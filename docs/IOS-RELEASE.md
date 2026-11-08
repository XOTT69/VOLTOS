# VOLTOS 1.0 — iPhone personal testing build

VOLTOS 1.0 is a real-data, device-integrated **personal testing release**. It is not yet a safety-certified product, multi-tenant SaaS, or App Store distribution.

## Install from current XOTT69/VOLTOS checkout

Requirements: macOS, recent Xcode with iPhone-compatible SDK, Node.js 22+, Apple Account configured for signing, USB/wireless iPhone pairing, iPhone Developer Mode enabled.

Open Terminal:

```bash
cd ~/VOLTOS
git pull origin main
npm install
npm run ios
```

If you checked out the repository elsewhere, use that location instead of `~/VOLTOS`.

The `ios` script:
1. Builds Vite and performs TypeScript checks.
2. Syncs Capacitor web assets/plugins.
3. Adds the required Bluetooth privacy usage description.
4. Generates the VOLTOS branded app icon.
5. Opens the native project in Xcode.

In Xcode, open **App** (not a Swift Package), set **Signing & Capabilities → Team** to your Apple account, select your actual connected iPhone as destination, choose **Product → Clean Build Folder** if updating and click **Run (⌘R)**. If Xcode was previously open during a plugin sync, close/reopen the workspace.

Do **not** delete the installed app for routine upgrades unless necessary: local telemetry history is stored on-device and deleting the app can delete that history.

## Device test plan

### 1. BLUETTI EB3A
- Enable Bluetooth on the iPhone and the EB3A.
- VOLTOS → **Пристрої → Підключити EB3A**.
- Grant Bluetooth permission and select the EB3A.
- Compare SOC, input and output watts with the physical display.
- On the **Пристрої** page, test safe commands one at a time: LED and ECO first; then charging mode; then DC; and AC only when no critical loads are connected. All commands ask for confirmation and attempt Modbus readback.
- Close/reopen the app: native BLE must be reconnected if the phone released the peripheral. Background telemetry is not currently guaranteed.

### 2. Oukitel P2001E Plus
- VOLTOS → **Пристрої**; enter existing Oukitel/Wonderfree login credentials.
- Select the correct power station if multiple devices are linked.
- Check SOC, input, output and temperature. Cloud Shadow may be stale.
- Test AC/DC/USB output changes ONLY with non-critical loads; verify physically. A Cloud acknowledgement and Cloud readback are **not** proof that an output changed on hardware.
- If a reading is missing, VOLTOS displays an unknown value rather than 0.

### 3. Atlantic Altis Eco Boost
- Enter the existing Atlantic Home app access password (not the Cozytouch credential).
- Check room/target temperatures and operating mode.
- Change target temperature in 0.5°C steps, confirm command and verify in the official Cozytouch app.
- Test a safe mode change; do not rely on automation until independently verified.

### 4. Navigation & history
- Go through Home / Devices / Analytics / Settings and confirm the lower tab bar remains visible while content scrolls.
- Verify dashboards contain no synthetic battery or graph values.
- Leave the app in foreground long enough to capture two or more samples; check the three data sources on Analytics.
- Export CSV and verify timestamps. Cloud history is explicitly cloud snapshots, not guaranteed sampling instants.
- Test app closing, network loss and reconnection. Data should not be labeled current when the underlying source is stale.

## Known limits

- **Native vendor sessions:** bearer sessions are kept in memory and can require login again after restarting the app. This avoids storing credentials insecurely; durable Keychain-based reauthentication will be a separate update.
- **Background recording:** iOS suspends foreground JS and BLE. 24/7 history requires a separate always-on Edge/Cloud monitor and supported device integration.
- **User accounts:** the current Atlantic bridge is privately configured for the owner's installation, not a multi-user commercial SaaS.
- **Cloud reliability:** Oukitel protocol is vendor/reverse-engineering dependent. Some firmware versions or regions may differ.
- **Push and Home Screen widgets:** not shipped yet.
- **Physical controls:** always validate commands on the actual device before trusting remote operation with important loads.

## Web preview

Use https://voltos-belli.vercel.app to review the same interface. Safari PWA does not supply iPhone Web Bluetooth; test the EB3A connection in the Xcode-installed app.

## Troubleshooting

- **Old interface after upgrade:** run `npm run ios`, reopen the Capacitor Xcode workspace, clean build folder and Run.
- **Xcode says build-only destination:** change destination from Any iOS Device to the connected iPhone.
- **Untrusted developer:** iPhone → Settings → General → VPN & Device Management → trust your development certificate.
- **No BLE permission:** ensure Info.plist contains NSBluetoothAlwaysUsageDescription and rebuild natively.
- **Atlantic login works but no data:** check original Atlantic Home's Cozytouch account/token state.
- **Oukitel Cloud login fails:** ensure your account's region and password match the manufacturer app.
