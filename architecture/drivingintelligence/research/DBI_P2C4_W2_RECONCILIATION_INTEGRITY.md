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

## Limitations

- Integrity validates **adapter-reported** fields only; it does not re-run DS4 kernels or attest sources.
- Composite A1+B1 bundles in tests must align `providerSourceLinkId` / `v1bInputFingerprint` when A1 reports them (same as production bundle assembly expectations).
- W2 dual-facet test helper synthesizes one participant from two legitimate single-facet adapter runs for envelope tests only — not a production adapter path.
