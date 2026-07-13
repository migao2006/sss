function marketEnvironment(){
  const tradable=S.stocks.filter(x=>x.change!=null),up=tradable.filter(x=>x.change>0).length,down=tradable.filter(x=>x.change<0).length,flat=tradable.length-up-down;
  const avgChange=mean(tradable.map(x=>x.change))||0,totalVolume=S.stocks.reduce((a,x)=>a+(x.volume||0),0),foreign=S.stocks.reduce((a,x)=>a+(x.foreign||0),0),inst=S.stocks.reduce((a,x)=>a+(x.inst||0),0);
  const breadth=tradable.length?up/tradable.length*100:0;
  const label=breadth>=60&&avgChange>0?'市場偏多':breadth<=40&&avgChange<0?'市場偏空':'市場震盪';
  const confidence=clamp(Math.round(Math.abs(breadth-50)*1.3+Math.abs(avgChange)*8),30,85);
  const industries=[...new Set(S.stocks.map(x=>x.industry).filter(Boolean))].map(industry=>{
    const rows=S.stocks.filter(x=>x.industry===industry),valid=rows.filter(x=>x.change!=null);return{industry,count:rows.length,avgChange:mean(valid.map(x=>x.change))||0,breadth:valid.length?valid.filter(x=>x.change>0).length/valid.length*100:0,rev:mean(rows.map(x=>x.rev)),foreign:rows.reduce((a,x)=>a+(x.foreign||0),0)}
  }).filter(x=>x.count>=3).sort((a,b)=>(b.avgChange+b.breadth/100)-(a.avgChange+a.breadth/100));
  return{up,down,flat,avgChange,totalVolume,foreign,inst,breadth,label,confidence,industries}
}

function percentile(values,value,higherIsBetter=true){const v=values.filter(x=>x!=null&&Number.isFinite(x));if(!v.length||value==null)return null;const rank=v.filter(x=>higherIsBetter?x<=value:x>=value).length;return Math.round(rank/v.length*100)}
function peerComparison(stock){
  let peers=S.stocks.filter(x=>x.industry===stock.industry&&x.symbol!==stock.symbol);if(peers.length<4)peers=S.stocks.filter(x=>x.market===stock.market&&x.symbol!==stock.symbol);
  const rows=[
    ['月營收年增',stock.rev,peers.map(x=>x.rev),true,'%'],['ROE',stock.roe,peers.map(x=>x.roe),true,'%'],['本益比',stock.pe,peers.map(x=>x.pe),false,''],['殖利率',stock.yield,peers.map(x=>x.yield),true,'%'],['外資買賣超',stock.foreign,peers.map(x=>x.foreign),true,' 張'],['單日漲跌',stock.change,peers.map(x=>x.change),true,'%']
  ].map(([label,value,values,higher,suffix])=>({label,value,median:median(values),percentile:percentile(values,value,higher),suffix,higher}));
  return{peerCount:peers.length,rows}
}
function median(values){const v=values.filter(x=>x!=null&&Number.isFinite(x)).sort((a,b)=>a-b);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2}

function nextRevenueWindow(){const now=new Date(),next=new Date(now.getFullYear(),now.getMonth()+1,1);return`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')} 上旬`}
function buildEvents(stock,indicators){
  const events=[{icon:'◷',title:'下次月營收觀察窗口',detail:nextRevenueWindow(),level:'info'}];
  if(stock.rev!=null&&stock.rev<0)events.push({icon:'!',title:'營收年增轉負',detail:`最新月營收年增 ${pct(stock.rev)}`,level:'bad'});
  if(stock.revMom!=null&&stock.revMom<=-15)events.push({icon:'!',title:'單月營收明顯下滑',detail:`月增率 ${pct(stock.revMom)}`,level:'bad'});
  if(Math.abs(stock.change||0)>=5)events.push({icon:'↕',title:'單日價格波動較大',detail:`今日漲跌 ${pct(stock.change)}`,level:'warn'});
  if(indicators?.volumeRatio>=1.5)events.push({icon:'▥',title:'成交量明顯放大',detail:`5 日／20 日量能比 ${fmt(indicators.volumeRatio)} 倍`,level:'warn'});
  if(indicators?.rsi14>=70)events.push({icon:'▲',title:'RSI 進入偏熱區',detail:`RSI ${fmt(indicators.rsi14)}`,level:'warn'});
  if(indicators?.rsi14<=30)events.push({icon:'▼',title:'RSI 進入偏弱區',detail:`RSI ${fmt(indicators.rsi14)}`,level:'bad'});
  if(stock.foreign!=null&&stock.foreign<-1000)events.push({icon:'外',title:'外資當日賣超',detail:`${fmt(stock.foreign,0)} 張`,level:'bad'});
  if(stock.marginChange!=null&&stock.marginChange>0&&(stock.change||0)<0)events.push({icon:'融',title:'下跌伴隨融資增加',detail:`融資增減 ${fmt(stock.marginChange,0)} 張`,level:'warn'});
  if(indicators?.resistance&&stock.close>=indicators.resistance*.98)events.push({icon:'壓',title:'接近 20 日壓力',detail:`壓力約 ${fmt(indicators.resistance)} 元`,level:'warn'});
  if(indicators?.support&&stock.close<=indicators.support*1.02)events.push({icon:'撐',title:'接近 20 日支撐',detail:`支撐約 ${fmt(indicators.support)} 元`,level:'bad'});
  if(stock.disp===true)events.push({icon:'處',title:'處置股票',detail:'交易限制可能影響流動性',level:'bad'});
  if(stock.full===true)events.push({icon:'全',title:'全額交割股票',detail:'交易風險較高',level:'bad'});
  return events;
}

function scenarioAnalysis(stock,forecast,indicators){
  const atr=indicators?.atrPct??forecast.expectedMove5/Math.sqrt(5)/.75;
  const support=indicators?.support??stock.close*(1-forecast.expectedMove5/100),resistance=indicators?.resistance??stock.close*(1+forecast.expectedMove5/100);
  return[
    {type:'good',title:'樂觀情境',prob:forecast.up,range:[Math.max(stock.close,resistance*.99),stock.close*(1+clamp(forecast.expectedMove5*1.15,3,22)/100)],trigger:'突破壓力、量能維持，法人籌碼未轉弱'},
    {type:'base',title:'中性情境',prob:forecast.neutral,range:[stock.close*(1-clamp(atr*.7,1.5,8)/100),stock.close*(1+clamp(atr*.7,1.5,8)/100)],trigger:'量價與籌碼缺乏明確方向，維持區間震盪'},
    {type:'bad',title:'悲觀情境',prob:forecast.down,range:[stock.close*(1-clamp(forecast.expectedMove5*1.2,3,24)/100),Math.min(stock.close,support*1.01)],trigger:'跌破支撐、下跌放量或法人轉為持續賣超'}
  ]
}

function directionFromReturn(ret){return ret>1.5?'up':ret<-1.5?'down':'neutral'}
function directionFromForecast(f){return f.up>=f.down+12?'up':f.down>=f.up+12?'down':'neutral'}
function recordPrediction(stock,forecast){
  const list=getPredictions(),key=`${stock.symbol}-${today()}-5-${MODEL_VERSION}`;if(list.some(x=>x.key===key))return;
  const rec={key,local_id:uid(),symbol:stock.symbol,stock_name:stock.name,prediction_date:today(),horizon_days:5,reference_price:stock.close,predicted_direction:directionFromForecast(forecast),up_probability:forecast.up,neutral_probability:forecast.neutral,down_probability:forecast.down,confidence:forecast.confidence,expected_low:forecast.expectedLow,expected_high:forecast.expectedHigh,model_version:MODEL_VERSION,factors:{technical:forecast.technical,fundamental:forecast.fundamental,chip:forecast.chip,valuation:forecast.valuation,completeness:forecast.completeness},created_at:new Date().toISOString()};
  list.unshift(rec);setPredictions(list);upsertPredictionCloud(rec).catch(()=>{});
}
function evaluatePredictionsForSymbol(symbol,history){
  const list=getPredictions();let changed=false;
  list.forEach(rec=>{
    if(rec.symbol!==symbol||rec.evaluated_at)return;const startIndex=history.findIndex(r=>r.date>=rec.prediction_date);if(startIndex<0||history.length<=startIndex+5)return;const actual=history[startIndex+5],ret=(actual.close/rec.reference_price-1)*100,dir=directionFromReturn(ret);Object.assign(rec,{evaluated_at:new Date().toISOString(),actual_price:actual.close,actual_return_pct:+ret.toFixed(2),actual_direction:dir,is_correct:dir===rec.predicted_direction});changed=true;upsertPredictionCloud(rec).catch(()=>{})
  });if(changed)setPredictions(list)
}

function runTechnicalBacktest(stock,history){
  const key=`${stock.symbol}-${history.at(-1)?.date||''}`;if(S.backtestCache.has(key))return S.backtestCache.get(key);
  const samples=[];
  for(let i=60;i<history.length-5;i+=5){const slice=history.slice(0,i+1),ind=computeIndicators(slice);if(!ind)continue;const historicalStock={...stock,close:slice.at(-1).close,change:slice.length>1?(slice.at(-1).close/slice.at(-2).close-1)*100:0,rev:null,revMom:null,revYtd:null,roe:null,eps:null,operatingMargin:null,debt:null,pe:null,pb:null,yield:null,foreign:null,trust:null,dealer:null,marginChange:null};const f=calculateForecast(historicalStock,ind),pred=directionFromForecast(f),future=history[i+5],ret=(future.close/slice.at(-1).close-1)*100,actual=directionFromReturn(ret);samples.push({date:slice.at(-1).date,pred,actual,ret:+ret.toFixed(2),correct:pred===actual,confidence:f.confidence})}
  const correct=samples.filter(x=>x.correct).length,returns=samples.map(x=>x.ret),result={samples,count:samples.length,hitRate:samples.length?correct/samples.length*100:null,avgReturn:mean(returns),avgWin:mean(samples.filter(x=>x.ret>0).map(x=>x.ret)),avgLoss:mean(samples.filter(x=>x.ret<0).map(x=>x.ret))};S.backtestCache.set(key,result);return result
}
