import './style.css';
import { Capacitor } from '@capacitor/core';
import { Eb3aBle, type Eb3aReading } from './eb3a';
import { demoDevices } from './model';
import { atlantic, type AtlanticState } from './atlantic';
import { heaterCard } from './heater-ui';

const el=document.querySelector<HTMLDivElement>('#app');
if(!el)throw Error('Не знайдено контейнер застосунку');
const eb3a=new Eb3aBle();
let selected='home';
let reading:Eb3aReading|null=null;
let connecting=false;
let busy=false;
let statusText='Не підключено';
let lastError='';
let controls: {led:number|null;eco:number|null;chargeMode:number|null;lifting:number|null}|null=null;
let controlBusy=false;
let heater:AtlanticState|null=null;
let heaterAuthed=false;
let heaterConfigured=false;
let heaterPending=false;
let heaterError='';
let chartHours=24;
let threshold=Number(localStorage.getItem('voltos-low-battery')||20);
if(!Number.isFinite(threshold)||threshold<5||threshold>90)threshold=20;
let lowChargeNotified=false;
let chartMetric:'output'|'input'|'soc'='output';

let poller:ReturnType<typeof setInterval>|null=null;
type Point={at:number,soc:number,input:number,output:number};
const HISTORY_KEY='voltos-eb3a-history-v1';
let history:Point[]=[];
try{
 const items=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]') as Point[];
 if(Array.isArray(items))history=items.filter(p=>p&&Number.isFinite(p.at)&&p.at>Date.now()-30*86400000).slice(-5000);
}catch{}
const svg=(name:string)=>({
home:'<path d="m3 10 9-7 9 7v11H3z"/><path d="M9 21v-8h6v8"/>',
battery:'<rect x="2" y="6" width="17" height="12" rx="2"/><path d="M22 10v4"/>',
chart:'<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>',
bolt:'<path d="m13 2-3 8h8L9 22l2-9H5l8-11Z"/>',
bluetooth:'<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',
refresh:'<path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6M4 13a8 8 0 0 0 14 5l3-3m0 6v-6h-6"/>'
} as Record<string,string>)[name]||'';
const icon=(name:string)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+svg(name)+'</svg>';
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const format=(n:number)=>new Intl.NumberFormat('uk-UA',{maximumFractionDigits:0}).format(n);
const stamp=(s:string)=>new Date(s).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const computedRuntime=(soc:number,output:number,capacity:number)=>{
 if(output<=2)return '—';
 const mins=Math.round(capacity*soc/100*.85/output*60);
 return Math.floor(mins/60)+' год '+mins%60+' хв';
};
function saveSample(r:Eb3aReading){
 const now=Date.now(),last=history.at(-1);
 if(last&&now-last.at<60000)return;
 history.push({at:now,soc:r.soc,input:r.inputWatts,output:r.outputWatts});
 history=history.filter(p=>p.at>now-30*86400000).slice(-5000);
 try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}catch{}
}

function hero(){
 const soc=reading?.soc??84;
 const live=Boolean(reading);
 return '<section class="energy-hero"><div class="hero-top"><span>ENERGY OVERVIEW</span><span class="hero-indicator">'+(live?'● BLUETOOTH LIVE':'◉ ДИЗАЙН-ПРЕВ’Ю')+'</span></div><div class="hero-inner"><div class="charge-ring" style="--soc:'+soc+'"><div class="ring-center"><strong>'+soc+'<small>%</small></strong><span>'+(live?'BLUETTI EB3A':'ДЕМО')+'</span></div></div><div class="hero-copy"><span class="hero-kicker">'+(live?'ЗАРЯД СТАНЦІЇ':'ТВОЯ ЕНЕРГОСИСТЕМА')+'</span><h2>'+(live?'Підключено':'Енергія під контролем')+'</h2><p>'+(live?'Вимірювання з пристрою':'Підключи EB3A для отримання реальних показників')+'</p><div class="hero-metrics"><span>↓ '+(reading?reading.inputWatts:'—')+' Вт</span><span>↑ '+(reading?reading.outputWatts:'—')+' Вт</span></div></div></div><div class="hero-foot"><span>Прогноз автономності</span><strong>'+(reading?computedRuntime(reading.soc,reading.outputWatts,268.8):'—')+'</strong></div></section>';
}
function controlsMarkup(){
 if(!reading)return '<section class="controls-section"><div class="section-title"><h2>Центр керування</h2><span>Прев’ю</span></div><div class="controls-grid">'+[['AC 230 В','Розетки'],['DC / USB','Живлення гаджетів'],['ECO','Енергозбереження'],['Power Lifting','Підвищена потужність']].map(([n,d])=>'<div class="control-tile"><div><strong>'+n+'</strong><small>'+d+'</small></div><button class="toggle-action" disabled>Демо</button></div>').join('')+'</div><p class="controls-warning">Демонстрація дизайну. Реальні команди доступні тільки після підключення EB3A.</p></section>';
 const act=(name:string,description:string,key:string,current:boolean|null,next:number)=>'<div class="control-tile"><div><strong>'+name+'</strong><small>'+description+'</small></div><button type="button" data-control="'+key+'" data-value="'+next+'" '+(current===null||controlBusy?'disabled':'')+' class="toggle-action '+(current?'enabled':'')+'">'+(current===null?'Н/Д':current?'Увімк.':'Вимк.')+'</button></div>';
 const sel=(name:string,description:string,key:string,current:number|null,values:[number,string][])=>'<div class="control-tile"><div><strong>'+name+'</strong><small>'+description+'</small></div><select data-control-select="'+key+'" '+(current===null||controlBusy?'disabled':'')+'>'+values.map(([v,label])=>'<option value="'+v+'" '+(current===v?'selected':'')+'>'+label+'</option>').join('')+'</select></div>';
 return '<section class="controls-section"><div class="section-title"><h2>Керування EB3A</h2><span>З підтвердженням</span></div><div class="controls-grid">'+act('AC 230 В','Розетки змінного струму','ac',reading.acEnabled,reading.acEnabled?0:1)+act('DC / USB','Порти постійного струму','dc',reading.dcEnabled,reading.dcEnabled?0:1)+act('ECO','Економний режим','eco',controls?.eco==null?null:controls.eco===1,controls?.eco===1?0:1)+act('Power Lifting','Підвищена потужність','lifting',controls?.lifting==null?null:controls.lifting===1,controls?.lifting===1?0:1)+sel('Режим заряджання','Швидкість заряджання','chargeMode',controls?.chargeMode??null,[[0,'Standard'],[1,'Silent'],[2,'Turbo']])+sel('LED','Вбудований ліхтарик','led',controls?.led??null,[[4,'Вимкнено'],[1,'Слабкий'],[2,'Яскравий'],[3,'SOS']])+'</div><p class="controls-warning">Команди виконуються тільки після ручного підтвердження й перевіряються зчитуванням. Не вимикай AC, якщо підключено критичні прилади.</p></section>';
}
function analyticsMarkup(){
 const points=history.filter(p=>p.at>=Date.now()-chartHours*3600000).slice(-120);
 const value=(p:Point)=>chartMetric==='soc'?p.soc:chartMetric==='input'?p.input:p.output;
 const max=Math.max(1,...points.map(value));
 const tabs=(values:[string,string][],active:string,key:string)=>values.map(([v,label])=>'<button data-'+key+'="'+v+'" class="'+(active===v?'active':'')+'">'+label+'</button>').join('');
 const bars=points.length?'<div class="history-bars">'+points.map(p=>'<div class="history-bar" title="'+new Date(p.at).toLocaleString('uk-UA')+' / '+value(p)+'"><i style="height:'+Math.max(3,value(p)/max*100)+'%"></i></div>').join('')+'</div>':'<div class="preview-chart"><span>ДЕМО-ГРАФІК · НЕ РЕАЛЬНІ ВИМІРЮВАННЯ</span><div class="history-bars">'+Array.from({length:32},(_,i)=>'<div class="history-bar"><i style="height:'+(12+Math.round(Math.abs(Math.sin(i*.9)*65+Math.cos(i*.3)*17)))+'%"></i></div>').join('')+'</div></div>';
 return '<div class="history-panel"><span class="eyebrow">РЕАЛЬНА ІСТОРІЯ · EB3A</span><h2>Аналітика енергії</h2><p>Дані записуються локально, коли застосунок відкритий.</p><div class="chart-toolbar">'+tabs([['1','1 год'],['24','24 год'],['168','7 днів']],String(chartHours),'hours')+'</div><div class="chart-toolbar">'+tabs([['output','Вихід'],['input','Вхід'],['soc','Заряд']],chartMetric,'metric')+'</div>'+bars+'<div class="chart-caption">'+points.length+' вимірювань · '+(chartMetric==='soc'?'%':'Вт')+'</div><button id="export" class="action outline">Експорт CSV</button></div>';
}

function deviceCard(title:string,brand:string,soc:number,source:string,input:number,output:number,capacity:number,live:boolean){
 return '<article class="device-card"><div class="device-top"><div class="device-icon">'+icon('battery')+'</div><span class="status '+(live&&!lastError?'live':'')+'">'+(live?(lastError?'⚠ ЗАСТАРІЛО':'● LIVE'):'ДЕМО')+'</span></div><p class="eyebrow">'+brand+'</p><h3>'+escapeHtml(title)+'</h3><div class="charge-row"><strong>'+soc+'%</strong><span>'+source+'</span></div><div class="track"><div style="width:'+soc+'%"></div></div><div class="metrics"><span>↓ Вхід <b>'+format(input)+' Вт</b></span><span>↑ Вихід <b>'+format(output)+' Вт</b></span></div><div class="runtime">Автономність: <b>'+computedRuntime(soc,output,capacity)+'</b></div></article>';
}
function navButton(tab:string,label:string,symbol:string){
 return '<button type="button" data-tab="'+tab+'" class="'+(selected===tab?'active':'')+'" aria-label="'+label+'" '+(selected===tab?'aria-current="page"':'')+'>'+icon(symbol)+'<span>'+label+'</span></button>';
}
function realCards(){
 if(!reading)return '';
 return deviceCard(reading.deviceName,'BLUETTI · BLUETOOTH',reading.soc,'BLE · '+stamp(reading.measuredAt),reading.inputWatts,reading.outputWatts,268.8,true);
}
function demoCards(){
 return demoDevices.map(d=>deviceCard(d.model,d.brand,d.batteryPercent,d.connection,d.inputWatts,d.outputWatts,d.capacityWh,false)).join('');
}
function title(){return ({home:'Енергосистема',devices:'Мої пристрої',analytics:'Аналітика',settings:'Параметри'} as Record<string,string>)[selected];}
function render(){
 const live=Boolean(reading);
 const cards=realCards()+(!live?demoCards():'');
 const energy=reading?268.8*reading.soc/100:null;
 const watts=reading?.outputWatts;
 const summary='<div class="summary-grid"><div class="summary"><span>ЗАПАС ЕНЕРГІЇ</span><strong>'+(energy===null?'—':format(energy))+' <small>Вт·год</small></strong><p>'+(live?'BLUETTI · реальні дані':'Підключи станцію')+'</p></div><div class="summary"><span>СПОЖИВАННЯ</span><strong>'+(watts===undefined?'—':format(watts))+' <small>Вт</small></strong><p>'+(live?'Поточне вимірювання':'Немає вимірювань')+'</p></div><div class="summary"><span>ПІДКЛЮЧЕНО</span><strong>'+(live?1:0)+' <small>пристрій</small></strong><p>'+escapeHtml(statusText)+'</p></div></div>';
 const info='<div class="connection-panel"><div class="connect-description"><span class="eyebrow">BLUETTI EB3A · BLE</span><h2>'+(reading?'Станція підключена':'Підключити станцію')+'</h2><p>Нативний Bluetooth на iPhone. Реальні показники заряду й потужності з твоєї EB3A.</p><p class="connection-state">'+escapeHtml(statusText)+'</p>'+(reading?'<p class="measured">Вимірювання: '+stamp(reading.measuredAt)+' · AC '+(reading.acEnabled?'увімкнено':'вимкнено')+' · DC '+(reading.dcEnabled?'увімкнено':'вимкнено')+'</p>':'')+(lastError?'<p class="error-note">'+escapeHtml(lastError)+'</p>':'')+'</div><div class="connect-actions">'+(eb3a.connected?'<button id="refresh" class="action primary">'+icon('refresh')+' Оновити</button><button id="disconnect" class="action outline">Від’єднати</button>':'<button id="connect" class="action primary">'+icon('bluetooth')+' '+(connecting?'Підключення…':'Знайти EB3A')+'</button>')+'</div></div>';
 let body='';
 if(selected==='home'||selected==='devices'){
  body=(selected==='home'?hero()+heaterCard(heater,heaterAuthed,heaterConfigured,heaterPending,heaterError,escapeHtml,stamp):'')+info+summary+controlsMarkup()+'<div class="section-title"><h2>'+(live?'Реальні пристрої':'Попередній перегляд карток')+'</h2><span>'+(live?'1 підключено':'Демо без підключення')+'</span></div><div class="device-grid">'+cards+'</div>';
 }else if(selected==='analytics'){
  body=analyticsMarkup();
 }else{
  body=heaterCard(heater,heaterAuthed,heaterConfigured,heaterPending,heaterError,escapeHtml,stamp)+'<div class="history-panel"><span class="eyebrow">ПОПЕРЕДЖЕННЯ</span><h2>Низький заряд</h2><p>Локальне попередження, поки застосунок відкритий. Фонові push потребують хмарного моніторингу.</p><label for="threshold" class="threshold-label">Рівень попередження <b>'+threshold+'%</b></label><input id="threshold" type="range" min="5" max="90" step="5" value="'+threshold+'"></div><div class="history-panel"><span class="eyebrow">ПАРАМЕТРИ</span><h2>Джерела енергії</h2><p>BLUETTI EB3A: '+escapeHtml(eb3a.connected?'підключено':'не підключено')+'</p><p>Oukitel P2001E Plus: інтеграція захищеного Cloud API у розробці. Облікові дані виробника не вводяться в PWA.</p><p>На iPhone Safari не підтримує Web Bluetooth — для керування EB3A потрібна нативна збірка Xcode.</p><p>Платформа: '+(Capacitor.isNativePlatform()?'Нативна':'Браузерна')+'</p></div>';

 }
 el!.innerHTML='<div class="shell"><aside class="sidebar"><div class="brand"><span class="mark">'+icon('bolt')+'</span><span>VOLTOS<small>ENERGY OS</small></span></div><nav class="desktop-nav">'+navButton('home','Головна','home')+navButton('devices','Пристрої','battery')+navButton('analytics','Графіки','chart')+navButton('settings','Параметри','settings')+'</nav><div class="side-footer">VOLTOS 0.2 · Native BLE Preview</div></aside><main class="main"><header class="topbar"><div class="mobile-brand"><span class="mark">'+icon('bolt')+'</span> VOLTOS</div><span class="preview-pill">'+(reading?'● BLUETOOTH LIVE':'● BLE PREVIEW')+'</span></header><div class="page-scroll"><section class="content"><p class="overline">VOLTOS / '+title().toUpperCase()+'</p><div class="heading"><div><h1>'+title()+'</h1><p>Контроль енергії в одному місці.</p></div></div>'+body+'</section></div><nav class="bottom-nav">'+navButton('home','Головна','home')+navButton('devices','Пристрої','battery')+navButton('analytics','Графіки','chart')+navButton('settings','Параметри','settings')+'</nav></main></div>';
 document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{selected=b.dataset.tab||'home';render();document.querySelector('.page-scroll')?.scrollTo(0,0);});
 document.getElementById('connect')?.addEventListener('click',()=>void connect());
 document.getElementById('refresh')?.addEventListener('click',()=>void refresh());
 document.getElementById('disconnect')?.addEventListener('click',()=>void disconnect());
 document.getElementById('atlantic-login')?.addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget as HTMLFormElement;void heaterLogin(String(new FormData(f).get('password')||''));});
 document.getElementById('heater-refresh')?.addEventListener('click',()=>void heaterRefresh());
 document.querySelectorAll<HTMLButtonElement>('[data-heat-temp]').forEach(b=>b.onclick=()=>{if(heater?.targetTemperature!=null)void heaterControl('temperature',heater.targetTemperature+Number(b.dataset.heatTemp));});
 document.querySelectorAll<HTMLButtonElement>('[data-heat-power]').forEach(b=>b.onclick=()=>void heaterControl('power',b.dataset.heatPower==='on'));
 document.getElementById('heater-mode')?.addEventListener('change',e=>{const mode=(e.currentTarget as HTMLSelectElement).value;if(mode)void heaterControl('mode',mode);});
 document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(b=>b.onclick=()=>void runControl(b.dataset.control||'',Number(b.dataset.value)));
 document.querySelectorAll<HTMLSelectElement>('[data-control-select]').forEach(b=>b.onchange=()=>void runControl(b.dataset.controlSelect||'',Number(b.value)));
 document.querySelectorAll<HTMLButtonElement>('[data-hours]').forEach(b=>b.onclick=()=>{chartHours=Number(b.dataset.hours);render();});
 document.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach(b=>b.onclick=()=>{chartMetric=b.dataset.metric as typeof chartMetric;render();});
 document.getElementById('export')?.addEventListener('click',exportCsv);
 document.getElementById('threshold')?.addEventListener('change',e=>{threshold=Number((e.currentTarget as HTMLInputElement).value);localStorage.setItem('voltos-low-battery',String(threshold));lowChargeNotified=false;render();});
 (document.getElementById('refresh') as HTMLButtonElement|null)?.toggleAttribute('disabled',busy);
 (document.getElementById('connect') as HTMLButtonElement|null)?.toggleAttribute('disabled',connecting);
}
async function refresh(){
 if(!eb3a.connected||busy)return;
 busy=true;statusText='Зчитування телеметрії…';render();
 try{
  const updated=await eb3a.refresh();reading=updated;saveSample(updated);
  if(updated.soc<=threshold&&!lowChargeNotified){lowChargeNotified=true;window.alert('VOLTOS: заряд EB3A '+updated.soc+'%. Поріг: '+threshold+'%.');}
  if(updated.soc>threshold)lowChargeNotified=false;
  lastError='';statusText='Bluetooth підключено';
 }catch(e){statusText='Помилка зчитування';lastError=e instanceof Error?e.message:String(e);}
 finally{busy=false;render();}
}
async function connect(){
 if(connecting)return;connecting=true;lastError='';statusText='Пошук EB3A…';render();
 try{
  await eb3a.connect();statusText='Bluetooth підключено';
  await refresh();
  try{controls=await eb3a.readControls();}catch{}
  render();
  if(poller)clearInterval(poller);
  poller=setInterval(()=>{if(eb3a.connected&&!busy&&document.visibilityState==='visible')void refresh()},10000);
 }catch(e){lastError=e instanceof Error?e.message:String(e);statusText='Не вдалося підключитися';}
 finally{connecting=false;render();}
}
async function disconnect(){
 if(poller)clearInterval(poller);poller=null;
 await eb3a.disconnect();reading=null;controls=null;statusText='Не підключено';lastError='';render();
}
eb3a.onDisconnect(()=>{reading=null;controls=null;statusText='Bluetooth від’єднано';if(poller)clearInterval(poller);poller=null;render();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&eb3a.connected)void refresh();});
render();

async function runControl(key:string,value:number){
 const regs:Record<string,3007|3008|3034|3063|3065|3066>={ac:3007,dc:3008,eco:3063,lifting:3066,chargeMode:3065,led:3034};
 if(!eb3a.connected||!reading||controlBusy||regs[key]===undefined)return;
 if(!window.confirm('Змінити '+key+' на '+value+'? Переконайся, що підключені прилади в безпеці.')){render();return;}
 controlBusy=true;statusText='Надсилання команди…';render();
 try{
  await eb3a.setRegister(regs[key],value);
  controls=await eb3a.readControls();
  if(key==='ac'||key==='dc'){const fresh=await eb3a.refresh();reading=fresh;saveSample(fresh);}
  statusText='Команду підтверджено';lastError='';
 }catch(e){lastError=e instanceof Error?e.message:String(e);statusText='Команда не підтверджена';}
 finally{controlBusy=false;render();}
}
function exportCsv(){
 const content=['date,soc,input_w,output_w',...history.map(p=>[new Date(p.at).toISOString(),p.soc,p.input,p.output].join(','))].join('\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv'}));
 const a=document.createElement('a');a.href=url;a.download='voltos-eb3a.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
if('serviceWorker' in navigator&&!Capacitor.isNativePlatform()){
 window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js').catch(()=>{});});
}

async function heaterRefresh(){
 if(!heaterAuthed||heaterPending)return;
 heaterPending=true;render();
 try{heater=await atlantic.state();heaterError='';}
 catch(e){heater=null;heaterError=e instanceof Error?e.message:'Сервер недоступний';}
 finally{heaterPending=false;render();}
}
async function heaterLogin(password:string){
 if(heaterPending)return;
 heaterPending=true;heaterError='';render();
 try{await atlantic.login(password);heaterAuthed=true;}
 catch(e){heaterError=e instanceof Error?e.message:'Помилка входу';}
 finally{heaterPending=false;render();}
 if(heaterAuthed)void heaterRefresh();
}
async function heaterControl(action:'temperature'|'power'|'mode',value:number|boolean|string){
 if(!heaterAuthed||!heater?.deviceOnline||heaterPending)return;
 if(!window.confirm('Змінити '+action+' на '+value+'?')){render();return;}
 heaterPending=true;heaterError='';render();
 try{const r=await atlantic.control(action,value);if(!r.accepted)throw Error('Cozytouch не прийняв команду');heaterError='Команду прийнято, перевіряємо стан…';}
 catch(e){heaterError=e instanceof Error?e.message:'Помилка керування';}
 finally{heaterPending=false;render();}
 void heaterRefresh();
}
void atlantic.session().then(s=>{heaterAuthed=s.authenticated;heaterConfigured=s.configured;render();if(heaterAuthed)void heaterRefresh()}).catch(()=>{heaterError='Серверний доступ недоступний';render()});
setInterval(()=>{if(heaterAuthed&&!heaterPending&&document.visibilityState==='visible')void heaterRefresh()},45000);
