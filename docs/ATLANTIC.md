# Atlantic Home ↔ VOLTOS

VOLTOS can connect to the existing Atlantic Home Cozytouch integration without requiring an end user to configure Vercel variables.

## User onboarding

1. Open VOLTOS → Home or Devices → Atlantic Altis Eco Boost.
2. Enter the **existing Atlantic Home app access password** (not the Cozytouch password).
3. VOLTOS verifies this server-to-server with the existing Atlantic Home app.
4. The frontend receives only its own authenticated session. Atlantic provider tokens and the server-to-server bridge secret never leave the server.
5. VOLTOS can read room temperature, target temperature, power and mode when available from Cozytouch, and send allowed commands with confirmation.

On iPhone/Xcode the native client uses a short-lived in-memory bearer session transported over HTTPS; PWA uses HttpOnly, Secure cookies. The native session is intentionally not persisted between app restarts in this foundation version, so the user may need to sign in again.

## Server setup (maintainer only — already provisioned for this deployment)

The following are provisioned as server-side Vercel Production variables:
- Atlantic Home: `VOLTOS_BRIDGE_SECRET`.
- VOLTOS: matching `VOLTOS_BRIDGE_SECRET`, `VOLTOS_SESSION_SECRET`, and `ATLANTIC_BRIDGE_URL=https://atlantic-home.vercel.app/`.

Do not paste these values into the frontend, commit them, or share them. If deploying your own VOLTOS clone, you must provision separate secrets.

The Atlantic Home background Cozytouch refresh-token flow still requires its existing Neon storage and a valid linked account. If it is expired, reconnect from the original Atlantic Home PWA so the bridge can read via the provider account.

## Restrictions

Current bridge is intended for **one privately managed Atlantic Home installation**. It is not yet suitable for multi-tenant commercial users: it requires per-user provider linking, tenant ownership, durable rate-limiting, revocation, consent, audit trails and model compatibility tests.

Provider command acceptance is not equivalent to confirmed physical state. The UI reads state again. All communication must be HTTPS.

## Source

- [Atlantic Home](https://github.com/XOTT69/atlantic-home)
- [VOLTOS](https://github.com/XOTT69/VOLTOS)
