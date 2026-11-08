# Service Events & Compliance — Agent Contract (bootstrap)

## Read-first sequence

1. [`README.md`](README.md) → 2. [`CURRENT_STATE.md`](CURRENT_STATE.md) → 3. [`decisions/DECISION_REGISTER.md`](decisions/DECISION_REGISTER.md) → 4. [`contradictions/KNOWLEDGE_GAPS.md`](contradictions/KNOWLEDGE_GAPS.md) → 5. [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md).

## Substantive change (requires same-PR authority update)

Any change to: due/overdue rules, calendar math, position taxonomy, baseline-coverage rules, provenance/data-quality contract, `NextServiceComplianceDto`/`ServiceInfoStatusDto` shape, task-signal `suggestionOnly` policy, `VehicleServiceEvent` semantics, denormalized `Vehicle.lastService*`/`lastOilChange*` refresh, or the Service Info Box contract.

## Prohibited silent changes

- Triggering paid OneAuto requests or activating provider SKUs from this module.
- Mixing measured HM/OEM remaining values with computed due values into one figure.
- Resetting a regular service position from free text (`notes`) or from `REPAIR`/`OTHER` events.
- Inventing a plan without a schedule source or a last service without a proven baseline.
- Auto-applying unconfirmed OCR extraction results.
- Production mutation of any kind during audits.

## Duties

- Maintain this authority in the same PR; append to [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md).
- Registry synchronization review per affected module (`UPDATED` / `UNCHANGED` with before/after coverage status and reason).
- Cross-module changes (Document Extraction, One Auto Provider, High Mobility, Rental Health, Tasks) → one registry review result each.
- Run `bash architecture/scripts/validate-module-registry.sh` and the module tests listed in `README.md`.
- Keep epistemic (`CONFIRMED`/`INFERRED`/`UNKNOWN`) and decision/validation statuses as separate axes.

## Completion report

Include the `ARCHITECTURE_GOVERNANCE` block from `.cursor/rules/Architectur-Updates.mdc`.
