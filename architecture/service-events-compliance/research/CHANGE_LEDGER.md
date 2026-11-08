# Service Events & Compliance — Change Ledger (append-only)

| Date | Change | PR / ref |
|------|--------|----------|
| 2026-06-17 | Service events secured history (V4.8.56); HM-only next service, REPAIR/OIL_CHANGE excluded from baseline | historical (ChangesView `service-events-secure-history-v4856-2026-06-17`) |
| 2026-07-17 | Document extraction service/inspection apply executors; `createFromDocumentExtraction` idempotency | `architecture/DOCUMENT_SERVICE_INSPECTION_APPLY_EXECUTOR_2026-07-17.md` |
| 2026-10/11 | OneAuto `OE_SERVICE_HISTORY_EU` ingestion → `VehicleServiceEvent` (origin ONEAUTO); `OE_SERVICE_SCHEDULE` result stored raw, Master UI only | `architecture/oneauto-provider/evidence/*` |
| 2026-11-08 | Bootstrap authority `AUDIT_IN_PROGRESS`; read-only Production baseline captured; decisions SEC-DEC-001…005; Service Info V2 deterministic maintenance forecast implemented on `cursor/service-info-v2-maintenance-intelligence-238e` HEAD `0ff062d66` (not merged, not deployed) | this PR |
