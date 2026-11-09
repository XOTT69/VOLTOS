export const h = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const glyphs: Record<string, string> = {
 star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
 home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 devices: '<rect x="3" y="6" width="15" height="13" rx="3"/><path d="M21 10v5M7 10h7M7 14h4"/>',
 analytics: '<path d="M4 20V10m5 10V4m6 16v-7m5 7V7"/>',
 settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
 plus: '<path d="M12 5v14M5 12h14"/>',
 arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
 chevron: '<path d="m9 6 6 6-6 6"/>',
 bluetooth: '<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',
 refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12 0l2 5M4 12l2 5a7 7 0 0 0 12 0"/>',
 cloud: '<path d="M19 18a4 4 0 0 0 0-8 7 7 0 0 0-13-1 4.5 4.5 0 0 0 0 9z"/>',
 sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
 shield: '<path d="m12 3 8 3v6c0 4-3 7-8 9-5-2-8-5-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
 power: '<path d="M12 2v10m6-7a9 9 0 1 1-12 0"/>',
 down: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
 up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
 download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 close: '<path d="m6 6 12 12M6 18 18 6"/>',
 check: '<path d="m5 12 4 4L19 6"/>',
 warning: '<path d="m12 3 10 18H2z"/><path d="M12 9v5m0 3v.5"/>',
 clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
 leaf: '<path d="M20 3C7 2 2 8 5 15s15 7 15-12Z"/><path d="M4 21 15 10"/>',
 wifi: '<path d="M2 9a16 16 0 0 1 20 0m-16 4a10 10 0 0 1 12 0m-8 4a4 4 0 0 1 4 0"/><circle cx="12" cy="20" r="1"/>',
 info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
};
export const icon = (name: string, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name] || glyphs.info}</svg>`;
export const num = (value: number | null | undefined, digits = 0) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('uk-UA', { maximumFractionDigits: digits }).format(value);
export const time = (date: string | number) => new Date(date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
export function ago(date?: string) {
 if (!date) return 'Немає вимірювань';
 const age = Date.now() - Date.parse(date);
 if (!Number.isFinite(age)) return 'Немає вимірювань';
 return age < 60000 ? 'Щойно' : age < 3600000 ? `${Math.floor(age / 60000)} хв тому` : time(date);
}
export function duration(minutes: number | null) {
 if (minutes === null) return '—';
 return minutes < 60 ? `${minutes} хв` : `${Math.floor(minutes / 60)} год ${minutes % 60} хв`;
}
export function equipmentArt(kind: string) {
 if (kind === 'atlantic') return `<svg class="equipment-art" viewBox="0 0 160 140" fill="none" aria-hidden="true"><ellipse cx="83" cy="125" rx="60" ry="6" fill="currentColor" opacity=".07"/><path d="m22 40 117-9v86l-117 8z" fill="#e2e5ed" stroke="#bdc4d4"/><path d="m139 31 8 8v75l-8 3z" fill="#919db6"/><path d="m22 40 9-9h116l-8 8z" fill="#f7f8fc"/><path d="M34 52 127 45M34 58l93-7M34 64l93-7M34 70l93-7" stroke="#a2acc2" stroke-width="2"/><rect x="105" y="87" width="21" height="12" rx="2" fill="#30384f"/><path d="M109 93h7" stroke="#b6c1ff"/></svg>`;
 return `<svg class="equipment-art" viewBox="0 0 160 140" fill="none" aria-hidden="true"><ellipse cx="83" cy="124" rx="57" ry="8" fill="currentColor" opacity=".08"/><path d="M53 38V25c0-5 4-8 8-8h38c5 0 8 3 8 8v13" stroke="#4c5874" stroke-width="8"/><path d="m25 45 106-7 15 12-4 66-105 7-14-13z" fill="#242d43"/><path d="m25 45 106-7-3 69-105 3z" fill="${kind === 'bluetti' ? '#61729a' : '#3c465e'}"/><path d="m128 48 18 2-4 66-14-9z" fill="#1a2337"/><rect x="42" y="56" width="68" height="33" rx="4" fill="#111c31"/><path d="M55 69h26m-26 8h15" stroke="#bbc8ff" stroke-width="3" opacity=".8"/><circle cx="99" cy="72" r="4" stroke="#96a7d6"/><circle cx="48" cy="101" r="6" fill="#202b44"/><circle cx="67" cy="100" r="6" fill="#202b44"/><path d="M87 98h19" stroke="#1e2941" stroke-width="5" stroke-linecap="round"/><path d="m34 47 83-6" stroke="#9eaed3" stroke-opacity=".4" stroke-width="2"/></svg>`;
}
