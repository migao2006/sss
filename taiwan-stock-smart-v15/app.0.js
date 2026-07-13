'use strict';

const EDGE='https://lfkdkdyaatdlizryiyon.supabase.co/functions/v1/twss-market-data';
const SUPABASE_URL='https://lfkdkdyaatdlizryiyon.supabase.co';
const SUPABASE_KEY='sb_publishable_r3h9eQIYdIqScvmc77avAg_OLgBT6lh';
const MODEL_VERSION='v15-multifactor';
const DISCLAIMER='未來漲跌預測是依公開資料、技術指標與固定權重計算的機率估計，僅供研究參考，不構成投資建議、買賣邀約或獲利保證。模型可能因突發消息、流動性、資料延遲及市場情緒而失準，投資人應自行判斷並承擔風險。';

const S={
  tab:'home',stocks:[],mode:'loading',date:'',fundStatus:'loading',fundPeriod:'',loading:true,
  historyCache:new Map(),backtestCache:new Map(),detailSymbol:null,forecastQuery:'',verifyQuery:'',verifySymbol:'',
  mineSub:'watch',session:null,dataStatus:{},syncState:'本機模式'
};

const app=document.querySelector('#app');
const modalRoot=document.querySelector('#modalRoot');
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const safe=v=>v==null||Number.isNaN(Number(v))?null:Number(v);
const fmt=(v,d=2)=>v==null||Number.isNaN(Number(v))?'—':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:d});
const pct=(v,d=2)=>v==null||Number.isNaN(Number(v))?'—':`${v>0?'+':''}${fmt(v,d)}%`;
const cls=v=>v>0?'up':v<0?'down':'neutral';
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reasonDash=reason=>`—（${reason}）`;

function readLocal(key,fallback=[]){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}}
function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value))}
function getWatchlist(){return readLocal('twss-watchlist-v15',[])}
function setWatchlist(v){writeLocal('twss-watchlist-v15',v)}
function getPredictions(){return readLocal('twss-predictions-v15',[])}
function setPredictions(v){writeLocal('twss-predictions-v15',v)}
function getJournal(){return readLocal('twss-journal-v15',[])}
function setJournal(v){writeLocal('twss-journal-v15',v)}
function isWatched(symbol){return getWatchlist().some(x=>x.symbol===symbol)}

async function fetchJson(url,timeout=22000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  try{const r=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json()}finally{clearTimeout(timer)}
}

function normalizeStock(item){return{
  symbol:'',name:'',industry:'未分類',market:'上市',close:null,change:null,open:null,high:null,low:null,
  volume:null,value:null,transactions:null,pe:null,pb:null,yield:null,revenue:null,rev:null,revMom:null,revYtd:null,revPeriod:null,
  eps:null,roe:null,roeEstimated:false,roePeriod:null,grossMargin:null,operatingMargin:null,netMargin:null,debt:null,equityRatio:null,
  foreign:null,trust:null,dealer:null,inst:null,marginBalance:null,marginChange:null,shortBalance:null,shortChange:null,disp:null,full:null,demo:false,
  ...item,symbol:String(item.symbol||'')
}}

async function loadStocks(){
  S.loading=true;render();
  try{
    const payload=await fetchJson(`${EDGE}?type=stocks`,24000);
    if(!Array.isArray(payload.stocks)||payload.stocks.length<20)throw new Error(payload.error||'盤後資料筆數不足');
    S.stocks=payload.stocks.map(normalizeStock);S.mode=payload.mode||'partial';S.date=payload.date||today();S.dataStatus=payload.sourceStatus||{};S.loading=false;
    q('#marketDate').textContent=`${S.date} · 盤後資料，非即時報價`;
    q('#dataMode').textContent=S.mode==='live'?'官方資料':S.mode==='partial'?'部分官方資料':'資料不足';
    render();loadFundamentals();
  }catch(error){
    S.loading=false;app.innerHTML=`<div class="card error-card"><h3>股票資料載入失敗</h3><p class="muted">${esc(error.message)}</p><button id="retryLoad" class="btn">重新載入</button></div>`;q('#retryLoad').onclick=loadStocks;
  }
}

async function loadFundamentals(){
  S.fundStatus='loading';render();
  const settled=await Promise.allSettled([fetchJson(`${EDGE}?type=revenue`,32000),fetchJson(`${EDGE}?type=financials`,36000)]);
  const merged=new Map();let revenueOk=false,financialOk=false;const periods=[];
  settled.forEach((result,index)=>{
    if(result.status!=='fulfilled')return;const payload=result.value||{},rows=payload.fundamentals||[];
    if(index===0&&rows.some(x=>x.rev!=null))revenueOk=true;
    if(index===1&&rows.some(x=>x.roe!=null||x.eps!=null))financialOk=true;
    if(payload.period)periods.push(payload.period);
    rows.forEach(row=>merged.set(String(row.symbol),{...(merged.get(String(row.symbol))||{}),...row}));
  });
  S.stocks=S.stocks.map(stock=>({...stock,...(merged.get(stock.symbol)||{})}));
  S.fundStatus=revenueOk&&financialOk?'ready':revenueOk||financialOk?'partial':'error';
  S.fundPeriod=periods.sort().at(-1)||'';render();
  if(S.detailSymbol)openDetail(S.detailSymbol,false);
}

async function getHistory(symbol){
  const cached=S.historyCache.get(symbol);if(cached)return cached instanceof Promise?cached:Promise.resolve(cached);
  const promise=(async()=>{const payload=await fetchJson(`${EDGE}?type=history&symbol=${encodeURIComponent(symbol)}&months=12`,42000);if(!Array.isArray(payload.history)||payload.history.length<20)throw new Error(payload.error||'歷史日線不足');const rows=payload.history.map(x=>({date:x.date,open:safe(x.open),high:safe(x.high),low:safe(x.low),close:safe(x.close),volume:safe(x.volume),value:safe(x.value),transactions:safe(x.transactions)})).filter(x=>x.close!=null&&x.high!=null&&x.low!=null);const result={rows,indicators:computeIndicators(rows),source:payload.source||'TWSE'};S.historyCache.set(symbol,result);return result})();
  S.historyCache.set(symbol,promise);try{return await promise}catch(error){S.historyCache.delete(symbol);throw error}
}

/* Supabase auth and optional cloud sync */
const SESSION_KEY='twss-supabase-session-v15';
function storeSession(session){S.session=session;if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);q('#accountBtn').textContent=session?'帳戶':'登入'}
async function sb(path,options={}){
  const headers={apikey:SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})};
  if(options.auth!==false&&S.session?.access_token)headers.Authorization=`Bearer ${S.session.access_token}`;
  const r=await fetch(SUPABASE_URL+path,{method:options.method||'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body),cache:'no-store'});
  let data=null;try{data=await r.json()}catch{}if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`HTTP ${r.status}`);return data;
}
async function refreshSession(){
  if(!S.session)return false;if((S.session.expires_at||0)>Date.now()/1000+90)return true;
  if(!S.session.refresh_token){storeSession(null);return false}
  try{const s=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:S.session.refresh_token},auth:false});s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);return true}catch{storeSession(null);return false}
}
async function login(email,password){const s=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},auth:false});s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);await cloudPull()}
async function signup(email,password){const s=await sb(`/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin)}`,{method:'POST',body:{email,password},auth:false});if(s?.access_token){s.expires_at=Math.floor(Date.now()/1000)+(s.expires_in||3600);storeSession(s);await cloudPull();return true}return false}
async function cloudPull(){
  if(!await refreshSession())return;S.syncState='同步中…';
  try{
    const [pred,journal]=await Promise.all([
      sb('/rest/v1/prediction_logs?select=*&order=prediction_date.desc'),
      sb('/rest/v1/investment_journal?select=*&order=entry_date.desc')
    ]);
    if(pred?.length)setPredictions(pred.map(x=>({...x,local_id:x.id})));
    if(journal?.length)setJournal(journal.map(x=>({...x,local_id:x.id})));
    S.syncState='雲端已同步';render();
  }catch(e){S.syncState=`同步失敗：${e.message}`}
}
async function upsertPredictionCloud(record){if(!await refreshSession())return;const body={user_id:S.session.user?.id||decodeJwtSub(S.session.access_token),symbol:record.symbol,stock_name:record.stock_name,prediction_date:record.prediction_date,horizon_days:record.horizon_days,reference_price:record.reference_price,predicted_direction:record.predicted_direction,up_probability:record.up_probability,neutral_probability:record.neutral_probability,down_probability:record.down_probability,confidence:record.confidence,expected_low:record.expected_low,expected_high:record.expected_high,model_version:record.model_version,factors:record.factors,evaluated_at:record.evaluated_at||null,actual_price:record.actual_price??null,actual_return_pct:record.actual_return_pct??null,actual_direction:record.actual_direction||null,is_correct:record.is_correct??null};await sb('/rest/v1/prediction_logs?on_conflict=user_id,symbol,prediction_date,horizon_days,model_version',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body})}
async function upsertJournalCloud(record){if(!await refreshSession())return;const userId=S.session.user?.id||decodeJwtSub(S.session.access_token);const body={user_id:userId,symbol:record.symbol,stock_name:record.stock_name,entry_date:record.entry_date,action:record.action,price:record.price??null,quantity:record.quantity??null,horizon:record.horizon||null,thesis:record.thesis||null,risk_plan:record.risk_plan||null,target_plan:record.target_plan||null,emotion:record.emotion||null,followed_plan:record.followed_plan??null,exit_price:record.exit_price??null,exit_date:record.exit_date||null,return_pct:record.return_pct??null,result_note:record.result_note||null,tags:record.tags||[]};if(record.id&&String(record.id).includes('-'))await sb(`/rest/v1/investment_journal?id=eq.${record.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body});else await sb('/rest/v1/investment_journal',{method:'POST',headers:{Prefer:'return=minimal'},body})}
function decodeJwtSub(token){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub}catch{return null}}
async function initSession(){try{S.session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{S.session=null}q('#accountBtn').textContent=S.session?'帳戶':'登入';if(S.session&&await refreshSession()){try{S.session.user=await sb('/auth/v1/user');storeSession(S.session)}catch{}cloudPull()}}
