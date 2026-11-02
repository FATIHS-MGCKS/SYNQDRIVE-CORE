# Vehicle Signal Intelligence — Cross-workstream contracts

| Field | Value |
|-------|-------|
| **Status** | CANONICAL boundary reference |
| **Established** | 2026-10-15 |

---

## Ownership matrix

| Workstream | Owns | Must not own |
|------------|------|--------------|
| **VO (Vehicle Onboarding)** | Vehicle registry lifecycle; provider consents; `VehicleDataSourceLink` create/activate/deactivate/supersede; `connectionIdentity` metadata; onboarding readiness gates | Signal observation semantics; poll scheduling; declared/observed profile evaluation |
| **VO-SIG** | Connection identity assurance, reconciliation audits, legacy binding repair evidence | Canonical signal keys; APDS decisions |
| **VDC (Vehicle & Device Connectivity)** | Connectivity runtime projection; monotonic VLS ingest; strict source advance vs poll success; physical device episodes; webhook vs snapshot provenance | Provider `availableSignals` catalog interpretation; per-signal consumer fallbacks |
| **VSI** | Capability profiles; declared vs observed reconciliation; fingerprints; availability intelligence; future capability resolver | Trip boundaries; braking/trip scores; HV SOH math; polling schedules |
| **DIMO Integration** | Provider auth, telemetry fetch, segments, triggers, webhook delivery | Tenant vehicle business rules; profile persistence |
| **Driving Intelligence (EXP021)** | Trip speed QC, behavior pipelines, post-trip analysis, domain policies (e.g. `DI_V0_SPEED_QC_POLICY_V2`) | Source of truth for whether a signal is listed or observed on a link |
| **Battery V2** | LV/HV health models, rest windows, publications, capability preflight **writers**, measurement gates | Link-scoped profile storage; APDS epoch activation |
| **APDS (R5 shadow)** | Polling decisions, cohort selection, shadow epochs, demand-aware request shaping, provider call optimization | Declaring a signal NOT_LISTED without catalog evidence; mutating VSI profiles implicitly |

---

## Data-flow contracts

### Declared catalog (provider)

```
DIMO availableSignals HTTP (onboarding / refresh)
  → driving-capability + battery-capability preflight rows (vehicle-scoped today)
  → VsiDeclaredCatalogResolver (read cached rows only on materialization)
  → profile.declaredSupport per canonical key
```

**Attribution rule:** Vehicle-scoped preflight must not map to a specific `providerSourceLinkId` when multiple active links exist or provider identity mismatches — declared axis = `UNKNOWN` + limitation (implemented P0+P1).

### Empirical observation (telemetry)

```
DIMO snapshot / telemetry ingest (VDC-ordered VLS upsert)
  → VehicleLatestState (providerBindingId, sourceTimestamp, rawPayloadJson)
  → VsiReadonlySignalComposerService (link-scoped)
  → profile.empiricalObservation per canonical key
```

**Poll logs:** `dimo_poll_logs` may explain attempts; they do **not** alone prove observation or catalog state.

### Source timestamp authority

- **VDC** documents: poll success ≠ strict source advance; equality upsert behavior; out-of-order skip rules.
- **VSI** materialization respects stored `lastMaterializedSourceTimestamp` and skips regressive source times.
- **Consumers** must not use `updatedAt` alone as provider observation time.

---

## GraphQL / API shape vs provider HTTP cost

**Contract:** Removing a signal from a DIMO GraphQL selection set or internal query projection **does not necessarily eliminate** a provider HTTP request.

| Layer | What changes | What may still happen |
|-------|----------------|----------------------|
| Query projection | Fewer fields parsed from response | Full telemetry fetch still executed |
| APDS poll list | Fewer signals requested per poll | Transport call may remain |
| availableSignals preflight | Declared catalog update | Separate HTTP from routine snapshot poll |

VSI and APDS documentation must treat **provider call cost** as orthogonal to **field presence** in a query document. P5/P6 require explicit **request accounting** (poll id, signal list hash, bytes).

---

## APDS ↔ VSI (future P5/P6)

| Direction | Allowed | Forbidden |
|-----------|---------|-----------|
| APDS → VSI | Read profiles, limitations, fingerprints, consumer demand registry | Writing profiles; inferring LISTED/NOT_LISTED |
| VSI → APDS | Emit read-only events (profile revision changed) | Enabling shadow or production polling flags |
| Shadow epoch | APDS logs profile snapshot id at decision time | Changing `WORKER_APD_SHADOW_ENABLED` in VSI PRs without VDC/APDS authority |

Reference: VDC change ledger APDS-9.x evidence; `vsi-apds-consumer.adapter.contract.ts`; P5A [`research/VSI_P5_APDS_INTEGRATION.md`](research/VSI_P5_APDS_INTEGRATION.md) (shadow service **not** wired — P5B gate default OFF); P5B.1 offline observer [`research/VSI_P5B1_OFFLINE_CORRELATION.md`](research/VSI_P5B1_OFFLINE_CORRELATION.md) (no poll-tier changes); P5-H1 immutable profile revision history [`research/VSI_P5H1_PROFILE_REVISION_HISTORY.md`](research/VSI_P5H1_PROFILE_REVISION_HISTORY.md) (capture gate default OFF; P5B.1 replay unchanged until follow-up).

**P4 internal resolver routing (operational):** production may expose `/api/v1/api/v1/internal/vsi/capability-resolver/...` (double prefix). Document-only in P5; do not alter working route without gateway contract review.

---

## Battery V2 ↔ VSI

- Battery capability preflight **writes** DIMO catalog cache; VSI **reads** for declared axes on LV/HV keys.
- Battery measurement gates and publications remain Battery V2 domain; they consume VSI truth only after P4 contracts exist.
- Battery V2 signal observability deadlocks (M3.x evidence) inform P3 quality but do not override VSI UNKNOWN semantics.

---

## Driving Intelligence ↔ VSI

- EXP021 speed QC and trip projections consume trip boundaries from Trip Detection / DIMO Segments — not VSI.
- **P4 (in PR):** read-only capability resolver supplies assessability context per link (`vsi-capability-resolver`); does not change EXP021 speed QC algorithms or trip boundaries.
- **RPM multicadence tier (2026-10-30):** VSI owns authoritative `engine_rpm` profile semantics and **RPM cadence tier evidence** (`rpmCadenceTierResolution`). RPM HF V1B consumes tier snapshots for admission/tier-aware shadow only; VSI must not assign synthetic tiers for canary vehicles. Vehicle `idleRpm`/`maxRpm` (Vehicle Specifications) are **not** VSI inputs. Boundaries: [`../drivingintelligence/design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md`](../drivingintelligence/design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md) (`DI-DEC-RPM-REF-INTEL-001`).

---

## VSI-03 P2C capture (forensic)

- Append-only `vehicle_provider_source_observations` when capture flags ON.
- **Not** the product profile loop; optional enrichment for P3 forensics and strict-advance experiments.
- Default OFF; separate authorization from profile materialization.

---

## Incident / drift escalation

| Symptom | First owner | VSI action |
|---------|-------------|------------|
| Poll success without VLS advance | VDC | Do not mark empirical OBSERVED from poll alone |
| Multi active links on vehicle | VO | Declared UNKNOWN per link until catalog per-link |
| Catalog refresh without observation change | VSI | Re-materialize on `declaredCatalogCheckedAt` advance |
| APDS reduced GraphQL fields but flat poll count | APDS | Track request-level metrics; do not claim VSI regression |

---

## Related documents

- [`VSI_PRODUCT_CHARTER.md`](VSI_PRODUCT_CHARTER.md)
- [`VSI_MASTER_ROADMAP.md`](VSI_MASTER_ROADMAP.md)
- [`../vehicle-onboarding/evidence/VO_SIG_01_CONNECTION_IDENTITY_AUDIT.md`](../vehicle-onboarding/evidence/VO_SIG_01_CONNECTION_IDENTITY_AUDIT.md)
- [`../vehicle-device-connectivity/CURRENT_STATE.md`](../vehicle-device-connectivity/CURRENT_STATE.md)
- [`../../backend/src/modules/vehicle-intelligence/vehicle-signal-intelligence/VSI03_P1_READONLY_COMPOSER.md`](../../backend/src/modules/vehicle-intelligence/vehicle-signal-intelligence/VSI03_P1_READONLY_COMPOSER.md)
