import { type ApiRequest as VercelRequest, type ApiResponse as VercelResponse, validClimateCommand } from '../server/http.js';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const cookieName='voltos_session';
const ttl=7*24*3600;
function secureEqual(a:string,b:string){
 const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();
 return timingSafeEqual(x,y)&&a.length===b.length;
}
function sessionSecret(){
 const secret=process.env.VOLTOS_SESSION_SECRET??'';
 return secret.length>=32?secret:null;
}
function signed(payload:string,secret:string){
 return createHmac('sha256',secret).update(payload).digest('base64url');
}
function session(req:VercelRequest){
 const secret=sessionSecret();
 if(!secret)return false;
 const cookie=(
  isNative(req)?String(req.headers.authorization||'').replace(/^Bearer /i,''):
  String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.split('=').slice(1).join('=')
 );
 if(!cookie)return false;
 const [value,tag]=cookie.split('.');
 if(!value||!tag||cookie.length>8192||cookie.split('.').length!==2||!secureEqual(signed(value,secret),tag))return false;
 try{
  const data=JSON.parse(Buffer.from(value,'base64url').toString()) as {expires:number};
  return Number.isFinite(data.expires)&&data.expires>Date.now();
 }catch{return false;}
}
function isNative(req:VercelRequest){return req.headers['x-voltos-native']==='1'&&!req.headers.origin;}
function headers(res:VercelResponse){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
}
function sameOrigin(req:VercelRequest){
 const origin=req.headers.origin;
 if(!origin)return false;
 const host=req.headers['x-forwarded-host']??req.headers.host;
 return origin===('https://'+host)||(process.env.NODE_ENV!=='production'&&origin==='http://'+host);
}
async function relay(action:'state'|'control',body?:unknown){
 const base=process.env.ATLANTIC_BRIDGE_URL??'';
 const key=process.env.VOLTOS_BRIDGE_SECRET??'';
 if(key.length<32||!base)return {status:503,payload:{error:'Підключення Atlantic не налаштовано. Додайте серверні змінні.'}};
 let url:URL;
 try{
  url=new URL(base);
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.search||url.hash||url.pathname!=='/')
   throw Error('INVALID_URL');
 }catch{return {status:503,payload:{error:'Некоректна конфігурація Atlantic URL.'}}}
 try{
  const target=new URL('/api/voltos',url);
  const response=await fetch(target.toString(),{
   method:action==='state'?'GET':'POST',
   headers:{authorization:'Bearer '+key,...(action==='control'?{'content-type':'application/json'}:{})},
   body:action==='control'?JSON.stringify(body):undefined,
   cache:'no-store',signal:AbortSignal.timeout(17000)
  });
  const json=await response.json().catch(()=>({error:'Невідома відповідь Atlantic'}));
  return {status:response.status,payload:json};
 }catch{return {status:502,payload:{error:'Atlantic Home наразі недоступний.'}}}
}
export default async function handler(req:VercelRequest,res:VercelResponse){
 headers(res);
 const op=Array.isArray(req.query.action)?req.query.action[0]:req.query.action;
 if(op==='login'&&req.method==='POST'){
  if(!sameOrigin(req)&&!isNative(req))return res.status(403).json({error:'Недозволений Origin'});
  const secret=sessionSecret();
  if(!secret)return res.status(503).json({error:'Сервіс авторизації не налаштований'});
  const supplied=typeof req.body?.password==='string'?req.body.password:'';
  if(supplied.length<4||supplied.length>256)return res.status(400).json({error:'Вкажіть пароль доступу Atlantic Home'});
  const verification=await relay('control',{action:'verifyAccess',password:supplied});
  if(verification.status!==200||!verification.payload||!(verification.payload as {verified?:boolean}).verified)
    return res.status(verification.status>=200&&verification.status<300?401:verification.status).json({error:(verification.payload as {error?:string}|null)?.error||'Atlantic Home не підтвердив пароль'});
  const payload=Buffer.from(JSON.stringify({expires:Date.now()+ttl*1000})).toString('base64url');
  const value=payload+'.'+signed(payload,secret);
  if(isNative(req))return res.status(200).json({authenticated:true,nativeToken:value});
  res.setHeader('Set-Cookie',cookieName+'='+value+'; HttpOnly; Secure; SameSite=Strict; Path=/api/bridge; Max-Age='+ttl);
  return res.status(200).json({authenticated:true});
 }
 if(op==='logout'&&req.method==='POST'){
  if(!sameOrigin(req)&&!isNative(req))return res.status(403).json({error:'Недозволений Origin'});
  res.setHeader('Set-Cookie',cookieName+'=; HttpOnly; Secure; SameSite=Strict; Path=/api/bridge; Max-Age=0');
  return res.status(200).json({authenticated:false});
 }
 if(op==='session'&&req.method==='GET'){
  return res.status(200).json({authenticated:session(req),configured:Boolean(sessionSecret()&&(process.env.VOLTOS_BRIDGE_SECRET?.length??0)>=32&&process.env.ATLANTIC_BRIDGE_URL)});
 }
 if(!session(req))return res.status(401).json({error:'Увійдіть у VOLTOS для доступу до Atlantic.'});
 if(op==='state'&&req.method==='GET'){
  const data=await relay('state');
  return res.status(data.status).json(data.payload);
 }
 if(op==='control'&&req.method==='POST'){
  if(!sameOrigin(req)&&!isNative(req))return res.status(403).json({error:'Недозволений Origin'});
  const body=req.body??{};
  if(!body||typeof body!=='object'||Array.isArray(body))return res.status(400).json({error:'Некоректні дані'});
  const action=body.action;
  if(!validClimateCommand(action,body.value))return res.status(400).json({error:'Недозволена команда або значення'});
  const data=await relay('control',{action,value:body.value});
  return res.status(data.status).json(data.payload);
 }
 return res.status(405).json({error:'Метод або дія не підтримується'});
}
