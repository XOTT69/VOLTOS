import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const device = { deviceKey: 'DK1', productKey: 'PK1', deviceName: 'Моя станція', productName: 'P2001E Plus', online: true };
async function mockApi(page: Page, options: { connected?: boolean; offline?: boolean; failLogin?: boolean; commands?: string[] } = {}) {
 const writes: string[] = [];
 await page.route('**/api/**', async route => {
  const url = new URL(route.request().url()), action = url.searchParams.get('action');
  const atl = url.pathname.endsWith('bridge');
  let body: unknown = {}, status = 200;
  if (action === 'session') body = atl ? { authenticated: false, configured: true } : { connected: options.connected ?? false };
  else if (action === 'login' && options.failLogin) { body = { error: 'Перевір email і пароль Oukitel' }; status = 401; }
  else if (action === 'login') body = atl ? { authenticated: true } : { connected: true, devices: [device] };
  else if (action === 'logout') body = atl ? { authenticated: false } : { connected: false };
  else if (action === 'devices') body = { devices: [device] };
  else if (action === 'state' && atl) body = { connected: true, deviceOnline: true, gatewayOnline: true, name: 'Конвектор', roomTemperature: 21.5, targetTemperature: 22, power: true, mode: 'normal', commands: options.commands ?? [], measuredAt: new Date().toISOString(), source: 'atlantic-cozytouch' };
  else if (action === 'state') body = { device: { ...device, online: !options.offline }, raw: { data: { customizeTslInfo: [
   { abId: 1, resourceValce: 75 }, { abId: 4, resourceValce: 0 }, { abId: 5, resourceValce: 120 },
   { abId: 43, resourceValce: 'true' }, { abId: 44, resourceValce: 'false' }, { abId: 46, resourceValce: 'true' },
  ] } }, cloudCheckedAt: new Date().toISOString() };
  else if (action === 'control') { writes.push(url.pathname); body = { accepted: true, confirmed: false, message: 'Прийнято' }; }
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
 });
 return writes;
}
async function openOukitel(page: Page) {
 await page.locator('.tabbar [data-nav="devices"]').click();
 await page.locator('.equipment-card[data-device="oukitel"]').click();
 await expect(page.locator('#detail-dialog')).toBeVisible();
}
test('first launch shows honest empty state and iPhone layout', async ({ page }, info) => {
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 await mockApi(page); await page.goto('/');
 await expect(page.locator('h1')).toContainText('Спокій');
 await expect(page.locator('.reserve-copy>strong')).toHaveText('—');
 await expect(page.locator('.energy-flow')).toContainText('—');
 await expect(page.locator('.energy-card')).not.toContainText('LIVE');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 for (const tab of ['devices', 'analytics', 'settings', 'home']) {
  await page.locator(`.tabbar [data-nav="${tab}"]`).click();
  await expect(page.locator(`.tabbar [data-nav="${tab}"]`)).toHaveAttribute('aria-current', 'page');
 }
 expect(errors).toEqual([]);
 if (info.project.name === 'iphone-webkit') {
  await page.screenshot({ path: 'docs/previews/iphone-home.png' });
  await page.locator('.tabbar [data-nav="devices"]').click();
  await page.screenshot({ path: 'docs/previews/iphone-devices.png' });
 }
});
test('cloud login reads telemetry, does not store credentials, and labels snapshot', async ({ page }) => {
 await mockApi(page); await page.goto('/'); await openOukitel(page);
 await page.locator('input[name="email"]').fill('test@example.com'); await page.locator('input[name="password"]').fill('test-password');
 await page.locator('#ouk-login button').click();
 await expect(page.locator('.detail-metrics')).toContainText('75');
 await expect(page.locator('#detail-content')).toContainText('Cloud Snapshot');
 expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-password');
 await page.locator('[data-action="close-detail"]').click();
 await page.locator('.tabbar [data-nav="home"]').click();
 await expect(page.locator('.energy-card-bottom')).toContainText('хмарний знімок');
 await expect(page.locator('.energy-card')).not.toContainText('LIVE');
});
test('authoritative offline status disables all physical cloud controls', async ({ page }) => {
 await mockApi(page, { connected: true, offline: true }); await page.goto('/'); await openOukitel(page);
 await expect(page.locator('#detail-content')).toContainText('станція офлайн');
 for (const control of await page.locator('[data-ouk-control]').all()) await expect(control).toBeDisabled();
});
test('cancelled command performs no physical write', async ({ page }) => {
 const writes = await mockApi(page, { connected: true }); await page.goto('/'); await openOukitel(page);
 await expect(page.locator('[data-ouk-control="ac"]')).toBeEnabled();
 await page.locator('[data-ouk-control="ac"]').click();
 await expect(page.locator('#confirmation')).toBeVisible();
 await expect(page.locator('#confirmation')).toContainText('втратять живлення');
 await page.locator('#confirm-no').click();
 expect(writes).toEqual([]);
 await expect(page.locator('[data-ouk-control="ac"]')).toHaveAttribute('aria-checked', 'true');
});
test('invalid login shows the server error and permits retry', async ({ page }) => {
 await mockApi(page, { failLogin: true }); await page.goto('/'); await openOukitel(page);
 await page.locator('input[name="email"]').fill('test@example.com'); await page.locator('input[name="password"]').fill('wrong');
 await page.locator('#ouk-login button').click();
 await expect(page.locator('.inline-error')).toContainText('Перевір email');
 await expect(page.locator('#ouk-login button')).toBeEnabled();
});
test('unsupported heater commands stay disabled', async ({ page }) => {
 const writes = await mockApi(page); await page.goto('/');
 await page.locator('.tabbar [data-nav="devices"]').click(); await page.locator('.equipment-card[data-device="atlantic"]').click();
 await page.locator('#atl-login input').fill('test-password'); await page.locator('#atl-login button').click();
 await expect(page.locator('.detail-metrics')).toContainText('21,5');
 await expect(page.locator('[data-temp="0.5"]')).toBeDisabled();
 await expect(page.locator('[data-atl-control]')).toBeDisabled();
 await expect(page.locator('#atl-mode')).toBeDisabled(); expect(writes).toEqual([]);
});
test('CSV download contains actual rows and clearing history can be cancelled', async ({ page }) => {
 await mockApi(page);
 await page.addInitScript(() => localStorage.setItem('voltos-history-v3', JSON.stringify([
  { at: Date.now() - 120000, source: 'bluetti', deviceId: 'A', soc: 60, input: 0, output: 120 },
  { at: Date.now() - 60000, source: 'bluetti', deviceId: 'A', soc: 59, input: 0, output: 125 },
 ])));
 await page.goto('/'); await page.locator('.tabbar [data-nav="analytics"]').click();
 await expect(page.locator('.plot-lines')).toBeVisible();
 const downloadPromise = page.waitForEvent('download'); await page.locator('[data-action="export"]').click();
 const download = await downloadPromise, path = await download.path();
 const file = await readFile(path!, 'utf8'); expect(file.split('\r\n')).toHaveLength(3); expect(file).not.toContain('\\n');
 await page.locator('.tabbar [data-nav="settings"]').click(); await page.locator('[data-action="clear"]').click(); await page.locator('#confirm-no').click();
 expect(await page.evaluate(() => JSON.parse(localStorage.getItem('voltos-history-v3')!).length)).toBe(2);
});
test('theme persists and small layouts do not overflow', async ({ page }) => {
 await mockApi(page); await page.goto('/'); await page.locator('.tabbar [data-nav="settings"]').click();
 await page.locator('[data-theme="dark"]').click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
 await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
 for (const width of [320, 375, 430, 1024]) {
  await page.setViewportSize({ width, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
});
test('legacy history remains viewable and exportable before a new station records data', async ({ page }) => {
 await mockApi(page);
 await page.addInitScript(() => {
  localStorage.setItem('voltos-bluetti-device', 'new-station-without-samples');
  localStorage.setItem('voltos-local-history-v2', JSON.stringify([
   { at: Date.now() - 120000, soc: 80, input: 0, output: 20 },
   { at: Date.now() - 60000, soc: 79, input: 0, output: 25 },
  ]));
 });
 await page.goto('/'); await page.locator('.tabbar [data-nav="analytics"]').click();
 await expect(page.locator('.plot-lines')).toBeVisible();
 const downloadPromise = page.waitForEvent('download'); await page.locator('[data-action="export"]').click();
 const download = await downloadPromise, path = await download.path();
 expect(await readFile(path!, 'utf8')).toContain('legacy-bluetti');
});
