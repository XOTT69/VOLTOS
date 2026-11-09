import { test, expect, type Page } from '@playwright/test';
const device={productKey:'p11wN7',deviceKey:'TEST-STATION',deviceName:'Моя станція',productName:'P2001E Plus',online:true};
async function nativeStation(page: Page, failures=0) {
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({device,failures})=>{
  localStorage.setItem('voltos-ouk-transport','lan');localStorage.setItem('voltos-lan-auto','on');
  localStorage.setItem('voltos-lan-host','192.168.1.50');localStorage.setItem('voltos-lan-device',JSON.stringify(device));localStorage.setItem('voltos-oukitel-device',device.deviceKey);
  Object.assign(window,{__lan:{calls:[] as string[],writes:[] as unknown[],failures}});
 },{device,failures});
 await page.route('**/src/native.ts',r=>r.fulfill({contentType:'application/javascript',body:`
  export const native=true;
  export const SecureSession={getSession:async({key})=>key.startsWith('oukitel-lan-')?{value:'AAECAwQFBgcICQoLDA0ODw=='}:undefined,setSession:async()=>{},removeSession:async()=>{},setAppearance:async()=>{}};
  export function tap(){} export async function shareCsv(){}
 `}));
 // UI/lifecycle fixture only. Actual AES/TTLV and independent readback are unit-tested.
 await page.route('**/src/oukitel-lan.ts',r=>r.fulfill({contentType:'application/javascript',body:`
  export class OukitelLan {
   ready=false;reading=null;
   constructor(onReading,onStatus){this.onReading=onReading;this.onStatus=onStatus;}
   async connect(host,key,device){window.__lan.calls.push(host);if(window.__lan.failures-->0)throw Error('Контрольний розрив Wi-Fi');this.ready=true;this.reading={device,soc:75,inputWatts:0,outputWatts:120,acOn:true,dcOn:true,usbOn:true,remainingMinutes:240,chargeRate:100,frequency:0,cloudCheckedAt:null,source:'quectel-lan',freshness:'live'};this.emit();}
   emit(){this.reading.measuredAt=new Date().toISOString();this.onReading({...this.reading});}
   async disconnect(){this.ready=false;}
   async refresh(){if(!this.ready)throw Error('Від’єднано');this.emit();}
   async setOutput(port,on){window.__lan.writes.push({port,on});this.reading[port+'On']=on;this.emit();}
   async setSetting(setting,value){window.__lan.writes.push({setting,value});this.reading[setting]=value;this.emit();}
  }
 `}));
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/**',async route=>{
  await gate;
  const atl=new URL(route.request().url()).pathname.endsWith('bridge');
  await route.fulfill({contentType:'application/json',body:JSON.stringify(atl?{authenticated:false,configured:true}:{connected:false})}).catch(()=>{});
 });
 return {errors,release};
}
async function openStation(page: Page) {
 await page.locator('.tabbar [data-nav="devices"]').click();await page.locator('.equipment-card[data-device="oukitel"]').click();
 await expect(page.locator('.connection-health')).toContainText('Дані надходять');
}
async function active(page:Page,value:boolean){
 await page.evaluate(value=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:value?'visible':'hidden'});document.dispatchEvent(new Event('visibilitychange'));},value);
}
test('connects before cloud responds, resumes after background and preserves a manual pause',async({page})=>{
 const fixture=await nativeStation(page);
 try{
  await page.goto('/');await openStation(page);
  expect(await page.evaluate(()=>(window as any).__lan.calls)).toEqual(['192.168.1.50']);
  await page.reload();await openStation(page);
  expect(await page.evaluate(()=>(window as any).__lan.calls)).toEqual(['192.168.1.50']);
  await active(page,false);await active(page,true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__lan.calls.length)).toBe(2);
  await expect(page.locator('.connection-health')).toContainText('Дані надходять');
  await page.locator('[data-action="lan-disconnect"]').click();
  await expect(page.locator('#lan-connect')).toBeVisible();
  await active(page,false);await active(page,true);
  expect(await page.evaluate(()=>(window as any).__lan.calls.length)).toBe(2);
  expect(await page.evaluate(()=>localStorage.getItem('voltos-lan-auto'))).toBe('off');
  expect(fixture.errors).toEqual([]);
 }finally{fixture.release();}
});
test('continues retrying beyond three failures until the station returns',async({page})=>{
 const fixture=await nativeStation(page,4);
 try{
  await page.clock.install();await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>(window as any).__lan.calls.length)).toBe(1);
  for(const [delay,count] of [[2000,2],[4000,3],[8000,4],[16000,5]]){
   await page.clock.runFor(delay);await expect.poll(()=>page.evaluate(()=>(window as any).__lan.calls.length)).toBe(count);
  }
  await openStation(page);expect(fixture.errors).toEqual([]);
 }finally{fixture.release();}
});
test('shows live runtime, reserve and load planning and confirms advanced controls',async({page},info)=>{
 const fixture=await nativeStation(page);
 try{
  await page.goto('/');await openStation(page);
  await expect(page.locator('[data-runtime]')).toHaveText('4 год 0 хв');
  await page.locator('[data-reserve-source]').selectOption('50');
  await expect(page.locator('[data-reserve-time]')).toHaveText('1 год 20 хв');
  await page.locator('[data-plan-source]').fill('200');await page.locator('[data-plan-source]').blur();
  await expect(page.locator('[data-plan-time]')).toHaveText('2 год 9 хв');
  await page.locator('[data-charge-rate="50"]').click();await page.locator('#confirm-no').click();
  expect(await page.evaluate(()=>(window as any).__lan.writes)).toEqual([]);
  await page.locator('[data-charge-rate="50"]').click();await page.locator('#confirm-yes').click();
  await expect(page.locator('#lan-charge-rate')).toHaveValue('50');
  await expect(page.locator('#lan-frequency')).toBeDisabled();
  await page.locator('[data-ouk-control="ac"]').click();await page.locator('#confirm-yes').click();
  await expect(page.locator('#lan-frequency')).toBeEnabled();
  await page.locator('#lan-frequency').selectOption('1');await page.locator('#confirm-yes').click();
  await expect(page.locator('#lan-frequency')).toHaveValue('1');
  await expect.poll(()=>page.evaluate(()=>(window as any).__lan.writes)).toEqual([{setting:'chargeRate',value:50},{port:'ac',on:false},{setting:'frequency',value:1}]);
  await page.locator('#device-tabs [data-device-view="overview"]').click();
  await expect(page.locator('[data-reserve-source]')).toHaveValue('50');
  for(const width of [320,390,430]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  if(info.project.name==='iphone-webkit')await page.screenshot({path:'docs/previews/iphone-live-forecast.png'});
  expect(fixture.errors).toEqual([]);
 }finally{fixture.release();}
});
