import './app.css';
import { App } from '@capacitor/app';
import { Eb3aBle, type Eb3aReading } from './eb3a';
import { atlantic, type AtlanticState } from './atlantic';
import { oukitel, type OukitelDevice, type OukitelReading } from './oukitel';
import { ApiError } from './native-api';
import { native, tap, shareCsv, SecureSession } from './native';
import { fresh, summarize, runtimeMinutes, series, chartPaths, csv, climateCapability, inRange, type Source, type Metric, type Sample } from './core';
import { registers, type BleControls, type Control } from './protocol';
import { read, write, loadHistory, record, clearHistory, loadJournal, journal } from './storage';
import { h, icon, num, time, ago, duration, equipmentArt } from './ui';

type Tab = 'home' | 'devices' | 'analytics' | 'settings';
type Kind = 'info' | 'error' | 'success';
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
 lowNotified: false, samples: loadHistory(), entries: loadJournal(), detail: null as Source | null, theme: read('voltos-theme', 'system'),
};
let oukGeneration = 0, atlGeneration = 0, noticeTimer: ReturnType<typeof setTimeout> | undefined;
let historyWarning = false;
let lastFocused: HTMLElement | null = null;
let appliedDark: boolean | undefined;
const isBleFresh = () => ble.connected && !state.bleError && fresh(state.ble?.measuredAt, 45000);
const isOukAvailable = () => !!state.ouk?.device.online && !state.oukError && fresh(state.ouk.cloudCheckedAt, 125000);
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
const sourceLabel = (source: Source) => source === 'bluetti' ? 'Bluetooth · поруч' : source === 'oukitel' ? 'Хмарний знімок' : 'Cozytouch · клімат';
function connection(source: Source): { text: string; kind: string } {
 if (source === 'bluetti') return state.bleConnecting ? { text: 'Підключення…', kind: 'pending' } : isBleFresh() ? { text: 'Підключено', kind: 'live' } : state.ble ? { text: 'Застарілі дані', kind: 'warn' } : { text: 'Не підключено', kind: '' };
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
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101713' : '#f3f5f0');
}
const tabs: [Tab, string, string][] = [['home', 'Головна', 'home'], ['devices', 'Пристрої', 'devices'], ['analytics', 'Аналітика', 'analytics'], ['settings', 'Параметри', 'settings']];
root.innerHTML = `<div class="layout"><header class="header"><button class="brand" data-nav="home" aria-label="VOLTOS · Головна"><span class="brand-mark">${icon('bolt')}</span><strong>VOLTOS<span>HOME ENERGY</span></strong></button><div class="header-actions"><span id="network" class="network"></span><button class="icon-button" data-action="refresh" aria-label="Оновити пристрої">${icon('refresh')}</button></div></header><main id="content" class="content" tabindex="-1"></main><nav class="tabbar" aria-label="Основна навігація">${tabs.map(([id, label, symbol]) => `<button data-nav="${id}">${icon(symbol)}<span>${label}</span></button>`).join('')}</nav></div><dialog id="detail-dialog" class="sheet" aria-labelledby="detail-title"><div class="sheet-top"><span class="sheet-handle"></span><button class="icon-button" data-action="close-detail" aria-label="Закрити пристрій">${icon('close')}</button></div><div id="detail-content" class="sheet-content"></div></dialog><dialog id="confirmation" class="confirmation" aria-labelledby="confirm-title"><div id="confirm-content"></div></dialog><div id="notice" class="notice" role="status" aria-live="polite"></div>`;
const content = document.querySelector<HTMLElement>('#content')!;
const detailDialog = document.querySelector<HTMLDialogElement>('#detail-dialog')!;
const detailContent = document.querySelector<HTMLElement>('#detail-content')!;
const confirmDialog = document.querySelector<HTMLDialogElement>('#confirmation')!;
function pageHeading(kicker: string, title: string, sub: string, action = '') {
 return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
function home() {
 const batteries = batteryData(), summary = summarize(batteries);
 const anySnapshot = isOukAvailable();
 const active = Number(isBleFresh()) + Number(isOukAvailable()) + Number(isAtlAvailable());
 const date = new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
 return pageHeading(`МІЙ ДІМ <span class="kicker-separator">/</span> ${h(date)}`, 'Спокій починається<br>з контролю.', 'Твій дім. Твоя енергія. Один простір.') +
 `<section class="energy-card"><div class="energy-card-top"><span class="eyebrow">ЕНЕРГЕТИЧНИЙ РЕЗЕРВ</span><span class="hero-status"><i class="${active ? 'on' : ''}"></i>${active ? `${active} ${active === 1 ? 'джерело' : 'джерела'}` : 'Очікуємо підключення'}</span></div><div class="reserve"><div class="reserve-copy"><span class="reserve-label">Доступний заряд</span><strong>${num(summary.soc)}<small>${summary.soc === null ? '' : '%'}</small></strong><span class="reserve-caption">${summary.stored === null ? 'Показники з’являться після підключення' : `≈ ${num(summary.stored)} Вт·год номінального запасу`}</span></div><div class="reserve-ring" style="--charge:${summary.soc ?? 0}"><div>${icon('bolt')}<span>VOLTOS</span></div></div></div><div class="energy-flow"><div><span class="flow-symbol">${icon('down')}</span><span><small>Надходить</small><strong>${num(summary.input)} <em>Вт</em></strong></span></div><span class="flow-divider"></span><div><span class="flow-symbol outgoing">${icon('up')}</span><span><small>Споживання</small><strong>${num(summary.output)} <em>Вт</em></strong></span></div></div><div class="energy-card-bottom">${icon(anySnapshot ? 'cloud' : 'shield')}<span>${anySnapshot ? 'Містить хмарний знімок · свіжість вимірювання невідома' : active ? 'Дані доступних пристроїв · без вигаданих значень' : 'Підключи станцію, щоб бачити свій резерв'}</span></div></section>` +
 `<div class="quick-stats"><div>${icon('devices')}<span><strong>${active}<small> / 3</small></strong><span>Доступні пристрої</span></span></div><div>${icon('sun')}<span><strong>${isAtlAvailable() ? num(state.atl?.roomTemperature, 1) : '—'}<small> °C</small></strong><span>Температура вдома</span></span></div></div>` +
 `<section class="section"><div class="section-heading"><div><span class="eyebrow">ТВОЯ ЕКОСИСТЕМА</span><h2>Усе поруч</h2></div><button class="text-button" data-nav="devices">Усі ${icon('arrow')}</button></div><div class="device-list">${(['bluetti', 'oukitel', 'atlantic'] as Source[]).map(deviceRow).join('')}</div></section>` +
 (!batteries.length ? `<section class="start-card"><span class="start-icon">${icon('plus')}</span><div><h3>Почнемо з одного пристрою</h3><p>Станція або конвектор — підключи те, що вже є вдома.</p></div><button class="icon-button" data-nav="devices" aria-label="Додати пристрій">${icon('arrow')}</button></section>` : forecast());
}
function deviceRow(source: Source) {
 const b = source === 'bluetti' ? state.ble : state.ouk;
 const sub = source === 'atlantic' ? state.atl?.roomTemperature == null ? 'Комфортна температура вдома' : `${num(state.atl.roomTemperature, 1)} °C · ціль ${num(state.atl.targetTemperature, 1)} °C` : b ? `${num(b.soc)}% · ${num(b.outputWatts)} Вт` : sourceLabel(source);
 return `<button class="device-row" data-device="${source}"><span class="device-symbol ${source}">${icon(symbols[source])}</span><span class="device-row-copy"><strong>${h(names[source])}</strong><small>${h(sub)}</small></span><span class="device-row-end">${badge(source)}${icon('chevron')}</span></button>`;
}
function devices() {
 return pageHeading('ПІДКЛЮЧЕННЯ', 'Техніка, що працює<br>для тебе.', 'Показники та керування кожним пристроєм.') +
 `<div class="equipment-grid">${(['bluetti', 'oukitel', 'atlantic'] as Source[]).map(source => `<button class="equipment-card" data-device="${source}"><div class="equipment-top"><span class="device-symbol ${source}">${icon(symbols[source])}</span>${badge(source)}</div><div class="equipment-visual">${equipmentArt(source)}</div><span class="eyebrow">${source === 'atlantic' ? 'КЛІМАТ' : 'ЗАРЯДНА СТАНЦІЯ'}</span><h2>${h(names[source])}</h2><p>${sourceLabel(source)}</p><div class="equipment-bottom"><span>${source === 'bluetti' && state.ble ? `${state.ble.soc}% · ${num(state.ble.outputWatts)} Вт` : source === 'oukitel' && state.ouk ? `${num(state.ouk.soc)}% · ${num(state.ouk.outputWatts)} Вт` : source === 'atlantic' && state.atl?.roomTemperature != null ? `${num(state.atl.roomTemperature, 1)} °C у кімнаті` : 'Налаштувати підключення'}</span>${icon('arrow')}</div></button>`).join('')}</div><div class="note">${icon('shield')}<p>Паролі не зберігаються. На iPhone сесії захищені системним Keychain. Bluetooth працює поруч зі станцією.</p></div>`;
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
 `<section class="settings-card"><div class="section-heading"><h2>Підключення</h2>${icon('link')}</div>${(['oukitel', 'atlantic'] as Source[]).map(source => `<div class="setting-row"><span>${h(names[source])}</span>${(source === 'oukitel' ? state.oukAuthed : state.atlAuthed) ? `<button class="text-button danger-text" data-action="logout-${source}">Вийти</button>` : `<button class="text-button" data-device="${source}">Підключити ${icon('chevron')}</button>`}</div>`).join('')}<div class="setting-row"><span>Bluetooth EB3A</span><strong>${ble.connected ? 'Підключено' : 'Не підключено'}</strong></div></section>` +
 `<section class="settings-card"><div class="section-heading"><h2>Журнал подій</h2>${icon('clock')}</div>${state.entries.length ? `<div class="journal">${state.entries.slice(-8).reverse().map(entry => `<div class="journal-row ${entry.kind}"><span>${time(entry.at)}</span><p>${h(entry.message)}</p></div>`).join('')}</div>` : '<p>Тут з’являтимуться підключення, команди та помилки.</p>'}</section>` +
 `<footer class="about"><span class="brand-mark">${icon('bolt')}</span><strong>VOLTOS <span>2.0</span></strong><p>Особистий простір домашньої енергії.</p><small>${native ? 'iPhone · нативний Bluetooth' : 'Вебперегляд · для Bluetooth встанови iOS-версію'}</small><a href="https://github.com/XOTT69/VOLTOS" target="_blank" rel="noopener noreferrer">Відкрити GitHub ${icon('arrow')}</a></footer>`;
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
function openDetail(source: Source) {
 lastFocused = document.activeElement as HTMLElement;
 state.detail = source; renderDetail(); detailDialog.showModal(); tap();
}
function closeDetail() { detailDialog.close(); state.detail = null; lastFocused?.focus(); }
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
 return (d ? metrics([['Заряд', num(d.soc), '%'], ['Надходить', num(d.inputWatts), 'Вт'], ['Споживання', num(d.outputWatts), 'Вт']]) + `<div class="detail-caption">${ago(d.measuredAt)} · ${isBleFresh() ? 'Bluetooth' : 'Останні відомі показники'}</div>` : '<p class="detail-intro">Твоя станція, без посередників. Підключи EB3A через Bluetooth — акаунт не потрібен.</p>') + inlineError(state.bleError) +
 (ble.connected ? `<div class="button-row">${button(state.bleBusy ? 'Оновлення…' : 'Оновити', 'ble-refresh', 'refresh', 'secondary', state.bleBusy || state.commandBusy)}${button('Від’єднати', 'ble-disconnect', '', 'ghost', state.commandBusy || state.bleBusy)}</div>` : button(state.bleConnecting ? 'Пошук станції…' : 'Знайти EB3A', 'ble-connect', 'bluetooth', 'primary', state.bleConnecting)) +
 (!native ? '<div class="note compact">' + icon('info') + '<p>На iPhone Safari Bluetooth недоступний. Установи VOLTOS через Xcode. Сумісний браузер на комп’ютері також підтримує підключення.</p></div>' : '') +
 (d ? `<div class="detail-section"><h3>Виходи станції</h3>${switchRow('AC 230 В', 'Розетки змінного струму', 'ac', d.acEnabled, disabled)}${switchRow('DC / USB', 'Живлення гаджетів', 'dc', d.dcEnabled, disabled)}</div><div class="detail-section"><h3>Заряджання та режими</h3>${select('Заряджання', 'chargeMode', [[0, 'Стандартне'], [1, 'Тихе'], [2, 'Турбо']])}${select('Ліхтарик', 'led', [[4, 'Вимкнено'], [1, 'Слабкий'], [2, 'Яскравий'], [3, 'SOS']])}${switchRow('ECO', 'Може вимикати виходи за малого навантаження', 'eco', c?.eco == null ? null : c.eco === 1, disabled)}${select('Таймер ECO', 'ecoTime', [[1, '1 година'], [2, '2 години'], [3, '3 години'], [4, '4 години']])}${switchRow('Power Lifting', 'Лише для сумісних навантажень', 'lifting', c?.lifting == null ? null : c.lifting === 1, disabled)}</div><div class="detail-section"><h3>Швидкі сценарії</h3><div class="presets">${[['night', 'moon', 'Тиха ніч'], ['turbo', 'bolt', 'Швидкий заряд'], ['save', 'leaf', 'Економія']].map(([id, symbol, name]) => `<button data-preset="${id}" ${disabled || !c || c.eco === null || c.chargeMode === null || id !== 'turbo' && c.led === null ? 'disabled' : ''}>${icon(symbol)}<span>${name}</span></button>`).join('')}</div><p class="fine">Сценарії змінюють заряджання, ECO та ліхтарик. Кожен крок перевіряється станцією. AC/DC залишаються під твоїм керуванням.</p></div>` : '');
}
function oukDetail() {
 const d = state.ouk;
 return (d ? metrics([['Заряд', num(d.soc), '%'], ['Надходить', num(d.inputWatts), 'Вт'], ['Споживання', num(d.outputWatts), 'Вт']]) + `<div class="detail-caption">Хмара перевірена ${ago(d.cloudCheckedAt)} · ${d.device.online ? 'станція доступна у хмарі' : 'станція офлайн'}</div>` : '<p class="detail-intro">Увійди з акаунтом застосунку Oukitel, щоб бачити власні станції та їхні показники.</p>') + inlineError(state.oukError) +
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
function renderDetail(force = false) {
 if (!state.detail) return;
 if (!force && detailContent.contains(document.activeElement) && document.activeElement?.matches('input,select')) return;
 const scroll = detailContent.scrollTop;
 detailContent.innerHTML = `<div class="detail-heading"><span class="device-symbol ${state.detail}">${icon(symbols[state.detail])}</span>${badge(state.detail)}<h2 id="detail-title">${h(names[state.detail])}</h2><p>${sourceLabel(state.detail)}</p></div>${({ bluetti: bleDetail, oukitel: oukDetail, atlantic: atlDetail }[state.detail])()}`;
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
  capture({ at: Date.parse(reading.cloudCheckedAt), source: 'oukitel', deviceId: reading.device.deviceKey, soc: reading.soc, input: reading.inputWatts, output: reading.outputWatts });
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
 (document.activeElement as HTMLElement)?.blur(); form.reset();
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
detailDialog.addEventListener('cancel', () => { state.detail = null; });
detailDialog.addEventListener('click', event => { if (event.target === detailDialog) { const bounds = detailDialog.getBoundingClientRect(); if (event.clientY < bounds.top || event.clientX < bounds.left || event.clientX > bounds.right) closeDetail(); } });
ble.onDisconnect(() => { state.bleControls = null; state.bleError = 'Bluetooth від’єднано. Підключи станцію знову.'; log(state.bleError, 'error'); render(); });
async function restore() {
 const og = oukGeneration, ag = atlGeneration;
 await Promise.allSettled([
  (async () => { try { const session = await oukitel.session(); if (og !== oukGeneration) return; state.oukAuthed = session.connected; if (session.connected) await refreshOukitel(true); } catch (error) { if (og === oukGeneration) state.oukError = errorText(error); } })(),
  (async () => { try { const session = await atlantic.session(); if (ag !== atlGeneration) return; state.atlAuthed = session.authenticated; state.atlConfigured = session.configured; if (session.authenticated) await refreshAtlantic(); } catch (error) { if (ag === atlGeneration) state.atlError = errorText(error); } })(),
 ]);
 state.restoring = false; render();
}
function resume() { state.online = navigator.onLine; if (ble.connected) void refreshBle(); if (state.oukAuthed) void refreshOukitel(); if (state.atlAuthed) void refreshAtlantic(); render(); }
window.addEventListener('online', resume);
window.addEventListener('offline', () => { state.online = false; render(); });
document.addEventListener('visibilitychange', () => { state.active = document.visibilityState === 'visible'; if (state.active) resume(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
if (native) void App.addListener('appStateChange', ({ isActive }) => { state.active = isActive; if (isActive) resume(); });
setInterval(() => { if (state.active && document.visibilityState === 'visible' && ble.connected) void refreshBle(); }, 12000);
setInterval(() => { if (state.active && document.visibilityState === 'visible') { if (state.oukAuthed) void refreshOukitel(); if (state.atlAuthed) void refreshAtlantic(); render(); } }, 60000);
setInterval(() => { if (state.active && !detailDialog.open && document.visibilityState === 'visible') render(); }, 15000);
if (!native && import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
render(); void restore();
