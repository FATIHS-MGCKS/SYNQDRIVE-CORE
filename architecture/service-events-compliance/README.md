# Service Events & Compliance — Architecture Authority (bootstrap, `AUDIT_IN_PROGRESS`)

Living architecture authority for **Service Events & Compliance**: vehicle service history (`VehicleServiceEvent`), next-service forecasting, TÜV/BOKraft compliance dates, compliance task signals, and the Service Info Box read model consumed by Vehicle Health, Rental Health, insights, notifications, and the vehicle file.

| Field | Value |
|-------|-------|
| Registry coverage status | `AUDIT_IN_PROGRESS` (from `NOT_STARTED`, 2026-11-08 — Service Info V2 workstream) |
| Authority-native status | Bootstrap V0.1 · repository audit for next-service scope complete · Production baseline `VERIFIED_READ_ONLY` @ `dbf5d91b7` (bounded counts only) |
| Standard | [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) |
| Registry | [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) → "Service Events & Compliance" |

## Purpose

Answer, per vehicle and per maintenance position, **"what is due, when, based on which proven data, from which source"** — deterministically, without an LLM, and independent of any single telematics provider.

## Scope

- `backend/src/modules/vehicle-intelligence/service-compliance/**` (evaluation, forecast engine, task signals, rental module health, display mappers)
- `backend/src/modules/vehicle-intelligence/service-events/**` (canonical history, denormalized vehicle baseline fields, extraction apply)
- Service Info read model (`GET /vehicles/:id/service-info-status`, `service-history-page`) and the frontend Service Info Box (`frontend/src/rental/lib/service-info-display.ts`, `HealthErrorsView` service card/modal, `VehicleHealthBox` compliance grid, health detail panel)

## Explicit non-scope

- OneAuto provider transport, quoting, charging, callbacks, and raw result persistence → One Auto Provider authority (`NOT_STARTED`). This module **reads** already-paid stored `OE_SERVICE_SCHEDULE` results; it never triggers provider requests.
- High Mobility signal ingestion/freshness → High Mobility Integration (`NOT_STARTED`). This module consumes `HmSignalUsageService.getServiceInfoSignals` only.
- Document upload/extraction pipeline → Document Extraction (AI Upload) (`NOT_STARTED`). This module owns only the service-specific apply rules and the `VehicleServiceEvent` created on confirmed apply.
- Brake/tire/battery lifecycle side effects of service events → their own authorities.

## Ownership boundaries

| Owns | Does not own |
|------|--------------|
| Maintenance position taxonomy, due/overdue rules, calendar-month math, baseline-coverage rules, provenance/data-quality contract | Provider HTTP contracts, HM freshness windows (consumed), document OCR extraction fields (consumed) |
| `VehicleServiceEvent` semantics and denormalized `Vehicle.lastService*`/`lastOilChange*` | Vehicle master data editing UI |
| Compliance task **signals** (`suggestionOnly` policy) | Task persistence/automation rules (Tasks & Work Orders) |

## Entry documents (partial)

1. [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md)
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. [`decisions/DECISION_REGISTER.md`](decisions/DECISION_REGISTER.md)
4. [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md)
5. [`contradictions/KNOWLEDGE_GAPS.md`](contradictions/KNOWLEDGE_GAPS.md)
6. [`AGENT_CONTRACT.md`](AGENT_CONTRACT.md)
7. [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md)

## Validation commands

```bash
cd backend && npx jest src/modules/vehicle-intelligence/service-compliance src/modules/vehicle-intelligence/service-events src/modules/document-extraction/document-service-extraction.rules.spec.ts
cd frontend && npx vitest run src/rental/lib/service-info-display src/rental/components/vehicle-detail/vehicle-health-box.mapper.test.ts
bash architecture/scripts/validate-module-registry.sh
```

## Neighboring authorities

Rental Health (`AUDIT_IN_PROGRESS`), Vehicle Health Summary (`NOT_STARTED`), Tasks & Work Orders (`NOT_STARTED`), One Auto Provider (`NOT_STARTED`), High Mobility Integration (`NOT_STARTED`), Document Extraction (`NOT_STARTED`), Internationalization (`AUTHORITY_ACTIVE`).

## Legacy / supporting documents (evidence only)

- `architecture/DOCUMENT_SERVICE_INSPECTION_APPLY_EXECUTOR_2026-07-17.md`
- `architecture/oneauto-provider/evidence/ONEAUTO_OE_SERVICE_HISTORY_INGESTION_V1.md`
- `architecture/oneauto-provider/evidence/P1_OE_SERVICE_SCHEDULE_INTEGRATION_DRAFT.md`
- `backend/src/modules/oneauto-provider/evidence/VERIFIED_PROVIDER_CONTRACTS.md`

`AUTHORITY_ACTIVE` is **not** claimed.
