import './premium.css';
import { Capacitor } from '@capacitor/core';
import { Eb3aBle, type Eb3aReading } from './eb3a';
import { atlantic, type AtlanticState } from './atlantic';
import { oukitel, type OukitelDevice, type OukitelReading } from './oukitel';
import { heaterCard } from './heater-ui';

type Tab='home'|'devices'|'analytics'|'settings';
type Metric='output'|'input'|'soc'|'room'|'target';
type Point={at:number;soc:number;input:number;output:number};
type CloudPoint={at:number;soc:number|null;input:number|null;output:number|null};
type ClimatePoint={at:number;room:number|null;target:number|null};
type ChartSource='bluetti'|'oukitel'|'atlantic';
const ble=new Eb3aBle();
const NATIVE=Capacitor.isNativePlatform();
const $=(id:string)=>document.getElementById(id);
const root=$('app') as HTMLElement;
if(!root)throw Error('VOLTOS root not found');
const h=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const nf=(v:number|undefined|null)=>v===null||v===undefined?'—':new Intl.NumberFormat('uk-UA',{maximumFractionDigits:0}).format(v);
const t=(date:string|null|undefined)=>date?new Date(date).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}):'—';
const since=(date:string|null|undefined)=>{
 if(!date)return 'Немає даних';
 const age=Date.now()-new Date(date).getTime();
 if(!Number.isFinite(age))return 'Немає даних';
 if(age<60000)return 'Щойно';
 if(age<3600000)return Math.floor(age/60000)+' хв тому';
 return t(date);
};
const glyphs:Record<string,string>={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 devices:'<rect x="3" y="7" width="16" height="11" rx="2"/><path d="M22 10v5"/>',
 analytics:'<path d="M3 18V8m6 10V5m6 13v-7m6 7V3"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',bluetooth:'<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.8 9a7 7 0 0 1 12-2L20 12M4 12l2.2 5a7 7 0 0 0 12-2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',warning:'<path d="m12 3 10 18H2z"/><path d="M12 9v5m0 3v.5"/>',
 cloud:'<path d="M20 17a4 4 0 0 0-2-7.4 7 7 0 0 0-13.5 2A3.5 3.5 0 0 0 5 18h14"/>',
 shield:'<path d="M12 2 3 6v6c0 5 4 8 9 10 5-2 9-5 9-10V6z"/><path d="m9 12 2 2 4-4"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
 power:'<path d="M12 2v10m6-7a9 9 0 1 1-12 0"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 link:'<path d="M10 13a5 5 0 0 0 8 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-8 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
 wifi:'<path d="M2 9a16 16 0 0 1 20 0m-16 4a10 10 0 0 1 12 0m-8 4a4 4 0 0 1 4 0"/><circle cx="12" cy="20" r="1"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v1"/>'
};
const icon=(key:string,cls='')=>'<svg class="'+cls+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+(glyphs[key]||glyphs.info)+'</svg>';
const save=(key:string,value:string)=>{try{localStorage.setItem(key,value)}catch{}};
const retrieve=(key:string,fallback:string)=>{try{return localStorage.getItem(key)??fallback}catch{return fallback}};
const logKey='voltos-local-history-v2';
const cloudLogKey='voltos-oukitel-cloud-samples-v1';
const climateLogKey='voltos-atlantic-samples-v1';
const loadSamples=<T extends {at:number}>(key:string):T[]=>{
 try{
  const records=JSON.parse(retrieve(key,'[]'));
  return Array.isArray(records)?records.filter((r:unknown)=>r&&typeof r==='object'&&Number.isFinite((r as T).at)&&(r as T).at>Date.now()-30*86400000).slice(-10000):[];
 }catch{return []}
};
let cloudPoints:CloudPoint[]=loadSamples<CloudPoint>(cloudLogKey);
let climatePoints:ClimatePoint[]=loadSamples<ClimatePoint>(climateLogKey);
const appendSample=<T extends {at:number}>(list:T[],item:T,key:string)=>{
 if(list.at(-1)&&item.at-list[list.length-1].at<60000)return;
 list.push(item);
 while(list.length>10000||list[0]?.at<Date.now()-30*86400000)list.shift();
 save(key,JSON.stringify(list));
};
const settings={
 alert:Number(retrieve('voltos-alert','20')),
 motion:retrieve('voltos-motion','on')==='on',
 units:retrieve('voltos-compact','on')==='on'
};
if(!Number.isFinite(settings.alert)||settings.alert<5||settings.alert>90)settings.alert=20;
let points:Point[]=[];
try{
 const data=JSON.parse(retrieve(logKey,'[]')) as Point[];
 if(Array.isArray(data))points=data.filter(p=>p&&Number.isFinite(p.at)&&p.at>Date.now()-30*86400000&&Number.isFinite(p.output)).slice(-10000);
}catch{}
const state={
 tab:'home' as Tab,range:24,metric:'output' as Metric,chartSource:'bluetti' as ChartSource,
 ble:null as Eb3aReading|null,
 bleBusy:false,bleConnecting:false,bleError:'',bleControls:null as {led:number|null;eco:number|null;chargeMode:number|null;lifting:number|null}|null,
 bleControlBusy:false,bleAlertSent:false,
 atlantic:null as AtlanticState|null,atlanticAuthed:false,atlanticConfigured:false,atlanticBusy:false,atlanticError:'',
 oukitel:null as OukitelReading|null,oukitelAuthed:false,oukitelList:[] as OukitelDevice[],oukitelId:'',oukitelBusy:false,oukitelError:'',
 toast:'',toastKind:'info' as 'info'|'error'|'success'
};
let toastTimer:ReturnType<typeof setTimeout>|null=null;
function toast(message:string,kind:'info'|'error'|'success'='info'){
 state.toast=message;state.toastKind=kind;render();
 if(toastTimer)clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>{state.toast='';render()},4200);
}
const lastBle=()=>state.ble?.measuredAt??null;
const bleFresh=()=>Boolean(state.ble&&!state.bleError&&Date.now()-new Date(state.ble.measuredAt).getTime()<45000);
const powerDevices=()=>[state.ble?.soc,state.oukitel?.soc].filter((x):x is number=>x!==null&&x!==undefined);
const connectedCount=()=>Number(bleFresh())+Number(Boolean(state.oukitel?.device.online))+Number(Boolean(state.atlantic?.deviceOnline));
function runtime(soc:number,watts:number,capacity:number){
 if(watts<=2)return 'Без навантаження';
 const m=Math.round(capacity*soc/100*.84/watts*60);
 return m<60?m+' хв':Math.floor(m/60)+' год '+m%60+' хв';
}
function capture(){
 const d=state.ble;if(!d)return;
 const now=Date.now();
 if(points.length&&now-points[points.length-1].at<60000)return;
 points.push({at:now,soc:d.soc,input:d.inputWatts,output:d.outputWatts});
 points=points.filter(p=>p.at>Date.now()-30*86400000).slice(-10000);
 save(logKey,JSON.stringify(points));
}
function overview(){
 const batteries=powerDevices();
 const storedWh=(state.ble?268.8*state.ble.soc/100:0)+(state.oukitel?.soc!=null?2048*state.oukitel.soc/100:0);
 const totalWh=(state.ble?268.8:0)+(state.oukitel?.soc!=null?2048:0);
 const avg=totalWh?Math.round(storedWh/totalWh*100):null;
 const connected=connectedCount();
 const load=(bleFresh()?state.ble?.outputWatts??0:0)+(state.oukitel?.outputWatts??0);
 const input=(bleFresh()?state.ble?.inputWatts??0:0)+(state.oukitel?.inputWatts??0);
 return '<section class="overview"><div class="overview-top"><div><div class="section-eyebrow">ENERGY OVERVIEW</div><h2>Твоя енергія.<br/><span>Під контролем.</span></h2><p>Живлення, клімат і автономність в одній системі.</p></div><span class="online-pill '+(connected?'is-online':'')+'">'+(connected?'● '+connected+' активні':'○ Очікуємо пристрої')+'</span></div>'+
 '<div class="overview-visual"><div class="orb" style="--percent:'+(avg??0)+'"><div class="orb-inner"><small>РІВЕНЬ РЕЗЕРВУ</small><strong>'+(avg===null?'—':avg+'%')+'</strong><span>'+(batteries.length?batteries.length+' батарей':'Немає даних')+'</span></div></div>'+
 '<div class="flow-metrics"><div><span class="flow-icon in">↓</span><span><small>Надходить</small><strong>'+(batteries.length?nf(input):'—')+' <em>Вт</em></strong></span></div><div><span class="flow-icon out">↗</span><span><small>Споживання</small><strong>'+(batteries.length?nf(load):'—')+' <em>Вт</em></strong></span></div></div></div>'+
 '<div class="overview-bottom"><span>'+icon('shield')+' '+(connected?'Показники з підключених джерел':'Підключи перший пристрій')+'</span><button data-nav="devices">Пристрої '+icon('chevron')+'</button></div></section>';
}
function statistic(label:string,value:string,description:string,ico:string){
 return '<div class="stat-card"><div class="stat-label">'+icon(ico)+' '+h(label)+'</div><strong>'+value+'</strong><span>'+h(description)+'</span></div>';
}
function summary(){
 const actualCount=connectedCount();
 const socs=powerDevices();
 const output=(bleFresh()?state.ble?.outputWatts??0:0)+(state.oukitel?.outputWatts??0);
 return '<section class="stats-row">'+statistic('Пристрої',String(actualCount),'з активними даними','devices')+
 statistic('Акумулятори',String(socs.length),'доступно в системі','bolt')+
 statistic('Навантаження',socs.length?nf(output)+' <small>Вт</small>':'—','EB3A + Oukitel','analytics')+'</section>';
}
function deviceHeader(name:string,kind:string,badge:string,cls:string){
 return '<div class="tile-head"><div class="tile-icon '+cls+'">'+icon(kind)+'</div><div class="tile-title"><span>'+h(badge)+'</span><h3>'+h(name)+'</h3></div></div>';
}
function eb3aTile(){
 const d=state.ble,online=bleFresh();
 return '<article class="premium-tile">'+deviceHeader('BLUETTI EB3A','bluetooth','ЗАРЯДНА СТАНЦІЯ · BLUETOOTH','bluetti')+
 '<div class="tile-badge '+(online?'good':d?'warn':'')+'">'+(online?'● Підключено':d?'● Дані застаріли':'○ Не підключено')+'</div>'+
 (d?'<div class="battery-detail"><strong>'+d.soc+'%</strong><div class="battery-progress"><i style="width:'+d.soc+'%"></i></div><span>'+since(d.measuredAt)+'</span></div><div class="tile-data"><div><small>Вхід</small><strong>'+nf(d.inputWatts)+' Вт</strong></div><div><small>Вихід</small><strong>'+nf(d.outputWatts)+' Вт</strong></div><div><small>Автономність</small><strong>'+runtime(d.soc,d.outputWatts,268.8)+'</strong></div></div>':
 '<p class="tile-empty">Підключи станцію через Bluetooth, щоб бачити показники та керувати AC/DC.</p>')+
 (state.bleError?'<p class="inline-error">'+h(state.bleError)+'</p>':'')+
 '<div class="tile-actions">'+(ble.connected?
 '<button data-action="ble-refresh" class="btn secondary" '+(state.bleBusy?'disabled':'')+'>'+icon('refresh')+' Оновити</button><button data-action="ble-disconnect" class="btn ghost">Відключити</button>':
 '<button data-action="ble-connect" class="btn primary" '+(state.bleConnecting?'disabled':'')+'>'+icon('bluetooth')+' '+(state.bleConnecting?'Підключення…':'Підключити EB3A')+'</button>')+'</div></article>';
}
function oukitelTile(){
 const d=state.oukitel,linked=state.oukitelAuthed;
 const options=state.oukitelList.length>1?'<label class="select-device">Пристрій<select id="ouk-select">'+state.oukitelList.map(x=>'<option value="'+h(x.deviceKey)+'" '+(x.deviceKey===state.oukitelId?'selected':'')+'>'+h(x.deviceName||x.productName)+'</option>').join('')+'</select></label>':'';
 const oukControl=d&&d.device.online?'<div class="ouk-output-controls">'+([['ac','AC 230 В',d.acOn],['dc','DC',d.dcOn],['usb','USB',d.usbOn]] as const).map(([port,label,isOn])=>
  '<div class="ouk-output"><span>'+label+'</span><button data-ouk-control="'+port+'" data-value="'+(isOn?'off':'on')+'" class="switch '+(isOn?'enabled':'')+'" '+(isOn===null||state.oukitelBusy?'disabled':'')+'>'+(isOn===null?'Н/Д':isOn?'Увімк.':'Вимк.')+'</button></div>').join('')+'</div><p class="tile-footnote">Керування через Cloud, із перевіркою стану після команди. Живлення критичних приладів вимикай обережно.</p>':'';
 const action=linked?'<div class="tile-actions">'+options+'<button data-action="ouk-refresh" class="btn secondary" '+(state.oukitelBusy?'disabled':'')+'>'+icon('refresh')+' Оновити</button><button data-action="ouk-logout" class="btn ghost">Відключити</button></div>':
 '<form id="ouk-login" class="login-form"><label>Електронна пошта<input required type="email" name="email" autocomplete="username" placeholder="Email акаунта Oukitel"/></label><label>Пароль<input required type="password" name="password" autocomplete="current-password" placeholder="Пароль Oukitel"/></label><button type="submit" class="btn primary" '+(state.oukitelBusy?'disabled':'')+'>Підключити Oukitel</button></form>';
 return '<article class="premium-tile">'+deviceHeader(d?.device.deviceName||'Oukitel P2001E Plus','cloud','ЗАРЯДНА СТАНЦІЯ · CLOUD','oukitel')+
 '<div class="tile-badge '+(d?'warn':'')+'">'+(d?'◉ Cloud Snapshot':linked?'○ Очікуємо дані':'○ Не підключено')+'</div>'+
 (d?'<div class="battery-detail"><strong>'+(d.soc===null?'—':d.soc+'%')+'</strong><div class="battery-progress"><i style="width:'+(d.soc??0)+'%"></i></div><span>Хмара · '+since(d.cloudCheckedAt)+'</span></div><div class="tile-data"><div><small>Вхід</small><strong>'+nf(d.inputWatts)+' Вт</strong></div><div><small>Вихід</small><strong>'+nf(d.outputWatts)+' Вт</strong></div><div><small>Температура</small><strong>'+(d.temperatureC===null?'—':d.temperatureC+'°C')+'</strong></div></div><p class="tile-footnote">Cloud може показувати збережені значення. Час фактичного вимірювання невідомий.</p>':
 '<p class="tile-empty">'+(linked?'Виконай оновлення для отримання даних із хмари.':'Авторизуйся у своєму акаунті Oukitel. Пароль не зберігається на телефоні.')+'</p>')+
 (state.oukitelError?'<p class="inline-error">'+h(state.oukitelError)+'</p>':'')+oukControl+action+'</article>';
}
function climateTile(){
 const d=state.atlantic,online=d?.deviceOnline;
 const current=d?.roomTemperature!=null?d.roomTemperature.toLocaleString('uk-UA',{maximumFractionDigits:1}):'—';
 const target=d?.targetTemperature!=null?d.targetTemperature.toLocaleString('uk-UA',{maximumFractionDigits:1}):'—';
 return '<article class="premium-tile climate">'+deviceHeader(d?.name||'Atlantic Altis Eco Boost','sun','КЛІМАТ · COZYTOUCH','atlantic')+
 '<div class="tile-badge '+(online?'good':'')+'">'+(online?'● Онлайн':state.atlanticAuthed?'○ Немає даних':'○ Не підключено')+'</div>'+
 '<div class="climate-values"><div><small>У кімнаті</small><strong>'+current+'<em>°C</em></strong></div><div><small>Цільова</small><strong>'+target+'<em>°C</em></strong></div></div>'+
 (online&&d?'<div class="climate-controls"><div class="temp-stepper"><button data-temp="-0.5" '+(state.atlanticBusy||d.targetTemperature==null||d.targetTemperature<=7?'disabled':'')+'>−</button><span>'+target+'°</span><button data-temp="0.5" '+(state.atlanticBusy||d.targetTemperature==null||d.targetTemperature>=30?'disabled':'')+'>+</button></div><button class="btn secondary" data-power="'+(d.power?'off':'on')+'" '+(state.atlanticBusy||d.power===null?'disabled':'')+'>'+icon('power')+' '+(d.power?'Вимкнути':'Увімкнути')+'</button></div><label class="mode-control">Режим<select id="climate-mode" '+(state.atlanticBusy?'disabled':'')+'><option value="">'+h(d.mode||'Обрати')+'</option>'+[['normal','Комфорт'],['eco','Еко'],['manual','Ручний'],['prog','Програма'],['antifreeze','Антизамерзання']].map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join('')+'</select></label>':
 state.atlanticConfigured&&!state.atlanticAuthed?'<form id="atl-login" class="login-form"><label>Пароль Atlantic Home<input type="password" name="password" required minlength="4" autocomplete="current-password" placeholder="Пароль застосунку Atlantic Home"/></label><button class="btn primary" type="submit">Підключити конвектор</button></form>':
 '<p class="tile-empty">'+(state.atlanticAuthed?'Сервер Cozytouch наразі не повертає показники.':'Підключення до Atlantic Home. Налаштування Vercel не потрібні.')+'</p><div class="tile-actions"><button class="btn secondary" data-action="atl-refresh">'+icon('refresh')+' Оновити</button></div>')+
 (state.atlanticError?'<p class="inline-error">'+h(state.atlanticError)+'</p>':'')+
 '<div class="tile-last">Cozytouch '+(d?'· '+since(d.measuredAt):'· очікування з’єднання')+'</div></article>';
}
function homeDevices(){
 const bd=state.ble,od=state.oukitel,ad=state.atlantic;
 const rows=[
  {icon:'bluetooth',style:'bluetti',name:'BLUETTI EB3A',sub:bd?(bd.soc+'% · '+nf(bd.outputWatts)+' Вт'):'Потрібно підключити',status:bleFresh()?'Онлайн':'Не підключено'},
  {icon:'cloud',style:'oukitel',name:'Oukitel P2001E Plus',sub:od?(nf(od.soc)+'% · '+nf(od.outputWatts)+' Вт'):'Потрібно підключити',status:od?'Cloud дані':'Не підключено'},
  {icon:'sun',style:'atlantic',name:'Atlantic Altis Eco Boost',sub:ad?.roomTemperature!=null?(ad.roomTemperature+'°C · '+(ad.mode||'Режим не вказано')):'Потрібно підключити',status:ad?.deviceOnline?'Онлайн':'Не підключено'}
 ];
 return '<section class="home-devices"><div class="grid-head"><div><div class="section-eyebrow">CONNECTED EQUIPMENT</div><h2>Пристрої</h2></div><button class="text-action" data-nav="devices">Усі пристрої '+icon('chevron')+'</button></div><div class="home-device-grid">'+rows.map(x=>
  '<button class="home-device" data-nav="devices"><span class="tile-icon '+x.style+'">'+icon(x.icon)+'</span><span class="home-device-info"><strong>'+h(x.name)+'</strong><small>'+h(x.sub)+'</small></span><span class="home-device-status">'+h(x.status)+'</span>'+icon('chevron')+'</button>').join('')+'</div></section>';
}
function deviceGrid(){
 return '<div class="grid-head"><div><div class="section-eyebrow">SMART DEVICES</div><h2>Мої пристрої</h2></div><span>'+connectedCount()+' підключено</span></div><section class="device-grid-modern">'+eb3aTile()+oukitelTile()+climateTile()+'</section>';
}
function controls(){
 const d=state.ble;if(!d)return '';
 const make=(label:string,desc:string,key:string,isOn:boolean|null,next:number)=>'<div class="switch-row"><div><strong>'+label+'</strong><small>'+desc+'</small></div><button class="switch '+(isOn?'enabled':'')+'" data-ble-control="'+key+'" data-value="'+next+'" '+(isOn===null||state.bleControlBusy?'disabled':'')+' aria-label="'+h(label)+'">'+(isOn?'Увімк.':isOn===null?'Н/Д':'Вимк.')+'</button></div>';
 const opts=(label:string,key:string,value:number|null,options:[number,string][])=>'<label class="select-row">'+label+'<select data-ble-select="'+key+'" '+(value===null||state.bleControlBusy?'disabled':'')+'>'+(value===null?'<option>Не підтримується</option>':'')+options.map(([v,name])=>'<option value="'+v+'" '+(value===v?'selected':'')+'>'+name+'</option>').join('')+'</select></label>';
 return '<section class="card-section"><div class="section-heading"><h2>Керування BLUETTI</h2><span>Команди з підтвердженням</span></div><div class="controls-matrix">'+
 make('AC 230 В','Розетки змінного струму','ac',d.acEnabled,d.acEnabled?0:1)+make('DC / USB','Виходи постійного струму','dc',d.dcEnabled,d.dcEnabled?0:1)+
 make('ECO','Енергозбереження','eco',state.bleControls?.eco==null?null:state.bleControls.eco===1,state.bleControls?.eco===1?0:1)+
 make('Power Lifting','Підвищена потужність','lifting',state.bleControls?.lifting==null?null:state.bleControls.lifting===1,state.bleControls?.lifting===1?0:1)+
 opts('Режим заряджання','chargeMode',state.bleControls?.chargeMode??null,[[0,'Standard'],[1,'Silent'],[2,'Turbo']])+
 opts('Ліхтарик','led',state.bleControls?.led??null,[[4,'Вимкнено'],[1,'Слабкий'],[2,'Яскравий'],[3,'SOS']])+'</div><p class="safety-note">'+icon('warning')+' Вимкнення AC може знеструмити підключені прилади. Перевіряй команду перед підтвердженням.</p></section>';
}
function chart(){
 const source=state.chartSource;
 const raw=source==='bluetti'?points:source==='oukitel'?cloudPoints:climatePoints;
 const records=raw.filter(p=>p.at>Date.now()-state.range*3600000);
 const value=(p:Point|CloudPoint|ClimatePoint):number=>{
  if(source==='atlantic'){
   const v=p as ClimatePoint;
   return (state.metric==='target'?v.target:v.room)??NaN;
  }
  const v=p as Point;
  return (state.metric==='soc'?v.soc:state.metric==='input'?v.input:v.output)??NaN;
 };
 const chosen=records.filter(p=>Number.isFinite(value(p))).slice(-300);
 const values=chosen.map(value);
 const max=Math.max(1,...values),min=(source==='atlantic'&&values.length)?Math.min(...values)-1:0;
 let graph='';
 if(chosen.length>1){
  const range=Math.max(1,max-min);
  const pts=values.map((v,i)=>[(i/(values.length-1)*100).toFixed(2),(96-((v-min)/range*85)).toFixed(2)]);
  graph='<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Графік фактичних записів"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6ce4d7" stop-opacity=".25"/><stop offset="1" stop-color="#6ce4d7" stop-opacity="0"/></linearGradient></defs><path d="M'+pts.map(a=>a.join(',')).join(' L')+' L100,100 L0,100Z" fill="url(#area)"/><polyline points="'+pts.map(a=>a.join(',')).join(' ')+'" fill="none" stroke="#7ce7dd" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>';
 }else graph='<div class="chart-empty">'+icon('analytics')+'<strong>Історія ще накопичується</strong><span>Підключи пристрій і залиш застосунок відкритим, щоб бачити фактичні записи.</span></div>';
 const sources=([['bluetti','BLUETTI'],['oukitel','OUKITEL'],['atlantic','ATLANTIC']] as [ChartSource,string][])
  .map(([id,label])=>'<button data-source="'+id+'" class="'+(source===id?'selected':'')+'">'+label+'</button>').join('');
 const available=(source==='atlantic'?[['room','У кімнаті'],['target','Цільова']]:[['output','Вихід'],['input','Вхід'],['soc','Заряд']]) as [Metric,string][];
 const metricButtons=available.map(([id,label])=>'<button data-metric="'+id+'" class="'+(state.metric===id?'selected':'')+'">'+label+'</button>').join('');
 const ranges=[1,24,168].map((v,i)=>'<button data-range="'+v+'" class="'+(state.range===v?'selected':'')+'">'+['1 год','24 год','7 днів'][i]+'</button>').join('');
 const note=source==='oukitel'?'Це історія відповідей Cloud Snapshot, а не підтверджений момент вимірювання станцією.':
  source==='atlantic'?'Температури отримані з Cozytouch під час відкритого VOLTOS.':
  'Вимірювання EB3A записуються з Bluetooth, поки застосунок активний.';
 return '<section class="analytics-card"><div class="analytics-head"><div><div class="section-eyebrow">ENERGY INSIGHTS</div><h2>Аналітика</h2></div><button data-action="export" class="icon-btn" aria-label="Експорт CSV">'+icon('download')+'</button></div>'+
 '<div class="chart-switches source-switch">'+sources+'</div><div class="chart-switches">'+metricButtons+'</div>'+
 '<div class="chart-wrap">'+graph+'</div><div class="chart-footer"><span>'+chosen.length+' записів · '+(source==='atlantic'?'°C':state.metric==='soc'?'%':'Вт')+'</span><div class="chart-range">'+ranges+'</div></div><p class="fine-print">'+note+' Зберігання локальне, до 30 днів.</p></section>';
}

function settingsPage(){
 return '<section class="settings-stack"><div class="settings-panel"><div class="section-heading"><h2>Сповіщення</h2><span>Локальні</span></div><p>Повідомимо про низький заряд EB3A, поки застосунок активний.</p><label class="threshold-title" for="alert">Сповістити нижче <strong>'+settings.alert+'%</strong></label><input id="alert" type="range" min="5" max="90" step="5" value="'+settings.alert+'"/></div>'+
 '<div class="settings-panel"><div class="section-heading"><h2>Застосунок</h2><span>VOLTOS</span></div><div class="settings-row"><span>Версія</span><strong>1.0 iPhone Test</strong></div><div class="settings-row"><span>Платформа</span><strong>'+(NATIVE?'iOS / Capacitor':'PWA / браузер')+'</strong></div><div class="settings-row"><span>BLE на iPhone</span><strong>'+(NATIVE?'Нативний':'Потрібен Xcode')+'</strong></div><div class="settings-row"><span>Джерела</span><strong>BLUETTI · Oukitel · Atlantic</strong></div></div>'+
 '<div class="settings-panel"><div class="section-heading"><h2>Дані та приватність</h2></div><p>Паролі виробників не зберігаються в локальному сховищі. Для аналітики зберігаються лише отримані показники пристроїв локально на твоєму iPhone.</p><button class="btn secondary" data-action="export">'+icon('download')+' Завантажити CSV</button><button class="btn danger" data-action="clear-history">Очистити локальну історію</button></div>'+
 '<div class="settings-panel"><div class="section-heading"><h2>Про VOLTOS</h2></div><p>Об’єднує доступні джерела енергетики. Показники залежать від підтримки конкретного обладнання та доступності його API.</p><a href="https://github.com/XOTT69/VOLTOS" target="_blank" rel="noopener noreferrer" class="external-link">GitHub VOLTOS '+icon('chevron')+'</a></div></section>';
}
function bottomNav(){
 const parts:[Tab,string,string][]=[['home','Головна','home'],['devices','Пристрої','devices'],['analytics','Аналітика','analytics'],['settings','Параметри','settings']];
 return '<nav class="app-tabbar" aria-label="Основна навігація">'+parts.map(([id,name,ico])=>'<button class="'+(state.tab===id?'active':'')+'" data-nav="'+id+'" '+(state.tab===id?'aria-current="page"':'')+'>'+icon(ico)+'<span>'+name+'</span></button>').join('')+'</nav>';
}
function render(){
 const headings:Record<Tab,[string,string]>={home:['Головна','Повний огляд твоєї системи'],devices:['Пристрої','Підключення, показники та керування'],analytics:['Аналітика','Реальна історія енергоспоживання'],settings:['Параметри','Налаштування VOLTOS']};
 const [title,subtitle]=headings[state.tab];
 let body='';
 if(state.tab==='home')body=overview()+summary()+homeDevices();
 else if(state.tab==='devices')body=deviceGrid()+controls();
 else if(state.tab==='analytics')body=chart();
 else body=settingsPage();
 root.innerHTML='<div class="app-frame"><header class="app-header"><div class="brand-lockup"><div class="app-mark">'+icon('bolt')+'</div><div><strong>VOLTOS</strong><span>ENERGY OPERATING SYSTEM</span></div></div><div class="header-right"><span class="header-live '+(connectedCount()?'connected':'')+'">'+(connectedCount()?'● LIVE':'○ OFFLINE')+'</span><button class="icon-btn header-refresh" data-action="refresh-all" aria-label="Оновити всі пристрої">'+icon('refresh')+'</button></div></header>'+
 '<main id="app-scroll" class="app-content"><div class="page-heading"><div class="page-kicker">VOLTOS / '+title.toUpperCase()+'</div><h1>'+title+'</h1><p>'+subtitle+'</p></div>'+body+'<footer class="app-footer">VOLTOS ENERGY OS <span>·</span> Показники оновлюються лише за доступності пристроїв</footer></main>'+bottomNav()+
 (state.toast?'<div class="toast '+state.toastKind+'" role="status">'+(state.toastKind==='error'?icon('warning'):icon('check'))+h(state.toast)+'</div>':'')+'</div>';
 bind();
}
function bind(){
 root.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.nav as Tab;render();$('app-scroll')?.scrollTo(0,0)});
 root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.onclick=()=>void action(b.dataset.action||''));
 root.querySelector<HTMLFormElement>('#ouk-login')?.addEventListener('submit',e=>{
  e.preventDefault();const f=new FormData(e.currentTarget as HTMLFormElement);
  void loginOukitel(String(f.get('email')||''),String(f.get('password')||''));
 });
 root.querySelector<HTMLFormElement>('#atl-login')?.addEventListener('submit',e=>{
  e.preventDefault();const f=new FormData(e.currentTarget as HTMLFormElement);
  void loginAtlantic(String(f.get('password')||''));
 });
 root.querySelectorAll<HTMLButtonElement>('[data-ouk-control]').forEach(b=>b.onclick=()=>void controlOukitel(b.dataset.oukControl as 'ac'|'dc'|'usb',b.dataset.value==='on'));
 root.querySelector<HTMLSelectElement>('#ouk-select')?.addEventListener('change',e=>{
  state.oukitelId=(e.currentTarget as HTMLSelectElement).value;state.oukitel=null;void refreshOukitel();
 });
 root.querySelectorAll<HTMLButtonElement>('[data-temp]').forEach(b=>b.onclick=()=>{
  if(state.atlantic?.targetTemperature!=null)void controlAtlantic('temperature',state.atlantic.targetTemperature+Number(b.dataset.temp));
 });
 root.querySelectorAll<HTMLButtonElement>('[data-power]').forEach(b=>b.onclick=()=>void controlAtlantic('power',b.dataset.power==='on'));
 root.querySelector<HTMLSelectElement>('#climate-mode')?.addEventListener('change',e=>{
  const v=(e.currentTarget as HTMLSelectElement).value;
  if(v)void controlAtlantic('mode',v);
 });
 root.querySelectorAll<HTMLButtonElement>('[data-ble-control]').forEach(b=>b.onclick=()=>void controlBle(b.dataset.bleControl||'',Number(b.dataset.value)));
 root.querySelectorAll<HTMLSelectElement>('[data-ble-select]').forEach(b=>b.onchange=()=>void controlBle(b.dataset.bleSelect||'',Number(b.value)));
 root.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(b=>b.onclick=()=>{state.chartSource=b.dataset.source as ChartSource;state.metric=state.chartSource==='atlantic'?'room':'output';render()});
 root.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach(b=>b.onclick=()=>{state.metric=b.dataset.metric as Metric;render()});
 root.querySelectorAll<HTMLButtonElement>('[data-range]').forEach(b=>b.onclick=()=>{state.range=Number(b.dataset.range);render()});
 root.querySelector<HTMLInputElement>('#alert')?.addEventListener('change',e=>{
  settings.alert=Number((e.currentTarget as HTMLInputElement).value);save('voltos-alert',String(settings.alert));state.bleAlertSent=false;render();
 });
}
async function action(name:string){
 if(name==='ble-connect')return connectBle();
 if(name==='ble-refresh')return refreshBle();
 if(name==='ble-disconnect')return disconnectBle();
 if(name==='ouk-refresh')return refreshOukitel();
 if(name==='ouk-logout')return logoutOukitel();
 if(name==='atl-refresh')return refreshAtlantic();
 if(name==='refresh-all')return Promise.allSettled([ble.connected?refreshBle():Promise.resolve(),state.oukitelAuthed?refreshOukitel():Promise.resolve(),state.atlanticAuthed?refreshAtlantic():Promise.resolve()]).then(()=>toast('Оновлення завершено'));
 if(name==='export')return exportCsv();
 if(name==='clear-history'&&confirm('Безповоротно видалити локальну історію всіх пристроїв?')){points=[];cloudPoints=[];climatePoints=[];save(logKey,'[]');save(cloudLogKey,'[]');save(climateLogKey,'[]');toast('Історію очищено','success')}
}
async function connectBle(){
 if(state.bleConnecting)return;
 if(!NATIVE){toast('На iPhone Bluetooth доступний через встановлену Xcode-версію VOLTOS.','info');return}
 state.bleConnecting=true;state.bleError='';render();
 try{
  await ble.connect();await refreshBle();
  try{state.bleControls=await ble.readControls()}catch{}
  toast('BLUETTI EB3A підключено','success');
 }catch(e){state.bleError=e instanceof Error?e.message:String(e);toast(state.bleError,'error')}
 finally{state.bleConnecting=false;render()}
}
async function refreshBle(){
 if(!ble.connected||state.bleBusy)return;
 state.bleBusy=true;render();
 try{
  const d=await ble.refresh();state.ble=d;state.bleError='';capture();
  if(d.soc<=settings.alert&&!state.bleAlertSent){state.bleAlertSent=true;toast('EB3A: заряд нижче '+settings.alert+'%','error')}
  if(d.soc>settings.alert)state.bleAlertSent=false;
 }catch(e){state.bleError=e instanceof Error?e.message:String(e)}
 finally{state.bleBusy=false;render()}
}
async function disconnectBle(){
 await ble.disconnect();state.ble=null;state.bleControls=null;state.bleError='';render();
}
async function controlBle(name:string,value:number){
 const regs:Record<string,3007|3008|3034|3063|3065|3066>={ac:3007,dc:3008,led:3034,eco:3063,chargeMode:3065,lifting:3066};
 if(!ble.connected||state.bleControlBusy||regs[name]===undefined)return;
 const dangerous=name==='ac'&&value===0;
 if(!confirm((dangerous?'Увага: буде вимкнено живлення AC 230 В!\n\n':'')+'Підтвердити зміну '+name+'?')){render();return}
 state.bleControlBusy=true;render();
 try{
  await ble.setRegister(regs[name],value);
  state.bleControls=await ble.readControls();
  await refreshBle();
  toast('Команду підтверджено станцією','success');
 }catch(e){toast(e instanceof Error?e.message:'Не вдалося виконати команду','error')}
 finally{state.bleControlBusy=false;render()}
}
async function loginOukitel(email:string,password:string){
 if(state.oukitelBusy)return;
 state.oukitelBusy=true;state.oukitelError='';render();
 try{
  const x=await oukitel.login(email,password);state.oukitelAuthed=x.connected;state.oukitelList=x.devices;state.oukitelId=x.devices[0]?.deviceKey??'';
  toast(x.devices.length?'Oukitel підключено':'В акаунті немає пристроїв','success');
 }catch(e){state.oukitelError=e instanceof Error?e.message:String(e)}
 finally{state.oukitelBusy=false;render()}
 if(state.oukitelAuthed)void refreshOukitel();
}
async function refreshOukitel(){
 if(!state.oukitelAuthed||state.oukitelBusy)return;
 const d=state.oukitelList.find(x=>x.deviceKey===state.oukitelId)??state.oukitelList[0];
 if(!d)return;
 state.oukitelBusy=true;render();
 try{
  state.oukitel=await oukitel.state(d);state.oukitelError='';
  const reading=state.oukitel;
  if(reading.soc!==null||reading.inputWatts!==null||reading.outputWatts!==null)
   appendSample(cloudPoints,{at:Date.now(),soc:reading.soc,input:reading.inputWatts,output:reading.outputWatts},cloudLogKey);
 }
 catch(e){state.oukitelError=e instanceof Error?e.message:String(e);state.oukitel=null}
 finally{state.oukitelBusy=false;render()}
}
async function controlOukitel(port:'ac'|'dc'|'usb',on:boolean){
 if(!state.oukitel||state.oukitelBusy||!state.oukitel.device.online)return;
 const current=port==='ac'?state.oukitel.acOn:port==='dc'?state.oukitel.dcOn:state.oukitel.usbOn;
 if(current===null||current===on)return;
 const warning=port==='ac'&&!on?'УВАГА: розетки 230 В будуть вимкнені. Це може знеструмити холодильник!\\n\\n':'';
 if(!confirm(warning+'Змінити стан '+port.toUpperCase()+' на '+(on?'УВІМКНЕНО':'ВИМКНЕНО')+'?'))return;
 state.oukitelBusy=true;render();
 try{
  const r=await oukitel.control(state.oukitel.device,port,on);
  if(!r.accepted)throw Error('Хмара не прийняла команду');
  toast(r.confirmed?'Cloud показує потрібний стан':'Команда прийнята, але стан ще не підтверджено',r.confirmed?'success':'info');
 }catch(e){toast(e instanceof Error?e.message:'Помилка керування Oukitel','error')}
 finally{state.oukitelBusy=false;render()}
 void refreshOukitel();
}
async function logoutOukitel(){
 try{await oukitel.logout()}catch{}
 state.oukitel=null;state.oukitelAuthed=false;state.oukitelList=[];state.oukitelId='';render();
}
async function loginAtlantic(password:string){
 if(state.atlanticBusy)return;
 state.atlanticBusy=true;state.atlanticError='';render();
 try{
  const response=await atlantic.login(password);
  state.atlanticAuthed=response.authenticated;toast('Atlantic Home підключено','success');
 }catch(e){state.atlanticError=e instanceof Error?e.message:String(e)}
 finally{state.atlanticBusy=false;render()}
 if(state.atlanticAuthed)void refreshAtlantic();
}
async function refreshAtlantic(){
 if(!state.atlanticAuthed||state.atlanticBusy)return;
 state.atlanticBusy=true;render();
 try{
  state.atlantic=await atlantic.state();state.atlanticError='';
  const d=state.atlantic;
  if(d.roomTemperature!==null||d.targetTemperature!==null)
   appendSample(climatePoints,{at:Date.now(),room:d.roomTemperature,target:d.targetTemperature},climateLogKey);
 }
 catch(e){state.atlantic=null;state.atlanticError=e instanceof Error?e.message:String(e)}
 finally{state.atlanticBusy=false;render()}
}
async function controlAtlantic(action:'temperature'|'power'|'mode',value:number|boolean|string){
 if(!state.atlanticAuthed||!state.atlantic?.deviceOnline||state.atlanticBusy)return;
 if(!confirm('Змінити параметри конвектора?\n'+action+': '+String(value)))return;
 state.atlanticBusy=true;render();
 try{
  const result=await atlantic.control(action,value);
  if(!result.accepted)throw Error('Cozytouch не прийняв команду');
  toast('Команду відправлено. Перевіряємо стан…','info');
 }catch(e){toast(e instanceof Error?e.message:'Помилка Cozytouch','error')}
 finally{state.atlanticBusy=false;render()}
 await refreshAtlantic();
}
function exportCsv(){
 const source=state.chartSource;
 const lines=source==='atlantic'?
  ['date,room_c,target_c',...climatePoints.map(p=>[new Date(p.at).toISOString(),p.room??'',p.target??''].join(','))]:
  source==='oukitel'?
  ['date,soc,input_w,output_w,source',...cloudPoints.map(p=>[new Date(p.at).toISOString(),p.soc??'',p.input??'',p.output??'','cloud_snapshot'].join(','))]:
  ['date,soc,input_w,output_w',...points.map(p=>[new Date(p.at).toISOString(),p.soc,p.input,p.output].join(','))];
 const a=document.createElement('a');
 const url=URL.createObjectURL(new Blob([lines.join('\\n')],{type:'text/csv;charset=utf-8'}));
 a.href=url;a.download='voltos-'+source+'-history.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function restore(){
 try{
  const a=await atlantic.session();state.atlanticAuthed=a.authenticated;state.atlanticConfigured=a.configured;
  if(a.authenticated)void refreshAtlantic();
 }catch{state.atlanticConfigured=false}
 try{
  const o=await oukitel.session();state.oukitelAuthed=o.connected;
  if(o.connected){
   const x=await oukitel.devices();state.oukitelList=x.devices;state.oukitelId=x.devices[0]?.deviceKey??'';
   if(x.devices.length)void refreshOukitel();
  }
 }catch{}
 render();
}
ble.onDisconnect(()=>{state.ble=null;state.bleControls=null;state.bleError='Bluetooth від’єднано';render()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(ble.connected)void refreshBle();if(state.atlanticAuthed)void refreshAtlantic();if(state.oukitelAuthed)void refreshOukitel()}});
setInterval(()=>{if(document.visibilityState!=='visible')return;if(ble.connected)void refreshBle();},12000);
setInterval(()=>{if(document.visibilityState!=='visible')return;if(state.atlanticAuthed)void refreshAtlantic();if(state.oukitelAuthed)void refreshOukitel();},60000);
if(!NATIVE&&'serviceWorker' in navigator)window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js').catch(()=>{})});
render();void restore();
