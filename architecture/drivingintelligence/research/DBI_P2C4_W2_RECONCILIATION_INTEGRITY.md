# DBI P2-C4 W2 — P2-C3 reconciliation integrity

**Base:** `da1a958abcda911eb32a1b45c69642e875a92180`  
**Scope:** P2-C3 engine only (no A1/B1–B4 kernel changes, no W1 semantics changes).

## Findings remediated

| ID | Before | After | Test oracle | Implementation |
|----|--------|-------|-------------|----------------|
| P1-04 | `ABSTAINED` B1 + duplicate `KICKDOWN_LIKE_PROXY_CANDIDATE` → `SAME_SOURCE_DUPLICATE` | `ok: false`, `PARTICIPANT_CONTRADICTORY_POSITIVE_UNDER_ABSTAIN` | `w2-integrity.spec.ts` #01 | `dbi-p2c3-reconciliation.participant-integrity.v1.ts` |
| P1-04b | `NOT_OBSERVED` + positive inventory admitted to pairwise | Fail-closed `PARTICIPANT_CONTRADICTORY_POSITIVE_UNDER_NOT_OBSERVED` | #02 | same |
| Adapter claim forge | `adapterClaimsPositiveEvidence` true under abstain | `PARTICIPANT_ADAPTER_POSITIVE_CLAIM_CONTRADICTION` | #03 | `computeAdapterClaimsPositiveEvidence` recomputation |
| B2/B3/B4 module drift | Forged headers inconsistent with candidates | Module-specific diagnostic codes | #05–#11 | integrity validators |
| A1 composite | Source link / v1b mismatch across descriptive + proxy planes | `A1_PROXY_*` codes + identity `A1_*` contradiction fields | #12–#14 | integrity + `identity.v1.ts` |
| Duplicate planes | Two identical participant identities | `DUPLICATE_PARTICIPANT_PLANE_IDENTITY` | #15 | canonical identity key |
| Malformed input | Uncaught `TypeError` on `null` bundle | `BUNDLE_INPUT_SHAPE_INVALID` | #17 | `bundle-shape.v1.ts` |

## W2 closeout (P1-01 / P1-02 / P2-01 / P2-02)

| Control | Diagnostic | Tests |
|---------|------------|-------|
| Deep nested bundle shape | `BUNDLE_NESTED_SHAPE_INVALID` | `w2-closeout.spec.ts` |
| Kernel status enum | `PARTICIPANT_KERNEL_STATUS_INVALID` | closeout unknown-status |
| Duplicate plane (status-independent) | `DUPLICATE_PARTICIPANT_PLANE_IDENTITY` | closeout #08–#09 |
| A1 meta status agreement | `A1_METADATA_STATUS_MISMATCH` | closeout |
| B4 facet inventory counts | `B4_FACET_CANDIDATE_COUNT_MISMATCH` | closeout |

P1-04 forged abstain + duplicate positives remains fail-closed (`PARTICIPANT_CONTRADICTORY_POSITIVE_UNDER_ABSTAIN`).

## Required-field + B2 subtype closeout

| Control | Diagnostic | Tests |
|---------|------------|-------|
| Adapter contract required nested fields | `BUNDLE_NESTED_SHAPE_INVALID` | `w2-required-shape-subtype.spec.ts` |
| B2 three-subtype map completeness | `B2_SUBTYPE_ASSESSABILITY_INCOMPLETE` | same |
| B2 forged subtype status | `B2_SUBTYPE_STATUS_INVALID` | same |

## Opus independent re-audit remediation (A-1..A-9)

**Audit base:** `6f78f901943e2b4711dd6121cbf7f64e73092f38`  
**Branch:** `cursor/dbi-p2c4-w2-opus-remediation-2c57`

| Finding | Control | Diagnostic(s) | Oracle |
|---------|---------|---------------|--------|
| A-1 TOCTOU | Isolate via `tryDeepIsolate` before all validation; same snapshot for validate + reconcile | `BUNDLE_INPUT_ISOLATION_FAILED` | `w2-opus-remediation.spec.ts` AUD-15 |
| A-2 relationship eligibility | Reject any candidate under `ABSTAINED`; module classification enum; positive-only `SAME_SOURCE_DUPLICATE` | `CANDIDATE_INVENTORY_UNDER_ABSTAINED_KERNEL`, `CANDIDATE_CLASSIFICATION_INVALID` | AUD-03..05, pairwise |
| A-3 B2 parity | Classification must match `proxyKind`; subtype gate uses classification-resolved kind | `B2_CANDIDATE_CLASSIFICATION_PROXY_KIND_MISMATCH` | AUD-06, AUD-40 |
| A-4 B3 bidirectional | Status/trip class parity + positive ↔ `GAP_AWARE`; `ABSTAINED` → `NOT_ASSESSABLE`/`INSUFFICIENT_OBSERVATIONS` only; `COMPUTED` forbids `NOT_OBSERVED` | `B3_PARTICIPANT_TRIP_CLASSIFICATION_CONTRADICTION`, `B3_PARTICIPANT_STATUS_TRIP_CLASS_CONTRADICTION` | AUD-35..38, N-08, N-09 |
| A-5 runtime enums | A1/B3/B4 trip/facet status sets | `PARTICIPANT_ENUM_VALUE_INVALID` | AUD-07,08,31 |
| A-6 A1 NOT_APPLICABLE | Episodes forbidden when `NOT_APPLICABLE` | `A1_NOT_APPLICABLE_WITH_EPISODES` | AUD-32 |
| A-7 identity canon | Declared identity keys only; canonical duplicate key | `PARTICIPANT_IDENTITY_EXTRA_FIELD` | AUD-10,11 |
| A-8 malformed | Clone + canonical fail-closed (no throw); projection fields JSON-safe before digest | `BUNDLE_INPUT_ISOLATION_FAILED`, `CANDIDATE_PAYLOAD_CANONICAL_INVALID`, `PARTICIPANT_PROJECTION_CANONICAL_INVALID` | AUD-11..14, AUD-41/42, N-03..06 |
| A-9 extra B2 subtype | Unknown subtype keys rejected | `B2_SUBTYPE_ASSESSABILITY_EXTRA_KEY` | AUD-17 |

Full replay: `w2-opus-remediation.spec.ts` (39 probes incl. N-03..09) + `w2-final-reaudit.probe.spec.ts` (N-01..19). P3: B1 support-tier enum (N-12) nonblocking.

## Opus final two-blocker closeout (2026-11-09)

| Blocker | Fix | Oracle |
|---------|-----|--------|
| P1-A8 projection throw | `participant-projection-json-safety.v1` on digest-bound participant fields | N-03..06 |
| P2-A4 B3 negative gap | B3 status ↔ trip class extensions in `participant-integrity` | N-08, N-09 |

## Limitations

- Integrity validates **adapter-reported** fields only; it does not re-run DS4 kernels or attest sources.
- Composite A1+B1 bundles in tests must align `providerSourceLinkId` / `v1bInputFingerprint` when A1 reports them (same as production bundle assembly expectations).
- W2 dual-facet test helper synthesizes one participant from two legitimate single-facet adapter runs for envelope tests only — not a production adapter path.
