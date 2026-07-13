  function scenarioAnalysis(stock, forecast, indicators) {
    const volatility = forecast.expectedMove5 || 5;
    const support = indicators?.support || stock.close * (1 - volatility / 100);
    const resistance = indicators?.resistance || stock.close * (1 + volatility / 100);
    const optimism = Math.max(10, forecast.up);
    const pessimism = Math.max(10, forecast.down);
    const neutralProbability = Math.max(10, 100 - optimism - pessimism);
    return [
      { type: 'positive', title: '樂觀情境', probability: optimism, low: Math.max(stock.close, resistance * .99), high: stock.close * (1 + volatility * 1.35 / 100), trigger: '突破壓力且成交量同步增加' },
      { type: 'neutral', title: '中性情境', probability: neutralProbability, low: stock.close * (1 - volatility * .55 / 100), high: stock.close * (1 + volatility * .55 / 100), trigger: '量能持平，價格維持區間整理' },
      { type: 'negative', title: '悲觀情境', probability: pessimism, low: stock.close * (1 - volatility * 1.35 / 100), high: Math.min(stock.close, support * 1.01), trigger: '跌破支撐或法人籌碼持續轉弱' }
    ];
  }

  function recordPrediction(stock, forecast) {
    const logs = getPredictionLogs();
    const date = S.date || new Date().toISOString().slice(0, 10);
    const exists = logs.some(log => log.symbol === stock.symbol && log.prediction_date === date && log.model_version === PATCH_VERSION);
    if (exists) return;
    logs.unshift({
      local_id: createId(), symbol: stock.symbol, stock_name: stock.name, prediction_date: date,
      horizon_days: 5, reference_price: stock.close, predicted_direction: directionFromForecast(forecast),
      up_probability: forecast.up, neutral_probability: forecast.neutral, down_probability: forecast.down,
      confidence: forecast.confidence, expected_low: forecast.expectedLow, expected_high: forecast.expectedHigh,
      model_version: PATCH_VERSION, factors: { composite: forecast.composite, technical: forecast.technical, fundamental: forecast.fundamental, chip: forecast.chip, valuation: forecast.valuation },
      evaluated_at: null, actual_price: null, actual_return_pct: null, actual_direction: null, is_correct: null,
      created_at: new Date().toISOString()
    });
    setPredictionLogs(logs.slice(0, 500));
  }

  function evaluatePredictions(symbol, history) {
    const logs = getPredictionLogs();
    let changed = false;
    for (const log of logs) {
      if (log.symbol !== symbol || log.evaluated_at) continue;
      const index = history.findIndex(row => row.date >= log.prediction_date);
      if (index < 0 || history.length <= index + 5) continue;
      const actual = history[index + 5];
      const returnPct = (actual.close / log.reference_price - 1) * 100;
      const direction = directionFromReturn(returnPct);
      Object.assign(log, { evaluated_at: new Date().toISOString(), actual_price: actual.close, actual_return_pct: +returnPct.toFixed(2), actual_direction: direction, is_correct: direction === log.predicted_direction });
      changed = true;
    }
    if (changed) setPredictionLogs(logs);
  }

  function runTechnicalBacktest(stock, history) {
    const key = `${stock.symbol}-${history.at(-1)?.date || ''}`;
    if (patchState.backtestCache.has(key)) return patchState.backtestCache.get(key);
    const samples = [];
    for (let index = 80; index < history.length - 5; index += 5) {
      const past = history.slice(0, index + 1);
      const indicators = computeIndicators(past);
      if (!indicators) continue;
      const snapshot = { ...stock, close: past.at(-1).close, change: null, rev: null, revMom: null, revYtd: null, roe: null, eps: null, pe: null, pb: null, yield: null, debt: null, foreign: null, trust: null, dealer: null, marginChange: null };
      const forecast = calculateForecast(snapshot, indicators);
      const predicted = directionFromForecast(forecast);
      const returnPct = (history[index + 5].close / past.at(-1).close - 1) * 100;
      const actual = directionFromReturn(returnPct);
      samples.push({ date: past.at(-1).date, predicted, actual, returnPct: +returnPct.toFixed(2), correct: predicted === actual });
    }
    const result = {
      count: samples.length,
      hitRate: samples.length ? samples.filter(item => item.correct).length / samples.length * 100 : null,
      avgReturn: average(samples.map(item => item.returnPct)),
      avgWin: average(samples.filter(item => item.returnPct > 0).map(item => item.returnPct)),
      avgLoss: average(samples.filter(item => item.returnPct < 0).map(item => item.returnPct)),
      samples
    };
    patchState.backtestCache.set(key, result);
    return result;
  }

  function predictionStats() {
    const all = getPredictionLogs();
    const evaluated = all.filter(log => log.evaluated_at);
    const correct = evaluated.filter(log => log.is_correct);
    const last30 = evaluated.filter(log => Date.now() - new Date(log.prediction_date).getTime() <= 30 * 86400000);
    const last90 = evaluated.filter(log => Date.now() - new Date(log.prediction_date).getTime() <= 90 * 86400000);
    const accuracy = rows => rows.length ? rows.filter(row => row.is_correct).length / rows.length * 100 : null;
    return { all, evaluated, accuracy: accuracy(evaluated), accuracy30: accuracy(last30), accuracy90: accuracy(last90), correct: correct.length };
  }

  function scenarioHtml(stock, forecast, indicators) {
    return scenarioAnalysis(stock, forecast, indicators).map(item => `<div class="card patch-scenario ${item.type}"><div class="head"><div><b>${item.title}</b><div class="muted">觸發條件：${item.trigger}</div></div><b>${item.probability}%</b></div><div class="price">${fmt(item.low)}～${fmt(item.high)}</div><div class="muted">5 個交易日情境區間，非價格保證。</div></div>`).join('');
  }

  function peerHtml(stock) {
    const peer = peerComparison(stock);
    return `<div class="card"><div class="muted">比較群組：${stock.industry}，共 ${peer.peerCount} 檔</div>${peer.rows.map(row => `<div class="patch-peer"><span>${row.label}</span><div><div class="patch-track"><span style="width:${row.percentile || 0}%"></span></div><small class="muted">同業中位數 ${row.median == null ? '—' : `${fmt(row.median)}${row.suffix}`}</small></div><b>${row.value == null ? '—' : `${fmt(row.value)}${row.suffix}`}<br><small class="muted">百分位 ${row.percentile == null ? '—' : row.percentile}</small></b></div>`).join('')}</div>`;
  }

  function marketIndustryHtml(stock) {
    const environment = marketEnvironment();
    const industry = environment.industries.find(item => item.industry === stock.industry);
    return `<div class="grid">${metric('大盤環境', environment.label)}${metric('上漲家數比', `${fmt(environment.breadth, 0)}%`)}${metric(`${stock.industry}平均漲跌`, industry ? pct(industry.avgChange) : reasonDash('同業不足'))}${metric(`${stock.industry}上漲家數`, industry ? `${fmt(industry.breadth, 0)}%` : reasonDash('同業不足'))}${metric('市場外資合計', `${fmt(environment.foreign, 0)} 張`)}${metric('產業外資合計', industry ? `${fmt(industry.foreign, 0)} 張` : reasonDash('同業不足'))}</div>`;
  }

  function eventHtml(stock, indicators) {
    return `<div class="card">${buildEvents(stock, indicators).map(event => `<div class="patch-event"><div class="patch-event-icon">${event.icon}</div><div><b>${event.title}</b><div class="muted">${event.detail}</div></div><span class="tag ${event.level === 'bad' ? 'bad' : event.level === 'warn' ? 'warn' : 'info'}">${event.level === 'bad' ? '風險' : event.level === 'warn' ? '注意' : '事件'}</span></div>`).join('')}</div>`;
  }
