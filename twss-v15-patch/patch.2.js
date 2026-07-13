  function verifyPage() {
    const stats = predictionStats();
    const query = patchState.verifyQuery.trim().toLowerCase();
    const matches = query ? S.stocks.filter(stock => stock.symbol.includes(query) || stock.name.toLowerCase().includes(query)).slice(0, 10) : [];
    const rows = stats.all.filter(log => !query || log.symbol.includes(query) || String(log.stock_name || '').toLowerCase().includes(query));
    return `<h2>預測驗證</h2><p class="muted">系統會保存每次預測，五個交易日後比對實際收盤價。歷史回測只使用當時以前的價量資料。</p>
      <div class="grid">${metric('已保存預測', fmt(stats.all.length, 0))}${metric('已完成驗證', fmt(stats.evaluated.length, 0))}${metric('整體命中率', stats.accuracy == null ? '尚無樣本' : `${fmt(stats.accuracy, 1)}%`)}${metric('近 90 日命中率', stats.accuracy90 == null ? '尚無樣本' : `${fmt(stats.accuracy90, 1)}%`)}</div>
      <div class="card"><h3>查詢個股回測</h3><div class="search-row"><input id="patchVerifySearch" value="${escapeText(patchState.verifyQuery)}" placeholder="輸入代號或名稱"><button id="patchVerifyButton" class="btn">查詢</button></div>${matches.length ? `<div class="search-results">${matches.map(stock => `<button class="search-result" data-patch-backtest="${stock.symbol}"><span><b>${stock.name}</b><small class="muted"> ${stock.symbol}</small></span><span>執行回測</span></button>`).join('')}</div>` : ''}</div>
      <div class="card"><h3>預測紀錄</h3>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>日期</th><th>股票</th><th>預測</th><th>機率</th><th>實際</th><th>結果</th></tr></thead><tbody>${rows.slice(0, 80).map(log => `<tr><td>${log.prediction_date}</td><td>${log.stock_name || log.symbol}</td><td>${directionLabel(log.predicted_direction)}</td><td>${fmt(log.up_probability, 0)}/${fmt(log.neutral_probability, 0)}/${fmt(log.down_probability, 0)}</td><td class="${cls(log.actual_return_pct)}">${log.actual_return_pct == null ? '待驗證' : pct(log.actual_return_pct)}</td><td>${log.is_correct == null ? '—' : log.is_correct ? '✓' : '×'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty muted">開啟任何股票的趨勢預測後，就會開始累積紀錄。</div>'}</div>${disclaimer()}`;
  }

  function backtestHtml(result) {
    return `<div class="grid">${metric('回測樣本', fmt(result.count, 0))}${metric('方向命中率', result.hitRate == null ? '—' : `${fmt(result.hitRate, 1)}%`)}${metric('樣本平均報酬', pct(result.avgReturn))}${metric('平均獲利／虧損', `${pct(result.avgWin)} / ${pct(result.avgLoss)}`)}</div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>日期</th><th>預測</th><th>5 日報酬</th><th>結果</th></tr></thead><tbody>${result.samples.slice(-15).reverse().map(item => `<tr><td>${item.date}</td><td>${directionLabel(item.predicted)}</td><td class="${cls(item.returnPct)}">${pct(item.returnPct)}</td><td>${item.correct ? '✓' : '×'}</td></tr>`).join('')}</tbody></table></div><div class="muted small" style="margin-top:8px">回測不套用目前的營收、財報或法人資料，避免偷看未來；因此結果和當下完整模型不完全相同。</div>`;
  }

  function journalStats() {
    const all = getJournal();
    const closed = all.filter(item => item.return_pct != null);
    const wins = closed.filter(item => item.return_pct > 0);
    const followed = all.filter(item => item.followed_plan != null);
    return {
      all, closed,
      winRate: closed.length ? wins.length / closed.length * 100 : null,
      averageReturn: average(closed.map(item => item.return_pct)),
      followRate: followed.length ? followed.filter(item => item.followed_plan).length / followed.length * 100 : null
    };
  }

  function watchSection() {
    const items = getWatchlist();
    const rows = items.map(item => ({ item, stock: S.stocks.find(stock => stock.symbol === item.symbol) })).filter(row => row.stock);
    if (!rows.length) return '<div class="card empty"><h3>尚未加入自選股票</h3><p class="muted">可在機會股或股票詳細頁加入。</p></div>';
    return `<div class="list two-col">${rows.map(({ item, stock }) => { const gain = item.addedPrice && stock.close ? (stock.close / item.addedPrice - 1) * 100 : null; return `<div class="card clickable" data-detail="${stock.symbol}"><div class="head"><div><b>${stock.name}</b><div class="muted">${stock.symbol} · ${stock.industry}</div></div><button class="icon-btn" data-watch="${stock.symbol}">移除</button></div><div class="grid">${metric('目前價格', fmt(stock.close))}${metric('加入後漲跌', `<span class="${cls(gain)}">${pct(gain)}</span>`)}${metric('月營收年增', pct(stock.rev))}${metric('機會分數', opportunityScore(stock))}</div><button class="btn" data-forecast="${stock.symbol}" style="width:100%;margin-top:10px">查看趨勢預測</button></div>`; }).join('')}</div>`;
  }

  function actionLabel(value) { return ({ observe: '觀察', buy: '買入紀錄', sell: '賣出紀錄', review: '事後檢討' })[value] || value; }
  function horizonLabel(value) { return ({ short: '短線 1–5 日', swing: '波段 1–4 週', medium: '中期 1–6 月', long: '長期 6 月以上' })[value] || '未設定期間'; }
  function journalSection() {
    const stats = journalStats();
    const header = `<div class="grid">${metric('紀錄筆數', fmt(stats.all.length, 0))}${metric('已完成交易', fmt(stats.closed.length, 0))}${metric('勝率', stats.winRate == null ? '尚無樣本' : `${fmt(stats.winRate, 1)}%`)}${metric('遵守計畫率', stats.followRate == null ? '尚無資料' : `${fmt(stats.followRate, 1)}%`)}</div><div class="row" style="margin-top:10px"><button id="patchNewJournal" class="btn grow">＋新增投資紀錄</button><button id="patchExportJournal" class="btn secondary">匯出</button></div>`;
    if (!stats.all.length) return `${header}<div class="card empty"><h3>尚未建立投資紀錄</h3><p class="muted">記錄當時理由、風險與結果，之後才能檢查自己是否遵守計畫。</p></div>`;
    return `${header}<div class="list">${stats.all.map(item => `<div class="card patch-journal"><div class="head"><div><b>${item.stock_name || item.symbol} ${item.symbol}</b><div class="muted">${item.entry_date} · ${actionLabel(item.action)} · ${horizonLabel(item.horizon)}</div></div>${item.return_pct != null ? `<b class="${cls(item.return_pct)}">${pct(item.return_pct)}</b>` : ''}</div>${item.thesis ? `<p>${escapeText(item.thesis)}</p>` : ''}<div class="rules">${item.risk_plan ? `<span>風險：${escapeText(item.risk_plan)}</span>` : ''}${item.target_plan ? `<span>目標：${escapeText(item.target_plan)}</span>` : ''}${item.followed_plan != null ? `<span>遵守計畫：${item.followed_plan ? '是' : '否'}</span>` : ''}</div><div class="row" style="margin-top:10px"><button class="btn secondary" data-patch-edit="${item.local_id}">編輯</button><button class="btn danger" data-patch-delete="${item.local_id}">刪除</button></div></div>`).join('')}</div>`;
  }

  function minePage() {
    return `<h2>我的</h2><div class="patch-tabs"><button data-patch-mine="watch" class="${patchState.mineTab === 'watch' ? 'active' : ''}">自選清單</button><button data-patch-mine="journal" class="${patchState.mineTab === 'journal' ? 'active' : ''}">投資紀錄</button></div>${patchState.mineTab === 'watch' ? watchSection() : journalSection()}${disclaimer()}`;
  }
