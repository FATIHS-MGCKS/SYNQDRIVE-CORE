# P0-a — VSI Signal Integrity Matrix (2026-10-30)

Read-only audit export for the four production test vehicles (org `faa710c9-6d91-4079-a7d5-91fdccdec14a`):

| Vehicle | ID |
|---------|-----|
| Tesla Model 3 | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| VW Tiguan | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| Audi A4 | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| VW Arteon | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |

## Artifacts

- [`SIGNAL_INTEGRITY_MATRIX_2026-10-30.json`](SIGNAL_INTEGRITY_MATRIX_2026-10-30.json) — schema `synqdrive.vsi.signal_integrity_matrix.v1`
- [`SIGNAL_INTEGRITY_MATRIX_2026-10-30.md`](SIGNAL_INTEGRITY_MATRIX_2026-10-30.md) — human-readable compact table + production verification block

## Reproduce (read-only)

```bash
# 1) Export bundles from Production Postgres (operator; no writes)
# 2) Replay assembly locally:
cd backend && npx ts-node --transpile-only scripts/ops/vsi-p0a-signal-integrity-matrix-replay.ts \
  /path/to/bundles.json ../architecture/vehicle-signal-intelligence/evidence

# Live (requires DATABASE_URL, read-only SELECT):
cd backend && npx ts-node --transpile-only scripts/ops/vsi-p0a-signal-integrity-matrix-audit.ts
```

## Tests

```bash
cd backend && npx jest --testPathPatterns=vsi-p0a-signal-integrity-audit
```

No signal classification, RPM resolver, polling, or provider rate changes in this workstream.
