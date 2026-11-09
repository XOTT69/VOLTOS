import './app.css';
import { App } from '@capacitor/app';
import { Eb3aBle, type Eb3aReading } from './eb3a';
import { atlantic, type AtlanticState } from './atlantic';
import { oukitel, type OukitelDevice, type OukitelReading } from './oukitel';
import { ApiError } from './native-api';
import { OukitelLan } from './oukitel-lan';
import { authBytes, privateIPv4 } from './oukitel-wire';
import { energyEstimate, chargeMinutes, planLoads } from './device-insights';
import { native, tap, shareCsv, SecureSession } from './native';
import { fresh, summarize, runtimeMinutes, series, chartPaths, csv, climateCapability, inRange, type Source, type Metric, type Sample } from './core';
import { registers, type BleControls, type Control } from './protocol';
import { read, write, loadHistory, record, clearHistory, loadJournal, journal } from './storage';
import { h, icon, num, time, ago, duration, equipmentArt } from './ui';

type Tab = 'home' | 'devices' | 'analytics' | 'settings';
type Kind = 'info' | 'error' | 'success';
type DeviceView = 'overview' | 'controls' | 'history' | 'connection';
const ble = new Eb3aBle();
const root = document.querySelector<HTMLElement>('#app')!;
const names: Record<Source, string> = { bluetti: 'BLUETTI EB3A', oukitel: 'Oukitel P2001E Plus', atlantic: 'Atlantic Altis Eco Boost' };
const symbols: Record<Source, string> = { bluetti: 'bluetooth', oukitel: 'cloud', atlantic: 'sun' };
const storedAlert = Number(read('voltos-alert', '20'));
const storedCapacity = Number(read('voltos-oukitel-capacity', '2048'));
const state = {
 tab: 'home' as Tab, source: 'bluetti' as Source, metric: 'output' as Metric, hours: 24, historyId: '',
 ble: null as Eb3aReading | null, bleControls: null as BleControls | null, bleBusy: false, bleConnecting: false, bleError: '', commandBusy: false,
 ouk: null as OukitelReading | null, oukDevices: [] as OukitelDevice[], oukId: read('voltos-oukitel-device'), oukAuthed: false, oukBusy: false, oukError: '',
 atl: null as AtlanticState | null, atlAuthed: false, atlBusy: false, atlError: '', atlConfigured: false,
 restoring: true, online: navigator.onLine, active: true, alert: inRange(storedAlert, 5, 90) ? storedAlert : 20,
 oukCapacity: inRange(storedCapacity, 100, 20000) ? storedCapacity : 2048, forecastWatts: 100,
 deviceView: 'controls' as DeviceView, favorites: read('voltos-favorites', '').split(',').filter(Boolean) as Source[],
 oukTransport: 'cloud' as 'cloud' | 'lan', lanRetries: 0, lanBusy: false, lanError: '', lanStatus: '', lanHost: read('voltos-lan-host'),
 lowNotified: false, samples: loadHistory(), entries: loadJournal(), detail: null as Source | null, theme: read('voltos-theme', 'dark'),
};
let oukGeneration = 0, atlGeneration = 0, noticeTimer: ReturnType<typeof setTimeout> | undefined;
let historyWarning = false;
let lastFocused: HTMLElement | null = null;
let appliedDark: boolean | undefined;
let lanRetryTimer: ReturnType<typeof setTimeout> | undefined;
const lan = new OukitelLan(reading => {
 if(state.oukTransport !== 'lan')return;
 state.lanRetries = 0; state.ouk = reading; state.lanError = ''; state.lanStatus = 'Прямі пакети станції надходять у VOLTOS';
 capture({ at: Date.parse(reading.measuredAt!), source: 'oukitel', deviceId: reading.device.deviceKey, transport:'lan', soc:reading.soc,input:reading.inputWatts,output:reading.outputWatts });
 render();
},(message,error) => {
 state.lanStatus = message;
 if(error){state.lanError = message; log(`Oukitel LAN: ${message}`,'error');}
 else state.lanError = '';
 render();
 if(error)scheduleLanRetry();
});
function scheduleLanRetry(){
 if(!native || !state.active || state.oukTransport !== 'lan' || state.lanBusy || lanRetryTimer || state.lanRetries >= 3 || read('voltos-lan-auto') !== 'on')return;
 const delay=2000*2**state.lanRetries;
 lanRetryTimer=setTimeout(()=>{lanRetryTimer=undefined;state.lanRetries++;void connectLan(undefined,true);},delay);
}
function chosenLanDevice(host:string): OukitelDevice {
 const owned = state.oukDevices.find(d=>d.deviceKey === state.oukId);
 if(owned)return owned;
 try { const saved = JSON.parse(read('voltos-lan-device','null')); if(saved && typeof saved.deviceKey==='string' && typeof saved.productKey==='string')return saved; } catch {}
 return {deviceKey:`lan-${host.replaceAll('.','-')}`,productKey:'manual-p2001e-plus',deviceName:'Oukitel P2001E Plus',productName:'P2001E Plus',online:false};
}
async function connectLan(form?: HTMLFormElement, automatic=false) {
 if(!native){notify('Локальний Wi-Fi доступний у встановленій iPhone-версії','info');return;}
 if(state.lanBusy || lan.ready)return;
 if(form)state.lanRetries=0;
 clearTimeout(lanRetryTimer);lanRetryTimer=undefined;
 const data = form ? new FormData(form) : null;
 const host = String(data?.get('host') || state.lanHost).trim();
 if(!privateIPv4(host)){notify('Вкажи приватну IPv4-адресу станції','error');return;}
 const device = chosenLanDevice(host), keyName = `oukitel-lan-${device.deviceKey}`;
 const remember = form ? data?.get('remember') === 'on' : read('voltos-lan-auto') === 'on';
 let key = String(data?.get('key') || '').trim();
 (document.activeElement as HTMLElement)?.blur();
 state.lanBusy = true; state.lanError = ''; render();
 try {
  if(!key)key = (await SecureSession.getSession({key:keyName})).value || '';
  if(!key && state.oukAuthed && state.online){
   const result = await oukitel.localKey(device);
   if(result.deviceKey !== device.deviceKey)throw Error('Ключ належить іншій станції');
   key = result.authKey;
  }
  if(!key)throw Error('Потрібен персональний ключ станції. Увійди у Cloud або введи ключ вручну.');
  authBytes(key);
  await lan.connect(host,key,device);
  state.oukId = device.deviceKey; state.lanHost = host;
  write('voltos-lan-host',host);write('voltos-lan-device',JSON.stringify(device));write('voltos-oukitel-device',device.deviceKey);
  if(remember){await SecureSession.setSession({key:keyName,value:key});write('voltos-lan-auto','on');}
  else {await SecureSession.removeSession({key:keyName});write('voltos-lan-auto','off');}
  log('Oukitel: локальний Wi-Fi канал авторизовано','success');
  if(!automatic)notify('Канал підключено. Очікуємо прямі показники станції.','info');
 } catch(error){state.lanError=errorText(error);if(error instanceof ApiError&&error.status===401){state.oukAuthed=false;state.oukError=state.lanError;}if(!automatic)notify(state.lanError,'error');}
 finally{key='';state.lanBusy=false;render();if(!lan.ready && state.lanError)scheduleLanRetry();}
}
async function disconnectLan(manual=true) {
 clearTimeout(lanRetryTimer);lanRetryTimer=undefined;
 await lan.disconnect();state.lanBusy=false;state.lanStatus='Локальний канал від’єднано';state.lanError='';
 if(manual)write('voltos-lan-auto','off');render();
}
async function controlLan(port:'ac'|'dc'|'usb',on:boolean) {
 if(!isOukAvailable()||state.commandBusy)return;
 if(!await ask(`${on ? 'Увімкнути' : 'Вимкнути'} ${port.toUpperCase()} через Wi-Fi?`,on?'Пряма команда станції. Виконання перевіряється новим локальним пакетом.':'Підключені до виходу прилади втратять живлення.',!on))return;
 if(!isOukAvailable()||state.commandBusy)return;
 state.commandBusy=true;render();
 try{await lan.setOutput(port,on);log(`Oukitel LAN: ${port.toUpperCase()} → ${on ? 'увімкнено' : 'вимкнено'}, підтверджено`,'success');notify('Станція підтвердила стан виходу','success');}
 catch(error){notify(errorText(error),'error');log(`Oukitel LAN: ${errorText(error)}`,'error');}
 finally{state.commandBusy=false;render();}
}

const isBleFresh = () => ble.connected && !state.bleError && fresh(state.ble?.measuredAt, 45000);
const oukObservedAt = () => state.ouk?.source === 'quectel-lan' ? state.ouk.measuredAt : state.ouk?.cloudCheckedAt;
const isOukAvailable = () => !!state.ouk?.device.online && (state.oukTransport === 'lan' ? lan.ready && !state.lanError && fresh(state.ouk.measuredAt, 30000) : !state.oukError && fresh(state.ouk.cloudCheckedAt, 125000));
const isAtlAvailable = () => !!state.atl?.deviceOnline && !state.atlError && fresh(state.atl.measuredAt, 125000);
const batteryData = () => [
 ...(isBleFresh() && state.ble ? [{ soc: state.ble.soc, input: state.ble.inputWatts, output: state.ble.outputWatts, capacity: 268.8 }] : []),
 ...(isOukAvailable() && state.ouk ? [{ soc: state.ouk.soc, input: state.ouk.inputWatts, output: state.ouk.outputWatts, capacity: state.oukCapacity }] : []),
];
const deviceId = (source: Source) => source === 'bluetti' ? state.ble?.deviceId ?? read('voltos-bluetti-device') : source === 'oukitel' ? state.oukId : 'atlantic-home';
const historyDeviceId = () => {
 const known = state.samples.filter(p => p.source === state.source);
 const current = state.historyId || deviceId(state.source);
 return known.some(p => p.deviceId === current) ? current : known.at(-1)?.deviceId || current;
};
const sourceLabel = (source: Source) => source === 'bluetti' ? 'Bluetooth · поруч' : source === 'oukitel' ? state.oukTransport === 'lan' ? 'Wi-Fi · пряме підключення' : 'Хмарний знімок' : 'Cozytouch · клімат';
function connection(source: Source): { text: string; kind: string } {
 if (source === 'bluetti') return state.bleConnecting ? { text: 'Підключення…', kind: 'pending' } : isBleFresh() ? { text: 'Підключено', kind: 'live' } : state.ble ? { text: 'Застарілі дані', kind: 'warn' } : { text: 'Не підключено', kind: '' };
 if (source === 'oukitel' && state.oukTransport === 'lan') return state.lanBusy ? { text: 'Підключення…', kind: 'pending' } : isOukAvailable() ? { text: 'Wi-Fi · наживо', kind: 'live' } : { text: state.ouk ? 'Немає свіжих даних' : lan.ready ? 'Очікуємо дані' : 'LAN не підключено', kind: state.lanError ? 'warn' : '' };
 if (source === 'oukitel') return state.oukBusy ? { text: 'Оновлення…', kind: 'pending' } : isOukAvailable() ? { text: 'Cloud Snapshot', kind: 'snapshot' } : state.ouk ? { text: state.ouk.device.online ? 'Застарілі дані' : 'Станція офлайн', kind: 'warn' } : { text: state.oukAuthed ? 'Немає показників' : 'Не підключено', kind: '' };
 return state.atlBusy ? { text: 'Оновлення…', kind: 'pending' } : isAtlAvailable() ? { text: 'Підключено', kind: 'live' } : { text: state.atlAuthed ? 'Немає зв’язку' : 'Не підключено', kind: state.atlAuthed ? 'warn' : '' };
}
const badge = (source: Source) => { const c = connection(source); return `<span class="badge ${c.kind}"><i></i>${c.text}</span>`; };
const button = (label: string, action: string, symbol = '', cls = 'primary', disabled = false) => `<button class="btn ${cls}" data-action="${action}" ${disabled ? 'disabled' : ''}>${symbol ? icon(symbol) : ''}${label}</button>`;
function log(message: string, kind: Kind = 'info') { state.entries = journal(state.entries, message, kind); }
function notify(message: string, kind: Kind = 'info') {
 const notice = document.querySelector<HTMLElement>('#notice')!;
 notice.innerHTML = `${icon(kind === 'error' ? 'warning' : kind === 'success' ? 'check' : 'info')}<span>${h(message)}</span>`;
 notice.className = `notice visible ${kind}`;
 clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.classList.remove('visible'); }, 6500);
}
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Не вдалося виконати дію. Спробуй ще раз.'; }
function failed(source: Source, error: unknown) {
 const message = errorText(error);
 if (source === 'bluetti') { state.bleError = message; state.bleControls = null; }
 if (source === 'oukitel') { state.oukError = message; if (error instanceof ApiError && error.status === 401) { state.oukAuthed = false; state.ouk = null; } }
 if (source === 'atlantic') { state.atlError = message; if (error instanceof ApiError && error.status === 401) { state.atlAuthed = false; state.atl = null; } }
 log(`${names[source]}: ${message}`, 'error');
}
function capture(sample: Sample) {
 const result = record(state.samples, sample); state.samples = result.samples;
 if (!result.saved && !historyWarning) { historyWarning = true; notify('Сховище заповнене. Експортуй історію, щоб зберегти записи.', 'error'); }
}
function applyTheme() {
 const dark = state.theme === 'dark' || state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
 document.documentElement.dataset.theme = dark ? 'dark' : 'light';
 if (native && appliedDark !== dark) { appliedDark = dark; void SecureSession.setAppearance({ dark }).catch(() => {}); }
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0f16' : '#f4f5f8');
}
const tabs: [Tab, string, string][] = [['home', 'Головна', 'home'], ['devices', 'Пристрої', 'devices'], ['analytics', 'Аналітика', 'analytics'], ['settings', 'Параметри', 'settings']];
root.innerHTML = `<div class="layout"><header class="header"><button class="brand" data-nav="home" aria-label="VOLTOS · Головна"><span class="brand-mark">${icon('bolt')}</span><strong>VOLTOS<span>HOME ENERGY</span></strong></button><div class="header-actions"><span id="network" class="network"></span><button class="icon-button" data-action="refresh" aria-label="Оновити пристрої">${icon('refresh')}</button></div></header><main id="content" class="content" tabindex="-1"></main><nav class="tabbar" aria-label="Основна навігація">${tabs.map(([id, label, symbol]) => `<button data-nav="${id}">${icon(symbol)}<span>${label}</span></button>`).join('')}</nav></div><dialog id="detail-dialog" class="sheet" aria-labelledby="detail-title"><div class="sheet-top"><span class="sheet-handle"></span><span class="workspace-label">МІЙ ПРИСТРІЙ</span><button class="icon-button" data-action="close-detail" aria-label="Закрити пристрій">${icon('close')}</button></div><nav id="device-dock" class="device-dock" aria-label="Перемикання пристроїв"></nav><nav id="device-tabs" class="device-tabs" aria-label="Розділи пристрою"></nav><div id="detail-content" class="sheet-content"></div></dialog><dialog id="confirmation" class="confirmation" aria-labelledby="confirm-title"><div id="confirm-content"></div></dialog><div id="notice" class="notice" role="status" aria-live="polite"></div>`;
const content = document.querySelector<HTMLElement>('#content')!;
const detailDialog = document.querySelector<HTMLDialogElement>('#detail-dialog')!;
const detailContent = document.querySelector<HTMLElement>('#detail-content')!;
const confirmDialog = document.querySelector<HTMLDialogElement>('#confirmation')!;
function pageHeading(kicker: string, title: string, sub: string, action = '') {
 return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
function home() {
 const batteries = batteryData(), summary = summarize(batteries);
 const anySnapshot = isOukAvailable() && state.ouk?.source === 'quectel-cloud-shadow';
 const active = Number(isBleFresh()) + Number(isOukAvailable()) + Number(isAtlAvailable());
 const date = new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
 return pageHeading(`МІЙ ДІМ <span class="kicker-separator">/</span> ${h(date)}`, 'Спокій починається<br>з контролю.', 'Твій дім. Твоя енергія. Один простір.') +
 `<section class="energy-card"><div class="energy-card-top"><span class="eyebrow">ЕНЕРГЕТИЧНИЙ РЕЗЕРВ</span><span class="hero-status"><i class="${active ? 'on' : ''}"></i>${active ? `${active} ${active === 1 ? 'джерело' : 'джерела'}` : 'Очікуємо підключення'}</span></div><div class="reserve"><div class="reserve-copy"><span class="reserve-label">Доступний заряд</span><strong>${num(summary.soc)}<small>${summary.soc === null ? '' : '%'}</small></strong><span class="reserve-caption">${summary.stored === null ? 'Показники з’являться після підключення' : `≈ ${num(summary.stored)} Вт·год номінального запасу`}</span></div><div class="reserve-ring" style="--charge:${summary.soc ?? 0}"><div>${icon('bolt')}<span>VOLTOS</span></div></div></div><div class="energy-flow"><div><span class="flow-symbol">${icon('down')}</span><span><small>Надходить</small><strong>${num(summary.input)} <em>Вт</em></strong></span></div><span class="flow-divider"></span><div><span class="flow-symbol outgoing">${icon('up')}</span><span><small>Споживання</small><strong>${num(summary.output)} <em>Вт</em></strong></span></div></div><div class="energy-card-bottom">${icon(anySnapshot ? 'cloud' : 'shield')}<span>${anySnapshot ? 'Містить хмарний знімок · свіжість вимірювання невідома' : active ? 'Дані доступних пристроїв · без вигаданих значень' : 'Підключи станцію, щоб бачити свій резерв'}</span></div></section>` +
 `<div class="quick-stats"><div>${icon('devices')}<span><strong>${active}<small> / 3</small></strong><span>Доступні пристрої</span></span></div><div>${icon('sun')}<span><strong>${isAtlAvailable() ? num(state.atl?.roomTemperature, 1) : '—'}<small> °C</small></strong><span>Температура вдома</span></span></div></div>` +
 `<section class="section"><div class="section-heading"><div><span class="eyebrow">ТВОЯ ЕКОСИСТЕМА</span><h2>Усе поруч</h2></div><button class="text-button" data-nav="devices">Усі ${icon('arrow')}</button></div><div class="device-list">${(['bluetti', 'oukitel', 'atlantic'] as Source[]).sort((a,b)=>Number(state.favorites.includes(b))-Number(state.favorites.includes(a))).map(deviceRow).join('')}</div></section>` +
 (!batteries.length ? `<section class="start-card"><span class="start-icon">${icon('plus')}</span><div><h3>Почнемо з одного пристрою</h3><p>Станція або конвектор — підключи те, що вже є вдома.</p></div><button class="icon-button" data-nav="devices" aria-label="Додати пристрій">${icon('arrow')}</button></section>` : forecast());
}
function deviceRow(source: Source) {
 const b = source === 'bluetti' ? state.ble : state.ouk;
 const sub = source === 'atlantic' ? state.atl?.roomTemperature == null ? 'Комфортна температура вдома' : `${num(state.atl.roomTemperature, 1)} °C · ціль ${num(state.atl.targetTemperature, 1)} °C` : b ? `${num(b.soc)}% · ${num(b.outputWatts)} Вт` : sourceLabel(source);
 return `<button class="device-row" data-device="${source}"><span class="device-symbol ${source}">${icon(symbols[source])}</span><span class="device-row-copy"><strong>${h(deviceName(source))}</strong><small>${h(sub)}</small></span><span class="device-row-end">${badge(source)}${icon('chevron')}</span></button>`;
}
function devices() {
 return pageHeading('ПІДКЛЮЧЕННЯ', 'Техніка, що працює<br>для тебе.', 'Показники та керування кожним пристроєм.') +
 `<div class="equipment-grid">${(['bluetti', 'oukitel', 'atlantic'] as Source[]).map(source => `<button class="equipment-card" data-device="${source}"><div class="equipment-top"><span class="device-symbol ${source}">${icon(symbols[source])}</span>${badge(source)}</div><div class="equipment-visual">${equipmentArt(source)}</div><span class="eyebrow">${source === 'atlantic' ? 'КЛІМАТ' : 'ЗАРЯДНА СТАНЦІЯ'}</span><h2>${h(deviceName(source))}</h2><p>${sourceLabel(source)}</p><div class="equipment-bottom"><span>${source === 'bluetti' && state.ble ? `${state.ble.soc}% · ${num(state.ble.outputWatts)} Вт` : source === 'oukitel' && state.ouk ? `${num(state.ouk.soc)}% · ${num(state.ouk.outputWatts)} Вт` : source === 'atlantic' && state.atl?.roomTemperature != null ? `${num(state.atl.roomTemperature, 1)} °C у кімнаті` : 'Налаштувати підключення'}</span>${icon('arrow')}</div></button>`).join('')}</div><div class="note">${icon('shield')}<p>Паролі не зберігаються. На iPhone сесії захищені системним Keychain. Bluetooth працює поруч зі станцією.</p></div>`;
}
function forecast() {
 const batteries = batteryData(), total = summarize(batteries), watts = state.forecastWatts;
 const capacity = batteries.reduce((sum, b) => sum + b.capacity, 0);
 const estimate = runtimeMinutes(total.soc, watts, capacity);
 return `<section class="forecast-card"><div class="section-heading"><div><span class="eyebrow">ПЛАН НА ВІДКЛЮЧЕННЯ</span><h2>На скільки вистачить?</h2></div>${icon('clock')}</div><div class="forecast-value"><strong id="forecast-time">${duration(estimate)}</strong><span>Орієнтовно за поточного запасу</span></div><label class="range-label" for="forecast">Навантаження <strong id="forecast-label">${watts} Вт</strong></label><input id="forecast" type="range" min="10" max="1000" step="10" value="${watts}"><div class="range-ends"><span>Роутер · 10 Вт</span><span>Техніка · 1000 Вт</span></div><p class="fine">Оцінка з коефіцієнтом 84%. Реальний час залежить від навантаження, втрат та стану акумулятора.</p></section>`;
}
function analytics() {
 const id = deviceId(state.source);
 const knownIds = [...new Set(state.samples.filter(p => p.source === state.source).map(p => p.deviceId))];
 const currentId = historyDeviceId();
 const selected = series(state.samples, state.source, currentId, state.metric, state.hours);
 const unit = state.source === 'atlantic' ? '°C' : state.metric === 'soc' ? '%' : 'Вт';
 const paths = chartPaths(selected, state.metric, state.hours);
 const values = selected.map(p => p[state.metric]!);
 const metrics: [Metric, string][] = state.source === 'atlantic' ? [['room', 'У кімнаті'], ['target', 'Цільова']] : [['output', 'Споживання'], ['input', 'Надходження'], ['soc', 'Заряд']];
 const graph = selected.length > 1 ? `<div class="plot"><div class="plot-grid"><span>${num(paths.max)} ${unit}</span><span>${num((paths.max + paths.min) / 2)}</span><span>${num(paths.min)}</span></div><svg class="plot-lines" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Історія ${h(metrics.find(([m]) => m === state.metric)?.[1])}, ${selected.length} записів"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="currentColor" stop-opacity=".18"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${paths.area}" fill="url(#fill)"/><path d="${paths.line}" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg></div><div class="axis-labels"><span>${state.hours > 24 ? '7 днів тому' : state.hours === 24 ? '24 год тому' : '1 год тому'}</span><span>Зараз</span></div>` : `<div class="empty-chart"><span>${icon('analytics')}</span><h3>${selected.length ? 'Перше вимірювання збережено' : 'Історія починається з підключення'}</h3><p>Щойно з’являться два записи, тут буде графік.<br>Збір триває, поки VOLTOS відкритий.</p><button class="text-button" data-nav="devices">До пристроїв ${icon('arrow')}</button></div>`;
 return pageHeading('ІСТОРІЯ ТВОГО ДОМУ', 'Енергія в деталях.', 'Фактичні записи. Зрозумілі тенденції.', `<button class="icon-button" data-action="export" aria-label="Експортувати історію CSV">${icon('download')}</button>`) +
 `<div class="source-tabs">${(['bluetti', 'oukitel', 'atlantic'] as Source[]).map(s => `<button data-source="${s}" aria-pressed="${s === state.source}" class="${s === state.source ? 'selected' : ''}">${icon(symbols[s])}${s.toUpperCase()}</button>`).join('')}</div>` +
 `<section class="analytics-card"><div class="section-heading"><h2>${h(names[state.source])}</h2><span class="badge ${state.source === 'oukitel' ? 'snapshot' : ''}">${state.source === 'oukitel' ? 'Cloud Snapshot' : state.source === 'atlantic' ? 'Cozytouch' : 'Bluetooth'}</span></div>${knownIds.length > 1 ? `<label class="field">Історія пристрою<select id="history-device">${knownIds.map(key => `<option value="${h(key)}" ${key === currentId ? 'selected' : ''}>${key === id ? 'Поточний пристрій' : h(key)}</option>`).join('')}</select></label>` : ''}<div class="segmented">${metrics.map(([m, name]) => `<button data-metric="${m}" aria-pressed="${m === state.metric}" class="${m === state.metric ? 'selected' : ''}">${name}</button>`).join('')}</div>${graph}<div class="chart-ranges">${[1, 24, 168].map((hours, i) => `<button data-hours="${hours}" class="${state.hours === hours ? 'selected' : ''}" aria-pressed="${state.hours === hours}">${['1 година', 'Доба', '7 днів'][i]}</button>`).join('')}</div><div class="chart-statistics"><div><span>Мінімум</span><strong>${values.length ? num(Math.min(...values), 1) : '—'} <small>${unit}</small></strong></div><div><span>Максимум</span><strong>${values.length ? num(Math.max(...values), 1) : '—'} <small>${unit}</small></strong></div><div><span>Записів</span><strong>${selected.length}</strong></div></div></section><div class="note">${icon('info')}<p>${state.source === 'oukitel' ? 'Час на графіку — момент отримання хмарного знімка. Час вимірювання станцією невідомий.' : 'Історія зберігається на цьому пристрої до 30 днів. Під час закриття застосунку нові записи не збираються.'} Прогалини зв’язку не з’єднуються лінією.</p></div>` + forecast();
}
function settings() {
 return pageHeading('ОСОБИСТИЙ ПРОСТІР', 'Як зручно тобі.', 'Твій застосунок, твої налаштування.') +
 `<section class="settings-card"><div class="section-heading"><h2>Вигляд</h2>${icon('sun')}</div><p>Світла, темна або разом із твоїм iPhone.</p><div class="segmented">${[['system', 'Системна'], ['light', 'Світла'], ['dark', 'Темна']].map(([id, name]) => `<button data-theme="${id}" class="${state.theme === id ? 'selected' : ''}" aria-pressed="${state.theme === id}">${name}</button>`).join('')}</div></section>` +
 `<section class="settings-card"><div class="section-heading"><h2>Низький заряд</h2>${icon('devices')}</div><p>Попередження EB3A, поки застосунок активний.</p><label class="range-label" for="alert">Сповістити за заряду <strong id="alert-label">${state.alert}%</strong></label><input id="alert" type="range" min="5" max="90" step="5" value="${state.alert}"><div class="range-ends"><span>5%</span><span>90%</span></div></section>` +
 `<section class="settings-card"><div class="section-heading"><h2>Розрахунок резерву</h2>${icon('bolt')}</div><label class="field">Номінальна ємність Oukitel, Вт·год<input id="capacity" type="number" inputmode="numeric" min="100" max="20000" step="1" value="${state.oukCapacity}"></label><p class="fine">2048 Вт·год для P2001E Plus. Для іншої моделі вкажи ємність із її паспорта. Використовується лише для оцінки.</p></section>` +
 `<section class="settings-card"><div class="section-heading"><h2>Твої дані</h2>${icon('shield')}</div><p>Історія залишається на пристрої. Паролі не записуються. Сесії iPhone зберігаються в Keychain до завершення строку дії.</p><div class="setting-row"><span>Вимірювань</span><strong>${state.samples.length}</strong></div>${button('Експортувати всю історію', 'export-all', 'download', 'secondary', !state.samples.length)}${button('Очистити історію', 'clear', '', 'danger', !state.samples.length)}</section>` +
 `<section class="settings-card"><div class="section-heading"><h2>Підключення</h2>${icon('link')}</div>${(['oukitel', 'atlantic'] as Source[]).map(source => `<div class="setting-row"><span>${h(deviceName(source))}</span>${(source === 'oukitel' ? state.oukAuthed : state.atlAuthed) ? `<button class="text-button danger-text" data-action="logout-${source}">Вийти</button>` : `<button class="text-button" data-device="${source}">Підключити ${icon('chevron')}</button>`}</div>`).join('')}<div class="setting-row"><span>Bluetooth EB3A</span><strong>${ble.connected ? 'Підключено' : 'Не підключено'}</strong></div></section>` +
 `<section class="settings-card"><div class="section-heading"><h2>Журнал подій</h2>${icon('clock')}</div>${state.entries.length ? `<div class="journal">${state.entries.slice(-8).reverse().map(entry => `<div class="journal-row ${entry.kind}"><span>${time(entry.at)}</span><p>${h(entry.message)}</p></div>`).join('')}</div>` : '<p>Тут з’являтимуться підключення, команди та помилки.</p>'}</section>` +
 `<footer class="about"><span class="brand-mark">${icon('bolt')}</span><strong>VOLTOS <span>2.1</span></strong><p>Особистий простір домашньої енергії.</p><small>${native ? 'iPhone · нативний Bluetooth' : 'Вебперегляд · для Bluetooth встанови iOS-версію'}</small><a href="https://github.com/XOTT69/VOLTOS" target="_blank" rel="noopener noreferrer">Відкрити GitHub ${icon('arrow')}</a></footer>`;
}
function render() {
 applyTheme();
 const network = document.querySelector<HTMLElement>('#network')!;
 network.innerHTML = `<i class="${state.online ? 'on' : ''}"></i>${state.online ? 'Мій дім' : 'Без інтернету'}`;
 document.querySelectorAll<HTMLButtonElement>('.tabbar [data-nav]').forEach(b => {
  b.classList.toggle('active', b.dataset.nav === state.tab);
  if (b.dataset.nav === state.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
 });
 // Polling must not replace an input while someone is editing a setting.
 if (!content.contains(document.activeElement) || !document.activeElement?.matches('input,select')) {
  const scroll = content.scrollTop;
  content.innerHTML = (!state.online ? `<div class="offline-banner">${icon('wifi')}<span>Без інтернету. Bluetooth продовжує працювати поруч.</span></div>` : '') +
   ({ home, devices, analytics, settings }[state.tab])();
  content.scrollTop = scroll;
 }
 renderDetail();
}
const deviceScroll: Partial<Record<Source, number>> = {};
const deviceViews: Partial<Record<Source, DeviceView>> = {};
function openDetail(source: Source) {
 if(!detailDialog.open)lastFocused = document.activeElement as HTMLElement;
 if(state.detail){deviceScroll[state.detail] = detailContent.scrollTop;deviceViews[state.detail]=state.deviceView;}
 const changed = state.detail !== source;
 state.detail = source;
 if(changed){ state.deviceView = deviceViews[source] || 'controls'; detailContent.dataset.renderKey = ''; }
 renderDetail(true);
 if(!detailDialog.open)detailDialog.showModal();
 if(changed)detailContent.scrollTop = deviceScroll[source] || 0;
 tap();
}
function closeDetail() { if(state.detail){deviceViews[state.detail]=state.deviceView;deviceScroll[state.detail]=detailContent.scrollTop;}detailDialog.close(); state.detail = null; lastFocused?.focus(); }
function metrics(items: [string, string, string][]) {
 return `<div class="detail-metrics">${items.map(([label, value, unit]) => `<div><span>${label}</span><strong>${value}<small> ${unit}</small></strong></div>`).join('')}</div>`;
}
function inlineError(message: string) { return message ? `<div class="inline-error" role="alert">${icon('warning')}<span>${h(message)}</span></div>` : ''; }
function switchRow(label: string, description: string, key: string, current: boolean | null, disabled: boolean, attr = 'ble') {
 return `<div class="switch-row"><div><strong>${label}</strong><small>${description}</small></div><button class="switch ${current ? 'enabled' : ''}" role="switch" aria-checked="${current === true}" aria-label="${h(label)}${current === null ? ' · стан невідомий' : ''}" data-${attr}-control="${key}" data-value="${current ? 0 : 1}" ${current === null || disabled ? 'disabled' : ''}>${current === null ? '<span>—</span>' : '<i></i>'}</button></div>`;
}
function bleDetail() {
 const d = state.ble, c = state.bleControls, disabled = !isBleFresh() || state.commandBusy || state.bleBusy;
 const select = (label: string, key: keyof BleControls, values: [number, string][]) => `<label class="field row-field">${label}<select data-ble-select="${key}" ${disabled || c?.[key] == null ? 'disabled' : ''}>${c?.[key] == null ? '<option>Недоступно</option>' : ''}${values.map(([value, text]) => `<option value="${value}" ${c?.[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
 return (d ? metrics([['Заряд', num(d.soc), '%'], ['Надходить', num(d.inputWatts), 'Вт'], ['Споживання', num(d.outputWatts), 'Вт']]) + `<div class="detail-caption">${ago(d.measuredAt)} · ${isBleFresh() ? 'Bluetooth' : 'Останні відомі показники'}</div>` : '<p class="detail-intro">Твоя станція, пряме підключення. Підключи EB3A через Bluetooth — акаунт не потрібен.</p>') + inlineError(state.bleError) +
 (ble.connected ? `<div class="button-row">${button(state.bleBusy ? 'Оновлення…' : 'Оновити', 'ble-refresh', 'refresh', 'secondary', state.bleBusy || state.commandBusy)}${button('Від’єднати', 'ble-disconnect', '', 'ghost', state.commandBusy || state.bleBusy)}</div>` : button(state.bleConnecting ? 'Пошук станції…' : 'Знайти EB3A', 'ble-connect', 'bluetooth', 'primary', state.bleConnecting)) +
 (!native ? '<div class="note compact">' + icon('info') + '<p>На iPhone Safari Bluetooth недоступний. Установи VOLTOS через Xcode. Сумісний браузер на комп’ютері також підтримує підключення.</p></div>' : '') +
 (d ? `<div class="detail-section"><h3>Виходи станції</h3>${switchRow('AC 230 В', 'Розетки змінного струму', 'ac', d.acEnabled, disabled)}${switchRow('DC / USB', 'Живлення гаджетів', 'dc', d.dcEnabled, disabled)}</div><div class="detail-section"><h3>Заряджання та режими</h3>${select('Заряджання', 'chargeMode', [[0, 'Стандартне'], [1, 'Тихе'], [2, 'Турбо']])}${select('Ліхтарик', 'led', [[4, 'Вимкнено'], [1, 'Слабкий'], [2, 'Яскравий'], [3, 'SOS']])}${switchRow('ECO', 'Може вимикати виходи за малого навантаження', 'eco', c?.eco == null ? null : c.eco === 1, disabled)}${select('Таймер ECO', 'ecoTime', [[1, '1 година'], [2, '2 години'], [3, '3 години'], [4, '4 години']])}${switchRow('Power Lifting', 'Лише для сумісних навантажень', 'lifting', c?.lifting == null ? null : c.lifting === 1, disabled)}</div><div class="detail-section"><h3>Швидкі сценарії</h3><div class="presets">${[['night', 'moon', 'Тиха ніч'], ['turbo', 'bolt', 'Швидкий заряд'], ['save', 'leaf', 'Економія']].map(([id, symbol, name]) => `<button data-preset="${id}" ${disabled || !c || c.eco === null || c.chargeMode === null || id !== 'turbo' && c.led === null ? 'disabled' : ''}>${icon(symbol)}<span>${name}</span></button>`).join('')}</div><p class="fine">Сценарії змінюють заряджання, ECO та ліхтарик. Кожен крок перевіряється станцією. AC/DC залишаються під твоїм керуванням.</p></div>` : '');
}
function oukDetail() {
 if(state.oukTransport === 'lan')return lanDetail();
 const d = state.ouk;
 return (d ? metrics([['Заряд', num(d.soc), '%'], ['Надходить', num(d.inputWatts), 'Вт'], ['Споживання', num(d.outputWatts), 'Вт']]) + `<div class="detail-caption">Хмара перевірена ${ago(d.cloudCheckedAt || undefined)} · ${d.device.online ? 'станція доступна у хмарі' : 'станція офлайн'}</div>` : '<p class="detail-intro">Увійди з акаунтом застосунку Oukitel, щоб бачити власні станції та їхні показники.</p>') + inlineError(state.oukError) +
 (state.oukAuthed ? `${state.oukDevices.length ? `<label class="field">Твоя станція<select id="ouk-device" ${state.oukBusy ? 'disabled' : ''}>${state.oukDevices.map(device => `<option value="${h(device.deviceKey)}" ${device.deviceKey === state.oukId ? 'selected' : ''}>${h(device.deviceName || device.productName || 'Oukitel')}</option>`).join('')}</select></label>` : '<div class="note compact">' + icon('info') + '<p>В акаунті немає прив’язаних станцій. Додай станцію в застосунку виробника й онови список.</p></div>'}<div class="button-row">${button(state.oukBusy ? 'Оновлення…' : 'Оновити', 'ouk-refresh', 'refresh', 'secondary', state.oukBusy)}${button('Вийти', 'logout-oukitel', '', 'ghost', state.oukBusy)}</div>${d ? `<div class="detail-section"><h3>Виходи станції</h3>${switchRow('AC 230 В', 'Розетки змінного струму', 'ac', d.acOn, state.oukBusy || !isOukAvailable(), 'ouk')}${switchRow('DC', 'Постійний струм', 'dc', d.dcOn, state.oukBusy || !isOukAvailable(), 'ouk')}${switchRow('USB', 'Заряджання гаджетів', 'usb', d.usbOn, state.oukBusy || !isOukAvailable(), 'ouk')}</div>` : ''}` : `<form id="ouk-login" class="login-form"><label class="field">Електронна пошта<input name="email" type="email" autocomplete="username" inputmode="email" placeholder="you@example.com" required maxlength="254" ${state.oukBusy ? 'disabled' : ''}></label><label class="field">Пароль<input name="password" type="password" autocomplete="current-password" placeholder="Пароль Oukitel" required maxlength="256" ${state.oukBusy ? 'disabled' : ''}></label><button class="btn primary" ${state.oukBusy ? 'disabled' : ''}>${state.oukBusy ? 'Підключення…' : 'Підключити Oukitel'}${icon('arrow')}</button></form>`) +
 `<div class="note compact">${icon('cloud')}<p>Cloud Snapshot — останні дані у хмарі. Успішний запит не підтверджує, що станція виміряла їх щойно.</p></div>`;
}
function atlDetail() {
 const d = state.atl, online = isAtlAvailable();
 const can = (action: 'temperature' | 'power' | 'mode') => !!d && online && !state.atlBusy && climateCapability(d.commands, action, !d.power);
 return (d ? metrics([['У кімнаті', num(d.roomTemperature, 1), '°C'], ['Цільова', num(d.targetTemperature, 1), '°C'], ['Живлення', d.power === null ? '—' : d.power ? 'Увімк.' : 'Вимк.', '']]) + `<div class="detail-caption">${ago(d.measuredAt)} · ${h(d.mode || 'Режим невідомий')}</div>` : '<p class="detail-intro">Звичний Atlantic Home, тепер поруч з енергією. Використай пароль доступу до свого Atlantic Home.</p>') + inlineError(state.atlError) +
 (state.atlAuthed ? `${d ? `<div class="detail-section"><h3>Комфорт удома</h3><div class="temperature-control"><button class="icon-button" data-temp="-0.5" aria-label="Зменшити температуру" ${!can('temperature') || d.targetTemperature === null || d.targetTemperature <= 7 ? 'disabled' : ''}>−</button><strong>${num(d.targetTemperature, 1)}<small>°C</small></strong><button class="icon-button" data-temp="0.5" aria-label="Збільшити температуру" ${!can('temperature') || d.targetTemperature === null || d.targetTemperature >= 30 ? 'disabled' : ''}>+</button></div>${switchRow('Конвектор', 'Живлення обігрівача', 'power', d.power, !can('power') || d.power === null, 'atl')}<label class="field row-field">Режим<select id="atl-mode" ${!can('mode') ? 'disabled' : ''}><option value="">${h(d.mode || 'Обрати режим')}</option>${[['normal', 'Комфорт'], ['eco', 'Еко'], ['manual', 'Ручний'], ['prog', 'За розкладом'], ['antifreeze', 'Антизамерзання']].map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label></div>` : ''}<div class="button-row">${button(state.atlBusy ? 'Оновлення…' : 'Оновити', 'atl-refresh', 'refresh', 'secondary', state.atlBusy)}${button('Вийти', 'logout-atlantic', '', 'ghost', state.atlBusy)}</div>` : `<form id="atl-login" class="login-form"><label class="field">Пароль Atlantic Home<input name="password" type="password" autocomplete="current-password" required minlength="4" maxlength="256" placeholder="Пароль доступу" ${state.atlBusy ? 'disabled' : ''}></label><button class="btn primary" ${state.atlBusy || state.restoring ? 'disabled' : ''}>${state.atlBusy ? 'Підключення…' : 'Підключити Atlantic'}${icon('arrow')}</button></form>`) +
 `<div class="note compact">${icon('info')}<p>Підключення використовує приватний міст Atlantic Home. Якщо сервер недоступний, звернися до налаштувань своєї інсталяції. Команди доступні за можливостями пристрою.</p></div>`;
}
function deviceName(source: Source) { return read(`voltos-name-${source}`, names[source]).slice(0,48); }
function devicePower(source: Source) { return source === 'bluetti' ? state.ble : source === 'oukitel' ? state.ouk : null; }
function deviceOverview(source: Source) {
 const d = devicePower(source), climate = state.atl;
 const available = source === 'bluetti' ? isBleFresh() : source === 'oukitel' ? isOukAvailable() : isAtlAvailable();
 const capacity = source === 'bluetti' ? 268.8 : state.oukCapacity;
 const energy = energyEstimate(state.samples,source,deviceId(source));
 const quick = `<div class="workspace-actions"><button class="btn primary" data-device-view="controls">${icon('settings')}Керування</button><button class="btn secondary" data-device-view="history">${icon('analytics')}Історія</button></div>`;
 if(source === 'atlantic')return `<section class="device-dashboard climate-dashboard"><span class="eyebrow">КЛІМАТ У ТВОЄМУ ДОМІ</span><div class="dashboard-number">${num(climate?.roomTemperature,1)}<small>°C</small></div><span class="dashboard-sub">Ціль ${num(climate?.targetTemperature,1)} °C · ${h(climate?.mode || 'режим невідомий')}</span>${quick}</section><div class="insights-grid"><div><span>Конвектор</span><strong>${climate?.power == null ? '—' : climate.power ? 'Увімкнено' : 'Вимкнено'}</strong></div><div><span>Шлюз</span><strong>${climate ? climate.gatewayOnline ? 'Онлайн' : 'Офлайн' : '—'}</strong></div></div><p class="fine">${available ? 'Показники Cozytouch доступні.' : 'Підключи Atlantic або онови зв’язок.'} Редагування розкладу залишається у Cozytouch; підтримуваний режим PROG доступний у керуванні.</p>`;
 const output = d?.outputWatts ?? null, input = d?.inputWatts ?? null;
 return `<section class="device-dashboard"><div class="dashboard-kicker"><span class="eyebrow">ОСОБИСТА ПАНЕЛЬ СТАНЦІЇ</span>${icon(symbols[source])}</div><div class="dashboard-number">${num(d?.soc)}<small>%</small></div><span class="dashboard-sub">${available ? sourceLabel(source) : 'Останній стан / очікування підключення'}</span><span class="dashboard-time">${icon('clock')}${source === 'bluetti' ? ago(state.ble?.measuredAt) : ago(oukObservedAt() || undefined)}${source === 'oukitel' && state.oukTransport === 'cloud' ? ' · час запиту до хмари' : ''}</span><div class="dashboard-flow"><div><span>Надходить</span><strong>${num(input)} <small>Вт</small></strong></div><div><span>Споживання</span><strong>${num(output)} <small>Вт</small></strong></div><div><span>Баланс</span><strong>${input === null || output === null ? '—' : `${input-output > 0 ? '+' : ''}${num(input-output)}`} <small>Вт</small></strong></div></div>${quick}</section><div class="insights-grid"><div><span>До розряду · оцінка</span><strong>${available ? duration(runtimeMinutes(d?.soc ?? null,output,capacity)) : '—'}</strong></div><div><span>До 100% · оцінка</span><strong>${available ? duration(chargeMinutes(d?.soc ?? null,input,output,capacity)) : '—'}</strong></div><div><span>Віддано за записами доби</span><strong>${energy.hasCoverage ? num(energy.outputWh,1) : '—'} <small>Вт·год</small></strong></div><div><span>Покриття записами</span><strong>${energy.coveredMinutes} <small>хв / добу</small></strong></div></div>${source === 'bluetti' && state.ble ? `<div class="insights-grid ac-dc-detail"><div><span>AC · вхід</span><strong>${num(state.ble.acInputWatts)} <small>Вт</small></strong></div><div><span>DC · вхід</span><strong>${num(state.ble.dcInputWatts)} <small>Вт</small></strong></div><div><span>AC · вихід</span><strong>${num(state.ble.acOutputWatts)} <small>Вт</small></strong></div><div><span>DC · вихід</span><strong>${num(state.ble.dcOutputWatts)} <small>Вт</small></strong></div></div>` : source === 'oukitel' && state.ouk?.source === 'quectel-cloud-shadow' ? `<div class="setting-row"><span>Температура · хмарний знімок</span><strong>${num(state.ouk.temperatureC)} °C</strong></div>` : ''}<section class="load-plans"><h3>План на відключення</h3>${planLoads(available ? d?.soc ?? null : null,capacity).map(load=>`<div><span>${h(load.name)}<small>${h(load.detail)} · ${load.watts} Вт</small></span><strong>${duration(load.minutes)}</strong></div>`).join('')}<p class="fine">Умовні навантаження, не автоматизації. Оцінки залежать від фактичної ємності та втрат. Прогалини в історії не домальовуються.</p></section>`;
}
function deviceHistory(source: Source) {
 const id = deviceId(source), metric: Metric = source === 'atlantic' ? 'room' : 'soc';
 const rows = series(state.samples,source,id,metric,24), paths = chartPaths(rows,metric,24);
 return `<section class="workspace-history"><div class="section-heading"><h3>${source === 'atlantic' ? 'Температура' : 'Заряд'} · остання доба</h3><span class="badge">${rows.length} записів</span></div>${rows.length > 1 ? `<div class="mini-history"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Історія поточного пристрою"><path d="${paths.line}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg></div>` : `<div class="empty-chart">${icon('analytics')}<h3>Тут буде твоя історія</h3><p>Записи збираються після підключення пристрою.</p></div>`}<div class="workspace-actions"><button class="btn primary" data-device-analytics="${source}">${icon('analytics')}Повна аналітика</button><button class="btn secondary" data-device-export="${source}" ${rows.length ? '' : 'disabled'}>${icon('download')}CSV</button></div><p class="fine">У цій панелі тільки ${h(deviceName(source))}. ${source === 'oukitel' ? 'Історія позначає окремо хмарні знімки й локальні показники.' : 'Локальні записи, поки застосунок активний.'}</p></section>`;
}
function lanDetail() {
 const d = state.ouk?.source === 'quectel-lan' ? state.ouk : null;
 return (d ? metrics([['Заряд',num(d.soc),'%'],['Надходить',num(d.inputWatts),'Вт'],['Споживання',num(d.outputWatts),'Вт']]) + `<div class="detail-caption">Прямі дані · ${ago(d.measuredAt)}</div>` : '<p class="detail-intro">Прямий канал до Oukitel у твоєму Wi-Fi. Потік показників читає VOLTOS, відкривати фірмовий застосунок для кожного оновлення не потрібно.</p>') + inlineError(state.lanError) +
 (lan.ready ? `<div class="connection-health"><span>${icon('wifi')}Локальний канал</span><strong>${isOukAvailable() ? 'Дані надходять' : 'Очікуємо телеметрію'}</strong><p>${h(state.lanStatus)}</p></div><div class="button-row">${button('Запитати показники','lan-refresh','refresh','secondary',state.lanBusy)}${button('Від’єднати','lan-disconnect','','ghost',state.commandBusy)}</div>${d ? `<div class="detail-section"><h3>Виходи Oukitel · LAN</h3>${switchRow('AC 230 В','Безпосередньо зі станції','ac',d.acOn,!isOukAvailable()||state.commandBusy,'ouk')}${switchRow('DC','Постійний струм','dc',d.dcOn,!isOukAvailable()||state.commandBusy,'ouk')}${switchRow('USB','Заряджання гаджетів','usb',d.usbOn,!isOukAvailable()||state.commandBusy,'ouk')}</div>` : ''}` :
 `<form id="lan-connect" class="login-form"><label class="field">IP станції у домашній мережі<input id="lan-host" name="host" value="${h(state.lanHost)}" inputmode="decimal" autocomplete="off" placeholder="192.168.1.50" required></label><details class="manual-key"><summary>Маю персональний ключ станції</summary><label class="field">Локальний authKey<input name="key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Base64 · 16 байтів"></label></details><label class="checkbox-field"><input name="remember" type="checkbox" checked> Запам’ятати ключ у Keychain та підключатися автоматично</label><button class="btn primary" ${!native || state.lanBusy ? 'disabled' : ''}>${icon('wifi')}${state.lanBusy ? 'Підключення…' : 'Підключити напряму'}</button><p class="fine">${state.oukAuthed ? 'Без введеного ключа VOLTOS спробує отримати його для твоєї прив’язаної станції через захищений сервер.' : 'Увійди у Cloud один раз для отримання персонального ключа або введи свій ключ вручну.'}</p></form>`) +
 `<div class="note compact">${icon('info')}<p>${native ? 'iPhone і станція мають бути в одній мережі. IP можна знайти у списку клієнтів роутера. На запит iOS дозволь Local Network.' : 'Локальний TCP доступний у встановленій iPhone-версії, браузер не підтримує таке підключення.'} Залежно від прошивки станція може потребувати зв’язку з хмарою навіть для LAN-звітів. Без нових пакетів показники не позначаються як свіжі.</p></div>`;
}
function transportSelector() {
 return `<div class="transport-picker"><button data-transport="lan" class="${state.oukTransport === 'lan' ? 'selected' : ''}" aria-pressed="${state.oukTransport === 'lan'}">${icon('wifi')}Прямий Wi-Fi</button><button data-transport="cloud" class="${state.oukTransport === 'cloud' ? 'selected' : ''}" aria-pressed="${state.oukTransport === 'cloud'}">${icon('cloud')}Cloud</button></div>`;
}
function renderDetail(force = false) {
 if (!state.detail) return;
 const source = state.detail;
 const dock = document.querySelector<HTMLElement>('#device-dock')!, tabbar = document.querySelector<HTMLElement>('#device-tabs')!;
 dock.innerHTML = (['bluetti','oukitel','atlantic'] as Source[]).map(key=>`<button data-device="${key}" class="${source === key ? 'selected' : ''}" aria-pressed="${source === key}">${icon(symbols[key])}<span>${key === 'bluetti' ? 'BLUETTI' : key === 'oukitel' ? 'OUKITEL' : 'ATLANTIC'}</span><i class="${connection(key).kind}"></i></button>`).join('');
 tabbar.innerHTML = ([['overview','Огляд'],['controls','Керування'],['history','Історія'],['connection','Зв’язок']] as [DeviceView,string][]).map(([key,label])=>`<button data-device-view="${key}" class="${state.deviceView === key ? 'selected' : ''}" aria-pressed="${state.deviceView === key}">${label}</button>`).join('');
 const authed = source === 'bluetti' ? ble.connected : source === 'oukitel' ? state.oukTransport === 'lan' ? lan.ready : state.oukAuthed : state.atlAuthed;
 const key = `${source}:${state.deviceView}:${source === 'oukitel' ? state.oukTransport : ''}:${authed}`;
 const error = source === 'bluetti' ? state.bleError : source === 'oukitel' ? state.oukTransport === 'lan' ? state.lanError : state.oukError : state.atlError;
 const busy = source === 'oukitel' ? state.oukTransport === 'lan' ? state.lanBusy : state.oukBusy : source === 'atlantic' ? state.atlBusy || state.restoring : state.bleConnecting;
 // Keep the actual form node for the whole connection state, including blur,
 // polling, tab changes elsewhere, API errors and keyboard transitions.
 if (!force && detailContent.dataset.renderKey === key && detailContent.querySelector('form')) {
  const slot = detailContent.querySelector<HTMLElement>('[data-form-error]'); if(slot)slot.innerHTML = inlineError(error);
  detailContent.querySelectorAll<HTMLButtonElement>('form button[type="submit"], form .btn').forEach(b=>{b.disabled=busy || source==='oukitel'&&state.oukTransport==='lan'&&!native;b.setAttribute('aria-busy',String(busy));if(busy){b.dataset.idleMarkup ||= b.innerHTML;b.textContent='Підключення…';}else if(b.dataset.idleMarkup){b.innerHTML=b.dataset.idleMarkup;delete b.dataset.idleMarkup;}});
  detailContent.querySelectorAll<HTMLInputElement>('form input').forEach(input=>input.disabled=busy);
  return;
 }
 if(!force && detailContent.contains(document.activeElement) && document.activeElement?.matches('input,select'))return;
 const scroll = detailContent.scrollTop;
 let body = state.deviceView === 'overview' ? deviceOverview(source) : state.deviceView === 'history' ? deviceHistory(source) : ({ bluetti:bleDetail,oukitel:oukDetail,atlantic:atlDetail }[source])();
 // Put connection errors outside the persistent form and update only this slot.
 if(body.includes('<form'))body = body.replace(inlineError(error),'');
 const favorite = state.favorites.includes(source);
 detailContent.dataset.renderKey = key;
 detailContent.innerHTML = `<div class="detail-heading"><span class="device-symbol ${source}">${icon(symbols[source])}</span>${badge(source)}<h2 id="detail-title">${h(deviceName(source))}</h2><p>${sourceLabel(source)}</p><button class="favorite-button ${favorite ? 'selected' : ''}" data-favorite="${source}" aria-label="${favorite ? 'Прибрати з обраних' : 'Додати до обраних'}" aria-pressed="${favorite}">${icon('star')}</button></div>${source === 'oukitel' ? transportSelector() : ''}<div data-form-error>${body.includes('<form') ? inlineError(error) : ''}</div><div class="device-body ${state.deviceView === 'connection' ? 'connection-only' : ''}">${body}</div>${state.deviceView === 'connection' ? `<div class="detail-section"><label class="field">Назва для цього дому<input id="device-name" value="${h(deviceName(source))}" maxlength="48" autocomplete="off"></label>${button('Зберегти назву','rename-device','','secondary')}</div>` : ''}`;
 detailContent.scrollTop = scroll;
}
async function ask(title: string, message: string, destructive = false): Promise<boolean> {
 if (confirmDialog.open) return false;
 const focus = document.activeElement as HTMLElement;
 document.querySelector('#confirm-content')!.innerHTML = `<span class="confirm-symbol ${destructive ? 'destructive' : ''}">${icon(destructive ? 'warning' : 'shield')}</span><h2 id="confirm-title">${h(title)}</h2><p>${h(message)}</p><div class="confirm-actions"><button class="btn ${destructive ? 'danger-fill' : 'primary'}" id="confirm-yes">Підтвердити</button><button class="btn secondary" id="confirm-no" autofocus>Скасувати</button></div>`;
 confirmDialog.showModal();
 return new Promise(resolve => {
  let accepted = false;
  document.querySelector('#confirm-yes')!.addEventListener('click', () => { accepted = true; confirmDialog.close(); }, { once: true });
  document.querySelector('#confirm-no')!.addEventListener('click', () => confirmDialog.close(), { once: true });
  confirmDialog.addEventListener('close', () => { resolve(accepted); focus?.focus(); }, { once: true });
 });
}
async function refreshBle(full = false, fromCommand = false): Promise<boolean> {
 if (!ble.connected || state.bleBusy || state.commandBusy && !fromCommand) return false;
 state.bleBusy = true; render();
 try {
  const reading = await ble.refresh();
  if (!ble.connected) return false;
  state.ble = reading; state.bleError = ''; write('voltos-bluetti-device', reading.deviceId);
  capture({ at: Date.parse(reading.measuredAt), source: 'bluetti', deviceId: reading.deviceId, soc: reading.soc, input: reading.inputWatts, output: reading.outputWatts });
  if (full || !state.bleControls) state.bleControls = await ble.readControls();
  if (reading.soc <= state.alert && !state.lowNotified) { state.lowNotified = true; notify(`BLUETTI: залишилося ${reading.soc}% заряду`, 'error'); log(`Низький заряд EB3A: ${reading.soc}%`, 'error'); }
  if (reading.soc > state.alert + 5) state.lowNotified = false;
  return true;
 } catch (error) { failed('bluetti', error); return false; }
 finally { state.bleBusy = false; render(); }
}
async function connectBle() {
 if (state.bleConnecting || ble.connected) return;
 state.bleConnecting = true; state.bleError = ''; render();
 try {
  await ble.connect();
  if (await refreshBle(true)) { log('BLUETTI EB3A підключено', 'success'); notify('Твоя EB3A підключена', 'success'); }
  else notify(state.bleError || 'Bluetooth підключено, але показники ще недоступні', 'error');
 } catch (error) { failed('bluetti', error); notify(errorText(error), 'error'); }
 finally { state.bleConnecting = false; render(); }
}
async function disconnectBle() {
 if (state.commandBusy || state.bleBusy) return;
 await ble.disconnect(); state.ble = null; state.bleControls = null; state.bleError = ''; state.lowNotified = false;
 log('BLUETTI від’єднано'); render();
}
async function refreshOukitel(reloadList = false) {
 if(state.oukTransport === 'lan'){
  if(reloadList && state.oukAuthed && state.online){const list=await oukitel.devices();state.oukDevices=list.devices;}
  if(lan.ready)await lan.refresh();return;
 }
 if (!state.oukAuthed || state.oukBusy || !state.online) return;
 const generation = oukGeneration;
 state.oukBusy = true; render();
 try {
  if (reloadList || !state.oukDevices.length) {
   const response = await oukitel.devices(); if (generation !== oukGeneration) return;
   state.oukDevices = response.devices;
   if (!state.oukDevices.some(d => d.deviceKey === state.oukId)) state.oukId = state.oukDevices[0]?.deviceKey ?? '';
  }
  const device = state.oukDevices.find(d => d.deviceKey === state.oukId);
  if (!device) { state.ouk = null; state.oukError = ''; return; }
  const reading = await oukitel.state(device);
  if (generation !== oukGeneration || device.deviceKey !== state.oukId) return;
  state.ouk = reading; state.oukError = '';
  state.oukDevices = state.oukDevices.map(d => d.deviceKey === reading.device.deviceKey ? reading.device : d);
  capture({ at: Date.parse(reading.cloudCheckedAt!), source: 'oukitel', deviceId: reading.device.deviceKey, soc: reading.soc, input: reading.inputWatts, output: reading.outputWatts });
 } catch (error) { if (generation === oukGeneration) failed('oukitel', error); }
 finally { if (generation === oukGeneration) { state.oukBusy = false; render(); } }
}
async function refreshAtlantic() {
 if (!state.atlAuthed || state.atlBusy || !state.online) return;
 const generation = atlGeneration;
 state.atlBusy = true; render();
 try {
  const reading = await atlantic.state(); if (generation !== atlGeneration) return;
  state.atl = reading; state.atlError = '';
  if (reading.deviceOnline) capture({ at: Date.parse(reading.measuredAt), source: 'atlantic', deviceId: 'atlantic-home', room: reading.roomTemperature, target: reading.targetTemperature });
 } catch (error) { if (generation === atlGeneration) failed('atlantic', error); }
 finally { if (generation === atlGeneration) { state.atlBusy = false; render(); } }
}
async function login(source: 'oukitel' | 'atlantic', form: HTMLFormElement) {
 if (source === 'oukitel' ? state.oukBusy : state.atlBusy) return;
 const data = new FormData(form);
 const generation = source === 'oukitel' ? ++oukGeneration : ++atlGeneration;
 const email = String(data.get('email') || '').trim();
 const password = String(data.get('password') || '');
 (document.activeElement as HTMLElement)?.blur();
 if (source === 'oukitel') { state.oukBusy = true; state.oukError = ''; } else { state.atlBusy = true; state.atlError = ''; }
 render();
 try {
  if (source === 'oukitel') {
   const response = await oukitel.login(email, password); if (generation !== oukGeneration) return;
   state.oukAuthed = response.connected; state.oukDevices = response.devices;
   if (!response.devices.some(d => d.deviceKey === state.oukId)) state.oukId = response.devices[0]?.deviceKey ?? '';
   write('voltos-oukitel-device', state.oukId);
  } else {
   const response = await atlantic.login(password); if (generation !== atlGeneration) return;
   state.atlAuthed = response.authenticated;
  }
  log(`${names[source]}: вхід виконано`, 'success'); notify('Підключення збережено', 'success');
 } catch (error) { if (generation === (source === 'oukitel' ? oukGeneration : atlGeneration)) failed(source, error); }
 finally {
  if (generation === (source === 'oukitel' ? oukGeneration : atlGeneration)) {
   if (source === 'oukitel') state.oukBusy = false; else state.atlBusy = false;
   render();
  }
 }
 if (source === 'oukitel' && state.oukAuthed) await refreshOukitel();
 if (source === 'atlantic' && state.atlAuthed) await refreshAtlantic();
}
async function logout(source: 'oukitel' | 'atlantic') {
 if (!await ask('Від’єднати акаунт?', 'Історія залишиться на цьому пристрої. Для керування потрібно буде увійти знову.')) return;
 if (source === 'oukitel') { oukGeneration++; state.oukBusy = true; }
 else { atlGeneration++; state.atlBusy = true; }
 render();
 try {
  await (source === 'oukitel' ? oukitel.logout() : atlantic.logout());
  if (source === 'oukitel') { state.oukAuthed = false; state.ouk = null; state.oukDevices = []; state.oukError = ''; }
  else { state.atlAuthed = false; state.atl = null; state.atlError = ''; }
  log(`${names[source]}: вихід`); notify('Акаунт від’єднано', 'success');
 } catch { notify('Не вдалося підтвердити вихід. Повтори з розблокованим iPhone та доступом до інтернету.', 'error'); }
 finally { if (source === 'oukitel') state.oukBusy = false; else state.atlBusy = false; render(); }
}
const controlLabels: Record<Control, string> = { ac: 'AC 230 В', dc: 'DC / USB', led: 'Ліхтарик', eco: 'ECO', ecoTime: 'Таймер ECO', chargeMode: 'Заряджання', lifting: 'Power Lifting' };
function bleControlValue(control: Control): number | null {
 if (control === 'ac') return state.ble?.acEnabled == null ? null : Number(state.ble.acEnabled);
 if (control === 'dc') return state.ble?.dcEnabled == null ? null : Number(state.ble.dcEnabled);
 return state.bleControls?.[control] ?? null;
}
function controlWarning(control: Control, value: number): string {
 if ((control === 'ac' || control === 'dc') && value === 0) return 'Вихід буде вимкнено. Підключені до нього прилади втратять живлення.';
 if (control === 'eco' && value === 1) return 'ECO може автоматично вимикати виходи за малого навантаження.';
 if (control === 'chargeMode' && value === 2) return 'Турбо підвищує швидкість заряджання, шум і нагрів.';
 if (control === 'lifting' && value === 1) return 'Power Lifting підходить лише для сумісних навантажень. Перевір інструкцію станції.';
 return 'Станція перевірить виконання повторним зчитуванням.';
}
async function controlBle(control: Control, value: number) {
 const def = registers[control];
 if (!def || !(def.values as readonly number[]).includes(value) || !isBleFresh() || state.commandBusy || state.bleBusy || bleControlValue(control) === null) return;
 if (bleControlValue(control) === value) return;
 const accepted = await ask(`Змінити ${controlLabels[control]}?`, controlWarning(control, value), ['ac', 'dc'].includes(control) && value === 0);
 if (!accepted) { renderDetail(true); return; }
 if (!isBleFresh() || state.commandBusy || state.bleBusy) { notify('Стан пристрою змінився. Онови показники й повтори.', 'error'); return; }
 state.commandBusy = true; render();
 try {
  await ble.setRegister(def.address, value);
  log(`EB3A: ${controlLabels[control]} → ${value}, підтверджено`, 'success');
  notify('Команду підтверджено станцією', 'success'); await refreshBle(true, true);
 } catch (error) { failed('bluetti', error); notify(errorText(error), 'error'); }
 finally { state.commandBusy = false; render(); }
}
async function preset(name: string) {
 const definitions: Record<string, { label: string; warning: string; steps: [Control, number][] }> = {
  night: { label: 'Тиха ніч', warning: 'Тихе заряджання, ECO увімкнено, ліхтарик вимкнено. ECO може відключати виходи за малого навантаження.', steps: [['chargeMode', 1], ['eco', 1], ['led', 4]] },
  turbo: { label: 'Швидкий заряд', warning: 'Турбо заряджання, ECO вимкнено. Можливе збільшення шуму й нагріву.', steps: [['chargeMode', 2], ['eco', 0]] },
  save: { label: 'Економія', warning: 'Стандартне заряджання, ECO увімкнено, ліхтарик вимкнено. ECO може відключати виходи за малого навантаження.', steps: [['chargeMode', 0], ['eco', 1], ['led', 4]] },
 };
 const definition = definitions[name];
 if (!definition || !isBleFresh() || state.commandBusy || state.bleBusy) return;
 state.commandBusy = true; render();
 const completed: string[] = [];
 try {
  state.bleControls = await ble.readControls();
  if (definition.steps.some(([key]) => bleControlValue(key) === null)) throw Error('Прошивка не підтвердила всі потрібні налаштування');
  const steps = definition.steps.filter(([key, value]) => bleControlValue(key) !== value);
  if (!steps.length) { notify('Ці налаштування вже активні', 'success'); return; }
  const list = steps.map(([key, value]) => `${controlLabels[key]}: ${bleControlValue(key)} → ${value}`).join('\n');
  if (!await ask(definition.label, definition.warning + '\n\n' + list)) return;
  for (const [key, value] of steps) {
   await ble.setRegister(registers[key].address, value); completed.push(controlLabels[key]);
   log(`Сценарій ${definition.label}: ${controlLabels[key]} підтверджено`, 'success');
  }
  notify('Сценарій виконано й перевірено', 'success');
 } catch (error) {
  const message = errorText(error) + (completed.length ? ` Уже виконано: ${completed.join(', ')}. Решту кроків зупинено.` : ' Жоден крок не підтверджено.');
  state.bleControls = null; log(message, 'error'); notify(message, 'error');
 } finally { await refreshBle(true, true); state.commandBusy = false; render(); }
}
async function controlOukitel(port: 'ac' | 'dc' | 'usb', on: boolean) {
 const reading = state.ouk;
 if(state.oukTransport === 'lan')return controlLan(port,on);
 if (!reading || !isOukAvailable() || state.oukBusy) return;
 const current = port === 'ac' ? reading.acOn : port === 'dc' ? reading.dcOn : reading.usbOn;
 if (current === null || current === on) return;
 if (!await ask(`${on ? 'Увімкнути' : 'Вимкнути'} ${port.toUpperCase()}?`, on ? 'Команда буде надіслана через хмару Oukitel.' : 'Підключені до цього виходу прилади втратять живлення.', !on)) return;
 if (!isOukAvailable() || state.oukBusy || state.ouk?.device.deviceKey !== reading.device.deviceKey) return;
 const generation = oukGeneration;
 state.oukBusy = true; render();
 try {
  const result = await oukitel.control(reading.device, port, on); if (generation !== oukGeneration) return;
  if (!result.accepted) throw Error('Хмара не прийняла команду');
  const message = result.confirmed ? 'Хмара показує потрібний стан. Фізичний стан перевір на станції.' : 'Команда прийнята. Виконання ще не підтверджено.';
  log(`Oukitel ${port.toUpperCase()}: ${message}`, 'info'); notify(message);
 } catch (error) { if (generation === oukGeneration) { failed('oukitel', error); notify(errorText(error), 'error'); } }
 finally { if (generation === oukGeneration) { state.oukBusy = false; render(); } }
 await refreshOukitel();
}
async function controlAtlantic(action: 'power' | 'temperature' | 'mode', value: boolean | number | string) {
 const reading = state.atl;
 if (!reading || !isAtlAvailable() || state.atlBusy || !climateCapability(reading.commands, action, value === true)) return;
 if (action === 'temperature' && (!inRange(value, 7, 30) || value * 2 !== Math.round(value * 2))) return;
 const description = action === 'temperature' ? `Цільова температура ${value} °C.` : action === 'power' ? value ? 'Конвектор буде увімкнено.' : 'Обігрів буде вимкнено.' : `Новий режим: ${value}.`;
 if (!await ask('Змінити клімат?', description, action === 'power' && value === false)) { renderDetail(true); return; }
 if (!isAtlAvailable() || state.atlBusy) return;
 const generation = atlGeneration;
 state.atlBusy = true; render();
 try {
  const result = await atlantic.control(action, value); if (generation !== atlGeneration) return;
  if (!result.accepted) throw Error('Cozytouch не прийняв команду');
  log(`Atlantic: ${description} Команду прийнято.`); notify('Cozytouch прийняв команду. Оновлюємо показники…');
 } catch (error) { if (generation === atlGeneration) { failed('atlantic', error); notify(errorText(error), 'error'); } }
 finally { if (generation === atlGeneration) { state.atlBusy = false; render(); } }
 await refreshAtlantic();
}
async function exportHistory(all = false) {
 const selectedId = historyDeviceId();
 const samples = all ? state.samples : state.samples.filter(p => p.source === state.source && p.deviceId === selectedId);
 if (!samples.length) { notify('Ще немає записів для експорту'); return; }
 try { await shareCsv(csv(samples), `VOLTOS-${all ? 'all' : state.source}-${new Date().toISOString().slice(0, 10)}.csv`); }
 catch (error) { if (!/cancel/i.test(errorText(error))) notify('Не вдалося експортувати історію. Повтори ще раз.', 'error'); }
}
async function refreshAll() {
 const jobs = [ble.connected ? refreshBle(true) : null, state.oukAuthed ? refreshOukitel(true) : null, state.atlAuthed ? refreshAtlantic() : null].filter(Boolean);
 if (!jobs.length) { notify('Спочатку підключи пристрій'); return; }
 await Promise.allSettled(jobs);
 const hasErrors = !!(state.bleError || state.oukError || state.atlError);
 notify(hasErrors ? 'Не всі джерела доступні. Деталі — у картках пристроїв.' : 'Доступні показники оновлено', hasErrors ? 'error' : 'success');
}
async function action(name: string) {
 if (name === 'close-detail') return closeDetail();
 if(name === 'lan-refresh')return lan.refresh();
 if(name === 'lan-disconnect')return disconnectLan();
 if(name === 'rename-device' && state.detail){const value=(document.querySelector<HTMLInputElement>('#device-name')?.value||'').trim().slice(0,48);if(value){write(`voltos-name-${state.detail}`,value);(document.activeElement as HTMLElement)?.blur();render();notify('Назву збережено','success');}return;}
 if (name === 'refresh') return refreshAll();
 if (name === 'ble-connect') return connectBle();
 if (name === 'ble-refresh') return refreshBle(true);
 if (name === 'ble-disconnect') return disconnectBle();
 if (name === 'ouk-refresh') return refreshOukitel(true);
 if (name === 'atl-refresh') return refreshAtlantic();
 if (name === 'logout-oukitel') return logout('oukitel');
 if (name === 'logout-atlantic') return logout('atlantic');
 if (name === 'export') return exportHistory();
 if (name === 'export-all') return exportHistory(true);
 if (name === 'clear' && await ask('Очистити історію?', 'Усі локальні вимірювання буде видалено без можливості відновлення. Спершу збережи CSV, якщо потрібна копія.', true)) {
  if (clearHistory()) { state.samples = []; notify('Історію очищено', 'success'); render(); }
  else notify('Не вдалося очистити сховище', 'error');
 }
}
root.addEventListener('click', event => {
 const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
 if (!target || target.disabled) return;
 if (target.dataset.nav) {
  state.tab = target.dataset.nav as Tab;
  if (detailDialog.open) closeDetail();
  render(); content.scrollTo(0, 0); tap(); return;
 }
 if (target.dataset.device) return openDetail(target.dataset.device as Source);
 if(target.dataset.deviceView){state.deviceView=target.dataset.deviceView as DeviceView;renderDetail(true);detailContent.scrollTo(0,0);tap();return;}
 if(target.dataset.favorite){const key=target.dataset.favorite as Source;state.favorites=state.favorites.includes(key)?state.favorites.filter(s=>s!==key):[...state.favorites,key];write('voltos-favorites',state.favorites.join(','));render();return;}
 if(target.dataset.transport){if(state.lanBusy||state.oukBusy||state.commandBusy)return;state.oukTransport=target.dataset.transport as 'lan'|'cloud';write('voltos-ouk-transport',state.oukTransport);state.ouk=null;state.deviceView='controls';renderDetail(true);if(state.oukTransport==='cloud'){void disconnectLan();if(state.oukAuthed)void refreshOukitel();}return;}
 if(target.dataset.deviceAnalytics){state.source=target.dataset.deviceAnalytics as Source;state.historyId=deviceId(state.source);state.metric=state.source==='atlantic'?'room':'soc';state.tab='analytics';closeDetail();render();content.scrollTo(0,0);return;}
 if(target.dataset.deviceExport){const source=target.dataset.deviceExport as Source;const rows=state.samples.filter(p=>p.source===source&&p.deviceId===deviceId(source));void shareCsv(csv(rows),`VOLTOS-${source}.csv`).catch(e=>notify(errorText(e),'error'));return;}
 if (target.dataset.source) { state.source = target.dataset.source as Source; state.historyId = ''; state.metric = state.source === 'atlantic' ? 'room' : 'output'; render(); tap(); return; }
 if (target.dataset.metric) { state.metric = target.dataset.metric as Metric; render(); return; }
 if (target.dataset.hours) { state.hours = Number(target.dataset.hours); render(); return; }
 if (target.dataset.theme) { state.theme = target.dataset.theme; write('voltos-theme', state.theme); render(); return; }
 const task = target.dataset.action ? () => action(target.dataset.action!) :
  target.dataset.bleControl ? () => controlBle(target.dataset.bleControl as Control, Number(target.dataset.value)) :
  target.dataset.oukControl ? () => controlOukitel(target.dataset.oukControl as 'ac' | 'dc' | 'usb', target.dataset.value === '1') :
  target.dataset.atlControl ? () => controlAtlantic('power', target.dataset.value === '1') :
  target.dataset.temp && state.atl?.targetTemperature != null ? () => controlAtlantic('temperature', state.atl!.targetTemperature! + Number(target.dataset.temp)) :
  target.dataset.preset ? () => preset(target.dataset.preset!) : null;
 if (task) { tap(); void Promise.resolve().then(task).catch(error => notify(errorText(error), 'error')); }
});
root.addEventListener('submit', event => {
 const form = event.target as HTMLFormElement;
 if(form.id === 'lan-connect'){event.preventDefault();void connectLan(form);return;}
 if (form.id !== 'ouk-login' && form.id !== 'atl-login') return;
 event.preventDefault(); void login(form.id === 'ouk-login' ? 'oukitel' : 'atlantic', form).catch(error => notify(errorText(error), 'error'));
});
root.addEventListener('input', event => {
 const input = event.target as HTMLInputElement;
 if (input.id === 'alert') { state.alert = Number(input.value); write('voltos-alert', String(state.alert)); state.lowNotified = false; document.querySelector('#alert-label')!.textContent = `${state.alert}%`; }
 if (input.id === 'forecast') {
  state.forecastWatts = Number(input.value); const batteries = batteryData(), total = summarize(batteries);
  document.querySelector('#forecast-label')!.textContent = `${state.forecastWatts} Вт`;
  document.querySelector('#forecast-time')!.textContent = duration(runtimeMinutes(total.soc, state.forecastWatts, batteries.reduce((sum, b) => sum + b.capacity, 0)));
 }
});
root.addEventListener('change', event => {
 const input = event.target as HTMLInputElement;
 if (input.id === 'history-device') { state.historyId = input.value; input.blur(); render(); }
 if (input.id === 'capacity') {
  const value = Number(input.value);
  if (!inRange(value, 100, 20000)) { input.value = String(state.oukCapacity); notify('Вкажи ємність від 100 до 20 000 Вт·год', 'error'); return; }
  state.oukCapacity = value; write('voltos-oukitel-capacity', String(value));
 }
 if (input.id === 'ouk-device') {
  state.oukId = input.value; write('voltos-oukitel-device', input.value); state.ouk = null; state.oukError = '';
  input.blur(); void refreshOukitel();
 }
 if (input.id === 'atl-mode' && input.value) { input.blur(); void controlAtlantic('mode', input.value); }
 if (input.dataset.bleSelect) { input.blur(); void controlBle(input.dataset.bleSelect as Control, Number(input.value)); }
});
let deviceSwipe: {x:number;y:number}|null=null;
detailDialog.addEventListener('touchstart',event=>{const element=event.target as HTMLElement;if(element.closest('input,select,button,form,.manual-key')){deviceSwipe=null;return;}const point=event.touches[0];deviceSwipe=point?{x:point.clientX,y:point.clientY}:null;},{passive:true});
detailDialog.addEventListener('touchend',event=>{const start=deviceSwipe,point=event.changedTouches[0];deviceSwipe=null;if(!start||!point||!state.detail||confirmDialog.open)return;const dx=point.clientX-start.x,dy=point.clientY-start.y;if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dy)*2){const all:Source[]=['bluetti','oukitel','atlantic'];openDetail(all[(all.indexOf(state.detail)+(dx<0?1:2))%3]);}},{passive:true});
root.addEventListener('keydown',event=>{if(!state.detail||!(event.target as HTMLElement).closest('#device-dock')||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const all:Source[]=['bluetti','oukitel','atlantic'];openDetail(all[(all.indexOf(state.detail)+(event.key==='ArrowRight'?1:2))%3]);document.querySelector<HTMLButtonElement>(`#device-dock [data-device="${state.detail}"]`)?.focus();});
detailDialog.addEventListener('cancel', () => { if(state.detail)deviceViews[state.detail]=state.deviceView;state.detail = null; });
detailDialog.addEventListener('click', event => { if (event.target === detailDialog) { const bounds = detailDialog.getBoundingClientRect(); if (event.clientY < bounds.top || event.clientX < bounds.left || event.clientX > bounds.right) closeDetail(); } });
ble.onDisconnect(() => { state.bleControls = null; state.bleError = 'Bluetooth від’єднано. Підключи станцію знову.'; log(state.bleError, 'error'); render(); });
async function restore() {
 const og = oukGeneration, ag = atlGeneration;
 await Promise.allSettled([
  (async () => { try { const session = await oukitel.session(); if (og !== oukGeneration) return; state.oukAuthed = session.connected; if (session.connected) await refreshOukitel(true); } catch (error) { if (og === oukGeneration) state.oukError = errorText(error); } })(),
  (async () => { try { const session = await atlantic.session(); if (ag !== atlGeneration) return; state.atlAuthed = session.authenticated; state.atlConfigured = session.configured; if (session.authenticated) await refreshAtlantic(); } catch (error) { if (ag === atlGeneration) state.atlError = errorText(error); } })(),
 ]);
 state.restoring = false; render();
 if(native && read('voltos-ouk-transport')==='lan' && read('voltos-lan-auto')==='on' && state.lanHost){state.oukTransport='lan';void connectLan();}
}
function resume() { state.online = navigator.onLine; if (ble.connected) void refreshBle(); if (state.oukAuthed) void refreshOukitel(); if (state.atlAuthed) void refreshAtlantic(); render(); }
window.addEventListener('online', resume);
window.addEventListener('offline', () => { state.online = false; render(); });
document.addEventListener('visibilitychange', () => { state.active = document.visibilityState === 'visible'; if (state.active) resume(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
if (native) void App.addListener('appStateChange', ({ isActive }) => { state.active = isActive; if (isActive) {resume();if(state.oukTransport==='lan' && !lan.ready && read('voltos-lan-auto')==='on')void connectLan();} else if(lan.ready)void disconnectLan(false); });
setInterval(() => { if (state.active && document.visibilityState === 'visible' && ble.connected) void refreshBle(); }, 12000);
setInterval(() => { if (state.active && document.visibilityState === 'visible') { if (state.oukAuthed) void refreshOukitel(); if (state.atlAuthed) void refreshAtlantic(); render(); } }, 60000);
setInterval(() => { if (state.active && !detailDialog.open && document.visibilityState === 'visible') render(); }, 15000);
if (!native && import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
render(); void restore();
