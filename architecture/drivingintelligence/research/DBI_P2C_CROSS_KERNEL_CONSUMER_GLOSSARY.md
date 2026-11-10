# DBI P2-C — Cross-kernel consumer glossary (research-only)

**Status:** Preflight authority (P2-C1).  
**Scope:** P2-A1 RPM Episode, P2-B1 Kickdown, P2-B2 Cold Engine, P2-B3 Sustained Load, P2-B4 Revving/Idle.  
**Not in scope:** P2-C2 adapters, reconciliation engine, P2-D DS4×RPM fusion, production detectors.

## Mandatory consumer rules

1. **`COMPUTED` ≠ assessable opportunity** — trip/kernel `status` only means binding admitted (or A1 applicability satisfied). Always read module-specific assessability, `tripEvidenceClassification`, or `highEpisodes.status`.
2. **`NOT_OBSERVED` is not confirmed absence** — no positive proxy in the assessable observation window; behavior outside labels is unknown.
3. **`ABSTAINED` is not automatically fingerprint tampering** — inspect `abstainReasons`. B3 may abstain with sole `INSUFFICIENT_LOAD_LABEL_OBSERVATIONS` while exposing partial trusted load counts.
4. **`sourceProvenanceVerified` is always false** in B1–B4 success paths today; `contentConsistencyVerified` does not replace independent source attestation.
5. **Label spans are not physical duration** — `researchLabelSpanMs`, bucket spans, and A1 grid spans are MODE_A bucket-label semantics (`BUCKET_LABEL_UNVERIFIED`).

## Per-module semantics

### P2-A1 RPM Episode

| Layer | Field | Meaning |
|-------|--------|---------|
| Kernel status | `status` | `COMPUTED` \| `ABSTAINED` \| `NOT_APPLICABLE` (no `NOT_OBSERVED` at trip level) |
| Episode plane | `highEpisodes.status` | `SUPPORTED_DESCRIPTIVE` \| `NOT_OBSERVED` \| `NOT_ASSESSABLE` |
| Binding | `abstainReasons` | v1a/v1b identity, tenant, admission, ICE applicability |
| Assessability | `referenceContext.normalizedEpisodesEligible` | Reference + ICE gates for u-normalized episodes |
| Candidates | `highEpisodes.items` | Descriptive episodes, **not** misuse/proxy candidates |
| Intervals | `startIdx`/`endIdx`, `pointCount` | Inclusive bounds on **`CanonPoint.globalIdx`** for the admitted episode (canonicalized RPM point lattice for the trip binding); **not** local indices within one segmented sequence; **not** multichannel `startBucketIndex`/`endBucketIndex` |
| Sequence identity | `sequenceIndex` (kernel), `sourceSequenceIndex` (adapter) | **`sequenceIndex`:** segmented RPM sequence that produced the episode. **`sourceSequenceIndex`:** verbatim copy of `sourceEpisode.sequenceIndex` in `dbi-p2c2-a1-evidence-adapter.v1.ts` — identifies the source RPM sequence, **not** the ordinal row position in the adapter’s sorted plane (`adapterLocalReference` is separate) |
| Trust | No multichannel fingerprint | `semanticGuards.labelsNotForCrossDomainJoin=true` |

#### P2-A1 cross-domain authority (P2-C)

P2-A1 RPM episodes are **descriptive research outputs only**.

In P2-C, A1 episodes **MUST NOT** participate in cross-domain temporal overlap or event relationship edges with B1–B4.

Matching V1A/V1B fingerprints, source identity, or timestamp labels **do not** override `semanticGuards.labelsNotForCrossDomainJoin=true`.

A future cross-domain alignment policy requires separate scientific review, contract revision, and explicit architect approval.

A1 may appear as a **descriptive participant** in a reconciliation bundle **without** event edges.

### P2-B1 Kickdown

| Layer | Field | Meaning |
|-------|--------|---------|
| Kernel status | `status` | `COMPUTED` if ≥1 `KICKDOWN_LIKE_PROXY_CANDIDATE`; else `NOT_OBSERVED` |
| Assessability | *(none explicit)* | Movement completeness admits detection; do not invent facet assessability |
| Evidence | `kickdown.candidates` | Kickdown-like proxy only |
| Intervals | `startBucketIndex`/`endBucketIndex` + provider bucket label isos | **Multichannel powertrain demand bucket grid** (distinct namespace from A1 `startIdx`/`endIdx`) |
| Fingerprints | v1b + multichannel | Required for binding |

### P2-B2 Cold Engine

| Layer | Field | Meaning |
|-------|--------|---------|
| Kernel status | `status` | `COMPUTED` if candidates; else `NOT_OBSERVED` (independent of subtype assessability) |
| Assessability | `coldEngine.subtypeAssessability` | Per `COLD_ENGINE_*` kind: `ASSESSABLE` \| `NOT_ASSESSABLE` |
| Evidence | `coldEngine.candidates` | Cold-engine proxy candidates by `proxyKind` |
| Scope | `coverageEvidence.localCoverageScope` | ECT-labelled buckets; full-trip cold state unknown |

### P2-B3 Sustained Load

| Layer | Field | Meaning |
|-------|--------|---------|
| Kernel status | `status` | `NOT_OBSERVED` only when `tripEvidenceClassification===NOT_OBSERVED`; else `COMPUTED` |
| Abstain | Sole `INSUFFICIENT_LOAD_LABEL_OBSERVATIONS` | Trip `ABSTAINED` but partial load counts may be trusted |
| Assessability | *(none explicit)* | Encoded in `tripEvidenceClassification` |
| Evidence | `sustainedLoad.candidates` | Gap-aware sustained proxy |
| Intervals | `researchLabelSpanMs` | Label span, not physical duration |

### P2-B4 Revving / Idle

| Layer | Field | Meaning |
|-------|--------|---------|
| Kernel status | `status` | `ABSTAINED` \| `NOT_OBSERVED` (both facets) \| `COMPUTED` |
| Assessability | `facetA/B.assessability` | Per-facet opportunity |
| Evidence | `tripEvidenceClassification` | Per-facet verdict after detection |
| Coverage | `coverageEvidence` | **Exactly six keys** (grid + channel presence); root holds `distinctMsLabelsInTrip` |
| Zero-RPM admitted | `status=COMPUTED` | Both facets `NOT_ASSESSABLE` possible — not an evaluated rev/idle result |

## Index namespace authority (W3-048)

| Authority | Fields | Scientific meaning | Cross-domain rule |
|-----------|--------|-------------------|-------------------|
| **A1 RPM episode** | `sequenceIndex` | Index of the **segmented RPM sequence** passed into v1a episode detection for this item | **MUST NOT** be read as B-grid bucket index or adapter list ordinal |
| **A1 RPM episode** | `startIdx`, `endIdx` | Inclusive **`CanonPoint.globalIdx`** bounds from kernel (`seq[start].globalIdx` … `seq[end].globalIdx`); global canonicalized RPM points, not local indices within one sequence | **MUST NOT** be read as `startBucketIndex`/`endBucketIndex` |
| **A1 adapter plane** | `sourceSequenceIndex`, `crossDomainJoinEligible: false` | `sourceSequenceIndex` = kernel `sequenceIndex` copy; explicit join prohibition | Never eligible for B-side relationship inventory |
| **B1/B2 proxy** | `startBucketIndex`, `endBucketIndex` | Multichannel bucket grid windows for kickdown/cold-engine proxies | Comparable **only within** the same B module envelope |
| **P2-C2 temporal normalization** | Maps A1 `startIdx`/`endIdx` into temporal interval **validator** slots | Shared ISO/order checks only; **not** a semantic merge of namespaces | Does not authorize joins or inventory promotion |
| **P2-C3 reconciliation** | Separate temporal collectors per `sourceModule` | A1 episodes descriptive-only; indices validated independently | No pairwise edges with `P2-A1`; equal numbers/labels **do not** imply alignment |

**Consumer misuse prevented (not a runtime defect claim):** Treating equal `startIdx` and `startBucketIndex`, or equal provider bucket label isos across A1 and B1, as evidence of one event or inventory identity — **rejected by architecture** and guarded by `w3-048-index-namespace.opus.spec.ts`.

## P2-C2/C3 design constraints (not implemented in P2-C1)

- P2-A1 episodes: descriptive only; no cross-domain event edges to B1–B4 in P2-C (see **P2-A1 cross-domain authority** above).
- No physical event overlap inference from label timestamps alone.
- No `overlapLabelCount` without concrete shared label sets.
- Identity mismatch (tenant/trip/source link/fingerprint) ⇒ **reject reconciliation**, not `UNRELATED`.
- No default candidate suppression, scoring rollup, or DS4 Motion fusion in P2-C.
- No DB writer, persistent outbox, or provider/production queries in P2-C.
- Timestamp-only “synchronization” is insufficient for relationship edges.

## References

- Contracts: `ds4-rpm-episode-research.contract.v1.ts`, `ds4-powertrain-demand-research.contract.v1.ts`
- Consumer tests: `ds4-powertrain-demand-research.consumer-gating.spec.ts`
