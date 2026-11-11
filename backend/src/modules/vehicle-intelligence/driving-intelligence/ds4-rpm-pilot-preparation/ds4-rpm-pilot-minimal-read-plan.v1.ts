import type {
  Ds4RpmPilotMinimalReadPlanSliceV1,
  Ds4RpmPilotPreparationTargetCohortV1,
} from './ds4-rpm-pilot-preparation.contract.v1';

export function buildDs4RpmPilotMinimalReadPlanV1(
  cohort: Ds4RpmPilotPreparationTargetCohortV1,
): Ds4RpmPilotMinimalReadPlanSliceV1 {
  return {
    cohortVehicleLabel: cohort,
    sources: [
      {
        evidenceContract: 'ds4-rpm-real-data-replay-loader-v1',
        tableOrEndpoint: 'Postgres: Vehicle, Trip, DimoVehicle, provider source link tables',
        identityFilters: [
          'organizationId (owner-approved)',
          'vehicleId (owner-approved)',
          'tripId allowlist',
          'providerSourceLinkId exact match',
        ],
        allowedTimestampWindow: 'OWNER_BOUNDED_ISO_WINDOW_ONLY',
        maxPlannedResponseRows: 10_000,
        queryBudgetUnits: 100,
        snapshotConsistency: 'Single read-only transaction snapshot per extraction slice',
        integrityFingerprint: 'computeDs4RpmRealDataOfflineBundleInputFingerprintV1 + attestation provenance fingerprint',
        redactionRules: [
          'DimoVehicle.rawJson → digest only in artifacts',
          'No aftermarket serials or tokens in research exports',
        ],
      },
      {
        evidenceContract: 'ds4-rpm-hf-v1a / v1b shadow',
        tableOrEndpoint: 'Persisted V1B shadow summaries + V1A trip inputs',
        identityFilters: ['Same trip binding as RPM HF window'],
        allowedTimestampWindow: 'OWNER_BOUNDED_ISO_WINDOW_ONLY',
        maxPlannedResponseRows: 5_000,
        queryBudgetUnits: 50,
        snapshotConsistency: 'Match trip row timestamps to HF window',
        integrityFingerprint: 'computeDs4RpmHfV1bTierAwareInputFingerprint',
        redactionRules: ['No cross-tenant rows'],
      },
      {
        evidenceContract: 'di-v0-motion-core-shadow',
        tableOrEndpoint: 'Persisted motion shadow runs + event rows',
        identityFilters: ['org/vehicle/trip/motionRunId binding'],
        allowedTimestampWindow: 'OWNER_BOUNDED_ISO_WINDOW_ONLY',
        maxPlannedResponseRows: 20_000,
        queryBudgetUnits: 100,
        snapshotConsistency: 'Pin motionRunId before event export',
        integrityFingerprint: 'Motion payload content fingerprint (external attestation)',
        redactionRules: ['Unverified injected fingerprints excluded from production proof'],
      },
      {
        evidenceContract: 'ClickHouse HF RPM/speed',
        tableOrEndpoint: 'CLICKHOUSE bounded HF query (future — not executed P2-D2B)',
        identityFilters: ['organizationId', 'vehicleId', 'providerSourceLinkId', 'approved ISO window'],
        allowedTimestampWindow: 'OWNER_BOUNDED_ISO_WINDOW_ONLY',
        maxPlannedResponseRows: 50_000,
        queryBudgetUnits: 200,
        snapshotConsistency: '1s AVG buckets only — no interpolation',
        integrityFingerprint: 'Canonical RPM points bound to V1A fingerprint',
        redactionRules: ['No live query in pilot preparation phase'],
      },
    ],
    authorizationMetadataRequired: [
      'Ds4RpmRealDataPilotReadAuthorizationContextV1',
      'ownerAttestationReference',
      'trustedEvaluatedAtIso from executor boundary',
      'Separate owner production-read approval (out of scope PR-B3 scope checks)',
    ],
    auditTrailRequirements: [
      'Ds4RpmRealDataPilotReadAuditEntryV1 per slice',
      'Record abstain reasons and UNVERIFIED dimensions',
      'Archive code SHA + contract versions',
    ],
    productionReadPermitted: false,
    ownerApprovalRequired: true,
  };
}
