# VOLTOS architecture roadmap

## Core invariants

- All user-facing telemetry has a measuredAt timestamp and a data source. A successful HTTP call is not proof of fresh device telemetry.
- Each device has an explicit capability map; unsupported actions must never be shown as available.
- A command needs device ownership authorization, user confirmation where applicable, timeout, readback verification and audit logging.
- Demo fixtures are always explicitly labeled and cannot send any physical write commands.
- Secrets and vendor tokens never appear in frontend bundles or repositories.
- Multi-tenant isolation is mandatory before opening accounts to external testers.
- Never automatically shut off critical output loads.

## Planned packages

- packages/core: normalized telemetry and device capabilities
- packages/adapters/bluetti: EB3A transport and tested BLE register mappings
- packages/adapters/oukitel: OUKITEL cloud and optional LAN transports
- edge/: LAN/BLE collector with encrypted outbound pairing and local history
- services/api/: authenticated multi-user API
- services/telemetry/: timeseries ingestion, retention, downsampling
- apps/mobile: Capacitor with later native BLE bridge as needed

## Phase 0.1 (this repository)

Buildable Vite + TypeScript standalone UI and Capacitor configuration. All numbers are intentionally simulated; production connectivity and account management are NOT implemented.

## Integration source projects

- https://github.com/XOTT69/Stats — existing EB3A Web Bluetooth research
- https://github.com/XOTT69/oukite — existing OUKITEL cloud telemetry and worker research

Do not copy confidential tokens, access credentials, copyrighted art or potentially unsafe write sequences from either repository.
