# FSD P5B — Source-link deactivation policy (remaining gate)

**Status:** documented gate for production activation after P5A adapter wiring.

## Current behavior (P5A)

- Live DIMO dispatch validates the **active DIMO source link**, **organization scope**, **token id**, and **connection identity fingerprint** via `FsdDiscoveryPersistenceRepository.assertDimoDispatchBinding` before each outbound catalog/snapshot/historical GraphQL call.
- Durable run **lease** and **request ledger** reservations remain authoritative; orchestration does not add automatic provider retries beyond the single HTTP attempt reserved in FSD (`DimoRequestExecutor.maxRetries: 0` on the FSD GraphQL path).

## P5B requirement (not implemented in this PR)

When a `VehicleDataSourceLink` is **deactivated** or **superseded** while a discovery run is **IN_PROGRESS**, production must choose one of:

1. **Synchronous invalidation:** transition affected runs to `INVALIDATED` / `FAILED` and release leases at deactivation time, **or**
2. **Explicit acceptance** of **STALE_SOURCE_LINK** on the next fenced write only (current persistence path can throw `STALE_SOURCE_LINK` when writes observe an inactive link).

Until (1) or a documented operator procedure for (2) is implemented, treat **out-of-band link deactivation** as a **P5B activation blocker** alongside the existing `LIVE_ACTIVATION_BLOCKER` notes on FSD-3/FSD-4 config.
