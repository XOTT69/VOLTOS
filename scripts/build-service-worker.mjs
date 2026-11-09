import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const names = readdirSync('dist/assets').filter(name => /\.(js|css)$/.test(name)).sort();
const assets = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest', ...names.map(name => '/assets/' + name)];
const template = readFileSync('public/sw.js', 'utf8');
const hash = createHash('sha256').update(readFileSync('dist/index.html')).update(readFileSync('dist/icon.svg')).update(readFileSync('dist/manifest.webmanifest')).update(template).update(JSON.stringify(assets)).digest('hex').slice(0, 12);
writeFileSync('dist/sw.js', template.replace("'voltos-shell-development'", JSON.stringify('voltos-shell-' + hash)).replace("['/', '/index.html', '/icon.svg', '/manifest.webmanifest']", JSON.stringify(assets)));
console.log(`Offline shell prepared: ${assets.length} assets, version ${hash}`);
