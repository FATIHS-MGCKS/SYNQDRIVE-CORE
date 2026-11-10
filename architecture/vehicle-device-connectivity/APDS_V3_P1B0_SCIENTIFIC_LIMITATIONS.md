# APDS V3 P1B0 — Scientific limitations (offline only)

1. **No counterfactual DIMO responses** — Replay cannot observe telemetry that would have arrived only if a skipped poll had executed; projected request reduction is an estimate.
2. **Heuristic information gain** — `estimateVsiInformationGain` is explicitly not validated as calibrated probability; conservative decisions default to poll on hard safety and contradictory evidence.
3. **Limited fleet diversity** — Holdout epochs and vehicle counts in unit replay fixtures do not represent full production fleet heterogeneity.
4. **UNKNOWN consumer freshness** — Several registry consumers retain `UNKNOWN` max age; policy must not invent thresholds for them.
5. **KS_MX_2024** — Excluded from optimization calibration; provider-error ticks reported separately and classified `NOT_ASSESSABLE` when flagged.
6. **Baseline scheduler model** — Offline baseline uses **BASELINE_PARTIAL_PARITY** (`isSnapshotPollDue` with limited tier context only); promotion/hysteresis/coalescing are incomplete. Unknown `activityTier` labels are not coerced to RESTING_STANDBY. BullMQ dedupe is modeled via `physicalRequestDedupKey`; tick-only windows yield `physicalCountPrecision=NOT_ASSESSABLE_TICK_ONLY`.
7. **Consumer demand research boundary** — Registry v1 UNKNOWN hard-safety consumers block certified `WOULD_SKIP`; replay may report `HYPOTHETICAL_RESEARCH_CANDIDATE_SKIP` separately and must not conflate with authorized safe skip.
8. **Oracle vs observable** — `hindsightLvSourceAdvanceMissObserved` requires `lvStrictSourceAdvanceObservedAtMs`; `p2cTopLevelAdvancesAtRisk` requires bound P2C evidence at decision time.
