import { test, expect } from '@playwright/test';
test('production shell reloads offline with all local assets and no cached API data', async ({ page, context }) => {
 await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connected: false, authenticated: false, configured: false }) }));
 await page.goto('/');
 await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
 });
 const cachedPaths = await page.evaluate(async () => {
  const names = await caches.keys(), cache = await caches.open(names.find(name => name.startsWith('voltos-shell-'))!);
  return (await cache.keys()).map(request => new URL(request.url).pathname);
 });
 expect(cachedPaths.some(path => path.endsWith('.css'))).toBe(true);
 expect(cachedPaths.some(path => path.endsWith('.js'))).toBe(true);
 expect(cachedPaths.some(path => path.startsWith('/api/'))).toBe(false);
 await context.setOffline(true); await page.reload();
 await expect(page.locator('h1')).toContainText('Спокій');
 await page.locator('.tabbar [data-nav="devices"]').click(); await expect(page.locator('.equipment-card')).toHaveCount(3);
});
