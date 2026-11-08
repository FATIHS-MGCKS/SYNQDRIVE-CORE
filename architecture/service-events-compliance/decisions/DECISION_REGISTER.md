# Service Events & Compliance — Decision Register

Status vocabulary: `PROPOSED` · `EXPERIMENTAL` · `VALIDATED` (tests) · `PRODUCTION_VALIDATED` · `REJECTED` · `SUPERSEDED`. Epistemic: `CONFIRMED` · `INFERRED` · `UNKNOWN`.

---

## SEC-DEC-001 — Provider-agnostic deterministic maintenance forecast replaces HM-only next service

| Field | Value |
|-------|-------|
| Status | `VALIDATED` (unit/integration tests) — awaiting architect review; not deployed |
| Date | 2026-11-08 |
| Workstream | `SERVICE_INFO_V2_PROVIDER_AGNOSTIC_MAINTENANCE_INTELLIGENCE` |

**BEFORE.** `ServiceComplianceService.evaluateNextService` returned `TRACKED` only when an active `HM_HEALTH` link delivered fresh (≤ 7 d) `distanceToNextServiceKm`/`timeToNextServiceDays`. Everything else was `NO_TRACKING` ("Nächster Service nur über HM/OEM verfügbar"). Vehicle interval fields were marked `@deprecated`. Production had **0** active HM links, **1** paid `OE_SERVICE_SCHEDULE` result and **10** OneAuto history events that were never used for a forecast.

**WHY.** The product must forecast maintenance for vehicles without HM, must reuse already-paid OneAuto results, and must stay explainable: per position, per source, with data quality visible.

**Alternatives considered.**
1. Keep HM-only and ask operators to enter `nextServiceDueDate` manually — rejected: no per-position semantics, no provenance, no reuse of stored provider data.
2. LLM summarization of history + schedule at page load — rejected: non-deterministic, not testable, violates "no LLM at page load".
3. Trigger OneAuto `OE_SERVICE_SCHEDULE` automatically for vehicles lacking a plan — rejected: paid requests, provider activation, outside scope.
4. **Chosen:** pure deterministic engine over canonical *maintenance positions* fed by neutral source adapters (HM OEM signal, stored OneAuto schedule, manual intervals, documented/confirmed events).

**CHANGE.**
- New pure domain layer `service-compliance/maintenance-forecast/` (types, calendar util, coverage rules, engine, OneAuto/manual adapters) and a Nest loader `MaintenanceForecastService` (reads only; no provider calls).
- `evaluateNextService`: HM fresh → unchanged `source: 'HM_OEM'`; otherwise earliest due computed position → `TRACKED` with `source: 'COMPUTED_ONEAUTO_SCHEDULE' | 'COMPUTED_MANUAL_INTERVAL'`; both present → `conflicts[]` when |Δkm| > 1 000 or |Δdays| > 30. Measured OEM values and computed due values are never merged into one number.
- `NextServiceComplianceDto` gains `provenance`, `positionKind`, `dataQuality`, `conflicts`; `ServiceInfoStatusDto` gains `maintenanceForecast`.
- `trackingStatus` vocabulary unchanged (`TRACKED | NO_TRACKING | STALE`) so existing consumers keep working.

**EXPECTED_EFFECT.** Vehicles with a stored schedule or manual intervals plus a proven baseline get a forecast; vehicles without any basis show what can be added (upload / manual entry) instead of "not available".

**VALIDATION.** `maintenance-forecast.engine.spec.ts` covers the acceptance scenarios (80 000→100 000 km at 99 000 km / 11 of 12 months; km-overdue; time-overdue; oil change leaves inspection unchanged; full service updates only covered positions; history without schedule; schedule without history; no odometer → time-only; stale odometer flag; HM/computed conflict). Adapter spec uses the Production-shaped interval texts.

**OBSERVED_EFFECT.** Not yet observed in Production (`PRODUCTION_CHANGED=NO`).

**NON_EFFECTS.** No Prisma migration; no OneAuto request; no HM changes; no change to TÜV/BOKraft evaluation; task dedupe key unchanged.

**TRADEOFFS.** Each `evaluateNextService` now performs bounded extra reads (events, latest state, latest schedule response). Fleet-level callers (Rental Health, insight detectors) already evaluate per vehicle.

**REMAINING_GAPS.** `SEC-GAP-001..005` (see `contradictions/KNOWLEDGE_GAPS.md`).

---

## SEC-DEC-002 — OneAuto `OE_SERVICE_SCHEDULE` interval semantics: recurring intervals, per-axis optional

| Field | Value |
|-------|-------|
| Status | `VALIDATED` (parser + adapter tests against stored shape) · epistemic `CONFIRMED` for interval mode, `INFERRED` for duplicate groups |

**Evidence.** OpenAPI evidence (`docs/provider-evidence/oneauto-six-sku-openapi-evidence.json`): `service_kms` = "Service interval in kilometres", `service_months` = "Service months". Stored Production payload text: `every 30000 km or 24 months`, `every 24 months,regardless of mileage`, `every 120000 km,regardless of elapsed time`, `Oil and inspection service combined` (no numeric interval).

**Decision.** Treat `service_kms` / `service_months` as **recurring intervals** (`intervalMode: 'RECURRING'`), independently optional (time-only, km-only, both). A position with neither value is **not forecast** (`NO_INTERVAL`) and only listed informationally. Absolute manufacturer milestones (`ABSOLUTE_MILESTONE`) are supported by the engine type but **no current source produces them** — never invented.

**Duplicate groups.** Identical `(interval, description, task fingerprint)` entries are collapsed to one canonical position; the collapse is flagged `SCHEDULE_VARIANTS_COLLAPSED` in data quality (gap `SEC-GAP-001`).

**Kind classification (deterministic).** `normal_services` with km/months and an oil-change vocabulary match in ≤ 12 tasks → `OIL_CHANGE`; other `normal_services` with km/months → `INSPECTION`; `extra_services` → `OTHER` labelled by `service_description`. Small vs large inspection is **not** inferred from OneAuto (no such field) — `INSPECTION_SMALL`/`INSPECTION_LARGE` exist for manual/OCR confirmation only.

---

## SEC-DEC-003 — History baseline policy: event type + proven work items; no free-text-only resets

| Field | Value |
|-------|-------|
| Status | `VALIDATED` (coverage util tests) |

**Rules.**
- `FULL_SERVICE`, `GENERAL_INSPECTION` → baseline for `INSPECTION` (and `INSPECTION_SMALL`/`INSPECTION_LARGE` when the event's confirmed `serviceKind` says so). `FULL_SERVICE` additionally covers `OIL_CHANGE` **only** when its proven work items contain the oil-change vocabulary.
- `OIL_CHANGE` → baseline for `OIL_CHANGE` only. Never resets `INSPECTION`.
- `REPAIR`, `BRAKE_SERVICE`, `TIRE_ROTATION`, `BATTERY_REPLACEMENT`, `TUV_INSPECTION`, `BOKRAFT_INSPECTION` → never reset a regular service position.
- `OTHER` → resets nothing by type.
- `OTHER`-kind plan positions (brake fluid, spark plugs, filters, ATF…) are covered only by an exact component-vocabulary match of a structured work item (`service_actions` from OneAuto, `performedWork` from confirmed OCR/manual entry) against the position's component terms. Free text in `notes` is **never** used.
- Vehicle master data `lastServiceDate/lastServiceOdometerKm` (`INSPECTION`) and `lastOilChangeDate/OdometerKm` (`OIL_CHANGE`) are fallbacks with `eventSource: 'VEHICLE_MASTER_DATA'` when no qualifying event exists.
- Without any baseline → `NO_BASELINE` (no invented last service). Without any schedule → `NO_INTERVAL` (no invented plan).

---

## SEC-DEC-004 — Computed forecasts never auto-materialize tasks in V1

| Field | Value |
|-------|-------|
| Status | `VALIDATED` |

Computed-source signals and insight candidates carry `suggestionOnly: true` even when `CRITICAL`; only fresh HM OEM overdue keeps the existing auto-materialization path (org automation rule + dedupe key `service_overdue:<vehicleId>`). Operators can still materialize manually. Rationale: owner constraint "no automatic maintenance tasks without checking dedup/compliance rules"; computed forecasts depend on odometer freshness.

---

## SEC-DEC-005 — Manual/OCR service entries carry structured performed work; duplicate guard

| Field | Value |
|-------|-------|
| Status | `VALIDATED` |

- `CreateVehicleServiceEventDto.performedWork: string[]` (≤ 40 items) stored in `sourcePayloadJson.service_actions` — same key the OneAuto mapper uses, so history rendering and coverage matching share one path.
- Document extraction `SERVICE`/`OIL_CHANGE` schemas gain `performedWork` (JSON array or line list) and `serviceKind` (enum). Apply still requires explicit confirmation (existing action-plan gate); extraction never auto-applies.
- Manual duplicate guard: same vehicle + type + calendar day + odometer (±0) → `409 SERVICE_EVENT_DUPLICATE` unless `allowDuplicate: true`. Upload idempotency unchanged (`@@unique([organizationId, documentExtractionId])` + upload hash duplicate check).
