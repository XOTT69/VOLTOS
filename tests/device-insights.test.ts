import { expect, it } from 'vitest';
import { batteryForecast } from '../src/device-insights';
it('uses net discharge and scales the time to the chosen reserve',()=>{
 const forecast=batteryForecast(75,100,200,2000,25);
 expect(forecast).toMatchObject({mode:'discharging',netWatts:100,minutes:756,reserveMinutes:504,usableWh:840,fromStation:false});
});
it('uses a station estimate when available, but rejects the known placeholder',()=>{
 expect(batteryForecast(75,0,200,2000,25,240)).toMatchObject({minutes:240,reserveMinutes:160,fromStation:true});
 expect(batteryForecast(75,0,200,2000,25,5940).fromStation).toBe(false);
});
it('does not show a discharge countdown while charging or in passthrough',()=>{
 expect(batteryForecast(50,300,100,2000,20,240)).toMatchObject({mode:'charging',minutes:null,chargingMinutes:300});
 expect(batteryForecast(50,100,100,2000)).toMatchObject({mode:'balanced',minutes:null,reserveMinutes:null});
});
it('keeps unknown inputs unknown and clamps a reserve already reached to zero',()=>{
 expect(batteryForecast(null,0,100,2000)).toMatchObject({mode:'unknown',minutes:null,usableWh:null});
 expect(batteryForecast(50,NaN,100,2000).minutes).toBeNull();
 expect(batteryForecast(10,0,100,2000,20)).toMatchObject({reserveMinutes:0,usableWh:0});
});
