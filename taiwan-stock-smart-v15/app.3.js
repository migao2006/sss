function statusCard(){
  const rev=S.stocks.filter(x=>x.rev!=null).length,fin=S.stocks.filter(x=>x.roe!=null||x.eps!=null).length,chip=S.stocks.filter(x=>x.foreign!=null||x.inst!=null).length;
  const c=S.fundStatus==='ready'?'ok':S.fundStatus==='error'?'bad':'';const label=S.fundStatus==='ready'?'基本面已更新':S.fundStatus==='partial'?'部分基本面資料':S.fundStatus==='error'?'基本面暫缺':'基本面載入中';
  return`<div class="card data-health"><div><b>資料完整度</b><div class="muted">月營收 ${rev} 檔 · 財報 ${fin} 檔 · 法人 ${chip} 檔${S.fundPeriod?` · ${S.fundPeriod}`:''}</div></div><span class="status-pill ${c}">${label}</span></div>`
}
function disclaimer(){return`<div class="disclaimer">${DISCLAIMER}</div>`}
function metric(label,value,note=''){return`<div class="metric"><small>${label}</small><b>${value}</b>${note?`<em>${note}</em>`:''}</div>`}
function valueOrReason(v,suffix='',reason='API 未回傳'){return v==null?reasonDash(reason):`${fmt(v)}${suffix}`}

function homePage(){
  const env=marketEnvironment(),rank=(title,rows,value)=>`<div class="card"><h3>${title}</h3><div class="rank-list">${rows.slice(0,5).map((s,i)=>`<div class="rank clickable" data-detail="${s.symbol}"><b>${i+1}</b><span><b>${s.name}</b><small class="muted"> ${s.symbol}</small></span><b class="${cls(s.change)}">${value(s)}</b></div>`).join('')}</div></div>`;
  const rev=[...S.stocks].filter(x=>x.rev!=null).sort((a,b)=>b.rev-a.rev),inst=[...S.stocks].filter(x=>x.inst!=null).sort((a,b)=>b.inst-a.inst),opp=[...S.stocks].filter(opportunityEligible).sort((a,b)=>opportunityScore(b)-opportunityScore(a));
  return`<h2>盤後市場儀表板</h2><div class="muted">官方盤後資料整理，不是即時報價。</div>
  <div class="grid">${metric('最新日期',S.date||'—')}${metric('上市股票',fmt(S.stocks.length,0))}</div>
  <div class="card accent"><div class="head"><div><small class="muted">大盤環境</small><div class="price">${env.label}</div><div class="muted">上漲 ${env.up} · 下跌 ${env.down} · 平盤 ${env.flat}</div></div><div><small class="muted">多頭家數比</small><div class="score">${fmt(env.breadth,0)}%</div><div class="muted">平均漲跌 ${pct(env.avgChange)}</div></div></div><div class="grid" style="margin-top:10px">${metric('市場成交量',`${fmt(env.totalVolume,0)} 張`)}${metric('外資合計',`${fmt(env.foreign,0)} 張`)}${metric('三大法人合計',`${fmt(env.inst,0)} 張`)}${metric('環境信心',`${env.confidence}%`)}</div></div>
  ${statusCard()}
  <div class="card"><h3>產業相對強弱</h3><div class="rank-list">${env.industries.slice(0,6).map((x,i)=>`<div class="rank"><b>${i+1}</b><span><b>${x.industry}</b><small class="muted"> ${x.count} 檔 · 上漲家數 ${fmt(x.breadth,0)}%</small></span><b class="${cls(x.avgChange)}">${pct(x.avgChange)}</b></div>`).join('')}</div></div>
  ${rank('機會分數排行',opp,s=>`${opportunityScore(s)} 分`)}${rank('月營收年增排行',rev,s=>pct(s.rev))}${rank('三大法人買超排行',inst,s=>`${fmt(s.inst,0)} 張`)}${disclaimer()}`
}

function opportunityCard(stock){
  return`<article class="card accent clickable" data-detail="${stock.symbol}"><div class="head"><div><b>${stock.name}</b><div class="muted">${stock.symbol} · ${stock.industry}</div></div><div><small class="muted">機會分數</small><div class="score">${opportunityScore(stock)}</div></div></div><div><span class="price">${fmt(stock.close)}</span> <b class="${cls(stock.change)}">${pct(stock.change)}</b></div><div class="grid">${metric('月營收年增',pct(stock.rev),stock.revPeriod||'最新公開月')}${metric('月營收月增',pct(stock.revMom))}${metric(stock.roeEstimated?'年化推估 ROE':'ROE',stock.roe==null?reasonDash('API 未回傳'):`${fmt(stock.roe)}%`,stock.roePeriod||'')}${metric('本益比',valueOrReason(stock.pe))}</div><div class="rules" style="margin-top:10px"><span>成交量 ${fmt(stock.volume,0)} 張</span>${stock.foreign!=null?`<span>外資 ${fmt(stock.foreign,0)} 張</span>`:''}<span>${stock.industry}</span></div><div class="row" style="margin-top:10px"><button class="btn grow" data-forecast="${stock.symbol}">深度預測</button><button class="btn secondary" data-watch="${stock.symbol}">${isWatched(stock.symbol)?'★ 已自選':'＋自選'}</button></div></article>`
}
function opportunitiesPage(){
  const selected=S.stocks.filter(opportunityEligible).sort((a,b)=>opportunityScore(b)-opportunityScore(a));
  return`<h2>機會股</h2><p class="muted">月營收成長為核心，再綜合財報品質、估值、法人與流動性固定計分。</p><div class="card"><h3>固定門檻</h3><div class="rules"><span>月營收年增 ≥ 10%</span><span>成交量 ≥ 500 張</span><span>本益比 ≤ 35</span><span>ROE ≥ 8%（有資料時）</span><span>排除已確認風險股</span></div></div>${statusCard()}${selected.length?`<div class="list two-col">${selected.map(opportunityCard).join('')}</div>`:`<div class="card empty"><h3>目前沒有完整符合條件的股票</h3><p class="muted">可能是資料仍在載入，或目前沒有股票同時達到固定門檻。</p></div>`}${disclaimer()}`
}

function stockSearchResults(query,attr){
  const text=query.trim().toLowerCase();if(!text)return'';const rows=S.stocks.filter(x=>x.symbol.includes(text)||x.name.toLowerCase().includes(text)).slice(0,12);
  return rows.length?`<div class="search-results">${rows.map(x=>`<button class="search-result" ${attr}="${x.symbol}"><span><b>${x.name}</b><small class="muted"> ${x.symbol} · ${x.industry}</small></span><span class="${cls(x.change)}">${pct(x.change)}</span></button>`).join('')}</div>`:'<div class="muted" style="margin-top:10px">找不到符合的股票</div>'
}
function forecastPage(){
  const top=[...S.stocks].filter(x=>x.rev!=null).sort((a,b)=>opportunityScore(b)-opportunityScore(a)).slice(0,8);
  return`<h2>未來漲跌預測</h2><p class="muted">整合歷史日線、MA、RSI、MACD、布林通道、ATR、量價、基本面、法人籌碼、大盤與產業環境。</p><div class="notice"><b>僅供參考使用</b><br>${DISCLAIMER}</div><div class="card"><h3>搜尋股票</h3><div class="search-row"><input id="forecastSearch" value="${esc(S.forecastQuery)}" placeholder="輸入代號或名稱，例如 3702 大聯大"><button id="forecastSearchBtn" class="btn">搜尋</button></div>${stockSearchResults(S.forecastQuery,'data-forecast')}</div><div class="card"><h3>優先分析清單</h3><div class="rank-list">${top.map((x,i)=>`<div class="rank clickable" data-forecast="${x.symbol}"><b>${i+1}</b><span><b>${x.name}</b><small class="muted"> ${x.symbol}</small></span><b>${opportunityScore(x)} 分</b></div>`).join('')}</div></div>${disclaimer()}`
}

function predictionStats(){
  const rows=getPredictions(),evaluated=rows.filter(x=>x.evaluated_at),recent30=evaluated.filter(x=>(Date.now()-new Date(x.prediction_date).getTime())<=30*864e5),recent90=evaluated.filter(x=>(Date.now()-new Date(x.prediction_date).getTime())<=90*864e5);
  const rate=list=>list.length?list.filter(x=>x.is_correct).length/list.length*100:null;
  return{rows,evaluated,rate30:rate(recent30),rate90:rate(recent90),pending:rows.filter(x=>!x.evaluated_at).length}
}
function verifyPage(){
  const stats=predictionStats(),selected=S.verifySymbol?S.stocks.find(x=>x.symbol===S.verifySymbol):null,cached=selected?[...S.backtestCache.entries()].find(([k])=>k.startsWith(selected.symbol+'-'))?.[1]:null;
  return`<h2>預測驗證</h2><p class="muted">保存每次預測，五個交易日後比對實際結果；另提供不使用未來資料的技術面走勢回測。</p><div class="stat-strip">${metric('已評估',fmt(stats.evaluated.length,0))}${metric('待評估',fmt(stats.pending,0))}${metric('近 30 日命中率',stats.rate30==null?'尚無樣本':`${fmt(stats.rate30,1)}%`)}${metric('近 90 日命中率',stats.rate90==null?'尚無樣本':`${fmt(stats.rate90,1)}%`)}</div>
  <div class="card"><h3>選擇股票進行歷史驗證</h3><div class="search-row"><input id="verifySearch" value="${esc(S.verifyQuery)}" placeholder="股票代號或名稱"><button id="verifySearchBtn" class="btn">搜尋</button></div>${stockSearchResults(S.verifyQuery,'data-verify')}</div>
  ${selected?`<div class="card accent"><div class="head"><div><h3>${selected.name} ${selected.symbol}</h3><div class="muted">技術面走勢回測，每 5 個交易日取樣一次</div></div><button class="btn small-btn" id="runBacktest" data-symbol="${selected.symbol}">${cached?'重新回測':'開始回測'}</button></div>${cached?backtestHtml(cached):'<div class="muted">按下開始回測後，會讀取近 12 個月日線並驗證方向。</div>'}</div>`:''}
  <div class="card"><h3>最近預測紀錄</h3>${stats.rows.length?`<div class="table-wrap"><table><thead><tr><th>股票／日期</th><th>預測</th><th>信心</th><th>實際</th><th>結果</th></tr></thead><tbody>${stats.rows.slice(0,30).map(x=>`<tr><td>${x.stock_name||x.symbol}<br><small class="muted">${x.prediction_date}</small></td><td>${directionLabel(x.predicted_direction)}</td><td>${fmt(x.confidence,0)}%</td><td>${x.actual_return_pct==null?'待評估':pct(x.actual_return_pct)}</td><td>${x.evaluated_at?(x.is_correct?'<span class="tag">正確</span>':'<span class="tag bad">不符</span>'):'<span class="tag info">等待中</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty muted">尚未產生預測紀錄。開啟任一股票的深度預測後會自動保存。</div>'}</div>
  <div class="notice">命中率只反映既有樣本，樣本不足或市場狀態改變時，不代表未來仍有相同表現。</div>${disclaimer()}`
}
function directionLabel(value){return value==='up'?'偏多':value==='down'?'偏空':'震盪'}
function backtestHtml(b){return`<div class="grid" style="margin-top:12px">${metric('回測樣本',fmt(b.count,0))}${metric('方向命中率',b.hitRate==null?'—':`${fmt(b.hitRate,1)}%`)}${metric('樣本平均報酬',pct(b.avgReturn))}${metric('平均獲利／虧損',`${pct(b.avgWin)} / ${pct(b.avgLoss)}`)}</div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>日期</th><th>預測</th><th>5 日報酬</th><th>結果</th></tr></thead><tbody>${b.samples.slice(-12).reverse().map(x=>`<tr><td>${x.date}</td><td>${directionLabel(x.pred)}</td><td class="${cls(x.ret)}">${pct(x.ret)}</td><td>${x.correct?'✓':'×'}</td></tr>`).join('')}</tbody></table></div><div class="muted small" style="margin-top:8px">此回測只使用當時之前的價格與成交量，不套用現在的月營收或財報資料，避免偷看未來。</div>`}

function journalStats(){const all=getJournal(),closed=all.filter(x=>x.return_pct!=null),wins=closed.filter(x=>x.return_pct>0),followed=all.filter(x=>x.followed_plan!=null);return{all,closed,winRate:closed.length?wins.length/closed.length*100:null,avgReturn:mean(closed.map(x=>x.return_pct)),followRate:followed.length?followed.filter(x=>x.followed_plan).length/followed.length*100:null}}
function minePage(){
  return`<h2>我的</h2><div class="segmented"><button data-mine="watch" class="${S.mineSub==='watch'?'active':''}">自選清單</button><button data-mine="journal" class="${S.mineSub==='journal'?'active':''}">投資紀錄</button></div>${S.mineSub==='watch'?watchSection():journalSection()}${disclaimer()}`
}
function watchSection(){
  const items=getWatchlist();
  const rows=items.map(item=>({item,stock:S.stocks.find(x=>x.symbol===item.symbol)})).filter(x=>x.stock);
  if(!rows.length)return '<div class="card empty"><h3>尚未加入自選股票</h3><p class="muted">可在機會股或股票詳細頁加入。</p></div>';
  return `<div class="list two-col">${rows.map(({item,stock})=>{
    const gain=item.addedPrice&&stock.close?(stock.close/item.addedPrice-1)*100:null;
    return `<div class="card clickable" data-detail="${stock.symbol}"><div class="head"><div><b>${stock.name}</b><div class="muted">${stock.symbol} · ${stock.industry}</div></div><button class="icon-btn" data-watch="${stock.symbol}">移除</button></div><div class="grid">${metric('目前價格',fmt(stock.close))}${metric('加入後漲跌',`<span class="${cls(gain)}">${pct(gain)}</span>`)}${metric('月營收年增',pct(stock.rev))}${metric('機會分數',opportunityScore(stock))}</div><button class="btn" data-forecast="${stock.symbol}" style="width:100%;margin-top:10px">查看趨勢預測</button></div>`;
  }).join('')}</div>`;
}
function journalSection(){
  const stats=journalStats();
  const header=`<div class="stat-strip">${metric('紀錄筆數',fmt(stats.all.length,0))}${metric('已完成交易',fmt(stats.closed.length,0))}${metric('勝率',stats.winRate==null?'尚無樣本':`${fmt(stats.winRate,1)}%`)}${metric('遵守計畫率',stats.followRate==null?'尚無資料':`${fmt(stats.followRate,1)}%`)}</div><div class="row"><button id="newJournal" class="btn grow">＋新增投資紀錄</button><button id="exportJournal" class="btn secondary">匯出 JSON</button></div>`;
  if(!stats.all.length)return `${header}<div class="card empty"><h3>尚未建立投資紀錄</h3><p class="muted">記錄當時理由、預期、風險與結果，之後才能檢查自己是否遵守計畫。</p></div>`;
  return `${header}<div class="list">${stats.all.map(x=>`<div class="card journal-item ${x.action}"><div class="head"><div><b>${x.stock_name||x.symbol} ${x.symbol}</b><div class="muted">${x.entry_date} · ${actionLabel(x.action)} · ${horizonLabel(x.horizon)}</div></div>${x.return_pct!=null?`<b class="${cls(x.return_pct)}">${pct(x.return_pct)}</b>`:''}</div>${x.thesis?`<p>${esc(x.thesis)}</p>`:''}<div class="rules">${x.risk_plan?`<span>風險：${esc(x.risk_plan)}</span>`:''}${x.target_plan?`<span>目標：${esc(x.target_plan)}</span>`:''}${x.followed_plan!=null?`<span>遵守計畫：${x.followed_plan?'是':'否'}</span>`:''}</div><div class="row" style="margin-top:10px"><button class="btn secondary" data-edit-journal="${x.local_id||x.id}">編輯</button><button class="btn danger" data-delete-journal="${x.local_id||x.id}">刪除</button></div></div>`).join('')}</div>`;
}
function actionLabel(a){return({observe:'觀察',buy:'買入紀錄',sell:'賣出紀錄',review:'事後檢討'})[a]||a}
function horizonLabel(h){return({short:'短線 1–5 日',swing:'波段 1–4 週',medium:'中期 1–6 月',long:'長期 6 月以上'})[h]||'未設定期間'}
