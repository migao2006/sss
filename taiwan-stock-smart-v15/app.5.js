function toggleWatch(symbol){
  const list=getWatchlist(),index=list.findIndex(x=>x.symbol===symbol);
  if(index>=0)list.splice(index,1);else{const stock=S.stocks.find(x=>x.symbol===symbol);list.push({symbol,addedPrice:stock?.close??null,addedAt:new Date().toISOString(),note:''})}
  setWatchlist(list);render();if(S.detailSymbol)openDetail(S.detailSymbol,false)
}

function render(){
  qa('.bottom-nav button').forEach(button=>button.classList.toggle('active',button.dataset.tab===S.tab));
  if(S.loading&&!S.stocks.length){app.innerHTML='<div class="card empty"><div class="loading"><span class="spinner"></span>正在載入官方盤後資料…</div></div>';bind();return}
  app.innerHTML=S.tab==='home'?homePage():S.tab==='opportunities'?opportunitiesPage():S.tab==='forecast'?forecastPage():S.tab==='verify'?verifyPage():minePage();bind()
}

function bind(){
  qa('.bottom-nav button').forEach(button=>button.onclick=()=>{S.tab=button.dataset.tab;render()});
  qa('[data-detail]').forEach(element=>element.onclick=event=>{if(!event.target.closest('button'))openDetail(element.dataset.detail)});
  qa('[data-forecast]').forEach(element=>element.onclick=event=>{event.stopPropagation();openDetail(element.dataset.forecast)});
  qa('[data-watch]').forEach(button=>button.onclick=event=>{event.stopPropagation();toggleWatch(button.dataset.watch)});
  const forecastSearch=q('#forecastSearch');if(forecastSearch){forecastSearch.oninput=e=>S.forecastQuery=e.target.value;forecastSearch.onkeydown=e=>{if(e.key==='Enter'){S.forecastQuery=e.target.value;render()}}}
  q('#forecastSearchBtn')?.addEventListener('click',()=>{S.forecastQuery=q('#forecastSearch')?.value||'';render()});
  const verifySearch=q('#verifySearch');if(verifySearch){verifySearch.oninput=e=>S.verifyQuery=e.target.value;verifySearch.onkeydown=e=>{if(e.key==='Enter'){S.verifyQuery=e.target.value;render()}}}
  q('#verifySearchBtn')?.addEventListener('click',()=>{S.verifyQuery=q('#verifySearch')?.value||'';render()});
  qa('[data-verify]').forEach(button=>button.onclick=()=>{S.verifySymbol=button.dataset.verify;S.verifyQuery='';render()});
  q('#runBacktest')?.addEventListener('click',async e=>{
    const symbol=e.currentTarget.dataset.symbol,stock=S.stocks.find(x=>x.symbol===symbol);e.currentTarget.disabled=true;e.currentTarget.textContent='回測中…';
    try{const history=await getHistory(symbol),result=runTechnicalBacktest(stock,history.rows);evaluatePredictionsForSymbol(symbol,history.rows);render()}catch(error){alert(`回測失敗：${error.message}`);render()}
  });
  qa('[data-mine]').forEach(button=>button.onclick=()=>{S.mineSub=button.dataset.mine;render()});
  q('#newJournal')?.addEventListener('click',()=>openJournalModal());
  q('#exportJournal')?.addEventListener('click',exportJournal);
  qa('[data-edit-journal]').forEach(button=>button.onclick=()=>openJournalModal(getJournal().find(x=>String(x.local_id||x.id)===String(button.dataset.editJournal))));
  qa('[data-delete-journal]').forEach(button=>button.onclick=()=>deleteJournal(button.dataset.deleteJournal));
}

function bindModal(){
  q('.sheet-close',modalRoot)?.addEventListener('click',closeModal);
  q('.modal',modalRoot)?.addEventListener('click',e=>{if(e.target.classList.contains('modal'))closeModal()});
  qa('[data-watch]',modalRoot).forEach(button=>button.onclick=e=>{e.stopPropagation();toggleWatch(button.dataset.watch)});
  qa('[data-journal-stock]',modalRoot).forEach(button=>button.onclick=()=>{const symbol=button.dataset.journalStock,stock=S.stocks.find(x=>x.symbol===symbol);openJournalModal(null,stock)});
  qa('[data-verify-stock]',modalRoot).forEach(button=>button.onclick=()=>{S.verifySymbol=button.dataset.verifyStock;S.tab='verify';closeModal();render()});
}

function exportJournal(){
  const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),journal:getJournal()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`台股智選-投資紀錄-${today()}.json`;a.click();URL.revokeObjectURL(url)
}
function deleteJournal(id){if(!confirm('確定刪除這筆紀錄？'))return;const list=getJournal().filter(x=>String(x.local_id||x.id)!==String(id));setJournal(list);render()}

function openJournalModal(record=null,stock=null){
  const r=record||{},selected=stock||S.stocks.find(x=>x.symbol===r.symbol),symbol=selected?.symbol||r.symbol||'',name=selected?.name||r.stock_name||'';
  modalRoot.innerHTML=`<div class="modal"><div class="sheet"><button class="sheet-close" type="button">×</button><h2>${record?'編輯':'新增'}投資紀錄</h2><div class="form-grid">
    <label>股票代號<input id="jSymbol" value="${esc(symbol)}" placeholder="例如 2330"></label>
    <label>股票名稱<input id="jName" value="${esc(name)}" placeholder="例如 台積電"></label>
    <label>日期<input id="jDate" type="date" value="${esc(r.entry_date||today())}"></label>
    <label>類型<select id="jAction"><option value="observe">觀察</option><option value="buy">買入紀錄</option><option value="sell">賣出紀錄</option><option value="review">事後檢討</option></select></label>
    <label>價格<input id="jPrice" type="number" step="0.01" value="${r.price??selected?.close??''}"></label>
    <label>數量（股或張，自行統一）<input id="jQty" type="number" step="0.01" value="${r.quantity??''}"></label>
    <label>預計持有時間<select id="jHorizon"><option value="">未設定</option><option value="short">短線 1–5 日</option><option value="swing">波段 1–4 週</option><option value="medium">中期 1–6 月</option><option value="long">長期 6 月以上</option></select></label>
    <label>當時情緒<input id="jEmotion" value="${esc(r.emotion||'')}" placeholder="冷靜、焦慮、追高…"></label>
  </div>
  <label>判斷理由<textarea id="jThesis" placeholder="當時為什麼關注或交易？">${esc(r.thesis||'')}</textarea></label>
  <label>風險計畫<textarea id="jRisk" placeholder="什麼條件代表判斷失效？">${esc(r.risk_plan||'')}</textarea></label>
  <label>目標計畫<textarea id="jTarget" placeholder="原先預期的目標或觀察區間">${esc(r.target_plan||'')}</textarea></label>
  <div class="form-grid"><label>出場價格<input id="jExitPrice" type="number" step="0.01" value="${r.exit_price??''}"></label><label>出場日期<input id="jExitDate" type="date" value="${esc(r.exit_date||'')}"></label></div>
  <label>結果檢討<textarea id="jResult" placeholder="實際發生什麼？下次要改進什麼？">${esc(r.result_note||'')}</textarea></label>
  <label>是否遵守原本計畫<select id="jFollow"><option value="">尚未評估</option><option value="true">有遵守</option><option value="false">未遵守</option></select></label>
  <button id="saveJournal" class="btn" style="width:100%;margin-top:12px">儲存紀錄</button></div></div>`;
  q('#jAction',modalRoot).value=r.action||'observe';q('#jHorizon',modalRoot).value=r.horizon||'';q('#jFollow',modalRoot).value=r.followed_plan==null?'':String(r.followed_plan);bindModal();
  q('#saveJournal',modalRoot).onclick=async()=>{
    const symbolValue=q('#jSymbol',modalRoot).value.trim(),price=safe(q('#jPrice',modalRoot).value),exitPrice=safe(q('#jExitPrice',modalRoot).value);if(!/^\d{4}$/.test(symbolValue)){alert('請輸入四碼股票代號');return}
    const item={...r,local_id:r.local_id||r.id||uid(),symbol:symbolValue,stock_name:q('#jName',modalRoot).value.trim(),entry_date:q('#jDate',modalRoot).value||today(),action:q('#jAction',modalRoot).value,price,quantity:safe(q('#jQty',modalRoot).value),horizon:q('#jHorizon',modalRoot).value||null,emotion:q('#jEmotion',modalRoot).value.trim(),thesis:q('#jThesis',modalRoot).value.trim(),risk_plan:q('#jRisk',modalRoot).value.trim(),target_plan:q('#jTarget',modalRoot).value.trim(),exit_price:exitPrice,exit_date:q('#jExitDate',modalRoot).value||null,result_note:q('#jResult',modalRoot).value.trim(),followed_plan:q('#jFollow',modalRoot).value===''?null:q('#jFollow',modalRoot).value==='true'};
    item.return_pct=price&&exitPrice?+((exitPrice/price-1)*100).toFixed(2):r.return_pct??null;const list=getJournal(),index=list.findIndex(x=>String(x.local_id||x.id)===String(item.local_id));if(index>=0)list[index]=item;else list.unshift(item);setJournal(list);upsertJournalCloud(item).catch(()=>{});closeModal();S.tab='mine';S.mineSub='journal';render()
  }
}

function openAccountModal(){
  if(S.session){modalRoot.innerHTML=`<div class="modal"><div class="sheet"><button class="sheet-close">×</button><h2>雲端帳戶</h2><div class="card"><b>${esc(S.session.user?.email||'已登入')}</b><p class="muted">預測紀錄與投資紀錄會同步至 Supabase。自選清單目前仍保留在此裝置。</p><div class="row"><button id="syncCloud" class="btn grow">立即同步</button><button id="logout" class="btn danger">登出</button></div></div><div class="muted">${esc(S.syncState)}</div></div></div>`;bindModal();q('#syncCloud',modalRoot).onclick=cloudPull;q('#logout',modalRoot).onclick=()=>{storeSession(null);closeModal();render()};return}
  modalRoot.innerHTML=`<div class="modal"><div class="sheet"><button class="sheet-close">×</button><h2>登入台股智選</h2><p class="muted">登入後同步預測紀錄與投資紀錄。</p><label>電子郵件<input id="authEmail" type="email" autocomplete="email"></label><label>密碼<input id="authPass" type="password" autocomplete="current-password" placeholder="至少 6 個字元"></label><div class="row" style="margin-top:12px"><button id="loginBtn" class="btn grow">登入</button><button id="signupBtn" class="btn secondary">建立帳戶</button></div><div id="authMsg" class="muted" style="margin-top:10px"></div></div></div>`;bindModal();
  const act=async type=>{const email=q('#authEmail',modalRoot).value.trim(),password=q('#authPass',modalRoot).value,msg=q('#authMsg',modalRoot);if(!email||password.length<6){msg.textContent='請輸入有效電子郵件，密碼至少 6 個字元。';return}msg.textContent='處理中…';try{if(type==='login'){await login(email,password);closeModal();render()}else{const ok=await signup(email,password);msg.textContent=ok?'帳戶已建立並登入':'驗證信已寄出，完成驗證後再登入。'}}catch(e){msg.textContent=e.message}};
  q('#loginBtn',modalRoot).onclick=()=>act('login');q('#signupBtn',modalRoot).onclick=()=>act('signup')
}

document.querySelector('#accountBtn').onclick=openAccountModal;
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
initSession();render();loadStocks();
