# Service Events & Compliance — Production Baseline (read-only)

| Field | Value |
|-------|-------|
| Captured | 2026-11-08T12:31:58Z – 12:33Z (UTC) |
| Host | `srv1374778.hstgr.cloud` (single Hostinger VPS) |
| Access | SSH `synqdrive-admin`, `StrictHostKeyChecking=yes`; `psql` read-only via `sudo -u postgres`; `SET statement_timeout=10000` |
| Mode | `VERIFIED_READ_ONLY` — no writes, no flag changes, no restarts, no provider calls |
| Release path | `/opt/synqdrive/releases/20261108000410_v4994` |
| Deployed SHA | `dbf5d91b7687fb88197a54ac29baf68d7fc1a5ab` |
| Public health | `GET /api/v1/health` → `{"status":"ok","uptime":43736,...}` at 12:32:01Z |
| Repo drift | `origin/main 233bbcb4c` ahead of deployed SHA; not file-diffed for this module |
| Non-mutations | Only `SELECT`/`SET statement_timeout` executed; no VIN, plate, org, or user identifiers exported |

## Module tables (bounded counts)

| Metric | Value | Source query (read-only) |
|--------|-------|--------------------------|
| `vehicle_service_events` total | 11 | `count(*)` |
| by type/origin | OIL_CHANGE/ONEAUTO 8 · OTHER/ONEAUTO 2 · BRAKE_SERVICE/MANUAL 1 | `GROUP BY event_type, origin` |
| OneAuto jobs by SKU/status | `OE_SERVICE_HISTORY_EU` SUCCEEDED 2, FAILED 1 · `OE_SERVICE_SCHEDULE` SUCCEEDED 1 · `OE_VIN_LOOKUP_EU` SUCCEEDED 1, FAILED 4 | `GROUP BY service_sku, status` |
| Active `HM_HEALTH` data-source links | **0** | `vehicle_data_source_links … is_active` |
| Vehicles total / with any interval field / with last-service field / with `mileage_km` | 9 / 5 / 1 / 6 | `vehicles` aggregates |

**Interpretation (CONFIRMED):** with 0 active HM links the deployed HM-only `evaluateNextService` returns `NO_TRACKING` for every Production vehicle. A paid `OE_SERVICE_SCHEDULE` result and 10 OneAuto history events already exist and are currently not used for any forecast.

## Stored `OE_SERVICE_SCHEDULE` payload shape (field-level, no identifiers)

Single SUCCEEDED job; latest `callback` response HTTP 200 with `result.normal_services` = 9 items, `result.extra_services` = 21 items (an `initial` 202 row and a `recovery_audit` row carry no services).

| Group | `service_interval_desc` (verbatim) | `service_months` | `service_kms` | tasks |
|-------|-------------------------------------|------------------|---------------|-------|
| normal | `every 24 months,regardless of mileage` | 24 | null | 9 (Engine Oil, Oil Filter, Sealing Plug, oil sump) |
| normal | `every 30000 km or 24 months` | 24 | 30000 | 40 |
| normal | `Oil and inspection service combined` | null | null | 41 |
| extra | `every 36 months,regardless of mileage` | 36 | null | Brake Fluid / AWD coupling oil |
| extra | `every 60000 km or 24 months` | 24 | 60000 | interior air filter |
| extra | `every 60000 km or 36 months` | 36 | 60000 | — |
| extra | `every 60000 km or 48 months` | 48 | 60000 | Spark Plug |
| extra | `every 90000 km or 72 months` | 72 | 90000 | Air Filter |
| extra | `every 120000 km,regardless of elapsed time` | null | 120000 | Automatic Transmission Oil |

The 9 normal and 21 extra entries are **three identical repetitions** of the 3 / 7 distinct positions above (`SID1001–1003`, `SID1004–1006`, `SID1007–1009`, …). Interpreted as model-variant duplicates — epistemic state **INFERRED**; see `SEC-GAP-001`.

## Stored OneAuto history (`source_payload_json`, 10 rows)

- `service_type`: `service` (9) · `delivery` (1)
- `service_actions` examples: `Engine: oil and filter change.`, `Dust filter replaced.`, `Spark plugs replaced…`, `Brake fluid replaced.`, `Breakpads rear axle replaced.`, `Air filter element replaced.`, `Rear axle: Oil change.`, `Delivery inspection.`
- All 10 rows carry an odometer value.
- Heuristic typing produced 8× `OIL_CHANGE` and 2× `OTHER`; no row was typed `FULL_SERVICE`/`GENERAL_INSPECTION`.

## Confirmed claims

- Production next-service UI is non-functional for all vehicles (0 HM links) — `CONFIRMED`.
- OneAuto schedule intervals are expressed as recurring "every …" intervals with independent km / months axes, and some positions are time-only, km-only, or without interval — `CONFIRMED` from stored payload text.

## Unresolved / unobservable

- PM2 topology and bounded logs not read in this baseline.
- Whether the duplicated schedule groups represent engine/model variants — `UNKNOWN`.
