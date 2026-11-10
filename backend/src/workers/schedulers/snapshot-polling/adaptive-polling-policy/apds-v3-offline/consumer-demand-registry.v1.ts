export const APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION =
  'APDS_V3_CONSUMER_DEMAND_V1' as const;

export type ConsumerFreshnessRequirement =
  | { kind: 'KNOWN_MAX_AGE_MS'; maxAgeMs: number; provenance: string }
  | {
      kind: 'UNCALIBRATED_ASSUMPTION';
      assumedMaxAgeMs: number;
      provenance: string;
    }
  | { kind: 'UNKNOWN' };

export type ConsumerDemandEntry = {
  consumerId: string;
  dataSource: 'DIMO_SNAPSHOT' | 'INDEPENDENT_STREAM' | 'HISTORICAL_FETCH';
  signalGroup: string;
  freshness: ConsumerFreshnessRequirement;
  hardSafety: boolean;
  softPreference: boolean;
  tripStateDependent: boolean;
  wakeRecoveryOverride: boolean;
  missingDataBehavior: 'FAIL_CLOSED_POLL' | 'DEGRADE_UNKNOWN' | 'NOT_APPLICABLE';
  requirementProvenance: string;
};

/**
 * Read-only consumer demand registry — grounded in verified SNAPSHOT-backed paths.
 * Independent streams (DIMO segments webhooks, etc.) are listed with NOT_APPLICABLE snapshot demand.
 */
export const APDS_V3_CONSUMER_DEMAND_REGISTRY_V1: readonly ConsumerDemandEntry[] = [
  {
    consumerId: 'LV_BATTERY_V2',
    dataSource: 'DIMO_SNAPSHOT',
    signalGroup: 'STRICT_LV_PROVIDER_SOURCE',
    freshness: {
      kind: 'UNCALIBRATED_ASSUMPTION',
      assumedMaxAgeMs: 3_600_000,
      provenance:
        'LV rest-window engineering default (getRest60mDelayMs) — not a certified snapshot skip limit',
    },
    hardSafety: true,
    softPreference: false,
    tripStateDependent: false,
    wakeRecoveryOverride: true,
    missingDataBehavior: 'FAIL_CLOSED_POLL',
    requirementProvenance: 'backend/src/modules/vehicle-intelligence/battery-health',
  },
  {
    consumerId: 'TRIP_FSM_ORCHESTRATION',
    dataSource: 'DIMO_SNAPSHOT',
    signalGroup: 'SPEED_IGNITION_PROVIDER_WAKE',
    freshness: { kind: 'UNKNOWN' },
    hardSafety: true,
    softPreference: false,
    tripStateDependent: true,
    wakeRecoveryOverride: true,
    missingDataBehavior: 'FAIL_CLOSED_POLL',
    requirementProvenance: 'snapshot-wake + trip-detection-orchestration',
  },
  {
    consumerId: 'VSI_P2C_PROVIDER_SOURCE',
    dataSource: 'DIMO_SNAPSHOT',
    signalGroup: 'TOP_LEVEL_PROVIDER_SOURCE_TIMESTAMP',
    freshness: { kind: 'UNKNOWN' },
    hardSafety: false,
    softPreference: true,
    tripStateDependent: false,
    wakeRecoveryOverride: false,
    missingDataBehavior: 'DEGRADE_UNKNOWN',
    requirementProvenance: 'vsi-provider-source-observation.writer',
  },
  {
    consumerId: 'DTC_VEHICLE_HEALTH',
    dataSource: 'DIMO_SNAPSHOT',
    signalGroup: 'ERROR_CODES',
    freshness: { kind: 'UNKNOWN' },
    hardSafety: false,
    softPreference: true,
    tripStateDependent: false,
    wakeRecoveryOverride: false,
    missingDataBehavior: 'DEGRADE_UNKNOWN',
    requirementProvenance: 'vehicle health error-codes module',
  },
  {
    consumerId: 'DS4_MOTION',
    dataSource: 'INDEPENDENT_STREAM',
    signalGroup: 'MOTION_SIGNALS',
    freshness: { kind: 'UNKNOWN' },
    hardSafety: false,
    softPreference: false,
    tripStateDependent: false,
    wakeRecoveryOverride: false,
    missingDataBehavior: 'NOT_APPLICABLE',
    requirementProvenance: 'DS4 not canonical SNAPSHOT-only consumer',
  },
  {
    consumerId: 'DIMO_SEGMENTS_TRIPS',
    dataSource: 'INDEPENDENT_STREAM',
    signalGroup: 'SEGMENT_BOUNDARIES',
    freshness: { kind: 'UNKNOWN' },
    hardSafety: false,
    softPreference: false,
    tripStateDependent: true,
    wakeRecoveryOverride: false,
    missingDataBehavior: 'NOT_APPLICABLE',
    requirementProvenance: 'DIMO segments canonical trip boundaries',
  },
] as const;

export function listSnapshotBackedConsumers(): ConsumerDemandEntry[] {
  return APDS_V3_CONSUMER_DEMAND_REGISTRY_V1.filter(
    (e) => e.dataSource === 'DIMO_SNAPSHOT',
  );
}
