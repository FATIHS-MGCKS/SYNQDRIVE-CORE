# DS4 DBI W0 — Independent Scientific Architecture Audit

**Operation:** `DS4_DBI_W0_INDEPENDENT_SCIENTIFIC_ARCHITECTURE_AUDIT`  
**Mode:** STRICT READ-ONLY (audit only; no code changes in that session)  
**HEAD reviewed:** `a2f691574c4604ec37d454bca48a66fd83d0fad5`  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Branch context (audit):** `cursor/ds4-dbi-w0-offline-behavior-research-2c57` / PR #2353  

**Timestamp (user zone Europe/Berlin):** Friday, Nov 6, 2026, 11:02 PM (UTC+1)

---

## Verdict summary

**Verdict: BLOCKED for W1.** The W0 code mostly computes what it says, and the provenance labels are honest. But one proven defect stops D8 from working on real trips, and three high-severity issues remain. The 17 passing W0 tests and green CI don't change that, because none of the tests check the scientific behaviour that fails.

This document was produced as a strict read-only audit. HEAD matches expected. Extra checks ran from scratch scripts under `/tmp` (offline CLI `--json`, exact/analytic E9 gate probability, kernel Monte Carlo, sensitivity grid, occupancy-null reproduction). **CI green does not override an unresolved scientific blocker.**

---

## A. Executive verdict

| Question | Answer |
| --- | --- |
| Technically correct? | **Mostly.** D4, D5 and the IOD estimator match their definitions. Unfiltered over all draws, the IOD averages exactly 1 under a uniform null (~1.0000). D8 has one proven meaning error in its observation window. The test harness also has a proven contamination defect. |
| Scientifically defensible? | **Only in part.** D4 and D6 are plausible with known limits. D5 is unclear: it mostly measures the C4 speed estimator. D8 should not be used without more evidence. |
| Ready for W1? | **No.** One blocker, three high findings, and no sealed real-data loader. |

---

## B. Metric review

### D4 (robust speed variability)

- **Definition** (`ds4-dbi-w0-mbf-kernel.v1.ts` ~204–250): MAD of speeds on MOVING + DIRECT labels, divided by median speed. **No unit** (not a classical CV unless scaled e.g. by 1.4826).
- **Gates:** ≥120 labels; median speed ≥5 km/h.
- **Assumptions:** one label ≈ one second; tier filters speed qualities.
- **Verdict categories:** mathematically implementable; scientifically plausible within limits; not independently validated.

### D5 (speed roughness)

- **Definition** (~252–301): mean |Δv| over consecutive 1s pairs where both ends are MOVING + DIRECT. Unit: km/h per second.
- **Upstream:** C4 `robust-path-slope.ts` uses median of pairwise slopes over ±half window — neighbouring seconds share support → smoothed deltas.
- **Verdict categories:** implementable; scientific plausibility INCONCLUSIVE (estimator-dominated); not validated.

### D6 (stop structure)

- **Definition** (~302–458): direct stops/km (min stop duration), median MOVING_DIRECT run, sustained share.
- **Structural selectivity:** no DIRECT stop episodes → NOT_AVAILABLE; zero-stop motorways excluded from KNOWN stops/km.
- **Verdict categories:** implementable; plausible but selective; not validated.

### D8 (event burstiness)

- **Definition** (~461–627): IOD = variance/mean of OK-event counts in 60s bins; `shareNext` = fraction of consecutive inter-event gaps ≤30s.
- **Known issues (audit):** (F01) Es used as wall-clock horizon vs moving-exposure semantics; (F03) support gate censors clustered patterns at low n (e.g. n=12, K=11).
- **No D7** in W0 (types contract lists D4–D8 only in kernel output).

---

## C. E9 statistical audit (13 points)

Reference parameters: Es=660s, nEv=12, 60s windows, K=11, minNonEmpty=10.

1. **IOD estimator:** Correct; unconditional E[IOD]=1 under uniform timing (analytic / Monte Carlo).
2. **Variance (K−1):** Appropriate for sample variance across fixed slots given n.
3. **Selection bias:** Structural — exact P(pass gate) ≈ 0.02252; E[IOD | pass] ≈ 0.283; max IOD that can pass ≈ 0.45 at n=12,K=11. Estimator correct; application restricted by gate.
4. **Occupancy null description:** Partially accurate; construction forces draws in first 10 bins then fills (see CLI sampler).
5. **vs genuine conditional IID uniform:** Occupancy mean IOD ≈ 0.251 (200k repro) vs exact conditional ~0.283 — not equivalent.
6. **Unrestricted interpretability:** Eligibility rate interpretable; 0/50 accepted → no IOD reference from that batch alone.
7. **Abstention counting:** Correct in selection-report builder.
8. **Accepted-only vs unconditional:** Separate fields; unconditional reference for E9 not fully reported alongside accepted-only.
9. **Zero accepts:** Handled (mean null + warnings).
10. **200k provenance:** Value matches theory; hardcoded constant in `ds4-dbi-w0-e9-null-selection-report.v1.ts` — reproducibility script in-repo recommended.
11. **Seeds / rounding / boundaries:** Documented in audit; batch vs long-run occupancy IOD mean discrepancy explained as finite-sample/rare-bin effect.
12. **Uncertainty:** Binomial CIs for rates not in contract; 0.85 hazard threshold is arbitrary.
13. **Diagnostics:** Analytic formula, rejection sampling, CIs, rate-matched nulls for shareNext.

---

## D. Provenance / data integrity

- `evidenceOrigin` defaulting; `NOT_EVALUATED`; sealed CSV ≠ JSON digest — as coded.
- **F04 risk:** caller could set `SEALE_REAL_C4` without verified loader — latent unless guarded.
- **F02:** P2 synth placeholders (1970 events) can remain in `payload.events` after enrichment — harness contamination for several trips.
- **Fingerprint:** `JSON.stringify` order sensitivity vs “canonical digest” claim.

---

## E. Cross-architecture

- W0 research code isolated under `ds4-assessment/research/`; no RPM fusion in diff; no changes to Trip FSM / core kinematics in W0 PR scope per audit.
- Risks: 1 Hz label assumption vs C4 estimator; exposure vs elapsed time (F01); event start uncertainty ignored; trip bounds vs DIMO Segments not enforced in kernel.

---

## F. Test coverage

- 17 tests (kernel + E9 selection report) — pass-fail and fail-closed mostly; **no numeric oracle** (`toBeCloseTo` absent); one unrestricted-null assertion is tautological (`KNOWN` or `ABSTAIN`).
- Distinguish passing tests from demonstrated scientific correctness.

---

## G. W1 readiness gaps

1. Verified sealed-real loader + canonical fingerprint (RFC 8785 or equivalent).
2. Binding payload ↔ trip meta by `sourceMotionRunId`.
3. Preregistered D8 observation horizon (wall-clock vs exposure).
4. Gate-conditional null references per (n, K).
5. Coverage/support stratification.
6. Trip boundaries vs DIMO Segments.
7. Route/traffic cohorts.
8. Preregistered hypotheses + negative controls.
9. Uncertainty (binomial / bootstrap).
10. Reproducible scripts for cited numbers.

---

## H. Prioritized findings (summary)

**Proven defects (examples):** F01 D8 horizon semantics; F02 placeholder leak; F03 gate censorship; F04 sealed-origin loophole; F05 JSON fingerprint; F06 tier scope D6/D8; F07 zero-stop; F09 occupancy label; F10 200k provenance; F11 uncertainty; F16 test gaps.

**Plausible risks:** F08 meta binding; F17 D5 estimator; F18 confounders; F19 duplicate-event blast radius.

**Open questions:** raw position cadence; duplicate event starts from detector; D8 clock domain choice.

*(Full severity tables and remediation bullets as in the chat deliverable — see same IDs.)*

---

## I. Minimum correction plan

**Before W1:** F01, F02, F03, F04, F05, F06, F07, F08, F09, F11, F16, F17, F18 per architect preregistration.

**Do not implement yet:** threshold changes without architect decision; D7; RPM fusion; driver scoring; production wiring; W1 validation claims.

---

## J. Final machine-readable verdict

```
HEAD_SHA=a2f691574c4604ec37d454bca48a66fd83d0fad5
HEAD_MATCH=TRUE
IMPLEMENTATION_CORRECTNESS=CORRECT_AS_CODED_WITH_PROVEN_DEFECTS(F01_D8_HORIZON_SEMANTICS;F02_HARNESS_PLACEHOLDER_LEAK)
D4_SCIENTIFIC_VERDICT=MATHEMATICALLY_IMPLEMENTABLE;SCIENTIFICALLY_PLAUSIBLE_LIMITED;NOT_INDEPENDENTLY_VALIDATED
D5_SCIENTIFIC_VERDICT=MATHEMATICALLY_IMPLEMENTABLE;SCIENTIFIC_PLAUSIBILITY_INCONCLUSIVE(ESTIMATOR_DOMINATED_RISK);NOT_INDEPENDENTLY_VALIDATED
D6_SCIENTIFIC_VERDICT=MATHEMATICALLY_IMPLEMENTABLE;SCIENTIFICALLY_PLAUSIBLE_WITH_STRUCTURAL_SELECTION(ZERO_STOP_EXCLUSION);NOT_INDEPENDENTLY_VALIDATED
D8_SCIENTIFIC_VERDICT=MATHEMATICALLY_IMPLEMENTABLE;UNSUITABLE_WITHOUT_FURTHER_EVIDENCE(ES_WALLCLOCK_MISMATCH;GATE_CENSORSHIP_MAX_IOD_0.45_AT_N12_K11)
E9_NULL_MODEL_VERDICT=ESTIMATOR_CORRECT(E_IOD_UNCONDITIONAL=1.0000);OCCUPANCY_NULL_NOT_GENUINE_CONDITIONAL(0.2509_VS_EXACT_0.2826);UNRESTRICTED_ELIGIBILITY_EXACT_0.0225226;INCOMPLETE
STATISTICAL_SELECTION_VERDICT=STRUCTURAL_SELECTION_BIAS_CONFIRMED_LOW_COUNT_REGIME(N<=12_OR_ES<=900S);NO_UNCERTAINTY_REPORTED
PROVENANCE_VERDICT=CONDITIONAL(LABELS_HONEST;CALLER_ASSERTED_SEALED_REAL_C4_LOOPHOLE;NONCANONICAL_FINGERPRINT;6_OF_11_HARNESS_OUTCOMES_PLACEHOLDER_ARTIFACTS)
CROSS_ARCHITECTURE_VERDICT=ISOLATED_NO_AUTHORITY_VIOLATION;CLOCK_DOMAIN_AND_1S_LABEL_ASSUMPTION_RISKS
TEST_COVERAGE_VERDICT=INSUFFICIENT_FOR_SCIENTIFIC_CORRECTNESS(17_PASS;NO_NUMERIC_ORACLES;ONE_TAUTOLOGICAL_ASSERTION)
W1_REAL_DATA_READINESS=NOT_READY
CRITICAL_FINDINGS_COUNT=1
HIGH_FINDINGS_COUNT=3
REQUIRED_PRE_W1_CORRECTIONS=F01,F02,F03,F04,F05,F06,F07,F08,F09,F11,F16,F17,F18
W0_ARCHITECT_VERDICT=BLOCKED
FINAL_RECOMMENDATION=DO_NOT_ENTER_W1;RESOLVE_F01_BLOCKER_AND_F02_F03_F04_HIGH_UNDER_ARCHITECT_PREREGISTRATION;NO_THRESHOLD_CHANGES_WITHOUT_ARCHITECT_DECISION;CI_GREEN_DOES_NOT_OVERRIDE_SCIENTIFIC_BLOCKER
```

```
ARCHITECTURE_GOVERNANCE
- substantive_change: NO (audit session)
- registry_review: NOT_APPLICABLE
- reason: read-only audit; no registry change for audit narrative only
```

---

## How to share with another agent (ChatGPT, etc.)

- **Local path:** `architecture/drivingintelligence/research/evidence/DS4_DBI_W0_INDEPENDENT_SCIENTIFIC_ARCHITECTURE_AUDIT_2026-11-06.md`
- **After push:** use the repository default branch (or the branch this commit lands on) and open the same path on GitHub — **Raw** URL pattern:  
  `https://raw.githubusercontent.com/FATIHS-MGCKS/SYNQDRIVE-alpha/<branch>/architecture/drivingintelligence/research/evidence/DS4_DBI_W0_INDEPENDENT_SCIENTIFIC_ARCHITECTURE_AUDIT_2026-11-06.md`

Commit message and exact remote URL will be filled after `git push` in the agent summary.
