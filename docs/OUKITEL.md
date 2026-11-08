# Oukitel P2001E Plus in VOLTOS

This is an early integration adapted from [XOTT69/oukite](https://github.com/XOTT69/oukite). It uses Quectel EU Cloud endpoints over HTTPS.

## Connect without manual variables

1. Visit VOLTOS → Home / Devices → Oukitel P2001E Plus.
2. Enter the email/password you already use with the Oukitel/Wonderfree account.
3. The VOLTOS server performs the provider login and retrieves only your bound devices.
4. Select your station (if more than one), then tap “Оновити показники”.
5. SOC, input/output power and available output states appear using the actual cloud shadow response.

Credentials are sent to the server only for login over HTTPS; the original password is not written to the browser, source repository, or server database. Provider access token is encrypted with AES-256-GCM in an HttpOnly Secure SameSite=Strict cookie on PWA. The Capacitor/Xcode client uses a native HTTPS request and keeps a bearer session token only in memory; restarting the native app may require another login.

## Server setup for a new self-hosted deployment

The maintainer must set:
- `VOLTOS_SESSION_SECRET` (32+ character random secret)
- `OUKITEL_APP_SECRET` (server-only Quectel app client secret matching the supported app protocol)

These are already configured in the existing VOLTOS Vercel project; **end users do not configure environment variables**. Provider-specific app keys may change and are not an official guaranteed public API.

## Data freshness

Oukitel Cloud Shadow may return the last known values while hardware is offline. VOLTOS labels this as Cloud and displays **cloud query time**, not guaranteed physical measurement time. A response without SOC / input / output is rejected rather than displayed as live.

## Safety

Cloud output control is **not enabled in VOLTOS** until model-specific commands and readback have been validated on physical hardware. The existing Oukitel Home application is left untouched.

For a future commercial multi-user platform, add persistent distributed login rate-limiting, consent and terms checks, tenant/account isolation beyond the current session, refresh and revocation policies, encrypted long-term credentials with explicit opt-in, and vendor integration governance.
