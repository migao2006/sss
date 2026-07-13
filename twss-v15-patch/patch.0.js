(() => {
  'use strict';
  const PATCH_VERSION = 'v15.1';
  const PREDICTION_KEY = 'twss-predictions-v15';
  const JOURNAL_KEY = 'twss-journal-v15';
  const patchState = { verifyQuery: '', mineTab: 'watch', backtestCache: new Map() };
  const localRead = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
  const localWrite = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const getPredictionLogs = () => localRead(PREDICTION_KEY, []);
  const setPredictionLogs = value => localWrite(PREDICTION_KEY, value);
  const getJournal = () => localRead(JOURNAL_KEY, []);
  const setJournal = value => localWrite(JOURNAL_KEY, value);
  const createId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const average = values => { const valid = values.filter(value => value != null && Number.isFinite(value)); return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null; };
  const median = values => { const valid = values.filter(value => value != null && Number.isFinite(value)).sort((a, b) => a - b); if (!valid.length) return null; const middle = Math.floor(valid.length / 2); return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2; };
  const directionFromReturn = value => value > 1.5 ? 'up' : value < -1.5 ? 'down' : 'neutral';
  const directionFromForecast = value => value.up >= value.down + 12 ? 'up' : value.down >= value.up + 12 ? 'down' : 'neutral';
  const directionLabel = value => value === 'up' ? '偏多' : value === 'down' ? '偏空' : '震盪';

  function marketEnvironment() {
    const tradable = S.stocks.filter(stock => stock.change != null);
    const up = tradable.filter(stock => stock.change > 0).length;
    const down = tradable.filter(stock => stock.change < 0).length;
    const flat = tradable.length - up - down;
    const avgChange = average(tradable.map(stock => stock.change)) || 0;
    const breadth = tradable.length ? up / tradable.length * 100 : 0;
    const foreign = S.stocks.reduce((sum, stock) => sum + (stock.foreign || 0), 0);
    const institutions = S.stocks.reduce((sum, stock) => sum + (stock.inst || 0), 0);
    const label = breadth >= 60 && avgChange > 0 ? '市場偏多' : breadth <= 40 && avgChange < 0 ? '市場偏空' : '市場震盪';
    const industries = [...new Set(S.stocks.map(stock => stock.industry).filter(Boolean))].map(industry => {
      const stocks = S.stocks.filter(stock => stock.industry === industry);
      const valid = stocks.filter(stock => stock.change != null);
      return {
        industry,
        count: stocks.length,
        avgChange: average(valid.map(stock => stock.change)) || 0,
        breadth: valid.length ? valid.filter(stock => stock.change > 0).length / valid.length * 100 : 0,
        revenueGrowth: average(stocks.map(stock => stock.rev)),
        foreign: stocks.reduce((sum, stock) => sum + (stock.foreign || 0), 0)
      };
    }).filter(row => row.count >= 3).sort((a, b) => (b.avgChange + b.breadth / 100) - (a.avgChange + a.breadth / 100));
    return { up, down, flat, avgChange, breadth, foreign, institutions, label, industries };
  }

  function percentile(values, value, higherIsBetter = true) {
    const valid = values.filter(item => item != null && Number.isFinite(item));
    if (!valid.length || value == null) return null;
    const rank = valid.filter(item => higherIsBetter ? item <= value : item >= value).length;
    return Math.round(rank / valid.length * 100);
  }

  function peerComparison(stock) {
    const peers = S.stocks.filter(item => item.industry === stock.industry);
    const definitions = [
      ['月營收年增', 'rev', true, '%'], ['ROE', 'roe', true, '%'], ['EPS', 'eps', true, ''],
      ['本益比', 'pe', false, ' 倍'], ['殖利率', 'yield', true, '%'], ['外資買賣超', 'foreign', true, ' 張']
    ];
    return {
      peerCount: peers.length,
      rows: definitions.map(([label, key, high, suffix]) => ({
        label, suffix, value: stock[key], median: median(peers.map(item => item[key])),
        percentile: percentile(peers.map(item => item[key]), stock[key], high)
      }))
    };
  }

  function nextRevenueWindow() {
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')} 上旬`;
  }

  function buildEvents(stock, indicators) {
    const events = [
      { icon: '▣', title: '下次月營收觀察窗', detail: `預估於 ${nextRevenueWindow()} 前後公布，實際時間以公司公告為準。`, level: 'info' }
    ];
    if (Math.abs(stock.change || 0) >= 7) events.push({ icon: '!', title: '單日波動較大', detail: `盤後漲跌幅 ${pct(stock.change)}，短線預測不確定性提高。`, level: 'warn' });
    if (indicators?.volumeRatio >= 1.5) events.push({ icon: '◫', title: '成交量明顯放大', detail: `近 5 日量能約為 20 日平均的 ${fmt(indicators.volumeRatio, 2)} 倍。`, level: 'warn' });
    if (indicators?.rsi14 >= 75) events.push({ icon: '▲', title: 'RSI 進入過熱區', detail: `RSI 14 為 ${fmt(indicators.rsi14)}，短線追價風險較高。`, level: 'warn' });
    if (indicators?.rsi14 <= 30) events.push({ icon: '▼', title: 'RSI 進入超賣區', detail: `RSI 14 為 ${fmt(indicators.rsi14)}，仍需觀察是否止跌。`, level: 'warn' });
    if (stock.rev != null && stock.rev < 0) events.push({ icon: '↘', title: '月營收年增為負', detail: `最新月營收年增 ${pct(stock.rev)}，成長動能需持續追蹤。`, level: 'bad' });
    if (stock.debt != null && stock.debt >= 70) events.push({ icon: '!', title: '負債比偏高', detail: `負債比 ${fmt(stock.debt)}%，財務彈性風險較高。`, level: 'bad' });
    if (stock.foreign != null && stock.foreign < 0) events.push({ icon: '◁', title: '外資當日賣超', detail: `外資買賣超 ${fmt(stock.foreign, 0)} 張。`, level: 'warn' });
    if (events.length === 1) events.push({ icon: '✓', title: '目前未偵測重大量價警示', detail: '仍應留意公司公告、產業消息及整體市場變化。', level: 'info' });
    return events;
  }
