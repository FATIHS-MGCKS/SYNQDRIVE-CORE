# DS4×RPM — M1 Ratio-State (P18A foundation + P20 descriptive report)

Research-only offline harness: P18A falsification controls + **P20 TIG22 descriptive intelligence JSON + DE summary** (no RAY-RUN activation).

- **Not** production, backend, or customer-facing.
- **P16 pin gate** must pass before any compute (`5774d38f…704e6` manifest self-hash).
- **B0/B1** histogram + block-5 baselines are frozen descriptive references (not gears).
- **RAY-RUN classifier** remains **typed/stub only** in P18A — P20 references P18B **NO_GO** only in `governance`.

## CI

GitHub Actions workflow for this package is **not** included in PR #2348: adding `.github/workflows/*` triggers `i18n-authority-protection` (`GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL`) until a trusted owner applies label `i18n-governance-authority-change`.

Local/PR verification:

```bash
cd research/driving-intelligence/ratio-state-profiler-m1
npm ci && npm run typecheck && npm test
```

## P20 — TIG22 M1 descriptive report (real sealed data)

```bash
npm run run:p20
# JSON:  /opt/cursor/artifacts/ds4-rpm-p20-m1-descriptive-report.json
# German: /opt/cursor/artifacts/ds4-rpm-p20-m1-descriptive-report.de.md
```

Content hash is pinned in `fixtures/p20-evidence-manifest.json` (excludes `german_markdown` from the hash).

## Emit P18A foundation report

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
