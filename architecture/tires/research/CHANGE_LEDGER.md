# Tires Health — Change Ledger (append-only)

Newest entry last. Never rewrite or delete entries.

### Authority bootstrap + Tire Intelligence P1 architecture audit (2026-10-24)

| Event | Detail |
|-------|--------|
| BEFORE | Tires Health inventoried as `NOT_STARTED`; production-active module without authority; no DS4 → tire relation documented |
| WHY | Owner decision to keep the existing stack, freeze V2, and prepare a DS4-based shadow driving-load input; governance required before any implementation |
| CHANGE | Created `architecture/tires/` per MODULE_AUTHORITY_STANDARD (README, AUDIT_MANIFEST, CURRENT_STATE, AGENT_CONTRACT, KNOWLEDGE_GRAPH, graph/*, decisions, evidence, contradictions, research, scripts) and `integration/DS4_MOTION_INTEGRATION_AUDIT.md`; registry row Tires Health `NOT_STARTED` → `AUDIT_IN_PROGRESS` + detail section; append-only entry in Driving Intelligence `research/CHANGE_LEDGER.md` recording the proposed tire consumer |
| EXPECTED_EFFECT | Agents find exact V2 inputs, DS4 availability/limits, owner decisions and a conservative admission policy before touching code |
| VALIDATION | `bash architecture/tires/scripts/validate-graph.sh` PASS · `bash architecture/scripts/validate-module-registry.sh` PASS · read-only Production baseline 2026-10-24T17:21–17:23Z |
| OBSERVED_EFFECT | UNKNOWN (documentation only) |
| NON_EFFECTS | No runtime code, DB, migration, deploy, flag, DS4 or i18n change; V2 output unchanged; SynqDrive Code → Changes/Architektur views not updated (TIRE-GAP-CODE-VIEWS-NOT-UPDATED-001) |
| TRADEOFFS | Authority is a bootstrap (PARTIAL maturity); several statements INFERRED pending the first implementation PR |
| REMAINING_GAPS | See `contradictions/KNOWLEDGE_GAPS.md` |

### PR #2157 documentation refinement — async consumer + DS4 run identity (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `integration/DS4_MOTION_INTEGRATION_AUDIT.md` §4/§4.1: async retryable BullMQ consumer (no sync with trip finalization); tire shadow row identity binds `diV0MotionCoreShadowRunId`, `combinedInputIdentity`, `pinnedSnapshotHash`, `contentFingerprint`, `shadowBundleVersion`, `adapterVersion`; replay/newer-failed-run selection rules aligned with `readForTrip`. New `TIRE-DEC-DS4-ASYNC-RETRY-CONSUMER-001` + graph pipeline node. `AUDIT_MANIFEST` `AUDIT_BRANCH_SHA` → PR HEAD |
| WHY | Review feedback: DS4 lag must not drop work; shadow rows must reference concrete DS4 runs, not ambiguous latest-per-trip |
| VALIDATION | `bash architecture/tires/scripts/validate-graph.sh` · `bash architecture/scripts/validate-module-registry.sh` |
| NON_EFFECTS | No runtime, DS4, or i18n change |

### Tire Wear V3 P3B — premature NOT_AVAILABLE defer (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Adapter `tire-ds4-shadow-input-v1.1.1`: temporal coverage interprets DS4 FSM DIRECT/INFERRED/INDETERMINATE (not event OK/DEGRADED); v1.1.0 rows immutable |
| CHANGE | Tire processor bounded defer on NOT_AVAILABLE (terminal only TRIP_NOT_FOUND / retry exhausted); shared TripMapRead contract preserved |
| NON_EFFECTS | No catch-up flag change; no production backfill; Master/DS4 read consumers unchanged |

### Tire Wear V3 P3B — stop boundary safety (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Confirmed stationary seconds use FSM certain core (`startLatest`…`endEarliest`); no fill across uncertain earliest/latest envelopes; regression for wide stops |
| NON_EFFECTS | M3 unchanged; adapter v1.1.0 / schema v3; DS4 core, production flags |

### Tire Wear V3 P3B — temporal coverage correctness (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Stricter `VERIFIED` gate: OK movement + directly confirmed stops only; DEGRADED/LIMITED/invalid speed tracked; gap seconds exclude confirmed stationary; regression spec |
| NON_EFFECTS | M3 formula unchanged; adapter v1.1.0 / schema v3; DS4 core, production flags |

### Tire Wear V3 P3B — DS4 M3 dynamics & temporal coverage (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Adapter `tire-ds4-shadow-input-v1.1.0`, payload schema v3: M3 J/kg/km proxy + temporal coverage detail |
| NON_EFFECTS | DS4 core, Trip FSM, V2 wear, V3 prior β=0, production flags |

### Tire Wear V3 P3A — correctness fix (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Mount-period ledger/measurement scoping; empirical L2–L4; dynamic 3σ span; non-collapsing rate intervals; stable fingerprint; shadow write env-only; unique shadow fingerprint index |
| NON_EFFECTS | V2, DS4 canary, production flags unchanged |

### Tire Wear V3 P3A — distance prior shadow module (2026-10-25)

| Event | Detail |
|-------|--------|
| BEFORE | V2-only wear projection; Fable/Cursor research defined conservative prior + β=0 P3A scope |
| WHY | Implement kalibrierbares Distanz-Prior-Modell ohne V2/DS4/Produktionspfad zu berühren |
| CHANGE | `wear-v3-prior/*` service + math; `tire_wear_v3_prior_shadow_v1` migration; `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` default false; doc `integration/TIRE_WEAR_V3_PRIOR_P3A.md` |
| EXPECTED_EFFECT | Shadow-only P3A projections per setup/wheel with fingerprint + evidence levels; V2 unchanged |
| VALIDATION | Jest `tire-wear-v3-prior*` · productive isolation spec · `bash architecture/scripts/validate-module-registry.sh` |
| NON_EFFECTS | No deploy, no canary env change, β_dyn=0, no UI/alerts/rental, no TireHealthSnapshot writes |

### Tire Intelligence P2 — DS4 shadow adapter implementation (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `tire_ds4_motion_shadow_input_v1` + `backend/.../tires/ds4-shadow/*` (admission, mapper, repository, producer, processor), BullMQ `dimo.tire.ds4-shadow`, catch-up scheduler, ledger enqueue hook; data contract `integration/TIRE_DS4_SHADOW_DATA_CONTRACT.md` |
| WHY | Owner P2 scope after P1 authority: first read-only DS4 → tire shadow input path with retry/catch-up and run-bound identity |
| VALIDATION | Jest: `tire-ds4-shadow-*.spec.ts`, productive isolation spec; `architecture/tires/scripts/validate-graph.sh` |
| NON_EFFECTS | V2, rental gate, DS4 worker, trip FSM unchanged; feature OFF unless `TIRE_DS4_SHADOW_ENABLED`; migration not applied to Production by agent |
| REMAINING_GAPS | Production enablement + second baseline after deploy; successor wear model still out of scope |

### Tire Intelligence P2 hardening — catch-up, evidence, semantics (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | Adapter `v1.0.1` / payload schema 2: immutable insert (fingerprint conflict → `evidence_immutable_conflict`); terminal sentinel run ids for `NOT_AVAILABLE` and retry exhaustion; catch-up SQL targets latest **succeeded** DS4 run not yet materialized; split `event_quality_coverage` vs `temporal_coverage`; OK-only `okDeltaKmhAbsSum` (no ordinal intensity buckets); ledger FK `ON DELETE RESTRICT`; enqueue double `.catch` on trip finalization |
| WHY | PR #2160 review: avoid endless catch-up, preserve audit evidence, keep trip finalization independent of DS4, conservative coverage claims |
| VALIDATION | Jest: ds4-shadow processor/repository/catchup + tire-trip-usage enqueue specs; `validate-graph.sh` · `validate-module-registry.sh` |
| NON_EFFECTS | No merge to main, no Production migration/deploy/flag enable |

### Tire Wear V3 Prior 0.2.0 — mm estimation shadow (2026-10-27)

| Event | Detail |
|-------|--------|
| CHANGE | `tire-wear-v3-prior-0.2.0`: explicit `estimatedWearMm` / `displayTreadMm` / `treadEvidenceClass`; posterior rate fusion (`fuseRateWithPriorPosterior`) with legacy union preserved for `0.1.0` replays; read-only DS4 severity coverage interface (`dynamicBeta=0`); repository `findLatestDs4ShadowEvidenceByLedgerIds` |
| WHY | Fable scientific model research: conservative anchored mm/km projection, measurement calibration narrowing, evidence classes, no M3→mm conversion |
| VALIDATION | Jest `wear-v3-prior` suites (41 tests); productive V2 isolation spec unchanged |
| NON_EFFECTS | V2 customer path; `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` default OFF; no DS4/S4/FSM change; no migration |

### Tire Wear V3 — verification policy P1 (2026-10-27)

| Event | Detail |
|-------|--------|
| CHANGE | Isolated `tire-wear-v3-verification` policy (4500/5000/6000 km + 6 mo UTC); `resolveV3VerificationStatus` on V3 prior setup result; ground-truth acceptance separate from posterior calibration |
| WHY | Recurring manual tread verification design audit; shadow-only cadence without V2 measurementFreshness changes |
| VALIDATION | Jest `tire-wear-v3-verification.spec.ts` + existing wear-v3-prior suites |
| NON_EFFECTS | No V2 TireHealthSummary; no shadow writer; no migration; no scheduler |

### Tire Wear V3 — verification per-wheel cadence fix (2026-10-27)

| Event | Detail |
|-------|--------|
| CHANGE | Per-wheel latest accepted anchors (`latestAcceptedVerificationAnchorPerWheel`); setup `status` aggregated by precedence; rotation fail-closed (`INSUFFICIENT_EVIDENCE` per wheel); V3-only exclusion of legacy `ai_confirmed` |
| WHY | PR #2185 safety review: setup-wide latest anchor let partial rows reset cadence for unmeasured wheels |
| VALIDATION | Jest `tire-wear-v3-verification.spec.ts` (20 tests) + `tire-wear-v3-prior.service.spec` |
| NON_EFFECTS | V2 provenance maps; posterior calibration gates; no migration; no deploy |

### Commit B — AiTireSpec V2 contract, normalizer parity, provenance safety (2026-10-27)

| Event | Detail |
|-------|--------|
| BEFORE | Tire LLM schema/normalizer key drift; AI URLs could inflate tread evidence; DIMO registration could persist raw AI tire JSON |
| WHY | Owner Commit B: canonical AiTireSpec V2, null-not-clamp, no URL→MANUFACTURER_CONFIRMED, normalize-before-persist, preserve USER_CONFIRMED |
| CHANGE | `ai-tire-spec-canonical.contract.ts`; tire-spec-ai schema V2; normalizer V2; `tire-evidence-provenance` URL demotion; `ai-tire-spec-registration-persist.util` for DIMO path; contract + regression Jest suites |
| EXPECTED_EFFECT | AI tire specs and tread evidence stay conservative; DIMO writes normalized `tire_v2` payloads only |
| VALIDATION | Jest ai-tire-spec*, tire-evidence-provenance, tire-health-regression-matrix; vehicle-spec-ai Commit B offline preflight |
| NON_EFFECTS | Tire Wear V3 math; DS4; migrations; Intelligence modules unchanged; C6 brake hardening preserved on main |

### Tire V3 production cutover P1 — measurement ingestion & operator evidence (2026-10-27)

| Event | Detail |
|-------|--------|
| BEFORE | Measurements often persisted with `odometer_at_measurement` NULL; operator flow did not distinguish explicit vs telemetry odometer for V3 |
| WHY | Production cutover prep: ground-truth ingestion, explicit odometer evidence, V3 recompute hook after lifecycle save without V2/customer/shadow-writer changes |
| CHANGE | `tire-measurement-v3-ingestion.ts`; `TireLifecycleService.recordMeasurement` mount-period validation, explicit vs inferred odometer persistence, post-save `computeForSetup({ persistShadow: false })` + `v3Ingestion` assessment; OperatorTireMeasureFlow odometer confirm + V3 warnings; DTO `manualConfirmOdometer` |
| EXPECTED_EFFECT | New measurements can feed V3 verification policy when odometer explicitly confirmed; insufficient evidence returns operator-visible warnings; V2 kFactor/recalculate unchanged |
| VALIDATION | Jest `tire-measurement-v3-ingestion.spec.ts`, `tire-lifecycle-record-measurement-v3.spec.ts`, `operatorTireMeasure.utils.test.ts` |
| NON_EFFECTS | No migration; shadow writer OFF; no scheduler; no production backfill; superseded by measurement integrity P1 for quick-measure auto-confirm removal |
| EVIDENCE | Read-only fleet odometer audit (Tiguan/Tesla/Audi/Arteon): NULL measurement odometers + `mileage_km` vs install anchor retrograde flags documented in agent artifacts |

### Tire V3 measurement integrity P1 — explicit odometer provenance (2026-10-28)

| Event | Detail |
|-------|--------|
| BEFORE | `addTireHealthMeasurement` auto-set `manualConfirmOdometer` when `odometerKm` present; registration/bootstrap could infer telemetry odometer; workshop source treated as explicit without finite km |
| WHY | Evidence readiness P1: forward-only ground-truth intake for V3 verification/calibration without inventing historical odometers or changing wear math |
| CHANGE | Controller requires explicit `manualConfirmOdometer`; registration `manual_registration` persisted + verification-excluded + no inferred odometer; plausibility guard on confirmed odometer; `assessV3Ingestion` evidenceClass + workshop/registration warnings; operator post-save V3 toast; i18n en/de keys |
| EXPECTED_EFFECT | New manual/workshop measurements store explicit odometer only when confirmed/report-backed; unverified tread still savable; one-point vs two-point V3 rules visible in operator UI |
| VALIDATION | Jest ingestion + lifecycle P1 specs; `operatorTireMeasure.utils.test.ts`; `npm run i18n:check` |
| NON_EFFECTS | No production deploy; β=0; DS4 unchanged; historical rows untouched; no backfill |

### Tire V3 cutover P1 — post-commit compute + persistShadow safety (2026-10-27)

| Event | Detail |
|-------|--------|
| CHANGE | `recordMeasurement`: isolate optional V3 `computeForSetup` failures after durable save; return `v3Recompute` diagnostic + structured log `tire_measurement_v3_recompute_failed`. `computeForSetup`: `persistShadow === false` suppresses shadow inserts even when `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` is on |
| WHY | Safety review #2186: save must not 500 solely on post-commit V3 recompute; measurement ingestion path must not write shadow rows when explicitly dry-run |
| EXPECTED_EFFECT | Operators/API get 200 with saved measurement + `v3Recompute.failed` when V3 assess fails; shadow table untouched on `persistShadow: false` |
| VALIDATION | Jest `tire-lifecycle-record-measurement-v3.spec.ts`, `tire-wear-v3-prior.service.spec.ts` |
| NON_EFFECTS | V2 recalculate error semantics unchanged; customer-facing V3 read still future — fresh V3 state after cutover via on-demand `computeForSetup` / scheduled recompute hooks already used elsewhere, not new queue |

### Tire V3 production cutover P2 — customer read adapter & integration (draft, 2026-10-27)

| Event | Detail |
|-------|--------|
| BEFORE | V2 wear model only on tire summary/detail, fleet wear-analysis, rental health, alerts; V3 prior computed on measurement path but not exposed as versioned customer read |
| WHY | Owner P2: single future authoritative V3 read model with safe cutover flags (default OFF), V2 rollback retained, no dual customer-facing wear, no shadow dual-write on reads |
| CHANGE | `tire-health-v3-read.*` adapter/service; `tire-wear-v3-cutover.config.ts`; enrich `TireHealthService` summary/detail + `TiresService.getWearAnalysis`; rental health V3 verification codes; alert reason codes; rental UI `TireWearV3CustomerPanel`; i18n `tire.wearV3.*` (9 locales); `integration/TIRE_WEAR_V3_CUTOVER_P2.md` |
| EXPECTED_EFFECT | When `TIRE_WEAR_V3_CUSTOMER_READ_ENABLED=true`, APIs attach `wearV3` + optional authoritative presentation; rental distinguishes OVERDUE vs INSUFFICIENT_EVIDENCE; flags default false — no production behavior change until owner enables |
| VALIDATION | Jest adapter/read/rental/wear-analysis specs; `npm run i18n:check` (frontend); registry validator |
| NON_EFFECTS | No migration; no deploy; no DS4/S4/FSM change; shadow writer OFF; V2 snapshot recalculate path unchanged until authoritative flag; no feature activation in this PR |

### Tire V3 P2 cutover safety — flag AND-gate + V2 snapshot guard (2026-10-27)

| Event | Detail |
|-------|--------|
| WHY | Post-merge audit: `AUTHORITATIVE` alone could enable V3 read; authoritative mode did not suppress new V2 snapshot writes |
| CHANGE | `tire-wear-v3-cutover.policy.ts` truth table; authoritative requires enabled+authoritative; `TireHealthService.recalculate` skips `tireHealthSnapshot.create` when authoritative; rollback resumes V2 snapshots when flags cleared |
| VALIDATION | Jest policy truth table, v3-read flag regression, recalculate cutover spec |
| NON_EFFECTS | Defaults OFF; measurement ingestion, alerts, lifecycle unchanged; historical V2 snapshots retained |

### Tire V3 P3 — offline E2E validation (read-only production) (2026-10-28)

| Event | Detail |
|-------|--------|
| WHY | Final pre-cutover proof that V3 can replace V2 on real fleet evidence without production writes or flag activation |
| CHANGE | `validation/P3_OFFLINE_E2E_2026-10-27.md`; evidence bundle + `offline-replay-results.json`; `scripts/ops/tire-v3-p3-offline-e2e-validation.readonly.ts`; `tire-v3-p3-consumer-chain.validation.spec.ts`; `SYNTHETIC_partial-wheel-measurement.fixture.json` |
| VALIDATION | Read-only SSH/psql export (Tesla M3, Tiguan, A4, Arteon); offline replay idempotent 4/4; shadow rows unchanged; Jest cutover + P3 consumer chain 15/15 |
| OBSERVED_EFFECT | All four cohort vehicles: V3 verification `INSUFFICIENT_EVIDENCE` (NULL measurement odometers; Arteon no measurements); rental `MEASUREMENT_REQUIRED`; DS4 β=0 |
| VERDICT | **INCONCLUSIVE** for production GO — mechanics OK, evidence quality blocks authoritative replacement |
| NON_EFFECTS | No model formula change; no deploy; no flags; no production mutation |

### Tire V3 — production cutover operator runbook (2026-10-28)

| Event | Detail |
|-------|--------|
| WHY | Post–#2207 merge: empty `TIRE_WEAR_V3_CUTOVER_PRODUCTION.md`; owner requires executable global V3 cutover steps without shadow phase |
| CHANGE | Filled `integration/TIRE_WEAR_V3_CUTOVER_PRODUCTION.md` (preflight, deploy, dual-flag activation, smoke tests, rollback, stop conditions, evidence limits) |
| VALIDATION | Flag names and API paths cross-checked against `tire-wear-v3-cutover.config.ts`, `vehicle-intelligence.controller.ts`, DSRG deploy runbook |
| NON_EFFECTS | Documentation only — no deploy, no production env mutation |

### Cross-module — DI PR-2 persists DS4 event intensity (gap pointer only) (2026-10-28)

| Event | Detail |
|-------|--------|
| CHANGE | Documentation only. `TIRE-GAP-DS4-PERSISTED-INTENSITY-FIELDS-001` → **PARTIALLY_CLOSED** pointer: Driving Intelligence PR-2 (Draft, not deployed) persists `meanAccelMps2`, `durationS`, `steps`, `coverageRatio`, uncertainty labels on new shadow runs under `DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1`; peaks excluded by contract |
| WHY | Keep tire integration audit consistent with DI persistence state; data precondition for a future ordinal intensity channel |
| NON_EFFECTS | No tire runtime, adapter, flag or model change; `tire-ds4-shadow-input.mapper.ts` still consumes the trip-map DTO (no intensity); tire consumer binding remains forbidden until Fable review of `DI-DEC-DS4-INTENSITY-PERSIST-001`; historical DS4 rows unchanged |

### Tire V3 — authoritative customer read fail-closed hotfix (2026-10-28)

| Event | Detail |
|-------|--------|
| BEFORE | `TireHealthV3ReadService.enrichSummary` returned unchanged legacy summary when `computeCustomerRead` was null under authoritative flags (silent V2 GOOD / rental false-green; V2 snapshot suppression still active) |
| WHY | Production cutover readiness audit HARD BLOCKER — no silent V2 fallback when both customer authority flags are ON |
| CHANGE | `resolveCustomerReadForApi` + `buildAuthoritativeV3UnavailableRead`; authoritative path applies UNKNOWN/INSUFFICIENT stub; `TiresService.getWearAnalysis` attaches unavailable payload; rental policy blocks legacy GOOD clearance under V3 authority (`V3_READ_UNAVAILABLE`) |
| EXPECTED_EFFECT | Failed or missing V3 compute never presents legacy V2 as authoritative wear; rental stays measurement-required without new HARD_BLOCK |
| VALIDATION | Jest: `tire-health-v3-read*.spec`, `tires.service.v3-fail-closed.spec`, existing `tire-health-recalculate-v3-cutover.spec` |
| NON_EFFECTS | Flags default OFF; no migration; no DS4/RPM changes; `persistShadow: false` unchanged; β=0 unchanged |

### Tire V3 measurement numerical evidence safety follow-up (2026-10-29)

| Event | Detail |
|-------|--------|
| BEFORE | Post–#2232: `computeForSetup` could still consume mount-period rows excluded from verification (e.g. `ai_confirmed` with finite odometer) for rate segments and projection anchors; ingest `verificationEligible` did not require mount-period timestamp; `posteriorCalibrationEligible` could be inferred from setup flags rather than fused wheel rates |
| WHY | Close numerical evidence-integrity gaps without changing DS4, dynamic β, physics, or production cutover state |
| CHANGE | `tire-wear-v3-numerical-evidence.ts` trusted-row filter + posterior eligibility from per-wheel `measurement_fused`; `TireWearV3PriorService.computeForSetup` uses trusted rows only for rate/odometer validation/projection; `assessV3Ingestion` mount-period gate on verification + posterior from prior wheels |
| EXPECTED_EFFECT | Excluded sources never silently drive trusted V3 numbers; single accepted point cannot imply empirical rate calibration |
| VALIDATION | Jest: `tire-wear-v3-numerical-evidence.spec`, extended `tire-measurement-v3-ingestion.spec`, `tire-wear-v3-prior.service.spec`, existing P3 consumer + rental fail-closed + productive isolation specs |
| NON_EFFECTS | No deploy, migration, DS4, β, or V2 writer changes; global V3 fail-closed semantics preserved |

### Tire spec P0 integrity hardening — aiTireSpec read/apply (2026-10-30)

| Event | Detail |
|-------|--------|
| BEFORE | Stored `aiTireSpec` could be read without tire_v2 range validation; legacy direct apply skipped job binding guards; setup vs AI season/size conflicts were silent |
| WHY | P0 data-integrity hardening without V3 formula, DS4, calibration, or DB backfill changes |
| CHANGE | `parseValidatedAiTireSpecFromStorage` + shared legacy aliases on read; `guardDirectAiTireSpecApply` on direct apply; `detectAiTireSpecSetupConflicts` on apply + tire detail; rental apply sends tire identity + `tireSetupId`; V3 prior uses `parseAiTireSpec` only |
| EXPECTED_EFFECT | Invalid historical AI numerics fail closed on read; cross-setup direct apply blocked; conflicts reported explicitly; raw JSON in DB unchanged |
| VALIDATION | Jest: `ai-tire-spec-read*.spec`, `ai-tire-spec-setup-consistency.util.spec`, `ai-tire-spec-direct-apply.guard.spec`, `ai-tire-spec-apply.util.spec`, `ai-tire-spec-job-binding.util.spec` |
| NON_EFFECTS | No new AI prompt; no V3 math/DS4/calibration activation; no migration or production deploy |

### PR #2264 review remediation — payload binding + stale SSE (2026-10-30)

| Event | Detail |
|-------|--------|
| CHANGE | Server-side payload identity validation (`ai-tire-spec-payload-identity.util`); generation binding for direct apply; block apply on axle/LI/SI mismatch; season-only warnings; physical-axle ambiguous binding; preserve source URLs on read; rental warning banner + 9-locale keys |
| VALIDATION | Jest ai-tire-spec* (54 passed); frontend i18n:check PASS |

### PR #2264 final hardening — setup-wide axle binding + production parser audit (2026-10-30)

| Event | Detail |
|-------|--------|
| BEFORE | Identical front/rear setups falsely rejected as `AMBIGUOUS_AXLE_BINDING` despite single setup-wide `aiTireSpec` JSON column |
| WHY | Align apply guards with persistence: one blob per `VehicleTireSetup`; unified axle identity must accept `setup_wide` binding |
| CHANGE | `setupHasUnifiedAxleIdentity`, `resolvePayloadBindingScope` (`setup_wide` \| `front_axle` \| `rear_axle`); staggered setups remain single-axle match; read-only production parser audit script `backend/scripts/ops/tire-ai-spec-historical-parser-audit.ts` |
| EXPECTED_EFFECT | Square setups apply without false ambiguous binding; staggered and generation-binding failures unchanged fail-closed |
| VALIDATION | Jest ai-tire-spec* (57 passed); production read-only SSH psql audit: 4 stored blobs examined |
| OBSERVED_EFFECT | Production audit: 4/4 records parse under legacy permissive and new validated read; 4/4 differ only on `confidenceScore` (normalized scale); zero fields nullified by new parser |
| NON_EFFECTS | No schema/migration; no production writes/backfill; no V3 formula/DS4/calibration/AI prompt changes |

### Tire AI tire_v3_compact LLM contract (P1) (2026-10-30)

| Event | Detail |
|-------|--------|
| BEFORE | Mistral strict JSON requested 50 `tire_v2` fields including bias/sensitivity scores |
| WHY | Reduce hallucinated OEM surface; align LLM output with V3 + PR2264 identity needs only |
| CHANGE | `AI_TIRE_SPEC_V3_COMPACT_*` (14 CORE + 10 OPTIONAL LLM keys); `buildTireSpecJsonSchema` + prompt; `processAiTireSpecCompactLlmOutput` (authoritative identity, dimension reconcile, archetype/mark consistency, evidence fail-closed); new writes `schemaVersion: tire_v3_compact`; historical 50-field read/normalize unchanged |
| EXPECTED_EFFECT | New AI fetches omit excluded fields; optional/EU/UTQG/OE/newTread null without catalog alignment; V3 prior formulas unchanged |
| VALIDATION | Jest: `ai-tire-spec-compact-pipeline*`, `ai-tire-spec-canonical.contract.spec`, `ai-tire-spec*`, `vehicle-spec-ai.service.spec` |
| NON_EFFECTS | No DB migration; no V3 math changes; PR2264 apply guards preserved; V2 still reads legacy bias fields from old blobs |

### Tire AI tire_v3_compact final hardening — depth evidence + registration identity (2026-10-30)

| Event | Detail |
|-------|--------|
| BEFORE | Compact pipeline retained LLM `newTreadDepthMm` when request/setup identity aligned; registration persist ran compact pipeline without tire-side identity context |
| WHY | Identity match is not manufacturer catalog evidence; knowledge-only LLM must not establish verified nominal tread; registration must not conflate vehicle fields with tire brand/model |
| CHANGE | `applyCompactEvidenceGate`: always null `newTreadDepthMm` unless `catalogNominalTreadEvidence === true` (future catalog/OCR paths only); `resolveRegistrationTireIdentityContext` + registration DIMO persist passes `brandModelFront` / front LI·SI·size; prompt instructs LLM to always null nominal depth |
| EXPECTED_EFFECT | All current LLM/job/stream/registration writes store `newTreadDepthMm: null`; setup initial tread + historical V2 blobs unchanged; optional tier still fail-closed |
| VALIDATION | Jest: compact pipeline, registration identity/persist specs; tire-spec suite |
| NON_EFFECTS | No migration/backfill; no V3 formula/DS4 changes; no merge/deploy in this workstream |

### Tire AI tire_v3_compact P2A — Mistral eval harness + optional evidence review (2026-10-31)

| Event | Detail |
|-------|--------|
| BEFORE | No non-persistent way to score live Mistral output against compact pipeline + documented cohort |
| WHY | Production activation requires real LLM evidence and explicit optional-field policy |
| CHANGE | `ai-tire-spec-compact-eval.*` + `scripts/ops/tire-v3-compact-mistral-eval.readonly.ts`; `TIRE_V3_COMPACT_OPTIONAL_EVIDENCE_POLICY.md` |
| EXPECTED_EFFECT | Operators run harness with `MISTRAL_API_KEY` or `--fixture=p2-simulated`; JSON report with rejected fields and season consistency |
| VALIDATION | Jest `ai-tire-spec-compact-eval.util.spec.ts`; script smoke with fixture flag |
| NON_EFFECTS | No normalizer/gate changes; no deploy; PR2264/V3 formulas unchanged |

### Tire Wear V3 P2 — C5 temporal weight + C2/C3 safety + shadow plan (2026-10-31)

| Event | Detail |
|-------|--------|
| BEFORE | V3 DS4 temporal weight used missing `tripDurationSeconds` → silent 0.5; projection treated anchors as exact; OLS rate σ could collapse to ~0 |
| WHY | Fable review P2: fix adapter contract mismatch; widen only where σ_m already defined; prepare calibration snapshots without enabling writer |
| CHANGE | `tire-wear-v3-ds4-payload.util` accountableFraction/tripWindowSeconds; repository pre-resolves weight; C2 `projectTreadMm` optional measurement anchor σ; C3 noise floor on OLS σ; `TIRE_WEAR_V3_P2_CALIBRATION_SHADOW_PERSISTENCE_PLAN.md` |
| EXPECTED_EFFECT | `ds4SeverityCoverage` reflects accountableFraction; measurement-anchored tread/remaining km intervals widen; fused rate intervals less overconfident on sparse points |
| VALIDATION | Jest wear-v3-prior + p2 regression specs (84 tests in pattern scope) |
| NON_EFFECTS | β=0; shadow write env default OFF; no DS4 motion engine change; no C1/C4/C6–C8 |

### Tire Wear V3 Calibration Shadow P3 — snapshot store + writer + pairing foundation (2026-11-01)

| Event | Detail |
|-------|--------|
| BEFORE | P2 plan only; `tire_wear_v3_prior_shadow_v1` P3A table unused; no prospective per-wheel calibration snapshots |
| WHY | Enable future measurement calibration without altering customer V3 authority or wear equations |
| CHANGE | Table `tire_wear_v3_calibration_snapshot_v1`; `TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED` default false; leader scheduler `tire_wear_v3_calibration_shadow_writer`; pairing policy; Master Admin read endpoints; doc `integration/TIRE_WEAR_V3_CALIBRATION_SHADOW_P3.md` |
| EXPECTED_EFFECT | When ops enables flag on leader replica, idempotent per-wheel snapshots on changed V3 fingerprints; pairing rejects retroactive/leakage cases |
| VALIDATION | Jest calibration-shadow + pairing + writer + scheduler specs |
| NON_EFFECTS | Customer read path unchanged; β=0; P3A prior shadow flag unchanged; no production activation in PR |

### Tire Wear V3 Calibration Center P3.1 — Master Admin UI (2026-11-01)

| Event | Detail |
|-------|--------|
| BEFORE | PR #2289 calibration shadow APIs only; no Master UI |
| WHY | Operational monitoring dashboard + snapshot drawer without implying persisted pairs or accuracy |
| CHANGE | Paginated read routes + snapshot detail; Engineering nav `tire-v3-calibration-center`; 9-locale `master.intelligence.tireCalibration.*` |
| EXPECTED_EFFECT | MASTER_ADMIN can inspect writer replica-local stats, snapshots, sampled rejection histogram, honest NOT_EVALUABLE accuracy tab |
| VALIDATION | Jest master-read security/scoping; frontend nav regression tests |
| NON_EFFECTS | Customer V3; writer default OFF; no pair persistence |

### Tire Wear V3 Calibration Shadow P3 — PR #2289 pre-merge hardening (2026-11-01)

| Event | Detail |
|-------|--------|
| BEFORE | Snapshots keyed on full V3 `inputFingerprint` (odometer telemetry churn); no physical tire id / temporal cutoff fields; no DB immutability trigger; pairing gaps on leakage and ambiguous rotation |
| WHY | Safety audit before merge: reduce redundant compute/writes, fail-closed pairing, temporal leakage guards, tenant-scoped eligibility, insert-only enforcement |
| CHANGE | `computeTireWearV3CalibrationEligibilityDigest()` + `TireWearV3CalibrationEligibilityService`; writer digest gate; columns `calibration_eligibility_digest`, measurement cutoff fields, `pairing_eligible`, `measurement_ids_used`; migration `20261101183000_*` immutability trigger; extended pairing rejections; hardening Jest specs |
| EXPECTED_EFFECT | Odometer-only telemetry ticks do not insert; ledger/measurement/setup changes still snapshot; pairing rejects cross-identity/leakage; UPDATE forbidden at DB |
| VALIDATION | Jest calibration + fingerprint eligibility specs; backend build |
| NON_EFFECTS | Customer V3 fusion/fingerprint math unchanged; β=0; writer flag default OFF; no DS4 / V4 / production activation |
