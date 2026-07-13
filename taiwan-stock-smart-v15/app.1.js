function mean(values){const v=values.filter(x=>x!=null&&Number.isFinite(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function sma(values,period){return values.length>=period?mean(values.slice(-period)):null}
function emaSeries(values,period){if(!values.length)return[];const m=2/(period+1),out=[values[0]];for(let i=1;i<values.length;i++)out.push(values[i]*m+out[i-1]*(1-m));return out}
function std(values){const m=mean(values);return m==null?null:Math.sqrt(mean(values.map(v=>(v-m)**2)))}
function calcRsi(values,period=14){if(values.length<=period)return null;const changes=values.slice(1).map((v,i)=>v-values[i]);let gains=0,losses=0;for(const c of changes.slice(0,period)){if(c>0)gains+=c;else losses-=c}let avgGain=gains/period,avgLoss=losses/period;for(const c of changes.slice(period)){avgGain=(avgGain*(period-1)+Math.max(c,0))/period;avgLoss=(avgLoss*(period-1)+Math.max(-c,0))/period}if(avgLoss===0)return 100;return 100-100/(1+avgGain/avgLoss)}
function calcAtr(rows,period=14){if(rows.length<=period)return null;const tr=rows.slice(1).map((r,i)=>Math.max(r.high-r.low,Math.abs(r.high-rows[i].close),Math.abs(r.low-rows[i].close)));return mean(tr.slice(-period))}
function computeIndicators(rows){
  const closes=rows.map(r=>r.close).filter(v=>v!=null),volumes=rows.map(r=>r.volume).filter(v=>v!=null);if(closes.length<20)return null;
  const ma5=sma(closes,5),ma20=sma(closes,20),ma60=sma(closes,60),ema12=emaSeries(closes,12),ema26=emaSeries(closes,26);
  const macdSeries=closes.map((_,i)=>(ema12[i]??0)-(ema26[i]??0)),signalSeries=emaSeries(macdSeries,9);
  const macd=macdSeries.at(-1),signal=signalSeries.at(-1),histogram=macd-signal,rsi14=calcRsi(closes,14),atr14=calcAtr(rows,14),last=closes.at(-1);
  const w20=closes.slice(-20),mid=mean(w20),dev=std(w20),upper=mid==null||dev==null?null:mid+2*dev,lower=mid==null||dev==null?null:mid-2*dev;
  const momentum5=closes.length>5?(last/closes.at(-6)-1)*100:null,momentum20=closes.length>20?(last/closes.at(-21)-1)*100:null;
  const volume5=sma(volumes,5),volume20=sma(volumes,20),volumeRatio=volume5!=null&&volume20?volume5/volume20:null;
  const recent=rows.slice(-20),support=recent.length?Math.min(...recent.map(r=>r.low)):null,resistance=recent.length?Math.max(...recent.map(r=>r.high)):null;
  return{ma5,ma20,ma60,rsi14,atr14,atrPct:atr14&&last?atr14/last*100:null,macd,signal,histogram,bollingerUpper:upper,bollingerMiddle:mid,bollingerLower:lower,momentum5,momentum20,volume5,volume20,volumeRatio,support,resistance,last,rows:rows.length}
}

function calculateForecast(stock,indicators){
  let technical=0,fundamental=0,chip=0,valuation=0,riskPenalty=0;const positive=[],negative=[],missing=[];
  if(indicators){
    if(stock.close>indicators.ma5){technical+=7;positive.push('股價站上 5 日均線')}else technical-=5;
    if(indicators.ma5!=null&&indicators.ma20!=null&&indicators.ma5>indicators.ma20){technical+=10;positive.push('短期均線偏多')}else technical-=7;
    if(indicators.ma20!=null&&indicators.ma60!=null){if(indicators.ma20>indicators.ma60){technical+=13;positive.push('20 日均線高於 60 日均線')}else{technical-=11;negative.push('中期均線偏弱')}}else missing.push('60 日均線');
    if(indicators.histogram!=null){if(indicators.histogram>0){technical+=10;positive.push('MACD 柱狀體為正')}else{technical-=10;negative.push('MACD 柱狀體為負')}}
    if(indicators.rsi14!=null){if(indicators.rsi14>=50&&indicators.rsi14<=68)technical+=8;else if(indicators.rsi14>75){technical-=9;riskPenalty+=7;negative.push('RSI 過熱')}else if(indicators.rsi14<35){technical-=4;riskPenalty+=4;negative.push('RSI 偏弱')}}
    if(indicators.momentum5!=null)technical+=clamp(indicators.momentum5*1.2,-10,10);
    if(indicators.momentum20!=null)technical+=clamp(indicators.momentum20*.6,-12,12);
    if(indicators.volumeRatio!=null){if(indicators.volumeRatio>1.15&&(stock.change||0)>0){technical+=6;positive.push('量價同步')}if(indicators.volumeRatio>1.5&&(stock.change||0)<0){technical-=7;negative.push('下跌放量')}}
    if(indicators.atrPct!=null&&indicators.atrPct>5){riskPenalty+=9;negative.push('短線波動較大')}
  }else missing.push('歷史價格與技術指標');
  if(stock.rev!=null){if(stock.rev>=30){fundamental+=20;positive.push('月營收年增強勁')}else if(stock.rev>=10)fundamental+=13;else if(stock.rev>0)fundamental+=5;else{fundamental-=10;negative.push('月營收年增為負')}}else missing.push('月營收年增率');
  if(stock.revMom!=null)fundamental+=clamp(stock.revMom*.25,-7,7);
  if(stock.revYtd!=null)fundamental+=clamp(stock.revYtd*.18,-6,8);
  if(stock.roe!=null){if(stock.roe>=15){fundamental+=14;positive.push('ROE 表現佳')}else if(stock.roe>=8)fundamental+=8;else if(stock.roe<0)fundamental-=10}else missing.push('ROE');
  if(stock.eps!=null)fundamental+=stock.eps>0?6:-8;else missing.push('EPS');
  if(stock.operatingMargin!=null)fundamental+=stock.operatingMargin>10?5:stock.operatingMargin<0?-7:1;
  if(stock.debt!=null){if(stock.debt>75){fundamental-=7;riskPenalty+=5;negative.push('負債比偏高')}else if(stock.debt<50)fundamental+=3}else missing.push('負債比');
  if(stock.pe!=null&&stock.pe>0){if(stock.pe<=15)valuation+=12;else if(stock.pe<=25)valuation+=7;else if(stock.pe<=35)valuation+=2;else{valuation-=7;negative.push('本益比偏高')}}else missing.push('本益比');
  if(stock.pb!=null)valuation+=stock.pb<=2?5:stock.pb<=3?2:stock.pb>6?-4:0;
  if(stock.yield!=null&&stock.yield>=3)valuation+=3;
  if(stock.foreign!=null){if(stock.foreign>0){chip+=10;positive.push('外資買超')}else if(stock.foreign<0)chip-=8}else missing.push('外資買賣超');
  if(stock.trust!=null)chip+=stock.trust>0?7:stock.trust<0?-5:0;if(stock.dealer!=null)chip+=stock.dealer>0?3:stock.dealer<0?-2:0;
  if(stock.marginChange!=null&&stock.marginChange>0&&(stock.change||0)<0){chip-=4;riskPenalty+=3;negative.push('下跌且融資增加')}
  const tn=clamp(technical,-55,55),fn=clamp(fundamental,-35,35),cn=clamp(chip,-20,20),vn=clamp(valuation,-15,15);
  const composite=tn*.52+fn*.26+cn*.15+vn*.07-riskPenalty*.35;
  const neutralProbability=clamp(29-Math.abs(composite)*.25+(indicators?.atrPct>5?5:0),12,38),directional=100-neutralProbability,upShare=1/(1+Math.exp(-composite/11));
  let up=Math.round(directional*upShare),down=Math.round(directional-directional*upShare),neutral=100-up-down;
  const available=[stock.rev,stock.revMom,stock.roe,stock.eps,stock.pe,stock.pb,stock.debt,stock.foreign,indicators?.ma20,indicators?.rsi14,indicators?.macd,indicators?.atrPct].filter(v=>v!=null).length;
  const completeness=Math.round(available/12*100),confidence=clamp(Math.round(completeness*.78+Math.min(Math.abs(composite),30)*.55-riskPenalty),25,90);
  const shortLabel=up>=down+12?'短期偏多':down>=up+12?'短期偏空':'短期震盪';
  const mediumScore=(indicators?.ma20&&indicators?.ma60?(indicators.ma20>indicators.ma60?18:-18):0)+fn*.55+vn*.2+cn*.25;
  const mediumLabel=mediumScore>=10?'中期偏多':mediumScore<=-10?'中期偏空':'中期盤整';
  const atrPct=indicators?.atrPct??Math.max(2,Math.abs(stock.change||0)*.8),expectedMove5=clamp(atrPct*Math.sqrt(5)*.75,2,18);
  return{up,down,neutral,confidence,completeness,shortLabel,mediumLabel,composite:+composite.toFixed(1),technical:+tn.toFixed(1),fundamental:+fn.toFixed(1),chip:+cn.toFixed(1),valuation:+vn.toFixed(1),riskPenalty,expectedMove5,expectedLow:stock.close*(1-expectedMove5/100),expectedHigh:stock.close*(1+expectedMove5/100),positive:[...new Set(positive)].slice(0,8),negative:[...new Set(negative)].slice(0,8),missing:[...new Set(missing)].slice(0,8)}
}

function opportunityScore(stock){let score=0;if(stock.rev!=null)score+=stock.rev>=30?28:stock.rev>=20?24:stock.rev>=10?20:stock.rev>0?10:0;if(stock.revMom!=null)score+=stock.revMom>=10?10:stock.revMom>0?6:0;if(stock.revYtd!=null)score+=stock.revYtd>=10?7:stock.revYtd>0?3:0;if(stock.roe!=null)score+=stock.roe>=15?15:stock.roe>=10?12:stock.roe>=8?8:0;if(stock.eps!=null&&stock.eps>0)score+=5;if(stock.pe!=null&&stock.pe>0)score+=stock.pe<=15?10:stock.pe<=25?7:stock.pe<=35?3:0;if(stock.pb!=null)score+=stock.pb<=2?4:stock.pb<=3?2:0;if(stock.foreign>0)score+=6;if(stock.trust>0)score+=4;if((stock.volume||0)>=1000)score+=6;else if((stock.volume||0)>=500)score+=3;if(stock.debt!=null&&stock.debt<=55)score+=3;return Math.min(100,Math.round(score))}
function opportunityEligible(stock){return stock.rev!=null&&stock.rev>=10&&(stock.volume||0)>=500&&(stock.pe==null||(stock.pe>0&&stock.pe<=35))&&(stock.roe==null||stock.roe>=8)&&stock.disp!==true&&stock.full!==true}
