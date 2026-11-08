# VOLTOS ⚡ Energy OS

A local-first multi-brand home energy platform. **VOLTOS 0.2 is an early development preview, not a commercial or safety-certified release.**

## What works now

- Native BLUETTI EB3A Bluetooth connection on a physical iPhone, via `@capacitor-community/bluetooth-le`
- Read-only battery charge, AC/DC input and output power, AC/DC outlet state, and measurement timestamp
- Manual refresh and polling while the app is visible
- 30-day local telemetry samples recorded once per minute while open
- Basic actual-data chart, direct current battery runtime estimate
- Separate demo cards when no device is connected
- Stable tab bar and independent scroll area with safe-area handling in iOS

**Not yet implemented:** OUKITEL in this app, remote/cloud accounts, always-on background BLE monitoring, automated AC/DC control, billing, push or iOS widgets. Existing [OUKITEL Home](https://github.com/XOTT69/oukite) is separate and must keep running independently.

## Run on iPhone (Xcode)

Requires Node 22+, macOS, Xcode with iOS SDK, a physical iPhone and Apple Account for signing.

```bash
git clone https://github.com/XOTT69/VOLTOS.git
cd VOLTOS
npm install
npm run build
npx cap add ios
npm run ios
```

If `ios/` already exists **do not run** `npx cap add ios` again.

### Updating an existing checkout

```bash
cd ~/VOLTOS
git pull
npm install
npm run ios
```

The `npm run ios` script rebuilds web assets, syncs Capacitor plugins, and adds the native `NSBluetoothAlwaysUsageDescription` iOS privacy message to `ios/App/App/Info.plist` if missing, then opens Xcode. In Xcode select your development team, physical iPhone and Run (⌘R). Make sure Bluetooth is enabled. iOS will request Bluetooth access on first connection.

If Xcode was already open, close and reopen the workspace after the plugin sync to refresh packages. The plugin needs an updated native Xcode build; a web-only refresh cannot add native BLE.

### Troubleshooting

- If the BLE scan shows no station, ensure EB3A is powered on, Bluetooth is enabled and other apps are not currently holding its BLE connection.
- In Settings → VOLTOS, verify Bluetooth permission is granted.
- BLE requires a physical phone: the iOS simulator cannot scan for real BLE peripherals.
- If a read fails, app reports the error; old values must not be interpreted as current values.
- No background BLE telemetry is guaranteed after app closes or iOS suspends it.

The EB3A's register map is adapted from the user's [Stats](https://github.com/XOTT69/Stats) project. This preview only reads Modbus registers and does **not** send AC/DC write commands.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the multi-brand roadmap.

VOLTOS is not affiliated with OUKITEL or BLUETTI.
