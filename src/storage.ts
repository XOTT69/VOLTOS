import { appendSample, validSamples, type Sample } from './core';
export function read(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
export function write(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
const HISTORY = 'voltos-history-v3';
export function loadHistory(): Sample[] {
  try {
    const existing = read(HISTORY);
    if (existing) return validSamples(JSON.parse(existing));
    // Previous releases did not record device IDs. Keep those readings explicitly unassigned.
    const legacy: Sample[] = [];
    const sources = [
      ['voltos-local-history-v2', 'bluetti'], ['voltos-eb3a-history-v1', 'bluetti'],
      ['voltos-oukitel-cloud-samples-v1', 'oukitel'], ['voltos-atlantic-samples-v1', 'atlantic'],
    ] as const;
    for (const [key, source] of sources) {
      try {
        const records: unknown = JSON.parse(read(key, '[]'));
        if (Array.isArray(records)) for (const p of records) {
          if (p && typeof p === 'object') legacy.push({ ...p, source, deviceId: source === 'atlantic' ? 'atlantic-home' : `legacy-${source}` });
        }
      } catch { /* Leave an unreadable legacy store untouched. */ }
    }
    const validated = validSamples(legacy);
    write(HISTORY, JSON.stringify(validated));
    return validated;
  } catch { return []; }
}
export function record(samples: Sample[], sample: Sample) {
  const next = appendSample(samples, sample);
  return { samples: next, saved: next === samples || write(HISTORY, JSON.stringify(next)) };
}
export function clearHistory() { return write(HISTORY, '[]'); }
export type JournalEntry = { at: string; message: string; kind: 'info' | 'error' | 'success' };
export function loadJournal(): JournalEntry[] {
  try {
    const rows: unknown = JSON.parse(read('voltos-journal', '[]'));
    return Array.isArray(rows) ? rows.filter(r => r && typeof r.message === 'string' && typeof r.at === 'string' && ['info', 'error', 'success'].includes(r.kind)).slice(-50) : [];
  } catch { return []; }
}
export function journal(entries: JournalEntry[], message: string, kind: JournalEntry['kind'] = 'info') {
  const next = [...entries, { at: new Date().toISOString(), message, kind }].slice(-50);
  write('voltos-journal', JSON.stringify(next));
  return next;
}
