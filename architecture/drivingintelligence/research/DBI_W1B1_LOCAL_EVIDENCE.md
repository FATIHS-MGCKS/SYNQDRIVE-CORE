# DBI W1B1 — Local byte verification loader

**Phase:** DBI Phase 1 W1B1 (offline, research only)

## Path and size rules

- Repo-relative paths only: reject absolute paths and any `..` segment **before** normalization.
- `lstat` on the requested path entry rejects symlinks before `realpath`.
- Payload/manifest reads use size precheck + bounded `readSync` (no unbounded `readFileSync`).

## Maximum trust level

W1B1 may achieve **`STRUCTURALLY_BOUND`** when:

1. Payload and manifest paths resolve under fixture allowlists (no traversal/symlink escape).
2. Raw file SHA-256 and canonical payload digest match manifest declarations (computed by loader).
3. Detached manifest digest matches canonical sorted-key JSON of manifest body (excluding digest field).
4. `payload.contract.speedAuthority` is present and equals manifest (no C4 estimator inference).
5. Bundle version matches between payload contract and manifest.

W1B1 **never** produces `SOURCE_AUTHENTICATED` or `SCIENTIFICALLY_ELIGIBLE`.

## Digest semantics (`ds4-dbi-w1b1-digest-semantics.v1.ts`)

| Name | Definition |
|------|------------|
| `RAW_FILE_SHA256` | SHA-256 of on-disk file bytes |
| `CANONICAL_PAYLOAD_DIGEST` | SHA-256 of `JSON.stringify(parsedPayload)` (W0 kernel) |
| `MANIFEST_DIGEST` | SHA-256 of sorted-keys JSON of W1A body **without** `detachedProvenanceManifestDigestSha256` |
| `INDEPENDENT_TRUST_ANCHOR` | Declared only; **not** verified in W1B1 (W1B2) |

Identical raw/canonical hex values are valid when byte sequences align (e.g. TIG22 pretty JSON equals parse canonicalization).

## Historical TIG22 / TIG22_V4

Frozen recordings omit `contract.speedAuthority`. W1B1 **rejects** strict source binding with `PAYLOAD_SPEED_AUTHORITY_MISSING` after byte integrity checks. This is expected — do not retrofit trusted authority onto historical exports.

Lower-trust historical replay (`ds4-dbi-w0-historical-replay.loader.v1.ts`, RELAXED tier) remains separate.

## Synthetic positive fixture

`architecture/drivingintelligence/research/fixtures/w1b1-synthetic-positive-v1/` proves the byte mechanism. Classification stays **SYNTHETIC** — not real-world validation.

## Offline replay

`runDs4DbiW1b1OfflineReplayV1` runs W0 kernel + W1C **only** after successful W1B1 load. Verification failure → no kernel, no partial assessment masquerading as trusted.

## W1B2 prerequisites

- Owner-approved independent trust anchor verification
- Authorized real-data export pipeline
- Optional production-sealed manifest envelopes (no self-referential hashes)

## Non-effects

`DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1=false`, F04 unchanged, no API/UI, no persistence.
