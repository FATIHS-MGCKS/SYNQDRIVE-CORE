# Vehicle AI V2 — Complete Specification Persistence Audit

| Field | Value |
|-------|--------|
| **Audit SHA** | `07f008ee409e354bba69caa3b8c3714748609627` (PR #2213 HEAD) |
| **Production baseline** | `e3fadbcb84474bbb0f13e5fd045ccb947aedd67d` (merged #2210) |
| **Mode** | STRICT READ_ONLY analysis + isolated unit tests (no production DB writes) |
| **Scope** | Vehicle specifications / Master registration / Connected Vehicles spec edit |

## Executive summary

Vehicle technical data uses **multiple persistence lanes** (not a single `vehicles` row dump):

1. **`vehicles` scalars** — curb mass, engine, weight distribution, RPM, brake bias, tank, service/oil intervals, legacy HV usable kWh, `drive_type`.
2. **`vehicle_technical_spec` confirmed PATCH** — subset of (1) on **Connected Vehicle / Master edit** with AI confirmation + provenance (#2210, extended #2213).
3. **`register-from-dimo` / manual onboarding** — `extraData` + `manualSpecs` → post-activation patch + brake/tire/battery reference rows + motion physics draft.
4. **`vehicles.hv_master_specification` JSON** — extended HV catalog fields via admin upsert on edit.
5. **`vehicle_motion_physics_references`** — system power, 0–100 s, variant assumption (confirm tier); curb mass duplicated on vehicle + reference.
6. **Reference tables** — `vehicle_battery_specs`, `vehicle_brake_reference_specs`, `vehicle_tire_setups` (+ measurements).

The **Connected Vehicle “Edit specifications”** path only persists lane **(2)** + **(4)** (+ motion handled inside the modal, not the hub PATCH). Many modal fields are **registration-only** or **reference-table-only** and are **lost on edit-save** if the operator only uses `updateMasterRegisteredVehicle`.

On production baseline **`e3fadbcb`**, idle/max RPM and brake force were **GET-mapped but not included in `buildMasterVehiclePhysicsSpecPatch`** → **P0-class silent non-persistence on edit** after AI review. **PR #2213** closes that gap for those three fields.

---

## Phase 1 — Field matrix (AI V2 schema)

**Canonical AI schema:** `backend/src/modules/ai/vehicle-specs/vehicle-spec-ai.schema.util.ts` → `VEHICLE_SPEC_FIELD_KEYS` (**47** keys) plus legacy aliases `batteryType`, `batteryAmpere`, `batteryVolt`, `hvBatteryCapacityKwh` in the empty shape (**51** AI JSON keys total).

**Legend — Persistenzstatus**

| Code | Meaning |
|------|---------|
| `PERSISTED_AND_RELOADED` | Intended save path + GET + modal/CV reload |
| `PERSISTED_NOT_DISPLAYED` | Stored but not in CV technical specs panel |
| `DISPLAYED_NOT_PERSISTED` | Shown in modal/CV context but edit-save does not write |
| `AI_PREVIEW_ONLY_BY_DESIGN` | Variant gate / metadata; not a vehicle scalar |
| `REFERENCE_CONFIRMATION_REQUIRED` | Persists via reference/onboarding lane with separate confirmation |
| `UNSUPPORTED` | No durable column/table mapping |
| `UNKNOWN` | Could not verify end-to-end without PG integration run |

### A. Low-voltage battery

| AI V2 key | UI state | Save (register) | Save (CV edit) | DB / ref | GET | CV UI | Confirm rule | Status |
|-----------|----------|-----------------|----------------|----------|-----|-------|--------------|--------|
| `lvBatteryType` | `batteryType` | `manualSpecs.battery` | — | `vehicle_battery_specs` | `batteryType` | Modal | Manual on register | `PERSISTED_AND_RELOADED` (register); **edit: `DISPLAYED_NOT_PERSISTED`** |
| `lvBatteryChemistry` | `lvBatteryChemistry` | — | — | — | — | Modal | — | `UNSUPPORTED` (schema only) |
| `lvBatteryAmpere` | `batteryAmpere` | `manualSpecs.battery` | — | `vehicle_battery_specs` | `batteryAmpere` | Modal | Manual | Same as type |
| `lvBatteryVolt` | `batteryVolt` | `manualSpecs.battery` | — | `vehicle_battery_specs` | `batteryVolt` | Modal | Manual | Same as type |

### B. High-voltage traction pack

| AI V2 key | UI state | Save (register) | Save (CV edit) | DB / ref | GET | CV UI | Confirm rule | Status |
|-----------|----------|-----------------|----------------|----------|-----|-------|--------------|--------|
| `hvBatteryPresent` | `hvBatteryPresent` | extraData (logic) | — | inferred from fuel/HV | partial | Modal | AI gate | `AI_PREVIEW_ONLY_BY_DESIGN` / fuels logic |
| `hvBatteryUsableCapacityKwh` | `hvBatteryUsableCapacityKwh` | extraData → HV ref draft | legacy column only via register | `vehicles.hv_battery_capacity_kwh` + battery ref | yes | Modal | Manual/register | `PERSISTED_AND_RELOADED` (register); edit HV via **`hv_master` + not usable column PATCH** |
| `hvBatteryGrossCapacityKwh` | `hvBatteryGrossCapacityKwh` | extraData | `upsertHvMasterSpecification` | `hv_master_specification` JSON | admin DTO | Modal | Admin upsert | `PERSISTED_AND_RELOADED` on edit (HV master path) |
| `hvBatteryChemistry`, `CellFormat`, `Architecture`, `ThermalManagement`, `ModuleCount`, `CellCount`, `Warranty*`, `NominalVoltage`, `acOnboardChargerKw`, `dcFastChargeMaxKw` | matching form fields | extraData (partial) | `upsertHvMasterSpecification` | `hv_master_specification` | admin DTO | Modal | Admin upsert | `PERSISTED_AND_RELOADED` (edit HV path); **`PERSISTED_NOT_DISPLAYED`** in CV panel |
| Legacy `hvBatteryCapacityKwh` | `hvBatteryCapacityKwh` | alias of usable | — | usable column | yes | Modal | — | Alias only |

### C. ICE / mass / engine / RPM / brake bias (vehicle table)

| AI V2 key | UI state | PATCH key (edit) | DB column | GET key | CV UI | Confirm rule | Status @ `07f008ee4` | Status @ prod `e3fadbcb` edit |
|-----------|----------|------------------|-----------|---------|-------|--------------|---------------------|-------------------------------|
| `engineDisplacementCc` | `engineDisplacementCc` | `engineDisplacementCc` | `engine_displacement_cc` | yes | yes | `confirmedFieldKeys` + AI assert | `PERSISTED_AND_RELOADED` | Same (#2210) |
| `cylinderCount` | `cylinderCount` | `cylinderCount` | `cylinder_count` | yes | yes | confirmed + AI | `PERSISTED_AND_RELOADED` | Same |
| `frontToRearWeightDistribution` | `frontToRearWeightDistribution` | `frontWeightDistributionPct` / form string | `front_weight_distribution_pct` | `58/42` display | yes | confirmed + AI | `PERSISTED_AND_RELOADED` | Same |
| `idleRpm` | `idleRpm` | `idleRpm` | `idle_rpm` | yes | yes (#2213) | confirmed + AI | **`PERSISTED_AND_RELOADED`** | **`DISPLAYED_NOT_PERSISTED`** (missing PATCH builder) |
| `maxRpm` | `maxRpm` | `maxRpm` | `max_rpm` | yes | yes (#2213) | confirmed + AI | **`PERSISTED_AND_RELOADED`** | **`DISPLAYED_NOT_PERSISTED`** |
| `brakeForceDistribution` | `brakeForceDistribution` | `brakeForceFrontPercent` | `brake_force_front_percent` | `% front` string | yes (#2213) | confirmed + AI; slash rejected | **`PERSISTED_AND_RELOADED`** | **`DISPLAYED_NOT_PERSISTED`** |
| `curbWeightKg` | `curbWeight` | `curbWeightKg` | `curb_weight_kg` | yes | yes (pref ref) | no AI confirm on scalar | `PERSISTED_AND_RELOADED` | Same |
| `tankCapacityLiters` | `tankCapacityLiters` | — | `tank_capacity_liters` | DTO | Modal only | register extraData | Register: `PERSISTED_AND_RELOADED`; **edit: `DISPLAYED_NOT_PERSISTED`** | Same |
| `manufacturerServiceIntervalKm/Months` | form fields | — | `service_interval_manufacturer_*` | yes | Modal only | register | Register OK; **edit not PATCHed** | `DISPLAYED_NOT_PERSISTED` on edit |
| `oilchangeIntervalKm/Months` | form fields | — | `oil_change_interval_*` | yes | Modal only | register | Same |

### D. Brake reference (dimensions — not bias)

| AI V2 key | UI state | Save (register) | Save (edit) | DB | GET | CV UI | Status |
|-----------|----------|-----------------|-------------|-----|-----|-------|--------|
| `frontRotorDiameterMm` etc. (6 keys) | `brakeFront*` / `brakeBack*` | `manualSpecs.brakes` | — | `vehicle_brake_reference_specs` | brake* strings | Modal | Register: `PERSISTED_AND_RELOADED`; **edit: `DISPLAYED_NOT_PERSISTED`** |

### E. Motion physics (reference table)

| AI V2 key | UI state | Save | DB | GET | CV UI | Status |
|-----------|----------|------|-----|-----|-------|--------|
| `systemMotorPowerKw` | `systemMotorPowerKw` | `motionPhysicsReference.create/confirm` (+ register draft) | `vehicle_motion_physics_references` | ref + legacy form | yes | `REFERENCE_CONFIRMATION_REQUIRED` — `PERSISTED_AND_RELOADED` when reference flow completes |
| `accel0To100S` | `accel0To100S` | same | same | same | yes | same |
| `variantAssumption` | `motionPhysicsVariantAssumption` | same | same | same | yes | same |

**Note:** `buildMasterVehiclePhysicsSpecPatch` **intentionally omits** motor power / accel (see comment in `master-vehicle-registration.ts`); changing only those fields does **not** call `vehicles.update` (covered by unit test).

### F. Drivetrain / electrification

| AI V2 key | UI state | Save (register) | Save (edit) | DB | GET | Status |
|-----------|----------|-----------------|-------------|-----|-----|--------|
| `drivetrain` | `drivetrain` | `extraData` → `drive_type` | — | `vehicles.drive_type` | `drivetrain` | Register OK; **edit not PATCHed** → `DISPLAYED_NOT_PERSISTED` on edit |
| `electrificationLevel` | `electrificationLevel` | extraData only (not in post-activation patch) | — | **no column** | not in GET map | **`UNSUPPORTED` / modal-only** — lost after reload |

### G. AI metadata (not vehicle scalars)

| Key | Status |
|-----|--------|
| `resolvedVariant`, `variantConfidence`, `ambiguousVariants` | `AI_PREVIEW_ONLY_BY_DESIGN` (gates numerics in normalize util) |
| `sourceNote` | `AI_PREVIEW_ONLY_BY_DESIGN` |
| `aiFieldProvenance` (map) | Stored in registration capture / sent on PATCH; stripped from Prisma generic body (#2210) |

### H. Tires (not in AI numeric schema list but in modal + manualSpecs)

Tire dimensions, DOT, tread, etc. → `manualSpecs.tires` on register → tire reference/setup pipeline. **Edit-save:** `DISPLAYED_NOT_PERSISTED` via hub PATCH (by design of `updateMasterRegisteredVehicle` tests).

---

## Phase 2 — Save path trace

### Path 1 — Manual / DIMO registration (`persistMasterRegisteredVehicle`)

`buildVehicleExtraData` + `buildVehicleManualSpecs` → `registerFromDimo` → `buildPostActivationVehiclePatch` + baseline drafts.

- **Persists:** vehicle scalars in mapper list (includes idle/max/brake since mapper), weight %, tank, intervals, drive type; brake/tire/battery references; motion draft; HV usable reference (separate resolution).
- **Does not use** `assertAiTechnicalFieldsConfirmed` (registration trust model differs from edit PATCH).
- **Evidence:** `vo-sig-p2-master-dimo-registration.postgres.integration.spec.ts` (`fullMasterExtraData` includes idle/max/brake) — requires `VO_SIG_P2_MASTER_DIMO_PG=1` (not run in this audit environment).

### Path 2 — Fetch AI → Review → Save (edit mode, Connected Vehicles)

1. AI stream → `VehicleRegistrationModal.applySpecs` (maybeSetIfEmpty + provenance chunk).
2. Save → `ConnectedVehiclesHub` → `updateMasterRegisteredVehicle`.
3. `buildMasterVehiclePhysicsSpecPatch` → `api.vehicles.update` with `technicalSpecificationSave` + `aiFieldProvenance`.
4. Backend `extractTechnicalSpecificationPatchInput` → `assertAiTechnicalFieldsConfirmed` → `buildVehicleTechnicalSpecificationPrismaPatch`.

**Gaps (pre-#2213 on prod):** steps 3–4 did not include idle/max/brake → DB stayed NULL (Arteon production evidence in prior investigation).

**Post-#2213:** idle/max/brake follow same confirmation lane as displacement/cylinders/weight.

### Path 3 — HV master fields on edit

`buildHvMasterSpecPatchFromRegisteredVehicle` → `upsertHvMasterSpecification` (separate from physics PATCH).

### Path 4 — Motion physics

Modal `motionPhysicsReference.create` / `confirm` — not part of hub PATCH. Unsaved motion values warned in modal (`motionPhysicsHasUnsavedManualEdits`).

### Alias / confusion checks

| Risk | Result |
|------|--------|
| Weight `58/42` vs brake `%` | Backend `parseBrakeForceFrontPercent` rejects `/`; weight uses `parseFrontWeightDistributionPct` — **no collision in #2213** |
| `brakeForceDistribution` form string vs `brakeForceFrontPercent` PATCH | Edit builder sends numeric `brakeForceFrontPercent`; GET returns display string — reload uses string equality in patch builder (cosmetic P3: `62` vs `62% front` may re-PATCH) |
| Generic Prisma update bypass | Technical keys stripped; idle/max/brake routed through spec patch util |
| Zero vs unknown | Technical PATCH treats empty as null with confirmation; does not send 0 for missing fields in builder |

---

## Phase 3 — Automated tests (isolated)

Executed at audit SHA (no production DB):

| Suite | Result |
|-------|--------|
| `backend` `vehicle-technical-spec*.spec.ts` | **26 passed** |
| `backend` `vehicles-hv-master-specification*.spec.ts` (non-PG) | **passed** (1 PG suite skipped) |
| `frontend` `master-vehicle-registration.test.ts` | **27 passed** |
| `frontend` connected-vehicles util tests | **9 passed** |
| `frontend` full `connected-vehicles/` folder | **135 passed, 1 failed** — `connected-vehicles-offboard.test.tsx` expects `master.cv.technicalSpecs.sectionTitle` in **tr** dictionary; TR uses partial keys + EN fallback (pre-existing governance test tension, **P3**) |
| `npm run i18n:check` | **passed** |
| VO-SIG PostgreSQL registration integration | **not run** (env flag / DB) |
| End-to-end PATCH→DB→GET integration for `vehicles.update` technical fields | **not present** in repo (unit-level only) — **P2 test gap** |

### PR #2213 targeted cases (unit level)

| Case | Result |
|------|--------|
| Idle RPM PATCH → prisma field | pass (`buildVehicleTechnicalSpecificationPrismaPatch`) |
| Max RPM | pass |
| Brake front % | pass |
| Unchanged fields omitted | pass |
| AI without confirmation rejected | pass |
| USER_CONFIRMED correction | pass (existing #2210 tests + displacement) |
| Invalid RPM / percent | pass |
| maxRpm ≤ idleRpm | pass |
| Weight vs brake | pass |
| Regression displacement/cylinders/weight | pass |
| Frontend patch builder idle/max/brake | pass |

---

## Phase 4 — PR #2213 verdict

| Check | Assessment |
|-------|------------|
| API wiring | `buildMasterVehiclePhysicsSpecPatch` + `vehicles.update` rawBody |
| DB columns | Existing `idle_rpm`, `max_rpm`, `brake_force_front_percent` |
| Validation + AI confirm | Extended `vehicle-technical-spec-patch.util` |
| GET | Already mapped in `mapToRegisteredVehicle` |
| Frontend reload | `mapAdminRegisteredVehicleFromDto` + CV panel (#2213) |
| Production without merge | **Still broken on edit** until #2213 deploys |

**PR2213_TEST_RESULT:** **PASS** (unit + patch-builder coverage; no full-stack PG test).

**CI @ audit time:** PR #2213 checks **pending** (not modified during audit).

---

## Phase 5 — Findings by priority

### P0

| ID | Finding |
|----|---------|
| P0-1 | **Production baseline `e3fadbcb`:** Connected Vehicle edit after AI review **does not persist** idle/max/brake (PATCH builder gap). Data loss from operator perspective. **Mitigation: merge #2213.** |
| P0-2 | None identified for **unauthorized overwrite** on confirmed fields beyond documented optimistic concurrency (#2210) — tests pass. |

### P1

| ID | Finding |
|----|---------|
| P1-1 | **Edit-save omits** tank, manufacturer/oil intervals, drivetrain, tire/brake/LV manual specs, electrification level — modal implies full spec edit. |
| P1-2 | **`electrificationLevel`** has no vehicle column; not in post-activation patch — **never durably stored**. |
| P1-3 | Registration vs edit **AI confirmation asymmetry** — register path does not call `assertAiTechnicalFieldsConfirmed`. |

### P2

| ID | Finding |
|----|---------|
| P2-1 | Many persisted fields **not shown** in CV technical specs (tank, intervals, drivetrain, tire/brake dims, HV detail). |
| P2-2 | No PostgreSQL integration test for **`vehicles.update` technical PATCH** round-trip (only unit tests). |
| P2-3 | Brake GET display string vs form string may cause **no-op re-save noise** (not data loss). |

### P3

| ID | Finding |
|----|---------|
| P3-1 | Offboard i18n test vs partial **tr** CV keys. |
| P3-2 | Modal placeholder suggests `60/40` for brake force (copy); parser rejects — UX confusion only. |

---

## Recommended minimal fixes (out of scope for this audit)

1. **Merge #2213** to close P0-1 on production.
2. **P1-1:** Extend edit PATCH (or document “registration-only fields”) for tank/intervals/drivetrain — product decision.
3. **P1-2:** Drop electrification from editable UI or persist to provenance/JSON with explicit contract.
4. **P2-2:** Add one PG integration spec: PATCH confirmed idle/max/brake → GET registered vehicle DTO.

---

## Counts (summary block)

| Metric | Count |
|--------|------:|
| TOTAL_AI_V2_FIELDS (schema keys) | 47 (+4 legacy aliases in empty shape) |
| TOTAL_UI_EDITABLE_FIELDS (modal technical) | ~45+ |
| TOTAL_PERSISTABLE_FIELDS (any lane) | ~38 |
| PERSISTED_AND_RELOADED (register + edit where applicable) | ~22 |
| DISPLAYED_NOT_PERSISTED (edit hub) | ~12 |
| PERSISTED_NOT_DISPLAYED (CV panel) | ~10 |
| AI_PREVIEW_ONLY_BY_DESIGN | 4 |
| REFERENCE_CONFIRMATION_REQUIRED | 3 (+ HV master) |
| UNSUPPORTED | 2 (`lvBatteryChemistry`, `electrificationLevel` durable store) |
| UNKNOWN (PG E2E not run) | 0 critical |

---

## References (code)

- AI schema: `backend/src/modules/ai/vehicle-specs/vehicle-spec-ai.schema.util.ts`
- Normalize / variant gate: `backend/src/modules/ai/vehicle-specs/vehicle-spec-ai.normalize.util.ts`
- Modal: `frontend/src/master/components/VehicleRegistrationModal.tsx`
- Save hub: `frontend/src/master/connected-vehicles/ConnectedVehiclesHub.tsx`
- PATCH builder: `frontend/src/master/connected-vehicles/master-vehicle-registration.ts`
- Backend PATCH: `backend/src/modules/vehicles/vehicle-technical-spec-patch.util.ts`
- GET map: `backend/src/modules/vehicles/vehicles.service.ts` (`mapToRegisteredVehicle`)
- CV display: `frontend/src/master/connected-vehicles/ConnectedVehicleTechnicalSpecsSection.tsx`
- Register mapper: `backend/src/modules/vehicle-onboarding/master-dimo/master-dimo-registration.mapper.ts`

---

**FINAL_VERDICT:** Architecture is **multi-lane by design**; completeness on **Connected Vehicle edit** was incomplete for idle/max/brake on production baseline. **PR #2213** closes that P0 subset. **P1 completion (branch `cursor/vehicle-ai-v2-p1-persistence-f8cd`)** extends confirmed technical PATCH + manual baseline APIs on edit; see **§ P1 resolution matrix** below.

---

## P1 resolution matrix (2026-10-28 implementation)

| Field | Prior gap | Storage path (edit) | Test evidence | Remaining limits |
|-------|-----------|---------------------|---------------|------------------|
| `tankCapacityLiters` | Edit omitted | `vehicles.tank_capacity_liters` via `vehicle-technical-spec-patch.util` + CV `buildMasterVehiclePhysicsSpecPatch` | `vehicle-technical-spec-patch.util.spec.ts`; `vehicle-technical-spec.util.test.ts`; PG spec `vehicle-technical-spec-patch.postgres.integration.spec.ts` (opt-in) | CV panel still may not display tank |
| `serviceIntervalManufacturerKm/Months` | Edit omitted | `vehicles.service_interval_manufacturer_*` | Same unit + PG tests | — |
| `oilChangeIntervalKm/Months` | Edit omitted | `vehicles.oil_change_interval_*` | Same unit + PG tests | — |
| `drivetrain` | Edit omitted | `vehicles.drive_type` via `mapMasterFormDrivetrainToDriveType` | Same unit + PG tests | Form values must be FWD/RWD/AWD/4WD |
| Tire reference dims | Edit omitted | `api.vehicles.upsertTires` on diff (`applyManualBaselinesOnEdit`) | `master-vehicle-registration.test.ts` | Tread/measurement paths unchanged |
| LV battery spec (type/A/V) | Edit omitted | `api.vehicleIntelligence.createBatterySpec` on diff | `master-vehicle-registration.test.ts` | No `lvBatteryChemistry` column — **not persistable** |
| Brake reference dims | Edit omitted | `api.vehicleIntelligence.createBrakeSpec` on diff (not health measurements) | `master-vehicle-registration.test.ts` | Workshop measurements still use `recordBrakeService` only when confirmed |
| `electrificationLevel` | No column | **Not in edit PATCH** — `VEHICLE_AI_V2_EDIT_NON_PERSISTENT_FIELDS` | Documented only | Still in register `extraData` for fuel/HV heuristics; lost on reload |
| `lvBatteryChemistry` | No column | **Not persistable** — same constant | Documented only | UI must not imply save |
| Registration AI parity | Register skipped `assertAiTechnicalFieldsConfirmed` | `technicalSpecificationSave.confirmedFieldKeys` in `buildVehicleExtraData` + `assertMasterRegistrationAiTechnicalFieldsConfirmed` in activation finalize | `master-vehicle-registration.test.ts` | — |

**Regression preserved:** PR #2210 displacement/cylinders/weight; PR #2213 idle/max/brake; HV master, motion physics, brake health measurement protection unchanged.

---

## Vehicle Specifications V3 — Final consistency addendum (2026-10-29)

| Baseline | SHA / status |
|----------|----------------|
| **MAIN_SHA** | `634bb4b029e186e853f4cad0810894b822086c45` |
| **PRODUCTION_SHA** | `ebe9015386d4f5e69505b2c44a56c0e3869afec8` (release `20261029123520_v4994`) |
| **PR #2238** | **MERGED** @ `34346cdcca8fb20dd13db77ba70bc5f1b8e5b8c1` (2026-10-29 12:31 UTC); CI **SUCCESS**; **not yet on production** (prod i18n still `unitAmpere: 'A'`) |
| **Original audit baseline** | `440db67229bbd1f1b9b98b43cb6d4d661979c697` — superseded for prod/main |

**Mode:** read-only production verification + documentation + contract registry tests. No migrations, no production writes, no consumer formula changes.

### Canonical units (`CANONICAL_UNITS_STATUS`)

Code registry: `backend/src/modules/vehicles/vehicle-specification-canonical.contract.ts` → `VEHICLE_SPEC_CANONICAL_UNITS`.

| Semantic | Canonical unit |
|----------|----------------|
| Motor / charger power | kW |
| HV usable / gross / legacy usable alias | kWh |
| LV charge capacity (`lvBatteryAmpere`) | **Ah** (not A) |
| LV voltage | V |
| Electric current (when distinct from charge capacity) | A |
| Torque | Nm |
| Displacement | cm³ |
| Mass | kg |
| Length / width / height / brake dims | mm |
| Percent (bias, weight %) | % |
| RPM | rpm |
| Tank | L |
| Tire size | standardized string via tire reference pipeline (not re-labeled here) |

**UNIT_MISMATCHES**

| ID | Surface | Issue | Priority | Fix status |
|----|---------|-------|----------|------------|
| U1 | Master CV i18n `master.cv.technicalSpecs.unitAmpere` | Production shows **A**; main shows **Ah** after #2238 | P2 | **Fixed on main**; await owner deploy (do not duplicate in new PR) |
| U2 | AI schema key name `lvBatteryAmpere` | Key name says “Ampere” but semantics are **charge capacity Ah** | P2 | Documented; no rename (breaking) |

All other audited contract surfaces use consistent unit semantics in schema descriptions and CV labels on **main**.

### Field precedence (`FIELD_PRECEDENCE_STATUS`)

| Field / concept | Authoritative source (precedence) | Must not merge with |
|-----------------|-----------------------------------|---------------------|
| **HV usable kWh** | (1) Active `vehicle_battery_reference_capacities` row `capacityType=USABLE` → (2) `vehicles.hv_battery_capacity_kwh` legacy column | Gross catalog, telemetry BMS |
| **HV gross kWh** | `vehicles.hv_master_specification.grossCapacityKwh` (+ provenance on master JSON) | Usable column, unverified reference |
| **hvBatteryUsableCapacityKwh** (AI/API) | Same as usable lane above on GET (`vehicles.service.ts` ~951–954) | `hvBatteryGrossCapacityKwh` |
| **vehicle_battery_reference_capacities** | SOH / reference workflows; **VERIFIED** tier required for SOH gate (`hv-soh-gate.policy.ts`) | Legacy usable column alone |
| **brakeForceFrontPercent** | `vehicles.brake_force_front_percent` when USER_CONFIRMED / AI confirmed | `frontWeightDistributionPct` |
| **brake force fallback** | `null` → EBD **72/28** in `brake-health.service.ts` | Weight distribution |
| **frontWeightDistributionPct** | `vehicles.front_weight_distribution_pct` | Brake bias |
| **driveType** | `vehicles.drive_type` (canonical enum via `normalizeCanonicalDrivetrain`) | AI `drivetrain` string without PATCH |
| **electrificationLevel** | **Non-persistent** input; read-only derive via `deriveElectrificationLevelReadOnly(fuelType, powertrainType)` | Stored column (none) |
| **lvBatteryChemistry** | **Non-persistent** (`NON_PERSISTENT_VEHICLE_SPEC_INPUT_FIELDS`) | `lvBatteryType` persisted enum |

**LEGACY_ALIAS_STATUS:** `VEHICLE_SPEC_LEGACY_AI_FIELD_ALIASES` in canonical contract; PATCH util maps `brakeForceDistribution` → `brakeForceFrontPercent`, weight string → `frontWeightDistributionPct`. Tests: `vehicle-technical-spec-patch.util.spec.ts`, `vehicle-specification-canonical.contract.spec.ts`.

### Variant naming (`VARIANT_NAME_POLICY` / `VARIANT_NAME_SOURCE_OF_TRUTH`)

**Source of truth (persisted identity, not AI preview alone):**

| Attribute | Primary store | Notes |
|-----------|---------------|-------|
| Manufacturer / model / year | Registration identity canonical + `vehicles` | `registration_identity_provenance` v1 |
| Engine / trim line | `typeVariantVersion`, `electrificationGrade`, `nominalMotorPowerKw` | USER_CONFIRMED gates in identity review |
| AI `resolvedVariant` | Provenance + P3 bridge suggestion only | Gated in `vehicle-spec-ai.normalize.util.ts` |
| HV pack label | `hv_master_specification.variantLabel` | Separate from commercial variant name |
| Motion assumption | `vehicle_motion_physics_references.variantAssumption` | Reference tier |

**Display policy (deterministic, display-only — no bulk rename):**

1. **Fleet short name:** existing `vehicleDisplayName` = make + model (rental/rules mapper) — **does not** embed full powertrain line.
2. **Full variant line (when shown):** concatenate **only verified** identity fields in order: `[typeVariantVersion]`, `[nominalMotorPowerKw kW or PS if confirmed]`, `[driveType token if known]`, `[transmission if stored elsewhere]` — omit unknown segments; **never** duplicate make/model inside `typeVariantVersion`.
3. **AI path:** apply `resolvedVariant` to numerics only when confidence + identity match; ambiguous/low confidence → numerics nulled, variant unresolved.
4. **USER_CONFIRMED** provenance on identity fields **must not** be overwritten by lower-confidence AI (#2210 / identity review).
5. **No formatter shared today** across Master Admin, CV hub, and rental — policy above is the contract target; future work may extract one pure function without new tables.

**VARIANT_INCONSISTENCIES (P1/P2, no silent fix):**

| ID | Finding | Class |
|----|---------|-------|
| V1 | Rental/customer `vehicleDisplayName` ≠ Master full variant line | P2 by design unless product unifies |
| V2 | Tesla `drive_type` may be null while label says RWD | P1 identity vs scalar |
| V3 | `hvMasterSpecificationVariantLabel` (pack) vs `typeVariantVersion` (commercial) | P2 — keep separate |

**AI_VARIANT_NORMALIZATION:** `vehicle-spec-ai.normalize.util.ts` — MHEV strip, drivetrain normalize, variant gate, identity mismatch rejection.

**VARIANT_CONFIDENCE_PROTECTION:** Tests in `vehicle-spec-ai.normalize.util.spec.ts`; identity P3 bridge stores `resolvedVariant` as SUGGESTED until USER_CONFIRMED.

### Downstream consumers (`DOWNSTREAM_CONSUMER_STATUS`)

| Consumer | Source field(s) | Unit | Fallback / risk |
|----------|-----------------|------|-----------------|
| **Brake health** | `brakeForceFrontPercent` | % front | null → 72% EBD; **not** weight % |
| **Tire wear / lifecycle** | `curbWeightKg`, `frontWeightDistributionPct`, `driveType` | kg, % front | Missing weight → degraded estimates |
| **VSI / trip RPM** | `idleRpm`, `maxRpm` | rpm | Missing → enrichment skips |
| **Legacy HV health nominal** | `hvBatteryCapacityKwh` column | kWh | Not gross master |
| **SOH gate** | Verified reference capacity only | kWh | Weak sources excluded |
| **DS4 / Motion** | Telemetry + motion references | — | **No** direct read of all V3 scalars in DS4 assessment grep; do not claim dependency |

### Protected values (verified read-only)

**TESLA_VALUES_PRESERVED** — vehicle `68868291-5478-42cd-b0c4-cc77b2a78e21`: usable **57 kWh**, master gross **60 kWh** ESTIMATED, **0** battery reference rows; no workflow change in this workstream.

**ARTEON_VALUES_PRESERVED** — vehicle `8c850ff1-4201-432b-af2e-2711dbc7ca48`: `brake_force_front_percent` **NULL** (USER_CONFIRMED null); brake refs **312 / 300 mm** unchanged.

### Before / after matrix (contract focus)

| Topic | Before (prod / audit gaps) | After (main + this addendum) |
|-------|----------------------------|------------------------------|
| LV unit label | A on prod | Ah on main (#2238); prod pending deploy |
| Canonical unit registry | Implicit in code/i18n | `VEHICLE_SPEC_CANONICAL_UNITS` exported |
| Legacy aliases | PATCH util only | + `VEHICLE_SPEC_LEGACY_AI_FIELD_ALIASES` + tests |
| Field precedence | Described in prose in prior sections | Explicit table above |
| Variant display | Ad hoc per surface | Documented policy; no persistence change |

### Implementation in this workstream

| Item | Action |
|------|--------|
| Duplicate Ah i18n fix | **Skipped** (#2238 merged) |
| New variant catalog / migration | **Skipped** |
| Consumer formula changes | **Skipped** |
| Doc + contract tests | **PR** `cursor/vspec-v3-final-consistency-f8cd` |

**FINAL_VERDICT (V3 pass):** Canonical contract is **consistent on main** except **production deploy lag** for Ah (P2). No P0 unit errors in protected Tesla/Arteon paths. **One minimal PR** documents precedence + units registry tests; **merge/deploy of #2238 to prod** remains owner-operated out of scope here.
