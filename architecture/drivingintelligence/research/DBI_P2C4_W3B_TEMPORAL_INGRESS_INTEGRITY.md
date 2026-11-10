# DBI P2-C4 W3B — Temporal ingress integrity (W3-047)

**Operation:** `DBI_P2C4_W3B_TEMPORAL_INGRESS_INTEGRITY`  
**Base:** `2e19b4c162d56ab74b10558c49b0b31222afee62` (main after W3A #2387)

## Finding W3-047 (P2)

**Symptom:** P2-C3 could admit directly constructed P2-C2-shaped bundles with malformed provider bucket labels or index intervals even when P2-C2 adapter execution was bypassed.

**Cause:** Temporal validation lived only on the P2-C2 adapter path (`dbi-p2c2-evidence-adapter.temporal.v1.ts`); P2-C3 structural and participant-integrity gates did not re-apply the same semantics on the isolated bundle snapshot.

**Risk:** Forged research bundles could reach identity admission, candidate inventory, pairwise edges, and result digest with invalid calendar dates, non-canonical ISO, reversed intervals, or reversed bucket indices.

## Contract field map (ingress)

| Module | Timestamp fields | Index fields | Index requirement |
|--------|------------------|--------------|-------------------|
| P2-A1 (descriptive episodes) | `providerBucketLabelStartIso`, `providerBucketLabelEndIso` | `startIdx`, `endIdx` | **REQUIRED** (non-negative integer pair) |
| P2-B1 / P2-B2 | `providerBucketLabelStartIso`, `providerBucketLabelEndIso` | `startBucketIndex`, `endBucketIndex` | **REQUIRED** (non-negative integer pair) |
| P2-B3 / P2-B4 | `startProviderBucketLabelIso`, `endProviderBucketLabelIso` | — | **NOT_REQUIRED** (indices not validated; not invented) |

Canonical label rules and interval/index order match P2-C2 `collectTemporalViolations` (`.000Z` millisecond precision, UTC `Z` only, no offsets).

## Red-before (pre-gate)

Structurally valid bundles built by mutating cached adapter planes (no adapter re-run):

| Counterexample | Pre-fix | Post-fix (`W3-047`) |
|----------------|---------|---------------------|
| Invalid calendar date | Could `ok=true` through reconciliation | `INVALID_PROVIDER_BUCKET_LABEL` |
| Non-canonical ISO (no `.000Z`, offset, missing `Z`) | Could pass | `INVALID_PROVIDER_BUCKET_LABEL` |
| End before start (labels) | Could pass | `INVALID_TEMPORAL_INTERVAL_ORDER` |
| `startIdx` / index > end | Could pass | `INVALID_BUCKET_INDEX_ORDER` |
| Missing / wrong-type label fields | Could throw or pass | `INVALID_PROVIDER_BUCKET_LABEL` (fail-closed) |

Rejection contract: `ok=false`, sorted deduplicated diagnostics, **no** inventory, pairwise edges, or success digest.

## Green-after

**Mechanism:** `validateParticipantBundleTemporalIntegrity` in `dbi-p2c3-reconciliation.participant-temporal.v1.ts` runs on the isolated bundle **after** shape validation and **before** bundle structure, participant integrity, identity, inventory, pairwise, or digest.

**Shared authority:** imports `collectTemporalViolations` from P2-C2 temporal module (no duplicated ISO parser).

**W3-B adversarial closeout:** field families keyed by `sourceModule` only; required index pairs for A1/B1/B2 via `INVALID_TEMPORAL_BUCKET_INDEX_SHAPE`.

**P2-C3 diagnostic codes:** `INVALID_PROVIDER_BUCKET_LABEL`, `INVALID_TEMPORAL_INTERVAL_ORDER`, `INVALID_BUCKET_INDEX_ORDER`, `INVALID_TEMPORAL_BUCKET_INDEX_SHAPE`.

## Positive controls

- Genuine P2-C2 adapter outputs for A1, B1–B4 remain accepted.
- Equal start/end timestamps and equal bucket indices permitted when otherwise valid.
- B3/B4 without index fields permitted.
- A1 descriptive-only reconciliation unchanged (no over-rejection of abstained planes).
- Scientific boundaries preserved: `BUCKET_LABEL_UNVERIFIED`, `MODE_A`, no timestamp-only cross-module edges, no A1↔multichannel index join (W3-048 deferred).

## Regression

- `dbi-p2c3-reconciliation.w3-047-temporal-ingress.opus.spec.ts`
- P2-C2 temporal adapter tests, P2-C3 W2 / Opus / W3A suites, `ds4-powertrain-demand|dbi-p2c` aggregate
- `w2-final-reaudit.probe.spec.ts` B3 fixtures include canonical labels (N-11)

## Open debt (unchanged)

- DI-DEF-045 — B1 `candidateSupportTier` enum validation (W3-C)
- W3-048 — index namespace parity (separate workstream)
