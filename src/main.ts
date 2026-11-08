import './style.css';
import { demoDevices, durationLabel } from './model';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root missing');

const icons = {
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-3 8h8L9 22l2-9H5l8-11Z"/></svg>',
  battery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="17" height="12" x="2" y="6" rx="2"/><path d="M22 10v4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v11H3z"/><path d="M9 21v-8h6v8"/></svg>',
};
const number = (n: number) => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n);
const deviceCard = (device: typeof demoDevices[number]) => `<article class="device-card">
 <div class="device-top"><div class="device-icon">${icons.battery}</div><span class="status">ДЕМО</span></div>
 <p class="eyebrow">${device.brand}</p><h3>${device.model}</h3>
 <div class="charge-row"><strong>${device.batteryPercent}%</strong><span>${device.connection === 'cloud' ? 'Cloud' : 'Bluetooth'}</span></div>
 <div class="track"><div style="width:${device.batteryPercent}%"></div></div>
 <div class="metrics"><span>↓ Вхід <b>${number(device.inputWatts)} Вт</b></span><span>↑ Вихід <b>${number(device.outputWatts)} Вт</b></span></div>
 <div class="runtime">Автономність: <b>${durationLabel(device)}</b></div>
 </article>`;
const totalStoredWh = demoDevices.reduce((sum,d)=>sum+d.capacityWh*d.batteryPercent/100,0);
const totalOutput = demoDevices.reduce((sum,d)=>sum+d.outputWatts,0);
let activeTab = 'home';
function render() {
app!.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="mark">${icons.bolt}</span><span>VOLTOS<small>ENERGY OS</small></span></div><div class="side-caption">РОБОЧИЙ ПРОСТІР</div><nav class="desktop-nav"><button data-tab="home" class="${activeTab==='home'?'active':''}">${icons.home} Огляд</button><button data-tab="devices" class="${activeTab==='devices'?'active':''}">${icons.battery} Пристрої</button><button data-tab="analytics" class="${activeTab==='analytics'?'active':''}">${icons.chart} Аналітика</button><button data-tab="settings" class="${activeTab==='settings'?'active':''}">${icons.settings} Налаштування</button></nav><div class="side-footer">VOLTOS 0.1 · Foundation<br/>Дані для демонстрації</div></aside>
 <main class="main"><header class="topbar"><div class="mobile-brand"><span class="mark">${icons.bolt}</span> VOLTOS</div><span class="preview-pill">● PREVIEW · DEMO DATA</span></header>
 <section class="content"><p class="overline">VOLTOS / ${activeTab === 'home'?'ОГЛЯД':activeTab === 'devices'?'ПРИСТРОЇ':activeTab === 'analytics'?'АНАЛІТИКА':'НАЛАШТУВАННЯ'}</p>
 <div class="heading"><div><h1>${activeTab==='home'?'Енергосистема':activeTab==='devices'?'Мої пристрої':activeTab==='analytics'?'Аналітика':'Налаштування'}</h1><p>Єдине місце для контролю енергії.</p></div><span class="demo-label">Симуляція · без підключення</span></div>
 ${activeTab === 'home' || activeTab === 'devices' ? `<div class="summary-grid"><div class="summary"><span>ЗАПАС ЕНЕРГІЇ</span><strong>${number(totalStoredWh)} <small>Вт·год</small></strong><p>Сума демо-батарей</p></div><div class="summary"><span>СПОЖИВАННЯ</span><strong>${number(totalOutput)} <small>Вт</small></strong><p>Демонстраційне навантаження</p></div><div class="summary"><span>ДЖЕРЕЛА ЖИВЛЕННЯ</span><strong>2 <small>демо</small></strong><p>Реальних підключень: 0</p></div></div><div class="section-title"><h2>Зарядні станції</h2><span>2 пристрої · демонстрація</span></div><div class="device-grid">${demoDevices.map(deviceCard).join('')}</div>` : activeTab==='analytics' ? `<div class="empty-state">${icons.chart}<h2>Аналітика з'явиться після інтеграції</h2><p>Немає реальних вимірювань. У цій версії ми не вигадуємо історичні графіки.</p></div>` : `<div class="empty-state">${icons.settings}<h2>Підключення ще не доступне</h2><p>У наступних версіях тут будуть акаунт, джерела даних, безпечне керування й підключення шлюзу.</p></div>`}
 <section class="notice"><b>⚠ Демо-режим</b><p>Жодні дані на цій сторінці не зчитуються зі станцій. Кнопок керування обладнанням немає. Встановлена через Xcode версія призначена для перевірки дизайну та навігації.</p></section></section>
 <nav class="bottom-nav"><button data-tab="home" class="${activeTab==='home'?'active':''}">${icons.home}<span>Головна</span></button><button data-tab="devices" class="${activeTab==='devices'?'active':''}">${icons.battery}<span>Пристрої</span></button><button data-tab="analytics" class="${activeTab==='analytics'?'active':''}">${icons.chart}<span>Графіки</span></button><button data-tab="settings" class="${activeTab==='settings'?'active':''}">${icons.settings}<span>Параметри</span></button></nav>
 </main></div>`;
 document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>button.addEventListener('click',()=>{activeTab=button.dataset.tab || 'home';render();window.scrollTo({top:0,behavior:'auto'});}));
}
render();
