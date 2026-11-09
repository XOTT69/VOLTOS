import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const patches = [
  {
    package: '@capacitor-community/bluetooth-le', version: '8.3.0',
    file: 'ios/Sources/BluetoothLe/Plugin.swift',
    before: 'let companyIdentifier = dataObject["companyIdentifier"] as? UInt16 else {',
    after: 'let companyIdentifierValue = dataObject["companyIdentifier"] as? Int,\n                  let companyIdentifier = UInt16(exactly: companyIdentifierValue) else {',
  },
  {
    package: '@capacitor/filesystem', version: '8.1.5',
    file: 'ios/Sources/FilesystemPlugin/LegacyFilesystemImplementation.swift',
    before: '        let responseType = call.getString("responseType", "text")\n',
    after: '        // File downloads return a path; responseType is not used here.\n',
  },
];

for (const patch of patches) {
  const directory = resolve(root, 'node_modules', patch.package);
  const manifest = resolve(directory, 'package.json');
  if (!existsSync(manifest)) throw Error(`Missing ${patch.package}. Run npm ci first.`);
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
  if (version !== patch.version) {
    console.log(`iOS patch skipped for ${patch.package}@${version}; scoped to ${patch.version}.`);
    continue;
  }
  const file = resolve(directory, patch.file);
  const original = readFileSync(file, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const content = original.replaceAll('\r\n', '\n');
  if (content.includes(patch.after)) {
    console.log(`iOS fix already applied: ${patch.package}@${version}`);
    continue;
  }
  if (content.split(patch.before).length !== 2) throw Error(`Unexpected source layout: ${patch.package}/${patch.file}. Review the iOS compatibility fix.`);
  const updated = content.replace(patch.before, patch.after);
  writeFileSync(file, updated.replaceAll('\n', eol));
  console.log(`Applied iOS fix: ${patch.package}@${version}`);
}
