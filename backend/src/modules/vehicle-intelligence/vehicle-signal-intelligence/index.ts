/**
 * Vehicle Signal Intelligence — VSI-02 contracts, VSI-03 composer, P0+P1 signal profiles.
 */

export {
  VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
  VsiSignalFamily,
  VsiSignalValueCategory,
  VsiCanonicalUnit,
  VSI_CANONICAL_SIGNAL_DEFINITIONS,
  getVsiCanonicalSignalDefinition,
  isVsiCanonicalSignalKey,
  evaluateCanonicalProviderNativeAlias,
  type VsiCanonicalSignalContractVersion,
  type VsiCanonicalSignalKey,
  type VsiCanonicalSignalDefinition,
  type VsiCanonicalAliasMappingVerdict,
} from './canonical-signal-keys';

export {
  VSI_EVIDENCE_CONTRACT_VERSION,
  VSI_UNRESOLVED_PROVIDER_SOURCE_LINK_ID,
  VsiProviderCatalogStatus,
  VsiEmpiricalObservationStatus,
  VsiAuthorizationStatus,
  VsiSignalQualityStatus,
  VsiConsumerEligibilityStatus,
  buildVsiEvidenceScopeKey,
  formatProviderSourceLinkScopeSegment,
  assertDistinctTenantScope,
  assertProviderIdentityForScope,
  VsiAuthorizationRequestKind,
  deriveProviderCatalogStatus,
  deriveEmpiricalObservationFromSamples,
  deriveAuthorizationFromHttpStatus,
  evaluateStrictSourceAdvance,
  mapBatteryProviderObservationOutcomeToVsiQuality,
  observationStatusDuringSuppressionWindow,
  assertVsiProjectionDoesNotOverwriteHistoricalFields,
  assertCanonicalUnitCompatible,
  type VsiEvidenceContractVersion,
  type VsiProviderSourceLinkRef,
  type VsiMeasuredTimestamp,
  type VsiMultiAxisCapability,
  type VsiEvidenceOrigin,
  type VsiCatalogListingEvidence,
  type VsiEmpiricalObservationEvidence,
  type VsiAuthorizationEvidence,
  type VsiConsumerEligibilityEvidence,
  type VsiVehicleSignalEvidenceDescriptorV1,
  type VsiEvidenceScopeKeyInput,
  type VsiProviderIdentity,
  type VsiAuthorizationHttpContext,
} from './vehicle-signal-evidence.contract';

export {
  VSI_READONLY_COMPOSER_VERSION,
  VSI_P1_SIGNAL_KEYS,
  type VsiP1SignalKey,
  type VsiReadonlyComposerRequest,
  type VsiReadonlyComposerResult,
  type VsiConnectionIdentityProjection,
} from './vsi-readonly-composer.types';

export { composeReadonlyVehicleSignals } from './vsi-readonly-composer.engine';
export { projectConnectionIdentitiesFromLinks } from './vsi-connection-identity-projection';
export { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
export { VsiReadonlySignalComposerModule } from './vsi-readonly-composer.module';
export {
  VSI_APDS_ADAPTER_CONTRACT_VERSION,
  projectVsiEvidenceForApdsReadonlyCorrelation,
  type VsiApdsReadonlyAdapterView,
} from './vsi-apds-consumer.adapter.contract';

export {
  VSI_PROFILE_CONTRACT_VERSION,
  VSI_PROFILE_MATERIALIZATION_KEYS,
  type VsiProfileEvaluationResult,
  type VsiProfileSignalSnapshotV1,
} from './vsi-profile.types';
export { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
export { evaluateVsiSignalProfile } from './vsi-profile-evaluator';
export { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
export { isVsiP5h1ProfileRevisionHistoryCaptureEnabled } from './vsi-p5h1-profile-revision-history.config';
export { selectVsiProfileRevisionAsOf } from './vsi-profile-revision-as-of.resolver';
export { VsiProfileRevisionAsOfAuthority } from './vsi-profile-revision-as-of.types';
export {
  VsiProfileRevisionAsOfQueryCompleteness,
  type VsiProfileRevisionAsOfResolutionV1,
} from './vsi-profile-revision-as-of.types';
export {
  assessVsiProfileRevisionSignalTemporalState,
  VsiProfileRevisionSignalTemporalState,
} from './vsi-profile-revision-signal-temporal';
export { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';

export {
  VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION,
  VSI_NATIVE_DISCOVERY_INVENTORY_MAX_ENTRIES,
  VSI_NATIVE_DISCOVERY_INVENTORY_TRUNCATION_LIMITATION,
  VsiNativeDiscoveryIngestionLimitation,
  validateNativeSignalDiscoveryInventoryWellFormed,
  truncateNativeSignalDiscoveryInventory,
  assertNativeDiscoveryInventoryScopeMatch,
  type VsiNativeSignalDiscoveryInventoryV1,
  type VsiNativeSignalDiscoveryInventoryEntryV1,
} from './vsi-native-signal-discovery-inventory.contract';

export {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
  axisAllowsPositiveObservationClaim,
  type VsiEvidenceAxisEvaluationV1,
} from './vsi-native-signal-discovery-evaluation-state';

export {
  VsiNativeDiscoveryOperationalWriteOutcome,
  evaluateNativeDiscoveryOperationalCasPreconditions,
  assertInventoryOnlyRefreshPreservesProfileRevision,
} from './vsi-native-signal-discovery-operational-cas.contract';

export {
  VSI_NATIVE_DISCOVERY_INVENTORY_NOT_AS_OF_LIMITATION,
  VsiNativeDiscoveryConsumerTemporalMode,
  resolveNativeDiscoveryInventoryForConsumerContext,
  assertApdsHistoricalContextDoesNotUseHeadDiscoveryInventory,
} from './vsi-native-signal-discovery-as-of.guard';

export {
  VSI_DISCOVERY_CH_MAX_FINALIZED_TRIPS,
  VSI_DISCOVERY_CH_HISTORY_DAYS,
  validateClickHouseDiscoveryQueryScope,
  linkAttributionAllowsPositiveHistoricalClaim,
  assertClickHouseDiscoverySqlContainsTenantPredicates,
} from './vsi-clickhouse-discovery-safety.contract';

export {
  VSI_NATIVE_DISCOVERY_CANONICAL_EMPTY_DB,
  buildCanonicalEmptyNativeDiscoveryInventoryDbJson,
  normalizeNativeSignalDiscoveryInventoryFromProfileRow,
} from './vsi-native-discovery-inventory.db.util';

export {
  persistNativeDiscoveryInventoryOperationalCas,
  type VsiNativeDiscoveryInventoryOperationalPersistOutcome,
} from './vsi-native-discovery-inventory-operational.persistence';
