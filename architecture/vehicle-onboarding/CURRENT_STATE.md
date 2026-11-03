# Vehicle Onboarding / Vehicle Registry — Current State

| Field | Value |
|-------|-------|
| **Sealed from** | VO-0A discovery audit |
| **Repository anchor SHA** | `312d9f54a2b4c0b0740061d3e2b74897e78eacb0` |
| **Authority status** | `AUDIT_IN_PROGRESS` — **not** `AUTHORITY_ACTIVE` |
| **Last updated** | 2026-11-02 (One Auto OEM spec PRA nullable Vehicle columns + provenance registry v2; VO-SIG P2 production baseline unchanged) |
| **Production release (VO-SIG P2)** | `f5bb7bb0b35ca2ca1ccd69a24e73038d968761fb` — see [VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md](./evidence/VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md) |

## Executive summary

SynqDrive today separates **provider mirrors** (`DimoVehicle`, `HighMobilityVehicle`) from the **tenant-operational** entity (`Vehicle`). Onboarding is implemented as **registration transactions** and UI flows, not as a unified lifecycle module. Canonical PK is `Vehicle.id`; DIMO discovery does not create `Vehicle` rows.

---

## A. Current architecture

- **Canonical operational entity:** `Vehicle` (`backend/prisma/schema.prisma` — `@@map("vehicles")`).
- **DIMO mirror:** `DimoVehicle` (`dimo_vehicles`) — global per developer license sync, not tenant-scoped.
- **HM provider state:** `HighMobilityVehicle` (`high_mobility_vehicles`) — clearance, streaming, optional `synqdriveVehicleId`.
- **Provider-neutral bindings:** `VehicleDataSourceLink`, `VehicleProviderConsent` (schema comments designate extensible provider binding).
- **VO-3 (2026-09-30):** `VehicleOnboardingModule` — internal case orchestration + atomic activation (see [VO3_ORCHESTRATOR_ACTIVATION.md](./evidence/VO3_ORCHESTRATOR_ACTIVATION.md)). **VO-SIG P2 (2026-10-15 prod):** Master `register-from-dimo` **cut over** to this stack; **HM_ONLY** and **manual** `create` remain **legacy parallel** paths (see [research/VO_NEXT_PHASE_REGISTRATION_PATH_AUDIT.md](./research/VO_NEXT_PHASE_REGISTRATION_PATH_AUDIT.md)).
- **VO-3.2 (2026-09-30):** Governed `attachDimoSource` / `attachHighMobilitySource` only (no public arbitrary snapshot attach); DIMO cutover auth invariant `VO-INV-DIMO-CUTOVER-AUTH-001` (see [VO3_2_FINAL_RUNTIME_SEAL.md](./evidence/VO3_2_FINAL_RUNTIME_SEAL.md)).
- **VO-4 / VO-4.1 (2026-09-30):** `VehicleOnboardingReadinessService` + snapshot V2 + explicit `ProductSlug` entitlement + fingerprint v1.1 (incl. source evidence); HM source refresh; shared readiness mutation lock (see [VO4_READINESS_AUTHORITY.md](./evidence/VO4_READINESS_AUTHORITY.md)).
- **VO-4.8 (2026-09-30):** Tenant-scoped authenticated capture HTTP (`VehicleOnboardingCaptureController`) — see [VO48_AUTHENTICATED_CAPTURE_API.md](./evidence/VO48_AUTHENTICATED_CAPTURE_API.md).
- **VO-4.9 (2026-10-01):** Master Admin trusted source adoption HTTP (`VehicleOnboardingSourceAdoptionController`) — global source claim lock, cross-org suppression, platform-trusted DIMO adoption; **no** tenant self-service adoption (see [VO49_MASTER_ADMIN_SOURCE_ADOPTION_API.md](./evidence/VO49_MASTER_ADMIN_SOURCE_ADOPTION_API.md)).
- **VO-4.10 (2026-10-01):** Master Admin read-only provider candidate discovery (`GET …/candidates`) — derived projection over DIMO/HM mirrors; adoption transaction remains write authority (see [VO410_PROVIDER_CANDIDATE_DISCOVERY.md](./evidence/VO410_PROVIDER_CANDIDATE_DISCOVERY.md)).
- **VO-5A (2026-10-01):** Offboarding foundation — destructive `VehiclesService.deregister` audited; internal registry offboard (`ACTIVE`→`OFFBOARDED` + `VEHICLE_OFFBOARDED` outbox); **no** public HTTP; **no** legacy endpoint change (see [VO5A_OFFBOARDING_FOUNDATION.md](./evidence/VO5A_OFFBOARDING_FOUNDATION.md)).
- **VO-5B (2026-10-01):** Post-commit registry outbox consumer → Billing quantity deprovision (`VEHICLE_DISCONNECTED` at `occurredAt`); billable policy requires registry `ACTIVE`; **no** Stripe in registry consumer; **no** public offboard HTTP (see [VO5B_REGISTRY_BILLING_BRIDGE.md](./evidence/VO5B_REGISTRY_BILLING_BRIDGE.md)).
- **VO5B-AB1 (2026-10-07):** Same outbox worker handles `VEHICLE_ACTIVATED` → `VEHICLE_CONNECTED` at `occurredAt` / `activatedAt`; event idempotency `vehicle-registry:<eventId>:billing-activate:v1`; legacy `registerFromDimo`/`create` billing hooks **unchanged** (see [VO5B_AB1_ACTIVATION_BILLING_BRIDGE.md](./evidence/VO5B_AB1_ACTIVATION_BILLING_BRIDGE.md)).
- **VO5C-P1 (2026-10-07):** Master Admin safe offboard HTTP (`POST …/offboard`) with MFA, operational preflight, idempotency; calls `VehicleOffboardingService` only; **no** legacy deregister/tenant DELETE changes (see [VO5C_P1_MASTER_ADMIN_OFFBOARD_HTTP.md](./evidence/VO5C_P1_MASTER_ADMIN_OFFBOARD_HTTP.md)).
- **VO5C-P4A (2026-10-09):** Default-OFF server admission gate (`SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED`) + release attestation; dual frontend UI gate; HTTP+Postgres security matrix; operator runbook — **no** production activation (see [docs/runbooks/master-admin-vehicle-offboard-rollout-vo5c-p4a.md](../../docs/runbooks/master-admin-vehicle-offboard-rollout-vo5c-p4a.md)).
- **VO5C owner MFA exception (2026-10-13):** Default-OFF, single verified owner user id, `ACTIVATED_AT` + `EXPIRES_AT` with hard 24h max window for canonical offboard HTTP only (`SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_*`); `MasterVehicleOffboardMfaGuard` delegates to global `MasterAdminMfaGuard` except when admission path is `OWNER_MFA_EXCEPTION`; removal planned after IAM MFA rollout (runbook track B′).
- **VO5C D4/D5 (2026-10-14):** Fleet status derivation treats `registryLifecycle` OFFBOARDED/ARCHIVED as non-operational (does not overwrite persisted `Vehicle.status`); Master Admin offboard optional `note` persisted via `business_audit_outbox` (`VEHICLE_REGISTRY_OFFBOARDED`) in the same transaction as registry offboard — **billing** `VEHICLE_OFFBOARDED` outbox payload **v2 unchanged**.
- **VO5C-P2A (2026-10-08):** Connected Vehicles UI cutover to P1 offboard HTTP; lifecycle visibility + server `registryLifecycle` filter; **no** legacy backend route removal (see [VO5C_P2A_FRONTEND_CUTOVER.md](./evidence/VO5C_P2A_FRONTEND_CUTOVER.md)).
- **VO5C-P2B1 (2026-10-08):** `POST admin/vehicles/:vehicleId/deregister` retired with **409** `LEGACY_VEHICLE_DESTRUCTION_DISABLED` + `MASTER_ADMIN` + `MASTER_INTEGRATIONS` MFA; `VehiclesService.deregister` fail-closed; tenant DELETE + prune **unchanged** (see [VO5C_P2B1_LEGACY_DEREGISTER_LOCKDOWN.md](./evidence/VO5C_P2B1_LEGACY_DEREGISTER_LOCKDOWN.md)).
- **VO5C-P2B2 (2026-10-08):** Removed `api.vehicles.deregister` frontend client; repo scan proves no active runtime caller; canonical `api.vehicleOnboarding.offboardVehicle` unchanged; org-scoped `api.vehicles.delete` wrapper retained for P2B3 (see [VO5C_P2B2_LEGACY_FRONTEND_CLIENT_RETIREMENT.md](./evidence/VO5C_P2B2_LEGACY_FRONTEND_CLIENT_RETIREMENT.md)).
- **VO5C-P2B3 (2026-10-08):** `DELETE organizations/.../vehicles/...` and `DELETE vehicles/:vehicleId` fail-closed **409**; `VehiclesService.delete` retired; guards unchanged (see [VO5C_P2B3_VEHICLE_DELETE_LOCKDOWN.md](./evidence/VO5C_P2B3_VEHICLE_DELETE_LOCKDOWN.md)).
- **VO5C-P2B4-0 (2026-10-08):** `POST /admin/prune`, `PlatformAdminService.pruneMasterData`, and `npm run prisma:prune` unconditionally fail-closed; recovery-grade prune **not implemented**; `SECURITY_REMEDIATION_IN_PROGRESS` (see [VO5C_P2B4_0_PRUNE_EMERGENCY_CONTAINMENT.md](./evidence/VO5C_P2B4_0_PRUNE_EMERGENCY_CONTAINMENT.md)).
- **VO-SIG-01 (2026-10-13):** Connection identity contract (`connection-identity/*`), readiness rule `VO-RDY-CONN-001`, HM activation persists `provider=HIGH_MOBILITY`; production read-only inventory — see [VO_SIG_01_CONNECTION_IDENTITY_AUDIT.md](./evidence/VO_SIG_01_CONNECTION_IDENTITY_AUDIT.md) and [VO_SIG_01_DATA_REPAIR_PLAN.md](./research/VO_SIG_01_DATA_REPAIR_PLAN.md).
- **VO-SIG-01 P1 (2026-10-13):** Proposed vs verified modality separation, activation-time mirror revalidation + hardware device evidence, multi-provider per-ref identity, post-link snapshot parity; regression suite `vehicle-connection-identity.unit.spec.ts` (18 cases).
- **VO-SIG-01 P1 closure (2026-10-13):** Device-binding assurance levels, link `metadata.connectionIdentity` persistence for VSI-03, PostgreSQL certification `vo-sig-01-connection-identity.postgres.integration.spec.ts`.
- **VO-SIG-01 B1 (2026-10-13 code; 2026-10-14 production closure):** One-time legacy cohort reconciliation (`origin=LEGACY_RECONCILIATION`) for four DIMO source links — **operator-reported production execute completed 2026-10-14** (four links, four audits); **no repeat B1 backfill** required. Evidence: [VO_SIG_01_B1_LEGACY_CONNECTION_IDENTITY_RECONCILIATION.md](./evidence/VO_SIG_01_B1_LEGACY_CONNECTION_IDENTITY_RECONCILIATION.md). Draft PR #2018 **closed without merge** (superseded by operator SQL V3 execute path).
- **Vehicle Identity P2 — ZB-I review-only (2026-10-27 code; flags default OFF):** Master `VehicleRegistrationModal` edit mode exposes `VehicleIdentityP2Panel` when `VITE_ZB1_VEHICLE_IDENTITY_P2_ENABLED=true`. Backend `VehicleIdentityReviewService` (`…/registration-identity-review`) reconciles **manual draft** and optional **REGISTRATION_CERTIFICATE** extraction against a **provenance-aware system baseline** (DIMO link for VIN/make/model; fuel **UNCONFIRMED** on vehicle row; kW from active `VehicleMotionPhysicsReference` with AI/operator/reference mapping; displacement **unavailable** without new provider queries). **Review-only:** `validate-confirmations` validates field confirmations and returns `persisted: false` — **no** writes to `Vehicle` or motion-physics tables in P2. **FIN/VIN mismatch** blocks until explicitly acknowledged. **P.2** is nominal power — cannot be confirmed as hybrid/system power. Optional ZB-I upload uses existing document-extraction upload path when `ZB1_REGISTRATION_CERTIFICATE_EXTRACTION_ENABLED`. Code: `backend/src/modules/vehicle-onboarding/vehicle-identity-review/*`, `backend/src/config/vehicle-identity-p2.config.ts`.
- **Vehicle Identity P3 — bridge + provenance (2026-10-27 code; flags default OFF):** After P2 field confirmation, `VehicleIdentityP3Service` builds **canonical identity**, runs **Vehicle AI V2 preview** (`POST …/ai-v2-preview`; live Mistral only when `ZB1_VEHICLE_IDENTITY_P3_AI_LIVE_ENABLED`), and **explicit save** (`POST …/save`) writing vehicle scalars plus nullable `registration_identity_provenance` JSONB (`GET …/provenance` on reload). Conflict gates on save (FIN, P.2 vs AI system kW, eTSI/displacement). P2 validate remains `persisted: false`. Flags: `ZB1_VEHICLE_IDENTITY_P3_ENABLED`, `ZB1_VEHICLE_IDENTITY_P3_AI_LIVE_ENABLED`, `VITE_ZB1_VEHICLE_IDENTITY_P3_ENABLED`.
- **One Auto OEM specification PRA (2026-11-02 schema slice):** Ten nullable OEM identity columns on `Vehicle` (`oem_engine_*`, transmission, exterior/interior trim, model range/derivative) plus provenance registry keys in `registrationIdentityProvenance` (legacy v1 parse preserved; optional document v2 with `oemFieldRegistryVersion`). **No** provider auto-confirm. Evidence: [ONEAUTO_OEM_SPEC_PRA_SCHEMA_PROVENANCE.md](./evidence/ONEAUTO_OEM_SPEC_PRA_SCHEMA_PROVENANCE.md).
- **One Auto OEM specification PR-C1 (2026-11-03 normalizer slice):** Pure `OE_VIN_LOOKUP_EU` → six desc suggestion mapping + comparison engine (no persistence/API/UI). Evidence: [ONEAUTO_OEM_SPEC_PRC1_NORMALIZER.md](./evidence/ONEAUTO_OEM_SPEC_PRC1_NORMALIZER.md).
- **One Auto OEM specification PR-C2 (2026-11-03 snapshot slice):** Job-linked immutable OEM suggestion snapshots + Master read API (flag `ONEAUTO_OEM_SUGGESTIONS_ENABLED` default OFF); read-time comparison only — **no** auto-confirm. Evidence: [ONEAUTO_OEM_SPEC_PRC2_SNAPSHOT.md](../oneauto-provider/evidence/ONEAUTO_OEM_SPEC_PRC2_SNAPSHOT.md).
- **One Auto OEM specification PR-B (2026-11-02 Master slice):** Master Admin GET/PATCH + Connected Vehicle OEM UI with explicit per-field confirmation via `technicalSpecificationSave.confirmedFieldKeys`; v1→v2 provenance upgrade on OEM save only. Evidence: [ONEAUTO_OEM_SPEC_PRB_MASTER_API_UI.md](./evidence/ONEAUTO_OEM_SPEC_PRB_MASTER_API_UI.md).
- **VO-SIG-01 P2 (2026-10-14 code; 2026-10-15 production):** Master Admin `register-from-dimo` routes through canonical onboarding (`MasterDimoCanonicalRegistrationService` → capture/readiness/`VehicleOnboardingActivationService`); verified `metadata.connectionIdentity` via activation-time assertions; legacy inline vehicle create + `onVehicleProvisioned` hook **removed** from that HTTP path. Hardening: mandatory scalars + LV battery inside activation TX; **payload fingerprint bound atomically on case COMPLETED**; source-claim transaction lock + idempotent retry (changed payload → 409); entitlement-aware readiness (RENTAL/FLEET); single `VEHICLE_ACTIVATED` billing outbox per case; offboard/ARCHIVED suppression unchanged; Master UI surfaces tire post-activation enrichment failures without failing registration. **Deploy:** `f5bb7bb0b35ca2ca1ccd69a24e73038d968761fb`; operator replicas healthy; **natural E2E registration on production still pending** (no spare vehicle; do not create synthetic prod vehicles). Evidence: [VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md](./evidence/VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md), [VO_SIG_01_P2_MASTER_DIMO_CANONICAL_REGISTRATION.md](./evidence/VO_SIG_01_P2_MASTER_DIMO_CANONICAL_REGISTRATION.md), [VO_SIG_01_P2_MASTER_DIMO_FIELD_PARITY.md](./evidence/VO_SIG_01_P2_MASTER_DIMO_FIELD_PARITY.md).

---

## B. Current provider ingress

**DIMO**

- **Discovery:** `DimoApiSyncService.fetchAndSyncFromDimoApi()` — Identity GraphQL `vehicles(filterBy: { privileged: clientId })` (`backend/src/modules/dimo/dimo-api-sync.service.ts`).
- **Schedule:** `DimoVehicleSyncScheduler` — 24h repeat (`backend/src/workers/schedulers/dimo-vehicle-sync.scheduler.ts`).
- **Manual:** `POST /admin/dimo/sync` (`backend/src/modules/dimo/dimo.controller.ts`).
- **Persistence:** `DimoVehicleSyncService.syncMirroredVehicles()` upsert by `externalId` (`backend/src/modules/dimo/dimo-vehicle-sync.service.ts`).
- **Non-registered:** derived — `DimoVehicle` with no referencing `Vehicle.dimoVehicleId` (`getNonRegisteredVehicles()`).

**High Mobility**

- Substantial runtime: models through `high_mobility_*`, MQTT/stream logs, signal groups, webhooks, Master `HighMobilityDataView` (see `backend/src/modules/high-mobility/`).
- Registration paths: `DIMO_PLUS_HM` link-after-DIMO vs `HM_ONLY` (`high-mobility-registration.service.ts`).

---

## C. Current canonical identity

| Question | Answer | Evidence |
|----------|--------|----------|
| Canonical PK | `Vehicle.id` (UUID) | `schema.prisma` `Vehicle` |
| Tenant uniqueness | `@@unique([vin, organizationId])` | `schema.prisma` |
| Global DIMO binding | Partial unique `vehicles.dimo_vehicle_id` WHERE NOT NULL | migration `20260726140000_vehicles_dimo_vehicle_id_partial_unique` |
| VIN fallback | **Removed from Master register-from-dimo (P2)** — activation uses identity draft / provider VIN only | `MasterDimoCanonicalRegistrationService` |
| License plate | Single nullable `Vehicle.licensePlate` | `schema.prisma` — no history table |

---

## D. Registration paths

| Path | Entry | Backend |
|------|-------|---------|
| DIMO → tenant vehicle | Master `VehicleRegistrationModal` / Connected Vehicles | `POST …/register-from-dimo` → `VehiclesService.registerFromDimo` → `MasterDimoCanonicalRegistrationService` (VO-SIG P2) |
| Manual create | Org fleet APIs | `POST organizations/:orgId/vehicles` → `VehiclesService.create` |
| HM_ONLY | HM register API | `POST vehicles/register/hm-only` → `HighMobilityRegistrationService.registerHmOnlyVehicle` |
| HM health add-on | Post-register | `activate-high-mobility-health`, `link-high-mobility-full-telemetry` (`high-mobility-vehicle-register.controller.ts`) |
| Deregister (retired) | Legacy Master Admin HTTP | `POST admin/vehicles/:vehicleId/deregister` → **409** `LEGACY_VEHICLE_DESTRUCTION_DISABLED` (use canonical offboard HTTP) |
| Offboard (canonical) | Master Connected Vehicles | `POST admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard` → `VehicleOffboardingService` (`OFFBOARDED` + outbox) |

**Concurrency:** advisory lock `vehicleDimoBindingLockKey` in `registerFromDimo` (`pg-advisory-lock.util.ts`, `register-from-dimo-concurrency.smoke.spec.ts`).

---

## E. Technical baseline ownership

| Domain | Onboarding writes | Ongoing authority |
|--------|-------------------|-------------------|
| Tires | `manualSpecs.tires` → `TireLifecycleService` | `VehicleTireSetup`, measurements, health |
| Brakes | `manualSpecs.brakes` → `BrakeRegistrationService` | `VehicleBrakeReferenceSpec`, brake health |
| LV battery | `VehicleBatterySpec` on register | Battery V2 |
| HV capacity hint | `Vehicle.hvBatteryCapacityKwh`, etc. | `VehicleBatteryReferenceCapacity` (Battery V2) |
| Service / TÜV / BOKraft | `Vehicle` columns + optional events | Service intelligence, rental health |
| Exterior | Registration modal + `VehicleExteriorImage` | Damages / vehicle detail |

---

## F. Capability ownership

- **Static routing:** `getVehicleCapabilities(hardwareType)` (`backend/src/modules/vehicle-intelligence/vehicle-capabilities.ts`).
- **Device family (telemetry semantics):** `resolveTelemetrySourceFamily(DimoVehicle.rawJson)` — **not** `hardwareType` (`telemetry-source-family.ts`). **Cross-ref VDC-GAP-013** in VDC authority.
- **Post-register async:** `VehicleDrivingCapability`, `VehicleBatteryCapability` refresh (`registerFromDimo` hooks).

---

## G. Billing coupling

- **Canonical activation:** `VEHICLE_ACTIVATED` outbox → `VehicleRegistryLifecycleOutboxProcessor` → `onVehicleProvisioned` (VO5B-AB1).
- **Legacy:** `billingQuantity.onVehicleProvisioned` after manual `create` only; Master `registerFromDimo` uses registry `VEHICLE_ACTIVATED` outbox only (VO-SIG P2 production cutover). HM_ONLY register path uses **neither** (billing gap — see next-phase audit).
- `onVehicleRemoved` on deregister.
- Policy: `BillableVehiclesService` / `evaluateBillableVehiclePolicy` (`backend/src/modules/billing/billable-vehicles.service.ts`) — billing owns billable semantics.

---

## H. Downstream dependencies

Registered `Vehicle` required for: snapshot polling (`DimoSnapshotProcessor`), trip FSM state, fleet map, rental bookings, health modules, billing assignments. Pre-registration telemetry uses `DimoVehicle` mirror refresh only (`DimoController.refreshVehicleSnapshot`).

---

## I. Lifecycle fragmentation

| Layer | States |
|-------|--------|
| `VehicleStatus` | AVAILABLE, RENTED, IN_SERVICE, OUT_OF_SERVICE, RESERVED |
| `DimoConnectionStatus` | CONNECTED, DISCONNECTED, PENDING, ERROR |
| HM enums | clearance, registration, streaming on `HighMobilityVehicle` |
| Derived | `registrationState` registered/unregistered (`vehicles-operational.types.ts`) |

No unified onboarding lifecycle enum or readiness record.

---

## J. Known authority collisions

- Connectivity/freshness: `telemetry-freshness.resolver` vs `fleet-connectivity.util` vs `DimoVehicle.connectionStatus` vs Master UI (`docs/ui/master-admin-connected-vehicles-dimo-deep-audit.md`).
- `hardwareType` vs `DimoVehicle.rawJson` device family — **VDC-GAP-013** (do not duplicate; VO-GAP-011 related).
- Operational fleet `status` vs booking-derived RENTED/RESERVED (`vehicles.controller.ts` admin PATCH rules).

---

## K. Security / tenant observations

- `register-from-dimo`: `OrgScopingGuard`, `fleet:write` (`vehicles.controller.ts`, `iam-endpoint-enforcement-triage.security.spec.ts`).
- `admin/dimo/*`: `MASTER_ADMIN` + MFA step-up (`dimo.controller.ts`).
- `deregister`: platform-wide by `vehicleId` — high impact, master-only.

---

## L. Test coverage summary

| Area | Specs |
|------|-------|
| registerFromDimo tx/conflict | `vehicles.service.register-from-dimo.spec.ts`, `register-from-dimo-concurrency.smoke.spec.ts` |
| DIMO data source link at register | `dimo-vehicle-data-source-link.service.spec.ts` (D9) |
| Brake registration | `brake-registration-regression.spec.ts` |
| Telemetry family R1/Tesla | `telemetry-source-family.spec.ts`, `trip-analytics-canonical.service.spec.ts` |
| E2E Master onboarding UI | **Not found** dedicated suite |

---

## M. Open gaps

See [contradictions/KNOWLEDGE_GAPS.md](./contradictions/KNOWLEDGE_GAPS.md) (`VO-GAP-001` … `VO-GAP-015`). VO-1 must not implement until authorized.

**VO-SIG P2 production evidence gap (non-blocking):** live Master DIMO registration on production not yet executed — [VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md](./evidence/VO_SIG_01_P2_PRODUCTION_DEPLOYMENT_CLOSURE.md).

**Next-phase registration audit (read-only):** [research/VO_NEXT_PHASE_REGISTRATION_PATH_AUDIT.md](./research/VO_NEXT_PHASE_REGISTRATION_PATH_AUDIT.md).
