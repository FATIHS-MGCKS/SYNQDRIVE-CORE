# DBI W1A / W1C foundation (Phase 1, offline)

**Status:** Research contracts only. No production loader, no F04 arming, no API/UI activation.

## W1A — Trusted evidence contract

### Trust planes (not equivalent)

| Plane | W1A may achieve? |
|-------|------------------|
| `FILE_INTEGRITY_VERIFIED` | Yes (manifest schema valid, no binding) |
| `STRUCTURALLY_BOUND` | Yes (manifest + observed SHA bindings match) |
| `SOURCE_AUTHENTICATED` | **No** — requires W1B + owner-approved acquisition |
| `SCIENTIFICALLY_ELIGIBLE` | **No** — requires W1D protocol; `NOT_EVALUATED` preserved |

### Boundaries

- Caller attestation (`CALLER_ATTESTATION_UNTRUSTED`) is never an independent trust anchor.
- Provenance manifest hash must not equal the independent anchor alone.
- `speedAuthority` is required on trusted manifests; historical C4 estimator inference is **not** accepted as trusted authority.
- Raw file SHA-256 and canonical JSON payload digest are distinct fields.
- `sourceMotionRunId` must differ from `tripId`; `sameTripShadowRerunOfRunId` must not equal `tripId`.

**Non-effects:** `DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1 = false`, `sealedRealC4StatisticalEligibility: false`, `F04_TRUST_GATE` unchanged.

## W1C — Trip assessment projector

### Metric eligibility (from W0 kernel status)

- `KNOWN` ← kernel `KNOWN`
- `ABSTAIN` / `NOT_AVAILABLE` ← kernel statuses
- `BLOCKED_FAIL_CLOSED` when trip-level fail-closed reasons are present (typed codes from `ds4-dbi-w0-fail-closed-codes.v1.ts`)

### Trip outcome state machine

Trip-level fail-closed **overrides** metric availability.

| Condition | `tripOutcome` |
|-----------|---------------|
| Trip fail-closed | `NOT_EVALUABLE` |
| 0 metrics `KNOWN` | `NOT_EVALUABLE` |
| 4 metrics `KNOWN` | `COMPLETE` |
| 1–3 `KNOWN` and ≥1 not `KNOWN` | `PARTIAL` |

`COMPLETE` means **metric availability only** — not scientific validation. No composite score, imputation, or weight redistribution.

### Examples

- **TIG22 (canonical kernel):** D4/D5/D6 `KNOWN`, D8 `ABSTAIN` → `PARTIAL` (preserve D8 reason e.g. `MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW` on canonical path).
- **Source integrity failure:** all metric values nulled; `NOT_EVALUABLE`.

## Remaining work

| Track | Requirement |
|-------|-------------|
| **W1B** | Owner-approved trusted loader implementing `Ds4DbiW1TrustedEvidenceLoaderV1`, independent manifest verification, `SOURCE_AUTHENTICATED` gate |
| **W1D** | Scientific eligibility protocol; must not conflate with W1C `COMPLETE` |
| **UI** | Present trust planes separately; partial assessments must show interpretation limits |
