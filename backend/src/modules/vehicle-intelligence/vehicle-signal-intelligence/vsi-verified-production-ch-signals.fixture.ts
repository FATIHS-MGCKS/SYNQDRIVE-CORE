/**
 * Verified production ClickHouse native signal names (90d preflight, 2026-11-02).
 * This is NOT the full DIMO catalog — tests must not treat arbitrary mocks as production coverage.
 *
 * @see architecture/vehicle-signal-intelligence/evidence/VSI_UNIVERSAL_DISCOVERY_PREIMPLEMENTATION_PREFLIGHT_2026-11-02.md
 */
export const VSI_VERIFIED_PRODUCTION_CH_NATIVE_SIGNAL_NAMES = [
  'speed',
  'obdEngineLoad',
  'obdThrottlePosition',
  'powertrainCombustionEngineECT',
  'powertrainCombustionEngineSpeed',
  'powertrainTractionBatteryCurrentPower',
] as const;

export type VsiVerifiedProductionChNativeSignalName =
  (typeof VSI_VERIFIED_PRODUCTION_CH_NATIVE_SIGNAL_NAMES)[number];

/** Tesla cohort subset observed in verified production inventory. */
export const VSI_VERIFIED_PRODUCTION_TESLA_CH_NATIVE_SIGNAL_NAMES = [
  'speed',
  'powertrainTractionBatteryCurrentPower',
] as const;

/** ICE-oriented subset from the verified six-name inventory (canonical-alias coverage varies). */
export const VSI_VERIFIED_PRODUCTION_ICE_CH_NATIVE_SIGNAL_NAMES = [
  'speed',
  'obdEngineLoad',
  'obdThrottlePosition',
  'powertrainCombustionEngineECT',
  'powertrainCombustionEngineSpeed',
] as const;
