# Atlantic Altis Eco Boost → VOLTOS integration

The working original is [Atlantic Home](https://github.com/XOTT69/atlantic-home). VOLTOS 0.4 introduces an **opt-in server-to-server Cozytouch integration**. It is disabled by default until the owner configures matching secrets. No Cozytouch password, refresh token or device ID is ever sent to the public PWA.

## Configure in Vercel

### 1. Atlantic Home project (`atlantic-home`)
In Settings → Environment Variables → Production, create:
- `VOLTOS_BRIDGE_SECRET` — a *new*, randomly generated secret, at least 32 characters. Do not reuse existing Atlantic, database or Cozytouch passwords.

Redeploy Atlantic Home once after adding the secret. The new `/api/voltos` endpoint will refuse all traffic without the exact server secret.

Make sure the existing `DATABASE_URL`, `SESSION_PASSWORD`, and background-provider refresh token are configured. If the refresh token is absent, reconnect Cozytouch in the original Atlantic Home app to allow the server-side bridge to read your installation after browser sessions expire.

### 2. VOLTOS project (`voltos`)
In Settings → Environment Variables → Production, create:
- `VOLTOS_APP_PASSWORD` — your own *new*, strong password (12+ characters) for accessing devices from VOLTOS;
- `VOLTOS_SESSION_SECRET` — a separate randomly generated string of 32+ characters for signing HttpOnly cookies;
- `VOLTOS_BRIDGE_SECRET` — the **same value** as configured in Atlantic Home;
- `ATLANTIC_BRIDGE_URL` — `https://atlantic-home.vercel.app` (HTTPS origin only).

Redeploy VOLTOS after adding the variables. Visit `https://voltos-belli.vercel.app` → Home or Settings → Atlantic card. Enter only `VOLTOS_APP_PASSWORD` (not Cozytouch password). Login creates a 7-day Secure, HttpOnly, SameSite=Strict cookie. The frontend calls VOLTOS's own `/api/bridge`; the backend alone contacts Atlantic Home with the bridge secret.

Never send the values of these secrets in chat, GitHub, screenshots, or `NEXT_PUBLIC_*` / `VITE_*` variables.

## Capabilities

After configuring the bridge and with a live provider account:
- read measured room temperature, target temperature, power and selected mode when reported by Cozytouch;
- show online/offline and last backend read time;
- set target (7–30°C, 0.5°C), power on/off and supported modes with user confirmation;
- return HTTP errors for failed, unsupported or offline commands.

A provider accepting a command does **not** guarantee physical execution; the frontend refreshes to inspect reported state. This implementation is currently intended for **one privately configured home**. Before commercial multi-tenant rollout add tenant-scoped authorization, installation pairing, revocable per-device credentials, persistent rate limiting, audit logs, and a capability-aware controller.

## Troubleshooting

- “Доступ VOLTOS не налаштований” → missing VOLTOS_APP_PASSWORD or VOLTOS_SESSION_SECRET.
- “Підключення Atlantic не налаштовано” → missing ATLANTIC_BRIDGE_URL or shared VOLTOS_BRIDGE_SECRET.
- Atlantic returns 401 → different bridge secrets or no configured secret on Atlantic Home.
- Provider token expired → reconnect Cozytouch from Atlantic Home with offline access and a configured Neon database.
- Offline device → verify Cozytouch gateway connectivity in the original Atlantic Home.

Existing Atlantic Home features and its authentication remain separate and unchanged.
