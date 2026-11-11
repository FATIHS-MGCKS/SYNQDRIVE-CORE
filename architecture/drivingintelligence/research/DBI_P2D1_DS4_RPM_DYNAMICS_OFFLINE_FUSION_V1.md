# P2-D1 DS4 Motion × P2-A2 RPM Dynamics Offline Fusion V1

**Operation:** `DBI_P2D1_DS4_RPM_DYNAMICS_OFFLINE_FUSION_V1`  
**Status:** Research-only offline fusion (`ds4-rpm-dynamics-fusion-research-v1`)  
**Time authority:** Shadow label-time hypothesis only — **not** physical synchronization

## Purpose

Attach **event-local** P2-A2 adjacent-delta summaries to existing DS4×RPM shadow-correlation events without mutating shadow Theil–Sen metrics or inventing cross-domain causal edges.

## Reused authorities (no parallel engines)

| Layer | Module |
|-------|--------|
| DS4 shadow events + join | `joinDs4EventsWithRpmEvidenceV1` |
| Provenance | `validateDs4RpmShadowCorrelationProvenanceGate` |
| Source family / R1 | `validateRpmSampleSourceFamilyAuthority` + `resolveTelemetrySourceFamily` |
| RPM dynamics | `computeDs4RpmDynamicsResearchV1` (P2-A2, unchanged) |
| Label canon | `canonicalizeDs4RpmResearchPoints` on fingerprint-bound V1A input |
| Event windows | `parseHalfOpenEventWindowMs` + shadow alignment offset probes |

## Fusion contract (`Ds4RpmDynamicsFusionResearchResultV1`)

Per trip: org/vehicle/trip, motion run id, V1B fingerprint, A2 contract/kernel versions, evidence kind, telemetry source family, `sourceTimestampPhase: UNKNOWN`, `rpmObservationSupportWidthSeconds: UNKNOWN`, trip-level A2 sidecar, scientific guards, unsupported claims list.

Per event: motion attributes, **verbatim** `shadowCorrelation` payload, fusion classification, event-local dynamics block (or null), alignment envelope copy, dynamics alignment sensitivity diagnostics (pair counts per offset), limitation flags.

## Event-local analysis rules

1. Filter full-trip A2 `adjacentDeltas` where **both** canonical endpoints lie in the shifted half-open DS4 window.
2. Match `globalIdx` only against the canonical lattice from bound V1A points.
3. Respect A2 sequence boundaries (pairs never cross gaps).
4. Summarize rise/fall/flat counts, reversal count, delta magnitude range, label gaps.
5. Alignment sensitivity reuses shadow `offsetSecondsProbed` — diagnostic pair counts only.
6. No fabricated points, no dRPM/dt, no causal DS4→RPM claims.

## Binding closeout (P2-D1 F1–F4)

- **F1:** `validateDs4RpmDynamicsFusionBindingGate` resolves DIMO family via `resolveTelemetrySourceFamily`; R1 via `hasUncertainHistoricalObdRecordTime`; cross-checks RPM sample family metadata (`TELEMETRY_SOURCE_FAMILY_CONTRADICTS_DIMO_IDENTITY`).
- **F2:** Recomputes V1B fingerprint from A2 `tripInput`; rejects cross-plane org/vehicle/trip/link, fingerprint, RPM points, and motion event/payload mismatches before event-local work.
- **F3:** Requires `evidenceKind` parity on input vs provenance gate; blocks `REAL_OBSERVATION` when gate is synthetic; enforces A2 `evidenceOrigin` compatibility.
- **F4:** Event-local `countEventLocalDirectionReversals` resets non-FLAT trend memory on `sequenceIndex` change (no gap-crossing reversals); plateaus preserved within a sequence.

## Mandatory gates (trip block → fusion `UNAVAILABLE`)

- R1: `R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED` (hard block via source-family authority)
- `SOURCE_FAMILY_BINDING_UNPROVEN` (REAL_OBSERVATION / attestation)
- `TELEMETRY_SOURCE_FAMILY_UNKNOWN` (resolved `UNKNOWN` family — no trusted fusion)
- Provenance gate failure (fingerprint / points digest / evidence source)
- A2 `ABSTAINED` (trip-level block; A2 abstain detail remains on `dynamicsTripResult`)

DS4-only shadow metrics remain unchanged when fusion is blocked (stored on each event).

## Scientific guards (always true in V1)

No physical sync, no causal RPM response to DS4 events, no gear-shift confirmation, no engine-load-from-RPM-alone, no misuse/scoring, R1 temporal fusion ineligible, unknown family untrusted.

## Validation

- `backend` Jest: `ds4-rpm-dynamics-fusion-research.kernel.spec.ts` (20 synthetic adversarial scenarios)
- Regressions: P2-A2 kernel, shadow-correlation replay, R1 temporal containment

## Illustrative event-local report

See `DBI_P2D1_FUSION_ILLUSTRATIVE_EVENT_REPORT.v1.json` for a single-event research-only example shape (synthetic fixture; not production data).

## Out of scope

Production scheduling, customer UI, P2-E scoring, P2-C reconciliation changes, P2-A1/A2 kernel edits, real-data executor wiring (see `DBI_P2D2_REAL_DATA_REQUIREMENTS.md`).
