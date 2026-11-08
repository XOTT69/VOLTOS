# VOLTOS ⚡ Energy OS

VOLTOS is an early-stage, local-first energy dashboard designed for power stations, UPS devices and home energy systems.

## Current status

**0.1 foundation preview — DEMO ONLY.** The dashboard uses simulated values. It is not yet connected to BLUETTI, OUKITEL, billing or cloud accounts, and it must not be used to make safety-critical decisions.

## Requirements

- Node.js 22+
- For installing on an iPhone: macOS, Xcode 26+, an Apple account, a connected iPhone and compatible iOS SDK (Capacitor 8)

## Run locally

```bash
npm install
npm run dev
```

## Build and install on an iPhone through Xcode

```bash
git clone https://github.com/XOTT69/VOLTOS.git
cd VOLTOS
npm install
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

In Xcode: choose the **App** target > **Signing & Capabilities** > **Team** (your Apple account), use a unique bundle identifier if needed, select your iPhone and press **Run**. On iPhone enable Developer Mode when prompted. A free Apple account can sign a personal development build subject to Apple's limitations. No App Store submission is needed for personal testing.

After web changes: `npm run build && npx cap sync ios`, then Run again in Xcode.

## Structure

- `src/` — TypeScript UI, demo device model, styles
- `capacitor.config.ts` — native app configuration
- `docs/ARCHITECTURE.md` — integration strategy and next milestones

## Next work

1. Adapt, do not directly merge, the verified BLUETTI EB3A BLE logic from [Stats](https://github.com/XOTT69/Stats).
2. Adapt the OUKITEL Cloud read-only integration from [oukite](https://github.com/XOTT69/oukite); do not publish secrets or assume cloud shadow is live.
3. Create a capability-aware adapter SDK and explicit device-source freshness indicators.
4. Add encrypted account-scoped cloud telemetry storage and optional local Edge agent.
5. Validate write commands with physical devices before enabling controls.

VOLTOS is not affiliated with any device manufacturer.
