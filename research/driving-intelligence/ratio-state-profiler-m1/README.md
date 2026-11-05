# DS4×RPM — M1 Ratio-State Profiler (P18A foundation)

Research-only offline harness for **RAY-RUN V1 foundation** and falsification controls.

- **Not** production, backend, or customer-facing.
- **P16 pin gate** must pass before any compute (`5774d38f…704e6` manifest self-hash).
- **B0/B1** histogram + block-5 baselines are immutable comparison references.
- **RAY-RUN classifier** (`ray_fit`, population separability, per-second `abstain_state`) is **typed/stub only** in P18A — not validated.

## Run tests

```bash
cd research/driving-intelligence/ratio-state-profiler-m1
npm ci
npm test
```

## Emit evidence report

```bash
npm run run:p18a
# default: /opt/cursor/artifacts/ds4-rpm-p18a-ray-run-foundation-report.json
```

## Sealed inputs

| Role | Location |
|------|----------|
| P16 manifest | `fixtures/p16-ratio-state-evidence-pin-manifest.json` |
| P5 QC overlay | `fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv` |
| Video 1 Hz + windows + S4 R1 | `research/.../tiguan-20261022/` (repo-relative, hash-gated) |

P5 fixture mirrors the P16-pinned artifact when the Cursor artifacts path is unavailable (same SHA-256).
