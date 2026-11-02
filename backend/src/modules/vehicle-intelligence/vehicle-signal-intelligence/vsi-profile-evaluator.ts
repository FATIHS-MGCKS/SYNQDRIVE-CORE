import { getVsiCanonicalSignalDefinition } from './canonical-signal-keys';
import { composeReadonlyVehicleSignals } from './vsi-readonly-composer.engine';
import type { VsiDeclaredCatalogSnapshot } from './vsi-declared-catalog.resolver';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import type { VsiConnectionIdentityProjection } from './vsi-readonly-composer.types';
import type {
  VsiLatestStateSnapshot,
  VsiPollLogRow,
  VsiSourceLinkRow,
} from './vsi-readonly-composer.types';
import {
  VSI_PROFILE_CONTRACT_VERSION,
  VSI_PROFILE_MATERIALIZATION_KEYS,
  mapVsiCatalogToDeclaredSupport,
  type VsiProfileEvaluationDraft,
  type VsiProfileMaterializationKey,
  type VsiProfileSignalSnapshotV1,
} from './vsi-profile.types';
import { VSI_P1_SIGNAL_KEYS } from './vsi-readonly-composer.types';
import {
  extractProfileSignalEmpirical,
  isProfileEmpiricalExtractorImplemented,
} from './vsi-profile-empirical-extractor';
import type { VsiDtcConfirmedCompleteEvidence } from './vsi-dtc-complete-evidence.util';
import {
  VSI_LIMITATION_EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED,
  VSI_LIMITATION_PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT,
} from './vsi-profile-empirical.constants';
import {
  resolveStrictSourceAdvanceEvidence,
  isLatestStateAttributedToLink,
} from './vsi-readonly-composer.evidence';
import {
  resolveProviderLastSuccessfulFetchFreshness,
  VSI_LIMITATION_PROVIDER_LAST_SUCCESSFUL_FETCH_WALL_CLOCK_NOT_PHYSICAL_SIGNAL,
} from './vsi-provider-last-successful-fetch-meta.util';
import type { VehicleRegistryLifecycle } from '@prisma/client';
import {
  VsiEmpiricalObservationStatus,
  type VsiEvidenceOrigin,
} from './vehicle-signal-evidence.contract';
import { applyVsiProfileSignalPowertrainApplicability } from './vsi-signal-powertrain-applicability.util';

export type VsiProfileEvaluatorInput = {
  organizationId: string;
  vehicleId: string;
  registryLifecycle: VehicleRegistryLifecycle | 'UNKNOWN';
  hardwareTypeLegacy: string;
  link: VsiSourceLinkRow;
  identity: VsiConnectionIdentityProjection;
  latestState: VsiLatestStateSnapshot | null;
  pollLogs: readonly VsiPollLogRow[];
  declaredCatalog: VsiDeclaredCatalogSnapshot;
  priorAggregatedSourceTimestamp?: Date | null;
  priorProvenStrictSourceAdvanceAt?: Date | null;
  projectionAsOf?: Date;
  dtcConfirmedComplete?: VsiDtcConfirmedCompleteEvidence | null;
  /** Vehicle registry / Spec V3 fuel type (Prisma FuelType string). */
  fuelType?: string | null;
};

function isoOrNull(
  value: Date | 'NOT_MEASURED' | 'UNKNOWN' | null | undefined,
): string | null {
  if (value instanceof Date) return value.toISOString();
  return null;
}

function mergeEmpiricalRow(
  key: VsiProfileMaterializationKey,
  composerSignals: ReturnType<typeof composeReadonlyVehicleSignals>['signals'],
  declaredCatalog: VsiDeclaredCatalogSnapshot,
  catalogResolver: Pick<VsiDeclaredCatalogResolver, 'catalogForCanonicalKey'>,
  empiricalContext: {
    latestState: VsiLatestStateSnapshot | null;
    stateAttributed: boolean;
    projectionAsOf: Date;
    providerSourceLinkId: string;
    dtcConfirmedComplete: VsiDtcConfirmedCompleteEvidence | null;
  },
): VsiProfileSignalSnapshotV1 {
  const def = getVsiCanonicalSignalDefinition(key);
  const native = def.primaryDimoSignalName ?? key;
  const descriptor = composerSignals.find((s) => s.identity.canonicalSignalKey === key);
  const declared = mapVsiCatalogToDeclaredSupport(
    catalogResolver.catalogForCanonicalKey(declaredCatalog, key),
  );

  const empirical =
    descriptor?.capability.empiricalObservation ?? VsiEmpiricalObservationStatus.NEVER_OBSERVED;
  const freshness =
    descriptor?.freshnessClassification === 'FRESH' ||
    descriptor?.freshnessClassification === 'STALE'
      ? descriptor.freshnessClassification
      : 'UNKNOWN';

  const strictAdvance =
    descriptor?.empiricalEvidence?.strictSourceAdvanced ??
    (key === 'provider_source_timestamp' ? 'UNKNOWN' : 'UNKNOWN');

  const provenance = new Set<string>();
  if (descriptor?.empiricalEvidence?.evidenceOrigin) {
    provenance.add(descriptor.empiricalEvidence.evidenceOrigin);
  }
  if (declared !== 'UNKNOWN') {
    provenance.add('DIMO_PREFLIGHT');
  }

  const limitations = [
    ...(descriptor?.confidenceLimitations ?? []),
    ...(declaredCatalog.limitations ?? []),
  ];

  let row: VsiProfileSignalSnapshotV1 = {
    canonicalSignalKey: key,
    providerNativeSignalName: native,
    declaredSupport: declared,
    empiricalObservation: empirical,
    lastValidObservationAt: isoOrNull(descriptor?.timestamps.observed ?? null),
    lastSourceTimestamp: isoOrNull(descriptor?.timestamps.source ?? null),
    lastProviderFetchAt: isoOrNull(descriptor?.timestamps.received ?? null),
    lastProvenStrictSourceAdvanceAt: null,
    strictSourceAdvanced: strictAdvance,
    freshnessClassification: freshness,
    evidenceProvenance: [...provenance] as VsiProfileSignalSnapshotV1['evidenceProvenance'],
    limitations,
  };

  const isP1 = (VSI_P1_SIGNAL_KEYS as readonly string[]).includes(key);
  if (!isP1) {
    const extracted = extractProfileSignalEmpirical({
      key,
      latestState: empiricalContext.latestState,
      stateAttributed: empiricalContext.stateAttributed,
      projectionAsOf: empiricalContext.projectionAsOf,
      providerSourceLinkId: empiricalContext.providerSourceLinkId,
      dtcConfirmedComplete: empiricalContext.dtcConfirmedComplete,
    });
    if (extracted) {
      row = {
        ...row,
        providerNativeSignalName: extracted.providerNativeSignalName,
        empiricalObservation: extracted.empiricalObservation,
        lastValidObservationAt: extracted.lastValidObservationAt?.toISOString() ?? null,
        lastSourceTimestamp: extracted.lastSourceTimestamp?.toISOString() ?? null,
        freshnessClassification: extracted.freshnessClassification,
        evidenceProvenance: [
          ...new Set([...row.evidenceProvenance, ...extracted.evidenceProvenance]),
        ] as VsiProfileSignalSnapshotV1['evidenceProvenance'],
        limitations: [...new Set([...row.limitations, ...extracted.limitations])],
      };
      if (empiricalContext.stateAttributed && empiricalContext.latestState?.providerFetchedAt) {
        row.lastProviderFetchAt =
          empiricalContext.latestState.providerFetchedAt.toISOString();
      }
      row.limitations.push(VSI_LIMITATION_PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT);
    } else if (
      !isProfileEmpiricalExtractorImplemented(key) &&
      key !== 'provider_last_successful_fetch'
    ) {
      row.limitations.push(VSI_LIMITATION_EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED);
    }
  }

  return row;
}

export function evaluateVsiSignalProfile(
  input: VsiProfileEvaluatorInput,
  catalogResolver: VsiDeclaredCatalogResolver,
): VsiProfileEvaluationDraft {
  const projectionAsOf = input.projectionAsOf ?? new Date();
  const profileLimitations: string[] = [...input.declaredCatalog.limitations];

  if (!input.identity.treatsAsPhysicalHardwareDevice) {
    profileLimitations.push('SOFTWARE_INTEGRATION_STRATIFICATION_ACTIVE');
  }

  const stateAttributed =
    input.latestState != null &&
    isLatestStateAttributedToLink({
      latestState: input.latestState,
      link: input.link,
      activeLinkCount: 1,
    });

  if (input.latestState && !stateAttributed) {
    profileLimitations.push('LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK');
  }

  const composer = composeReadonlyVehicleSignals({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    registryLifecycle: input.registryLifecycle,
    hardwareTypeLegacy: input.hardwareTypeLegacy,
    projectionAsOf,
    links: [input.link],
    latestState: stateAttributed ? input.latestState : null,
    pollLogs: input.pollLogs,
    priorAggregatedSourceTimestamp: input.priorAggregatedSourceTimestamp,
  });

  const linkScopedSignals = composer.signals.filter((s) => {
    const ref = s.identity.providerSourceLinkRef;
    return ref.kind === 'resolved' && ref.providerSourceLinkId === input.link.id;
  });

  const strictBundleAdvance = resolveStrictSourceAdvanceEvidence({
    priorAggregatedSourceTimestamp: input.priorAggregatedSourceTimestamp,
    currentAggregatedSourceTimestamp: stateAttributed
      ? input.latestState?.sourceTimestamp
      : null,
  });

  let lastProvenStrictSourceAdvanceAt = input.priorProvenStrictSourceAdvanceAt ?? null;
  if (strictBundleAdvance === true && input.latestState?.sourceTimestamp) {
    lastProvenStrictSourceAdvanceAt = input.latestState.sourceTimestamp;
  }

  const signals = VSI_PROFILE_MATERIALIZATION_KEYS.map((key) => {
    const row = mergeEmpiricalRow(
      key,
      linkScopedSignals,
      input.declaredCatalog,
      catalogResolver,
      {
        latestState: stateAttributed ? input.latestState : null,
        stateAttributed,
        projectionAsOf,
        providerSourceLinkId: input.link.id,
        dtcConfirmedComplete: input.dtcConfirmedComplete ?? null,
      },
    );
    if (key === 'provider_source_timestamp') {
      return {
        ...row,
        lastProvenStrictSourceAdvanceAt: lastProvenStrictSourceAdvanceAt?.toISOString() ?? null,
        strictSourceAdvanced: strictBundleAdvance,
      };
    }
    if (key === 'provider_last_successful_fetch' && stateAttributed && input.latestState) {
      const fetched = input.latestState.providerFetchedAt;
      const { freshnessClassification, limitations: fetchFreshnessLimits } =
        resolveProviderLastSuccessfulFetchFreshness({
          providerFetchedAt: fetched,
          projectionAsOfMs: projectionAsOf.getTime(),
        });
      const withoutExtractorLimitation = row.limitations.filter(
        (l) => !l.includes(VSI_LIMITATION_EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED),
      );
      return {
        ...row,
        empiricalObservation: fetched
          ? VsiEmpiricalObservationStatus.OBSERVED
          : VsiEmpiricalObservationStatus.NEVER_OBSERVED,
        lastValidObservationAt: fetched?.toISOString() ?? null,
        lastProviderFetchAt: fetched?.toISOString() ?? null,
        freshnessClassification: fetched ? freshnessClassification : 'UNKNOWN',
        evidenceProvenance: [
          ...new Set<VsiEvidenceOrigin>([...row.evidenceProvenance, 'VEHICLE_LATEST_STATE']),
        ],
        limitations: [
          ...new Set([
            ...withoutExtractorLimitation,
            ...fetchFreshnessLimits,
            'PROVIDER_FETCH_TIME_NOT_SOURCE_ADVANCE_PROOF',
            VSI_LIMITATION_PROVIDER_LAST_SUCCESSFUL_FETCH_WALL_CLOCK_NOT_PHYSICAL_SIGNAL,
          ]),
        ],
      };
    }
    return row;
  });

  const withApplicability = signals.map((row) =>
    applyVsiProfileSignalPowertrainApplicability(row, input.fuelType ?? null),
  );

  return {
    contractVersion: VSI_PROFILE_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.link.id,
    providerIdentity: input.link.provider || 'UNKNOWN',
    verifiedModality:
      input.identity.verifiedModality === 'UNRESOLVED'
        ? null
        : input.identity.verifiedModality,
    telemetrySourceFamily:
      input.identity.telemetrySourceFamily === 'UNRESOLVED'
        ? null
        : input.identity.telemetrySourceFamily,
    evaluatedAt: projectionAsOf,
    declaredCatalogCheckedAt: input.declaredCatalog.checkedAt,
    lastMaterializedSourceTimestamp: stateAttributed
      ? input.latestState?.sourceTimestamp ?? null
      : null,
    lastMaterializedProviderFetchAt: stateAttributed
      ? input.latestState?.providerFetchedAt ?? null
      : null,
    lastProvenStrictSourceAdvanceAt,
    signals: withApplicability,
    profileLimitations,
  };
}
