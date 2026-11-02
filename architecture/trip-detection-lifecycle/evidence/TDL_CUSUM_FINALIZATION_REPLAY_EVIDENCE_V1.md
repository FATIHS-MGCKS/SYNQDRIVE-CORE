# TDL CUSUM Finalization — Offline Replay Evidence V1

| Field | Value |
|-------|-------|
| **Operation** | `TDL_CUSUM_FINALIZATION_REPLAY_EVIDENCE_V1` |
| **Baseline audit** | `TDL_FINALIZATION_CUSUM_FORENSIC_AUDIT_V1` |
| **Production SHA** | `a27ca9059b9fa9e8aa88696e811107fb427cb369` |
| **Replay mode** | Offline fixtures only — **no production DB, workers, or scheduler** |
| **Harness** | `backend/scripts/research/tdl-cusum-finalization-replay-v1.harness.ts` |
| **Fixtures** | `architecture/trip-detection-lifecycle/evidence/TDL_CUSUM_REPLAY_FIXTURES_V1/` |

## Method

1. Pin six forensic exemplars (+ manifest) with deterministic UTC anchor `2026-10-30T10:00:00.000Z`.
2. Slice each series to production END_VALIDATION fetch window (`possibleEndAt −15m … +5m`).
3. **BASELINE** — production `detectTripEndChangePoint` + FSM defaults from `worker.config.ts` (120s inactivity, 90s stability, 3×60s CUSUM retry, 30s tick).
4. **A (FSM/Retry)** — counterfactual 90s/60s gates, 2 attempts, 45s retry, 20s tick (research policy only).
5. **B (Time-aware CUSUM)** — research-only detector in harness (time-weighted CUSUM step + ≥90s stopped-span confirmation); **not shipped product code**.
6. **C (CH assist / provider silence)** — counterfactual skip paths: `CLICKHOUSE_END_ASSIST` when eligible; `PROVIDER_SILENCE_FAST_FINALIZE` when `providerSilenceEmptyCore` without CH.

Absolute lag seconds in replay are **model estimates** from canonical `end_time` → simulated finalize commit; they calibrate **relative** gains vs baseline, not full production p50 reproduction (scheduler quantisation + missing PEC timestamps omitted).

## Results summary

| Fixture | Prod mode | Baseline | A | B | C |
|---------|-----------|----------|---|---|---|
| 858dce composite + silence | COMPOSITE | COMPOSITE ~290s | COMPOSITE ~175s | tie | **silence fast ~170s** |
| 95bee8 CUSUM OK | CUSUM | CUSUM | CUSUM | **regression → COMPOSITE** | CUSUM |
| b304e9 boundary adjust | CUSUM | CUSUM | CUSUM | regression risk | CUSUM |
| db96eba gap split | GAP_SPLIT | **excluded** (5926s prod lag recorded) | excluded | excluded | excluded |
| 0e64835 CH assist | CH_ASSIST | COMPOSITE (CUSUM inconclusive in window) | COMPOSITE | tie | **CH ~65s** |
| Tesla inconclusive | COMPOSITE | COMPOSITE ~290s | **~175s** | tie | tie |

Machine outputs: `/opt/cursor/artifacts/tdl-cusum-replay-evidence-v1.json`, `tdl-cusum-replay-comparison-v1.csv`, `tdl-cusum-finalization-replay-evidence-v1-report.md`.

## Safety assessments

| Variant | False-end risk | Gap-split / repair | Notes |
|---------|----------------|--------------------|-------|
| **Baseline** | MEDIUM on COMPOSITE after CUSUM exhaustion | Gap-split out of band | Matches fleet forensic dominance |
| **A** | MEDIUM–HIGH if retries cut without silence proof | Unchanged | ~115s modeled savings on composite paths; does not fix inconclusive CUSUM |
| **B** | HIGH without Fable tuning | Can mis-read dense series (95bee8 regression in replay) | Do not ship without independent review |
| **C (CH)** | MEDIUM — wrong segment end if resume invalidation fails | N/A | Requires `trip-r12-ch-assist-resume-invalidation` gate |
| **C (silence)** | MEDIUM–HIGH if silence is provider outage not true stop | Must not bypass gap-split guards | Strong latency win on 858dce-class trips only with forensics |

## Recommendation (evidence-only)

1. **Implement first (after Fable):** Candidate **C** — expand governed CH assist + provider-silence fast finalize for RUPTELA allowlist (Arteon fleet evidence: ~194s vs ~750s p50).
2. **Second:** Candidate **A** — modest FSM/retry tuning **only when** silence or CH forensics present (never raw timeout cuts).
3. **Third:** Candidate **B** — offline calibration + Fable review before any production change to `trip-cusum.ts`.

## Related package

Fable Architecture Review: [`TDL_CUSUM_FINALIZATION_FABLE_REVIEW_PACKAGE_V1.md`](TDL_CUSUM_FINALIZATION_FABLE_REVIEW_PACKAGE_V1.md)
