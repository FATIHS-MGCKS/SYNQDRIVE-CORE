# VSI Signal Integrity Matrix (P0-a)

Schema: `synqdrive.vsi.signal_integrity_matrix.v1`
Audit executed: 2026-10-30T16:15:00.000Z (Europe/Berlin)

## Production verification (read-only)

| Check | Result |
|---|---|
| origin/main SHA | `63626fa211d6f9742aa3d6d6d83daaf44975501c` |
| Production current SHA | `c847a68064da9e27ee9246338f1f67f44e7c7e19` |
| Release | `20261030144630_v4994` |
| Replica 3001 SHA | `NOT_VERIFIED` |
| Replica 3002 SHA | `NOT_VERIFIED` |
| Public health | ok |
| PR #2255 | CODE_PRESENT |
| PR #2256 | NOT_PRESENT |
| PR #2257 | CODE_PRESENT |
| Frontend rpmDual | ARTIFACT_PRESENT |
| Frontend dual provenance test id | ARTIFACT_PRESENT |
| Runtime dual provenance UI | NOT_VERIFIED |

## Query window

- HF history days: 14
- Max finalized trips: 20
- Max RPM HF points: 12000

## Summary

- Canonical signals: 21
- Vehicles: 4
- Matrix rows: 84
- Verified rows: 48
- Not verified rows: 36
- CONFIRMED_BUG: 11
- MISLEADING_PRESENTATION: 5
- SEMANTIC_AMBIGUITY: 12
- INSUFFICIENT_EVIDENCE / hypotheses: 36
- P0 findings: 11
- P1 findings: 13

## Matrix (compact)

| Vehicle | Signal | Applicability | Snapshot | HF | HF samples | Cadence profile | Class | P | Evidence |
|---|---|---|---|---|---|---|---|---|---|
Tesla Model 3 (KS FH 660E)|lv_voltage|UNKNOWN|NEVER_OBSERVED|SUPPORTED_EMPTY|0|UNKNOWN|CONFIRMED_BUG|P0|cadence_provenance_duplicate_entries
Tesla Model 3 (KS FH 660E)|hv_battery_soc|APPLICABLE|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Tesla Model 3 (KS FH 660E)|hv_charging_active|APPLICABLE|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Tesla Model 3 (KS FH 660E)|fuel_level_relative|NOT_APPLICABLE|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|MISLEADING_PRESENTATION|P1|not_applicable_shown_as_never_observed
Tesla Model 3 (KS FH 660E)|engine_rpm|NOT_APPLICABLE|NEVER_OBSERVED|SUPPORTED_EMPTY|0|null|MISLEADING_PRESENTATION|P1|not_applicable_shown_as_never_observed
Tesla Model 3 (KS FH 660E)|vehicle_speed|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P2|freshness_standby_semantics_review
Tesla Model 3 (KS FH 660E)|odometer|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Tesla Model 3 (KS FH 660E)|position_coordinates|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Tesla Model 3 (KS FH 660E)|trip_activity|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Tesla Model 3 (KS FH 660E)|device_connectivity|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P1|declared_support_unknown_outside_p3a_catalog
Tesla Model 3 (KS FH 660E)|provider_source_timestamp|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P1|declared_support_unknown_outside_p3a_catalog
Tesla Model 3 (KS FH 660E)|provider_last_successful_fetch|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|CONFIRMED_BUG|P0|observed_unknown_quality:provider_last_successful_fetch:EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED_BY_CURRENT_EVALUATOR
Tesla Model 3 (KS FH 660E)|device_wake_event|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Tesla Model 3 (KS FH 660E)|device_reconnect_event|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Tesla Model 3 (KS FH 660E)|diagnostic_trouble_code|UNKNOWN|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Tesla Model 3 (KS FH 660E)|tire_pressure|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Tesla Model 3 (KS FH 660E)|warning_indicator|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Tesla Model 3 (KS FH 660E)|provider_catalog_listing|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Tesla Model 3 (KS FH 660E)|provider_authorization_result|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Tesla Model 3 (KS FH 660E)|accelerator_pedal_position|UNKNOWN|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Tesla Model 3 (KS FH 660E)|brake_pedal_position|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|lv_voltage|UNKNOWN|OBSERVED|SUPPORTED_WITH_SAMPLES|256|LV_8H_OBSERVED|CONFIRMED_BUG|P0|cadence_provenance_duplicate_entries
VW Tiguan (WOB L 7503)|hv_battery_soc|NOT_APPLICABLE|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|MISLEADING_PRESENTATION|P1|not_applicable_shown_as_never_observed
VW Tiguan (WOB L 7503)|hv_charging_active|NOT_APPLICABLE|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|fuel_level_relative|APPLICABLE|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Tiguan (WOB L 7503)|engine_rpm|APPLICABLE|NEVER_OBSERVED|SUPPORTED_WITH_SAMPLES|5481|RPM_1HZ|CONFIRMED_BUG|P0|cadence_provenance_duplicate_entries
VW Tiguan (WOB L 7503)|vehicle_speed|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P2|freshness_standby_semantics_review
VW Tiguan (WOB L 7503)|odometer|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Tiguan (WOB L 7503)|position_coordinates|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Tiguan (WOB L 7503)|trip_activity|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|device_connectivity|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P1|declared_support_unknown_outside_p3a_catalog
VW Tiguan (WOB L 7503)|provider_source_timestamp|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P1|declared_support_unknown_outside_p3a_catalog
VW Tiguan (WOB L 7503)|provider_last_successful_fetch|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|CONFIRMED_BUG|P0|observed_unknown_quality:provider_last_successful_fetch:EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED_BY_CURRENT_EVALUATOR
VW Tiguan (WOB L 7503)|device_wake_event|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|device_reconnect_event|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|diagnostic_trouble_code|UNKNOWN|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Tiguan (WOB L 7503)|tire_pressure|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|warning_indicator|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|provider_catalog_listing|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|provider_authorization_result|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Tiguan (WOB L 7503)|accelerator_pedal_position|UNKNOWN|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Tiguan (WOB L 7503)|brake_pedal_position|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|lv_voltage|UNKNOWN|OBSERVED|SUPPORTED_WITH_SAMPLES|256|LV_8H_OBSERVED|CONFIRMED_BUG|P0|cadence_provenance_duplicate_entries
Audi A4 (KS MS 661)|hv_battery_soc|NOT_APPLICABLE|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|MISLEADING_PRESENTATION|P1|not_applicable_shown_as_never_observed
Audi A4 (KS MS 661)|hv_charging_active|NOT_APPLICABLE|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|fuel_level_relative|APPLICABLE|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Audi A4 (KS MS 661)|engine_rpm|APPLICABLE|NEVER_OBSERVED|SUPPORTED_WITH_SAMPLES|2076|RPM_STANDARD|CONFIRMED_BUG|P0|cadence_provenance_duplicate_entries
Audi A4 (KS MS 661)|vehicle_speed|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P2|freshness_standby_semantics_review
Audi A4 (KS MS 661)|odometer|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Audi A4 (KS MS 661)|position_coordinates|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Audi A4 (KS MS 661)|trip_activity|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|device_connectivity|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P1|declared_support_unknown_outside_p3a_catalog
Audi A4 (KS MS 661)|provider_source_timestamp|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P1|declared_support_unknown_outside_p3a_catalog
Audi A4 (KS MS 661)|provider_last_successful_fetch|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|CONFIRMED_BUG|P0|observed_unknown_quality:provider_last_successful_fetch:EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED_BY_CURRENT_EVALUATOR
Audi A4 (KS MS 661)|device_wake_event|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|device_reconnect_event|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|diagnostic_trouble_code|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Audi A4 (KS MS 661)|tire_pressure|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|warning_indicator|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|provider_catalog_listing|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|provider_authorization_result|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
Audi A4 (KS MS 661)|accelerator_pedal_position|UNKNOWN|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
Audi A4 (KS MS 661)|brake_pedal_position|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|lv_voltage|UNKNOWN|OBSERVED|SUPPORTED_WITH_SAMPLES|256|LV_8H_OBSERVED|CONFIRMED_BUG|P0|cadence_provenance_duplicate_entries
VW Arteon (HMÜ C 215)|hv_battery_soc|NOT_APPLICABLE|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|MISLEADING_PRESENTATION|P1|not_applicable_shown_as_never_observed
VW Arteon (HMÜ C 215)|hv_charging_active|NOT_APPLICABLE|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|fuel_level_relative|APPLICABLE|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Arteon (HMÜ C 215)|engine_rpm|APPLICABLE|NEVER_OBSERVED|SUPPORTED_WITH_SAMPLES|1789|RPM_STANDARD|CONFIRMED_BUG|P0|cadence_provenance_duplicate_entries
VW Arteon (HMÜ C 215)|vehicle_speed|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P2|freshness_standby_semantics_review
VW Arteon (HMÜ C 215)|odometer|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Arteon (HMÜ C 215)|position_coordinates|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Arteon (HMÜ C 215)|trip_activity|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|device_connectivity|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P1|declared_support_unknown_outside_p3a_catalog
VW Arteon (HMÜ C 215)|provider_source_timestamp|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|SEMANTIC_AMBIGUITY|P1|declared_support_unknown_outside_p3a_catalog
VW Arteon (HMÜ C 215)|provider_last_successful_fetch|UNKNOWN|OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|CONFIRMED_BUG|P0|observed_unknown_quality:provider_last_successful_fetch:EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED_BY_CURRENT_EVALUATOR
VW Arteon (HMÜ C 215)|device_wake_event|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|device_reconnect_event|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|diagnostic_trouble_code|UNKNOWN|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Arteon (HMÜ C 215)|tire_pressure|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|warning_indicator|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|provider_catalog_listing|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|provider_authorization_result|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot
VW Arteon (HMÜ C 215)|accelerator_pedal_position|UNKNOWN|NEVER_OBSERVED|NOT_SUPPORTED_BY_PIPELINE|null|null|EXPECTED_BEHAVIOR|P3|no_actionable_deviation
VW Arteon (HMÜ C 215)|brake_pedal_position|UNKNOWN|null|NOT_SUPPORTED_BY_PIPELINE|null|null|INSUFFICIENT_EVIDENCE|P3|signal_not_materialized_in_profile_snapshot

## Notes

- PR2256: merge 63626fa is NOT ancestor of production c847a680 (2256 landed on main; production head is 2257 c847a680 — verify with git merge-base on release checkout).
- Replica 3001/3002 SHA: NOT_VERIFIED — pm2 list empty for SSH user synqdrive-admin.
