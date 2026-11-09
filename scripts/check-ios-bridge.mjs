import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(resolve(root,path),'utf8');
const scene=read('ios/App/App/SceneDelegate.swift');
const controller=scene.match(/rootViewController\s*=\s*(\w+)\s*\(/)?.[1];
if(!controller||controller==='CAPBridgeViewController')throw Error('iOS scene must instantiate the app bridge controller, which registers native plugins. Main.storyboard is bypassed by this SceneDelegate.');
const files=readdirSync(resolve(root,'ios/App/App')).filter(name=>name.endsWith('.swift')).map(name=>({name,source:read(`ios/App/App/${name}`)}));
const bridge=files.find(file=>new RegExp(`class\\s+${controller}\\s*:\\s*CAPBridgeViewController`).test(file.source));
if(!bridge)throw Error(`No Capacitor app bridge implementation found for ${controller}`);
const project=read('ios/App/App.xcodeproj/project.pbxproj');
for(const path of ['src/native.ts','src/oukitel-lan.ts']){
 const names=[...read(path).matchAll(/registerPlugin(?:<[^>]+>)?\s*\(\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
 for(const name of names){
  const implementation=files.find(file=>new RegExp(`jsName\\s*=\\s*"${name}"`).test(file.source));
  const plugin=implementation?.source.match(/class\s+(\w+)\s*:\s*CAPPlugin/)?.[1];
  if(!plugin||!new RegExp(`registerPluginInstance\\(\\s*${plugin}\\(\\)\\s*\\)`).test(bridge.source))throw Error(`Native plugin ${name} is not registered in the active scene bridge`);
  if(!project.includes(`${implementation.name} in Sources`))throw Error(`Native plugin ${name} is missing from the Xcode source list`);
 }
}
console.log(`iOS scene bridge verified: ${controller} → VoltosNative + OukitelLan`);
