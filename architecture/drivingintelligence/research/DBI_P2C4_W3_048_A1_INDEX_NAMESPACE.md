# DBI P2-C4 W3-048 — A1 index namespace priming

**Operation:** `DBI_P2C4_W3B_PRIME_A1_INDEX_NAMESPACE`  
**Base:** `9d773eb4f35230b0c14de96404d44daf84ae809d` (main after W3-B #2390)  
**Mode:** Non-breaking semantic authority (documentation + consumer guard tests)

## Finding W3-048 (P2 — preventive)

**Risk:** Future consumers could misread equal numeric indices or equal provider bucket label isos across P2-A1 descriptive episodes and P2-B1/B2 multichannel candidates as identity, overlap, or event-join evidence.

**Classification:** **Prevented future consumer misuse** — not a claim that a production runtime defect was fixed by documentation alone. Repository audit found **no** P2-C3 pairwise path joining A1 `startIdx` with B `startBucketIndex`.

## Index authorities (canonical)

| Namespace | Primary fields | Meaning |
|-----------|----------------|---------|
| A1 RPM episode | `startIdx`, `endIdx`, `sequenceIndex` | v1a RPM lattice episode bounds |
| A1 adapter envelope | `sourceSequenceIndex`, `crossDomainJoinEligible: false` | Descriptive plane ordering; join forbidden |
| B1/B2 proxy | `startBucketIndex`, `endBucketIndex` | Multichannel bucket grid span for demand proxies |

P2-C2 `collectTemporalDiagnostics` maps A1 indices into temporal **validator** slots only. P2-C3 `validateParticipantBundleTemporalIntegrity` reads A1 and B field families separately by module.

## Executable guards

`dbi-p2c3-reconciliation.w3-048-index-namespace.opus.spec.ts`:

- Equal A1/B1 indices + equal isos → no A1 inventory, no A1 pairwise edges, no authorized positive cross edges
- Matching fingerprints → A1 remains descriptive-only
- B1 `SAME_SOURCE_DUPLICATE` positive control preserved
- No `POSSIBLE_LABEL_INTERVAL_OVERLAP` / `overlapLabelCount` from label equality alone

## Scientific boundaries (unchanged)

- No A1↔B event edges
- No physical timestamp inference from bucket labels
- No bucket-label-only relationship edges
- W1/W2/W3A/W3B behavior preserved

## References

- `DBI_P2C_CROSS_KERNEL_CONSUMER_GLOSSARY.md` — Index namespace authority (W3-048)
- `DBI_P2C3_OFFLINE_EVIDENCE_RECONCILIATION.md` — descriptive-only A1 authority
