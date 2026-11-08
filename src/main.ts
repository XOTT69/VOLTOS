import './style.css';
import { Capacitor } from '@capacitor/core';
import { Eb3aBle, type Eb3aReading } from './eb3a';
import { demoDevices, durationLabel } from './model';

const el=document.querySelector<HTMLDivElement>('#app');
if(!el)throw Error('Не знайдено контейнер застосунку');
const eb3a=new Eb3aBle();
let selected='home';
let reading:Eb3aReading|null=null;
let connecting=false;
let busy=false;
let statusText='Не підключено';
let lastError='';
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
function deviceCard(title:string,brand:string,soc:number,source:string,input:number,output:number,capacity:number,live:boolean){
 return '<article class="device-card"><div class="device-top"><div class="device-icon">'+icon('battery')+'</div><span class="status '+(live?'live':'')+'">'+(live?'● LIVE':'ДЕМО')+'</span></div><p class="eyebrow">'+brand+'</p><h3>'+escapeHtml(title)+'</h3><div class="charge-row"><strong>'+soc+'%</strong><span>'+source+'</span></div><div class="track"><div style="width:'+soc+'%"></div></div><div class="metrics"><span>↓ Вхід <b>'+format(input)+' Вт</b></span><span>↑ Вихід <b>'+format(output)+' Вт</b></span></div><div class="runtime">Автономність: <b>'+computedRuntime(soc,output,capacity)+'</b></div></article>';
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
  body=info+summary+'<div class="section-title"><h2>'+(live?'Реальні пристрої':'Попередній перегляд карток')+'</h2><span>'+(live?'1 підключено':'Демо без підключення')+'</span></div><div class="device-grid">'+cards+'</div>';
 }else if(selected==='analytics'){
  const h=history.slice(-25);
  const bars=h.length?'<div class="history-bars">'+h.map(p=>'<div class="history-bar" title="'+new Date(p.at).toLocaleString('uk-UA')+' · '+p.output+' Вт"><i style="height:'+Math.max(4,Math.min(100,p.output/600*100))+'%"></i></div>').join('')+'</div>':'';
  body='<div class="history-panel"><span class="eyebrow">ЛОКАЛЬНА ІСТОРІЯ</span><h2>Споживання BLUETTI</h2><p>Вимірювання записуються під час відкритої програми, не у фоновому режимі.</p>'+(h.length?bars+'<p>'+h.length+' останніх точок · 30 днів збереження</p>':'<div class="empty-inline">Ще немає вимірювань. Підключи EB3A на вкладці «Пристрої».</div>')+'</div>';
 }else{
  body='<div class="history-panel"><span class="eyebrow">ПІДКЛЮЧЕННЯ</span><h2>Джерела даних</h2><p>BLUETTI EB3A: '+escapeHtml(eb3a.connected?'Bluetooth підключено':'не підключено')+'</p><p>Oukitel P2001E Plus: хмарна інтеграція готується. Не вводь пароль виробника у демо-застосунок.</p><p>Платформа: '+(Capacitor.isNativePlatform()?'Нативний застосунок':'Веббраузер')+'</p></div>';
 }
 el!.innerHTML='<div class="shell"><aside class="sidebar"><div class="brand"><span class="mark">'+icon('bolt')+'</span><span>VOLTOS<small>ENERGY OS</small></span></div><nav class="desktop-nav">'+navButton('home','Головна','home')+navButton('devices','Пристрої','battery')+navButton('analytics','Графіки','chart')+navButton('settings','Параметри','settings')+'</nav><div class="side-footer">VOLTOS 0.2 · Native BLE Preview</div></aside><main class="main"><header class="topbar"><div class="mobile-brand"><span class="mark">'+icon('bolt')+'</span> VOLTOS</div><span class="preview-pill">'+(reading?'● BLUETOOTH LIVE':'● BLE PREVIEW')+'</span></header><div class="page-scroll"><section class="content"><p class="overline">VOLTOS / '+title().toUpperCase()+'</p><div class="heading"><div><h1>'+title()+'</h1><p>Контроль енергії в одному місці.</p></div></div>'+body+'</section></div><nav class="bottom-nav">'+navButton('home','Головна','home')+navButton('devices','Пристрої','battery')+navButton('analytics','Графіки','chart')+navButton('settings','Параметри','settings')+'</nav></main></div>';
 document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{selected=b.dataset.tab||'home';render();document.querySelector('.page-scroll')?.scrollTo(0,0);});
 document.getElementById('connect')?.addEventListener('click',()=>void connect());
 document.getElementById('refresh')?.addEventListener('click',()=>void refresh());
 document.getElementById('disconnect')?.addEventListener('click',()=>void disconnect());
 (document.getElementById('refresh') as HTMLButtonElement|null)?.toggleAttribute('disabled',busy);
 (document.getElementById('connect') as HTMLButtonElement|null)?.toggleAttribute('disabled',connecting);
}
async function refresh(){
 if(!eb3a.connected||busy)return;
 busy=true;statusText='Зчитування телеметрії…';render();
 try{
  const updated=await eb3a.refresh();reading=updated;saveSample(updated);
  lastError='';statusText='Bluetooth підключено';
 }catch(e){statusText='Помилка зчитування';lastError=e instanceof Error?e.message:String(e);}
 finally{busy=false;render();}
}
async function connect(){
 if(connecting)return;connecting=true;lastError='';statusText='Пошук EB3A…';render();
 try{
  await eb3a.connect();statusText='Bluetooth підключено';
  await refresh();
  if(poller)clearInterval(poller);
  poller=setInterval(()=>{if(eb3a.connected&&!busy&&document.visibilityState==='visible')void refresh()},10000);
 }catch(e){lastError=e instanceof Error?e.message:String(e);statusText='Не вдалося підключитися';}
 finally{connecting=false;render();}
}
async function disconnect(){
 if(poller)clearInterval(poller);poller=null;
 await eb3a.disconnect();reading=null;statusText='Не підключено';lastError='';render();
}
eb3a.onDisconnect(()=>{reading=null;statusText='Bluetooth від’єднано';if(poller)clearInterval(poller);poller=null;render();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&eb3a.connected)void refresh();});
render();
