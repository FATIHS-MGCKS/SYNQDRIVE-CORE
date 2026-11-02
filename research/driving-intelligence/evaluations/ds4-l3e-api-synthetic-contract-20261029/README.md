# DS4 L3-E — API_SYNTHETIC longitudinal evidence contract (offline spike)

Research-only. Does **not** change production assessment, gates, or DB.

| Artifact | Role |
|----------|------|
| `contract/DS4_LONGITUDINAL_EVIDENCE_QUALITY_RESEARCH_V1.json` | Versioned contract spec |
| `lib/research-longitudinal-evidence-quality.v1.mjs` | Research adapter (not imported by backend) |
| `scripts/run-l3e-offline-spike.ts` | Replays frozen pilot pins + compares L2 |
| `outputs/l3e-spike-report.json` | Generated spike results |

Run (from repo):

```bash
cd backend
npx ts-node --transpile-only scripts/research/ds4-l3e-api-synthetic-contract-spike.harness.ts
```

Harness entrypoint: `backend/scripts/research/ds4-l3e-api-synthetic-contract-spike.harness.ts` (research-only; not production code).

Pins: immutable pilot evidence under `/opt/cursor/artifacts/ds4-historical-offline-replay-pilot-20261029/evidence/`.
