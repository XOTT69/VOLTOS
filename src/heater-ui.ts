import type { AtlanticState } from './atlantic';
export function heaterCard(
  state:AtlanticState|null,authorized:boolean,configured:boolean,pending:boolean,
  error:string,escape:(text:string)=>string,formatDate:(text:string)=>string
):string{
 const online=state?.deviceOnline===true;
 const label=(value:number|null|undefined)=>value==null?'—':value.toLocaleString('uk-UA',{maximumFractionDigits:1});
 const temp=label(state?.roomTemperature),target=label(state?.targetTemperature);
 const status=online?'● Онлайн':authorized?'○ Немає зв’язку':'○ Не підключено';
 const name=escape(state?.name??'Atlantic Altis Eco Boost');
 let actions='';
 if(state&&online){
  const canChange=!pending&&state.targetTemperature!==null;
  actions='<div class="heater-actions"><button data-heat-temp="-0.5" '+(!canChange||state.targetTemperature!<=7?'disabled':'')+' aria-label="Зменшити температуру">−</button><span>'+target+'°</span><button data-heat-temp="0.5" '+(!canChange||state.targetTemperature!>=30?'disabled':'')+' aria-label="Збільшити температуру">+</button><button class="heater-power" data-heat-power="'+(state.power?'off':'on')+'" '+(pending||state.power===null?'disabled':'')+'>'+(state.power?'Вимкнути':'Увімкнути')+'</button></div><div class="heater-mode"><label for="heater-mode">Режим роботи</label><select id="heater-mode" '+(pending?'disabled':'')+'><option value="">'+escape(state.mode??'Не визначено')+'</option>'+[['normal','Комфорт'],['eco','Еко'],['prog','За розкладом'],['manual','Ручний'],['antifreeze','Антизамерзання']].map(([v,n])=>'<option value="'+v+'" '+(state.mode===v?'selected':'')+'>'+n+'</option>').join('')+'</select></div>';
 }else if(configured&&!authorized){
  actions='<form id="atlantic-login" class="heater-login"><input type="password" name="password" placeholder="Пароль від Atlantic Home" autocomplete="current-password" required minlength="4"/><button type="submit" class="action primary">Підключити Atlantic</button></form>';
 }else if(!configured){
  actions='<p class="heater-helper">Захищений зв’язок Atlantic Home ще не налаштований. Після активації тут з’являться температура, режими й керування.</p><a class="heater-open" href="https://atlantic-home.vercel.app/" target="_blank" rel="noopener noreferrer">Відкрити чинний Atlantic Home ↗</a>';
 }else{
  actions='<button type="button" id="heater-refresh" class="action outline" '+(pending?'disabled':'')+'>Перевірити підключення</button>';
 }
 return '<section class="heat-card"><div class="heat-header"><div class="heat-icon">♨</div><div class="heat-heading"><span>КЛІМАТ · КОНВЕКТОР</span><h3>'+name+'</h3></div><div class="heat-badge '+(online?'connected':'')+'">'+status+'</div></div><div class="heat-main"><div class="heat-temp"><span>У кімнаті</span><strong>'+temp+'<small>°C</small></strong></div><div class="heat-temp"><span>Цільова</span><strong>'+target+'<small>°C</small></strong></div><div class="heat-state"><span>Живлення</span><strong>'+(state?.power==null?'—':state.power?'Увімкнено':'Вимкнено')+'</strong></div></div>'+actions+'<div class="heat-footer"><span>'+(state?.measuredAt?'Оновлено '+formatDate(state.measuredAt):'Cozytouch · Atlantic Home')+'</span><span>'+escape(error)+'</span></div></section>';
}
