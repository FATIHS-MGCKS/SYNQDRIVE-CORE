# TDL CUSUM Replay Fixtures V1

Deterministic offline inputs for `TDL_CUSUM_FINALIZATION_REPLAY_EVIDENCE_V1`.

- **Anchor UTC:** `2026-10-30T10:00:00.000Z` (all timestamps derived from offset seconds)
- **No production data export** — series are synthetic shapes calibrated to forensic exemplar **modes** (not byte-identical telemetry)
- **Run:** `cd backend && npx ts-node --transpile-only scripts/research/tdl-cusum-finalization-replay-v1.harness.ts`

See `manifest.json` for FSM default constants aligned with production `worker.config.ts` @ `a27ca9059b9fa9e8aa88696e811107fb427cb369`.
