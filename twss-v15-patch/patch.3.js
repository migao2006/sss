  function openJournalModal(record = null, stock = null) {
    const item = record || { local_id: createId(), symbol: stock?.symbol || '', stock_name: stock?.name || '', entry_date: new Date().toISOString().slice(0, 10), action: 'observe', price: stock?.close ?? null, quantity: null, horizon: 'swing', thesis: '', risk_plan: '', target_plan: '', emotion: '', followed_plan: null, exit_price: null, exit_date: '', return_pct: null, result_note: '' };
    modalRoot.innerHTML = `<div class="modal"><div class="sheet"><button class="sheet-close">×</button><h2>${record ? '編輯' : '新增'}投資紀錄</h2><div class="grid"><label class="muted">股票代號<input id="journalSymbol" value="${escapeText(item.symbol)}"></label><label class="muted">股票名稱<input id="journalName" value="${escapeText(item.stock_name || '')}"></label><label class="muted">日期<input id="journalDate" type="date" value="${item.entry_date}"></label><label class="muted">類型<select id="journalAction"><option value="observe">觀察</option><option value="buy">買入紀錄</option><option value="sell">賣出紀錄</option><option value="review">事後檢討</option></select></label><label class="muted">價格<input id="journalPrice" type="number" step="0.01" value="${item.price ?? ''}"></label><label class="muted">數量／張數<input id="journalQuantity" type="number" step="0.001" value="${item.quantity ?? ''}"></label><label class="muted">預計期間<select id="journalHorizon"><option value="short">短線 1–5 日</option><option value="swing">波段 1–4 週</option><option value="medium">中期 1–6 月</option><option value="long">長期 6 月以上</option></select></label><label class="muted">當時情緒<input id="journalEmotion" value="${escapeText(item.emotion || '')}" placeholder="例如：冷靜、害怕錯過"></label></div><label class="muted">決策理由<textarea id="journalThesis">${escapeText(item.thesis || '')}</textarea></label><label class="muted">風險計畫<textarea id="journalRisk">${escapeText(item.risk_plan || '')}</textarea></label><label class="muted">目標計畫<textarea id="journalTarget">${escapeText(item.target_plan || '')}</textarea></label><div class="grid"><label class="muted">出場價格<input id="journalExitPrice" type="number" step="0.01" value="${item.exit_price ?? ''}"></label><label class="muted">出場日期<input id="journalExitDate" type="date" value="${item.exit_date || ''}"></label></div><label class="muted">事後檢討<textarea id="journalResult">${escapeText(item.result_note || '')}</textarea></label><label class="muted"><input id="journalFollowed" type="checkbox" style="width:auto" ${item.followed_plan ? 'checked' : ''}> 有遵守原本計畫</label><button id="journalSave" class="btn" style="width:100%;margin-top:12px">儲存紀錄</button></div></div>`;
    q('#journalAction').value = item.action || 'observe';
    q('#journalHorizon').value = item.horizon || 'swing';
    q('.sheet-close', modalRoot).onclick = closeModal;
    q('#journalSave').onclick = () => {
      const price = Number(q('#journalPrice').value) || null;
      const exitPrice = Number(q('#journalExitPrice').value) || null;
      const saved = {
        ...item,
        symbol: q('#journalSymbol').value.trim(), stock_name: q('#journalName').value.trim(), entry_date: q('#journalDate').value,
        action: q('#journalAction').value, price, quantity: Number(q('#journalQuantity').value) || null, horizon: q('#journalHorizon').value,
        emotion: q('#journalEmotion').value.trim(), thesis: q('#journalThesis').value.trim(), risk_plan: q('#journalRisk').value.trim(), target_plan: q('#journalTarget').value.trim(),
        exit_price: exitPrice, exit_date: q('#journalExitDate').value || '', result_note: q('#journalResult').value.trim(), followed_plan: q('#journalFollowed').checked,
        return_pct: price && exitPrice ? +((exitPrice / price - 1) * 100).toFixed(2) : null, updated_at: new Date().toISOString()
      };
      if (!saved.symbol) { alert('請輸入股票代號'); return; }
      const list = getJournal();
      const index = list.findIndex(row => row.local_id === saved.local_id);
      if (index >= 0) list[index] = saved; else list.unshift(saved);
      setJournal(list); closeModal(); patchState.mineTab = 'journal'; S.tab = 'mine'; render();
    };
  }

  function bindPatch() {
    q('#patchVerifySearch')?.addEventListener('input', event => { patchState.verifyQuery = event.target.value; });
    q('#patchVerifyButton')?.addEventListener('click', () => { patchState.verifyQuery = q('#patchVerifySearch')?.value || ''; render(); });
    qa('[data-patch-backtest]').forEach(button => button.onclick = async () => {
      const symbol = button.dataset.patchBacktest;
      const stock = S.stocks.find(item => item.symbol === symbol);
      modalRoot.innerHTML = '<div class="modal"><div class="sheet"><button class="sheet-close">×</button><h2>歷史回測</h2><div class="loading"><span class="spinner"></span>正在讀取歷史資料並回測…</div></div></div>';
      q('.sheet-close', modalRoot).onclick = closeModal;
      try {
        const history = await getHistory(symbol);
        evaluatePredictions(symbol, history.rows);
        const result = runTechnicalBacktest(stock, history.rows);
        modalRoot.innerHTML = `<div class="modal"><div class="sheet"><button class="sheet-close">×</button><h2>${stock.name} ${symbol} 回測</h2>${backtestHtml(result)}<div class="notice"><b>回測限制</b><br>歷史表現不代表未來結果，樣本數過少時不應視為可靠依據。</div></div></div>`;
        q('.sheet-close', modalRoot).onclick = closeModal;
      } catch (error) {
        modalRoot.innerHTML = `<div class="modal"><div class="sheet"><button class="sheet-close">×</button><h2>回測失敗</h2><div class="notice">${escapeText(error.message)}</div></div></div>`;
        q('.sheet-close', modalRoot).onclick = closeModal;
      }
    });
    qa('[data-patch-mine]').forEach(button => button.onclick = () => { patchState.mineTab = button.dataset.patchMine; render(); });
    q('#patchNewJournal')?.addEventListener('click', () => openJournalModal());
    q('#patchExportJournal')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(getJournal(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `台股智選-投資紀錄-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    });
    qa('[data-patch-edit]').forEach(button => button.onclick = () => openJournalModal(getJournal().find(item => item.local_id === button.dataset.patchEdit)));
    qa('[data-patch-delete]').forEach(button => button.onclick = () => { if (!confirm('確定刪除這筆紀錄？')) return; setJournal(getJournal().filter(item => item.local_id !== button.dataset.patchDelete)); render(); });
    qa('[data-patch-journal-stock]').forEach(button => button.onclick = () => openJournalModal(null, S.stocks.find(stock => stock.symbol === button.dataset.patchJournalStock)));
    qa('[data-patch-verify-stock]').forEach(button => button.onclick = () => { closeModal(); patchState.verifyQuery = button.dataset.patchVerifyStock; S.tab = 'verify'; render(); });
  }

  const originalDetailHtml = detailHtml;
  detailHtml = function patchedDetailHtml(stock, historyState) {
    let html = originalDetailHtml(stock, historyState);
    const indicators = historyState?.indicators || null;
    const forecast = calculateForecast(stock, indicators);
    const extra = `<h3 class="section-title">三種預測情境</h3><div class="patch-scenarios">${scenarioHtml(stock, forecast, indicators)}</div><h3 class="section-title">大盤與產業環境</h3>${marketIndustryHtml(stock)}<h3 class="section-title">同業比較</h3>${peerHtml(stock)}<h3 class="section-title">近期事件與風險</h3>${eventHtml(stock, indicators)}<div class="row" style="margin-top:16px"><button class="btn grow" data-patch-journal-stock="${stock.symbol}">新增投資紀錄</button><button class="btn secondary" data-patch-verify-stock="${stock.symbol}">查看預測驗證</button></div>`;
    const index = html.lastIndexOf('<div class="disclaimer">');
    return index >= 0 ? html.slice(0, index) + extra + html.slice(index) : html.replace(/<\/div><\/div>$/, `${extra}</div></div>`);
  };

  const originalOpenDetail = openDetail;
  openDetail = async function patchedOpenDetail(symbol, loadHistory = true) {
    await originalOpenDetail(symbol, loadHistory);
    const stock = S.stocks.find(item => item.symbol === symbol);
    if (!stock) return;
    try {
      const history = await getHistory(symbol);
      const forecast = calculateForecast(stock, history.indicators);
      recordPrediction(stock, forecast);
      evaluatePredictions(symbol, history.rows);
    } catch {
      recordPrediction(stock, calculateForecast(stock, null));
    }
  };

  const originalBind = bind;
  bind = function patchedBind() { originalBind(); bindPatch(); };
  const originalRender = render;
  render = function patchedRender() {
    qa('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.tab === S.tab));
    if (S.tab === 'verify') { app.innerHTML = verifyPage(); bind(); return; }
    if (S.tab === 'mine') { app.innerHTML = minePage(); bind(); return; }
    originalRender();
  };

  function updateNavigation() {
    const nav = q('.bottom-nav');
    if (!nav) return;
    const watchButton = q('[data-tab="watch"]', nav);
    if (watchButton) { watchButton.dataset.tab = 'mine'; watchButton.innerHTML = '<span>◎</span>我的'; }
    if (!q('[data-tab="verify"]', nav)) {
      const verifyButton = document.createElement('button');
      verifyButton.type = 'button'; verifyButton.dataset.tab = 'verify'; verifyButton.innerHTML = '<span>✓</span>預測驗證';
      nav.insertBefore(verifyButton, watchButton);
    }
  }

  updateNavigation();
  render();
})();
