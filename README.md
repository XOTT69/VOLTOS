# VOLTOS ⚡ Energy OS

A local-first multi-brand home energy platform. **VOLTOS 0.4 is an early development preview, not a commercial or safety-certified release.**

## Live PWA preview

https://voltos-belli.vercel.app

PWA is for reviewing design, interactions and preview charts. iPhone Safari does not provide Web Bluetooth; actual EB3A BLE telemetry and controls must be tested using the iOS app created by Capacitor/Xcode. Do not mistake demo energy charts for physical measurements.

## What works now

- Native BLUETTI EB3A Bluetooth connection on a physical iPhone, via `@capacitor-community/bluetooth-le`
- Read-only battery charge, AC/DC input and output power, AC/DC outlet state, and measurement timestamp
- Manual refresh and polling while the app is visible
- 30-day local telemetry samples recorded once per minute while open
- Analytics with 1h / 24h / 7-day filters, output/input/SOC, CSV export, runtime estimate
- EB3A AC/DC, LED, ECO, Power Lifting and charging mode control with explicit confirmation and Modbus readback (requires hardware validation before routine use)
- Local charge threshold warning while the app is open
- Premium dashboard with energy flow, compact mobile cards, responsive bottom navigation, and explicitly-labeled design preview charts
- Atlantic Altis Eco Boost card with temperature, modes, and power controls via optional **server-only** Atlantic Home bridge; see [setup](docs/ATLANTIC.md). The bridge is disabled until configured.
- Separate demo cards when no device is connected
- Stable tab bar and independent scroll area with safe-area handling in iOS

**Not yet implemented:** automatic Atlantic pairing for multiple end users, OUKITEL inside VOLTOS, remote/cloud accounts, always-on background BLE monitoring, device automations, remote push, billing or iOS widgets. Existing [OUKITEL Home](https://github.com/XOTT69/oukite) is separate and must keep running independently.

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

The EB3A's register map is adapted from the user's [Stats](https://github.com/XOTT69/Stats) project. The iOS preview includes allowlisted BLE write commands for AC/DC, LED, ECO and charge modes, each with manual confirmation and register readback. Hardware validation of every command is still required before routine use.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the multi-brand roadmap.

VOLTOS is not affiliated with OUKITEL or BLUETTI.
