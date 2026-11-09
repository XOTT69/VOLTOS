import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { loadHistory, clearHistory } from '../src/storage';
let items: Map<string, string>;
beforeEach(() => { items = new Map(); vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) }); });
afterEach(() => vi.unstubAllGlobals());
it('migrates legacy samples without attributing them to a newly connected station', () => {
 items.set('voltos-local-history-v2', JSON.stringify([{ at: Date.now(), soc: 80, input: 0, output: 100 }]));
 const samples = loadHistory(); expect(samples[0].deviceId).toBe('legacy-bluetti'); expect(items.has('voltos-local-history-v2')).toBe(true);
});
it('does not resurrect legacy history after the user clears it', () => {
 items.set('voltos-local-history-v2', JSON.stringify([{ at: Date.now(), soc: 80, input: 0, output: 100 }]));
 loadHistory(); clearHistory(); expect(loadHistory()).toEqual([]);
});
