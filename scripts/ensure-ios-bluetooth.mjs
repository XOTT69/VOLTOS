import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const path = 'ios/App/App/Info.plist';
if (!existsSync(path)) {
  console.error('iOS project missing. First run: npx cap add ios');
  process.exitCode = 1;
} else {
  const xml = readFileSync(path, 'utf8');
  if (!xml.includes('<key>NSBluetoothAlwaysUsageDescription</key>')) {
    const key = '    <key>NSBluetoothAlwaysUsageDescription</key>\n    <string>VOLTOS використовує Bluetooth для зчитування стану вашої зарядної станції BLUETTI.</string>\n';
    if (!xml.includes('</dict>')) {
      console.error('Info.plist format unexpected; Bluetooth permission not inserted.');
      process.exitCode = 1;
    } else {
      const pos=xml.lastIndexOf('</dict>');
      writeFileSync(path,xml.slice(0,pos)+key+xml.slice(pos));
      console.log('iOS Bluetooth permission added to Info.plist');
    }
  } else {
    console.log('iOS Bluetooth permission already configured');
  }
}
