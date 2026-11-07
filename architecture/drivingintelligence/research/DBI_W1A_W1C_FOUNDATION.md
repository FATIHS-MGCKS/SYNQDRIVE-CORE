# DBI W1A / W1C foundation (Phase 1, offline)

**Status:** Research contracts only. No production loader, no F04 arming, no API/UI activation.

## W1A — Trusted evidence contract

### Trust planes (not equivalent)

| Plane | W1A may achieve? |
|-------|------------------|
| `STRUCTURE_VALID` | Yes — schema + runtime field validation only (no byte read) |
| `FILE_BYTES_INTEGRITY_VERIFIED` | Reserved naming; W1A promotes to `STRUCTURALLY_BOUND` when loader byte inspection binds all digests |
| `STRUCTURALLY_BOUND` | Yes — manifest + `BYTE_INSPECTION` proofs match declarations |
| `SOURCE_AUTHENTICATED` | **No** — W1B + owner-approved acquisition |
| `SCIENTIFICALLY_ELIGIBLE` | **No** — W1D; `NOT_EVALUATED` preserved |

### Integrity rules

- Structure-only validation never implies hashed bytes (`STRUCTURE_VALID`).
- Detached provenance uses `detachedProvenanceManifestDigestSha256` (digest of manifest body excluding the digest field). No inline self-hash as trust proof.
- `declaredIndependentTrustAnchorSha256` is declarative only in W1A — **not** verified; unequal digests do not imply authenticity.
- Caller-supplied `observed*` digests (`CALLER_DIGEST_CLAIM`) are rejected — not byte proof.
- Raw file SHA-256 and canonical payload digest are **semantically** distinct; values may equal.
- Runtime checks: `speedAuthority` enum, UTC trip bounds, `algorithmVersions.bundle === shadowBundleVersion`, UUID identities, rerun linkage.

## W1C — Trip assessment projector

### Trip outcome state machine (unchanged)

Trip-level typed fail-closed **overrides** metric availability.

| Condition | `tripOutcome` |
|-----------|---------------|
| Trip fail-closed (typed codes only) | `NOT_EVALUABLE` |
| 0 metrics `KNOWN` | `NOT_EVALUABLE` |
| 4 metrics `KNOWN` | `COMPLETE` |
| 1–3 `KNOWN` and ≥1 not `KNOWN` | `PARTIAL` |

### Hardening

- Fail-closed only from `ds4-dbi-w0-fail-closed-codes.v1.ts`; unknown diagnostic codes reject projection.
- Unknown kernel metric statuses reject projection (no silent ABSTAIN).
- `KNOWN` requires finite primary value.
- `kernelInputValidationStatus` vs `sourceAuthenticationStatus` (`NOT_AUTHENTICATED`) vs `sourceIntegrityStatus`.
- D6 multidimensional evidence; D8 window slot counts (no misleading coverage labels).

## Remaining work

| Track | Requirement |
|-------|-------------|
| **W1B** | Trusted loader with real byte reads + independent anchor verification |
| **W1D** | Scientific eligibility protocol |
| **UI** | Separate trust planes; partial assessment interpretation limits |
