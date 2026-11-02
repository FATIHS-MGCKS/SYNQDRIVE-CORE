# ADR — RPM Reference Intelligence and Driving Intelligence Ownership Boundaries

| Field | Value |
|-------|-------|
| **Decision ID** | `DI-DEC-RPM-REF-INTEL-001` |
| **ADR status** | `PROPOSED` (owner-approved architecture text; **documentation-only**; **not** runtime activation) |
| **Date** | 2026-10-30 |
| **Scope** | Ownership, data-flow, quality semantics, and future interface boundaries between VSI, RPM HF V1A/V1B, Vehicle Specifications reference metadata, RPM Reference Intelligence, and Driving Intelligence DS4 |
| **Non-scope** | Production flag changes; schema migrations; admission gate changes; DS4 Motion / Driving Impact / Tire / Trip FSM / customer-facing behavior; RPM-derived load, wear, driving-impact, or driver-scoring models |

---

## Implementation state legend

| Label | Meaning |
|-------|---------|
| **CURRENT (IMPLEMENTED)** | Shipped in repository / production as described; cite code paths or runtime facts |
| **APPROVED FUTURE** | Owner-approved target architecture; **must not** be treated as live product behavior until a separate implementation PR and activation record exist |
| **NOT YET IMPLEMENTED** | No production module, API, scheduler, or consumer binding |

---

## Context and problem

SynqDrive now operates multiple overlapping RPM-related surfaces:

- **VSI** materializes link-scoped signal capability profiles and, for engine RPM, multicadence tier resolution (`rpmCadenceTierResolution`) used as evidence for tier-aware analytics.
- **RPM HF V1A/V1B** (within the Driving Intelligence workstream) performs trip-scoped HF observation, temporal processing, admission routing, and (V1B shadow) persisted quality contracts including `admission.qualityExposure`.
- **Vehicle Specifications** persist optional ICE reference fields `vehicles.idle_rpm` / `vehicles.max_rpm` (`idleRpm` / `maxRpm`) with provenance in `registrationIdentityProvenance` (USER_CONFIRMED, AI_ESTIMATED, KNOWLEDGE_ONLY).
- **Driving Intelligence DS4** remains the engineered authority for post-trip motion, acceleration, braking, and driving-event assessment (shadow today; target authority per `DI-DEC-DS4-AUTHORITY-001`).

Without an explicit boundary document, engineers could:

- substitute missing HF telemetry with vehicle-spec redlines or idle targets;
- silently weaken V1B admission by injecting reference metadata into gate functions;
- conflate RPM temporal quality with DS4 kinematic quality;
- ship RPM-derived engine-load, wear, or driving-impact scores without a validated model.

This ADR records **owner-approved boundaries** and a **small future component** — **RPM Reference Intelligence** — as part of the **RPM workstream**, not a new top-level intelligence subsystem.

---

## Decision (summary)

1. **VSI** owns authoritative engine RPM **signal profiles**, **cadence classification**, and **tier evidence** consumed by downstream RPM analytics.
2. **RPM HF V1A/V1B** owns HF RPM **observation**, **temporal processing**, **admission**, and **quality exposure** on admitted spans.
3. **RPM Reference Intelligence** is a **small, reusable analytical component** within the RPM workstream that **combines admitted RPM observations** with **vehicle-specific reference metadata** under explicit provenance and applicability rules.
4. **Vehicle specifications** provide reference metadata only; they **must never substitute** missing HF telemetry.
5. **Reference metadata must not silently modify** existing RPM V1B admission gates.
6. **Driving Intelligence DS4** remains authoritative for motion, acceleration, braking, and driving events.
7. **DS4 may later consume** RPM Reference Intelligence through a **versioned, optional interface** with **temporal alignment** and **quality gates** — not in this ADR’s implementation scope.
8. **No RPM-derived engine-load, wear, driving-impact, or driver-scoring** without separate validation and explicit owner approval.

---

## Component ownership

| Component | Owns | Must not own |
|-----------|------|--------------|
| **VSI** | `engine_rpm` profile axes; declared vs observed reconciliation; **RPM multicadence tier labels**, trip classifications, rolling tier snapshots; tier evidence timestamps and trip binding metadata | Trip boundaries; HF temporal RPM math; vehicle idle/max reference values; DS4 motion events; customer driving scores |
| **RPM HF V1A** | Trip-scoped HF read contract; VSI-gated trip input assembly; descriptive data-quality labels for HF RPM series | Tier classification rules; reference normalization; persistence of authoritative customer metrics |
| **RPM HF V1B** | Post-trip shadow temporal engine; outbox/worker (when enabled); admission routing; `admission.qualityExposure`; tier-aware processor path bound to VSI tier evidence | Vehicle spec reads for admission; synthetic tier assignment; DS4 motion assessment |
| **Vehicle Specifications (VO / Master)** | Persisted `idleRpm` / `maxRpm`; field provenance; validation (`maxRpm > idleRpm`); USER_CONFIRMED protection | HF telemetry; cadence tiers; RPM shadow runs |
| **RPM Reference Intelligence** (**APPROVED FUTURE**) | Versioned **optional** derived metrics from **admitted** HF RPM + reference metadata + uncertainty propagation | Admission gates; VSI tier rules; DS4 event detection; Tire/Brake load; Driving Impact publication |
| **Driving Intelligence DS4** | Motion FSM, manoeuvre events, assessment L2, target driving-behaviour authority | RPM cadence tier classification; vehicle redline storage; RPM HF temporal quality contract |

---

## CURRENT (IMPLEMENTED) — runtime and code facts

| Area | State |
|------|--------|
| VSI RPM cadence tier | **IMPLEMENTED** — tier resolution in VSI snapshot (`vsi-rpm-cadence-tier.*`); consumed by V1B tier evidence utilities |
| RPM HF V1A trip input | **IMPLEMENTED** — `ds4-rpm-hf-v1a/`; ClickHouse trip-scoped `engine_rpm` reads; no `idleRpm`/`maxRpm` usage |
| RPM HF V1B shadow | **IMPLEMENTED** — `ds4-rpm-hf-v1b/`; flags `DS4_RPM_HF_V1B_*`; outbox/runs tables; tier-aware path; Phase 4I `qualityExposure` on processor output |
| Vehicle idle/max persistence | **IMPLEMENTED** — Prisma `vehicles.idle_rpm`, `vehicles.max_rpm`; canonical units `rpm`; provenance via registration identity document |
| RPM Reference Intelligence module | **IMPLEMENTED (library Phase 5A; V1B shadow attach Phase 5B)** — `rpm-reference-intelligence-v1/`; optional V1B `summary_json` attachment behind `DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENABLED` (default OFF) |
| DS4 consumption of RPM reference metrics | **NOT YET IMPLEMENTED** — no versioned interface in production |
| RPM → engine-load / wear / Driving Impact | **FORBIDDEN** until separate validated model + owner approval (see Non-goals) |

Production canary note (operational, outside this ADR): Phase 4L Audi + Arteon V1B shadow activation is an **observation** configuration; it does **not** implement RPM Reference Intelligence.

---

## Data-flow boundaries

### Observed HF path (authoritative for measurement)

```
COMPLETED VehicleTrip (Trip Detection / DIMO Segments)
  → RPM HF V1A trip input (ClickHouse engine_rpm HF, trip window)
  → RPM HF V1B temporal + admission (+ tier evidence from VSI snapshot)
  → shadow run persistence (V1B contract only)
```

**Rule:** HF observation is the only source of **measured** RPM time series. Reference metadata **must not** fill gaps in HF series.

### Tier evidence path (authoritative for cadence semantics)

```
VSI profile materialization + rpm cadence tier resolution
  → signalsSnapshot.rpmCadenceTierResolution (trip classifications, rolling tier)
  → V1B tier evidence bind (trip end tolerance, readiness, coverage band)
  → admission.qualityExposure + tier-aware terminal states
```

**Rule:** VSI is the **sole** authority for tier labels (e.g. `RPM_2S`, `SPARSE`). RPM HF must not assign synthetic tiers to vehicles or trips.

### Reference metadata path (future enrichment only)

```
Vehicle Specifications idleRpm / maxRpm + provenance + variant applicability
  → (APPROVED FUTURE) RPM Reference Intelligence inputs
  → versioned optional metrics attached to admitted spans / trips
```

**Rule:** Reference inputs are **downstream of admission** (or parallel read-only metadata blocks), never inputs to `resolveTierAwareAnalysisMode` or V1B enablement allowlists.

### DS4 path (orthogonal motion authority)

```
Motion-core shadow / assessment pipeline (DS4)
  → manoeuvre events, intensity, L2 assessment
  → (APPROVED FUTURE) optional read of RPM Reference Intelligence contract
```

**Rule:** DS4 must not infer engine load from RPM alone without the gated interface and owner-approved model.

---

## Reference metadata provenance

| Provenance class | Typical source | Use in RPM Reference Intelligence (future) |
|------------------|----------------|--------------------------------------------|
| **USER_CONFIRMED** | Master registration / technical spec save | Eligible for **reference band** metrics when ICE applicability passes |
| **AI_ESTIMATED** / **KNOWLEDGE_ONLY** | AI V2 / catalog suggestions | **Downgraded** — metrics must carry uncertainty; must not imply OEM bulletin accuracy |
| **Missing** | Null idle or max on vehicle row | **Fail closed** for normalized position metrics; HF-only metrics may still publish with spec-unavailable reason codes |

Additional rules:

- **Telemetry max observed RPM** ≠ **spec maxRpm** (redline reference). Both may appear in future outputs with separate epistemic labels.
- **ICE applicability** must consider electrification / fuel context — not RPM fields alone (BEV rows may have empty reference RPM).
- **Variant accuracy** limits reference trust; wrong trim → wider uncertainty, not silent correction.

Canonical persistence audit: [`docs/audits/vehicle-ai-v2-complete-persistence-audit-2026-10-28.md`](../../../docs/audits/vehicle-ai-v2-complete-persistence-audit-2026-10-28.md).

---

## RPM quality and uncertainty semantics

Two **orthogonal** quality axes (must not be collapsed):

| Axis | Owner | Examples |
|------|-------|----------|
| **HF temporal / admission quality** | RPM HF V1B | `admission.qualityExposure` (`OBSERVED_HF_TEMPORAL` scope); tier readiness; coverage band; cadence confidence; `impliesFullTripCoverage: false` |
| **Reference metadata quality** | Vehicle Specifications + future RPM Reference Intelligence | Provenance tier; pair consistency; variant match; ICE applicability |

Future RPM Reference Intelligence metrics must propagate:

- **Coverage** — time mass outside admitted spans reported as uncovered, not zeroed.
- **Uncertainty** — VSI defer reasons (`MISSING_ROW`, `STALE_TRIP_BINDING`, `MINIMAL_SPAN`, low confidence) **plus** spec provenance axis.
- **Reason codes** — structured, stable contract IDs (no silent scalar “RPM score”).

Time-weighting (**APPROVED FUTURE**): weight samples by VSI active span and cadence tier confidence for admitted intervals only; cadence profile (1s/2s/3s) from V1B temporal engine remains the HF sampling authority.

---

## Future versioned interface (APPROVED FUTURE — NOT YET IMPLEMENTED)

A future **`rpm-reference-intelligence-v1`** (name indicative, not implemented) should expose:

| Property | Requirement |
|----------|-------------|
| **Contract version** | Explicit semver or `contractVersion` string in payload |
| **Inputs** | Admitted V1B run reference (trip, vehicle, org, engine version, input fingerprint); VSI tier snapshot id/revision; vehicle spec reference snapshot (idle/max + provenance hash) |
| **Outputs** | Optional metrics only: normalized RPM position, idle proximity, operating bands, time-weighted exposure — each with coverage, uncertainty, reason codes |
| **Optionality** | DS4 and other consumers **opt in** per version; absence of block ⇒ no reference metrics assumed |
| **Persistence** | Separate from V1B shadow summary unless owner approves combined storage |

**Forbidden without new ADR:** using reference metrics as DS4 assessment inputs, Tire wear basis, Driving Impact V2 weights, or customer UI scores.

---

## Temporal alignment requirements (APPROVED FUTURE)

Any DS4 or cross-domain consumer must:

1. Align reference metrics to **the same trip window** as the admitting V1B run (or explicit sub-span declared in the contract).
2. Respect **trip end binding tolerance** consistent with V1B tier evidence (`DS4_RPM_HF_TIER_TRIP_END_BINDING_TOLERANCE_MS`).
3. Treat **pre-admission** or **deferred** V1B states as **no reference metric authority** (fail closed).
4. Never back-align reference metrics to historical trips via spec retroactive edits without a version bump and explicit replay policy (replay policies remain owner-gated; Phase 4L canary forbids historical replay).

---

## Explicit non-goals

- Implement RPM Reference Intelligence code, APIs, schedulers, or migrations in this decision’s follow-up **without** a dedicated implementation PR.
- Modify RPM V1B admission gates, VSI tier thresholds, or MINIMAL_SPAN rules using vehicle specs.
- Replace missing HF RPM with idle/max from vehicle row.
- Assign synthetic RPM cadence tiers (e.g. forcing Arteon into `RPM_2S`).
- Publish RPM-derived **engine load**, **wear**, **driving impact**, or **driver scoring**.
- Change DS4 Motion, Driving Impact, Tire, Trip FSM, or customer-facing calculations as part of this documentation task.

---

## Consequences and future implementation phases

| Phase | Content | Status |
|-------|---------|--------|
| **P0 — Boundaries (this ADR)** | Ownership, flows, provenance, non-goals | **CURRENT (DOCUMENTATION)** |
| **P1 — Reference reader** | Read-only vehicle spec + provenance snapshot for RPM workstream tests | **IMPLEMENTED (Phase 5B mapper)** — `buildDs4RpmReferenceIntelligenceV1ReferenceFromVehicleRow`; wired from V1B shadow service vehicle select when attach flag ON |
| **P2 — Reference metrics library** | Pure functions: normalization, bands, time-weighting on admitted spans | **IMPLEMENTED (Phase 5A library)** — `rpm-reference-intelligence-v1/`; no consumer wiring |
| **P3 — Shadow persistence** | Optional attachment to V1B runs or sibling table; flags default OFF | **IMPLEMENTED (Phase 5B attach, flag `DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENABLED` default OFF)** — optional `rpmReferenceIntelligenceV1` on V1B `summary_json`; no sibling table; no spec-revision replay |
| **P4 — DS4 optional consumer** | Versioned read interface + alignment tests; Fable review | **NOT YET IMPLEMENTED** |
| **P5 — Product surfaces** | Customer UI / fleet analytics | **FORBIDDEN** until owner scope |

---

## Related decisions and documents

- [`decisions/DECISION_REGISTER.md`](../decisions/DECISION_REGISTER.md) → `DI-DEC-RPM-REF-INTEL-001`
- [`design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md`](DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md) — DS4 motion authority
- [`../../vehicle-signal-intelligence/VSI_CROSS_WORKSTREAM_CONTRACTS.md`](../../vehicle-signal-intelligence/VSI_CROSS_WORKSTREAM_CONTRACTS.md) — VSI ↔ DI RPM boundaries
- Backend modules: `rpm-hf-v1a/`, `rpm-hf-v1b/`, `vehicle-signal-intelligence/vsi-rpm-cadence-tier.*`
- Vehicle spec contract: `backend/src/modules/vehicles/vehicle-specification-canonical.contract.ts`

---

## Alternatives considered (rejected)

| Alternative | Rejection |
|-------------|-----------|
| RPM Reference Intelligence as a new top-level “Intelligence” module parallel to DI and VSI | Violates owner directive; duplicates governance surface |
| Vehicle specs inside V1B admission gates | Would silently change canary semantics and conflate spec trust with HF observation |
| DS4 derives engine load directly from RPM HF | No validated model; conflicts with DS4 authority separation |
| English-only reference metrics | Violates SynqDrive nine-locale product rule for any future user-visible copy |

---

## Validation record

| Check | Result |
|-------|--------|
| Architecture-only change | No runtime, migration, or production flag edits in this ADR PR |
| Duplicate registry | Uses existing DI decision register + graph; no second ADR tree |
