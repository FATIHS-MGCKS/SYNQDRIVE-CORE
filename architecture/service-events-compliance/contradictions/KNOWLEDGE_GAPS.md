# Service Events & Compliance — Knowledge Gaps

| ID | Component | Epistemic | Why it matters | Evidence required | Resolution path |
|----|-----------|-----------|----------------|-------------------|-----------------|
| SEC-GAP-001 | OneAuto schedule adapter | `INFERRED` | Stored schedule repeats identical position groups 3×; collapsing assumes model-variant duplicates. If they are distinct engine variants, one vehicle should match only one group. | Provider documentation or operator confirmation of group semantics; a second vehicle's stored schedule | Keep `SCHEDULE_VARIANTS_COLLAPSED` flag visible; ask provider |
| SEC-GAP-002 | Odometer provenance | `UNKNOWN` | `Vehicle.mileageKm` has no timestamp; staleness cannot be judged when `VehicleLatestState` is absent. | Audit of all `mileageKm` writers (HM registration, notification sync, bookings) | Flag `ODOMETER_TIMESTAMP_UNKNOWN`; future `mileageUpdatedAt` column (not in V1) |
| SEC-GAP-003 | OneAuto history typing | `INFERRED` | `classifyEventType` is keyword-based; an event typed `OIL_CHANGE` whose actions also list an inspection is not recognized as inspection baseline. | Provider `service_type` taxonomy; sample of real payloads | V1 keeps type-based rules conservative; consider structured confirmation UI for imported events |
| SEC-GAP-004 | Small vs large inspection | `UNKNOWN` | OneAuto exposes no small/large distinction; manual/OCR `serviceKind` is the only source. | Manufacturer plan documents | Document limitation in UI (`INSPECTION` generic) |
| SEC-GAP-005 | Production runtime | `UNKNOWN` | PM2 topology/logs for this module not inspected; behavior of forecast under fleet aggregation load not measured. | Bounded PM2/log read after deploy | Phase 2 completion before `AUTHORITY_ACTIVE` |
