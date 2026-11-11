import type {
  MasterFsdCatalogAvailabilityV1,
  MasterFsdSignalPresentationStateV1,
  MasterFsdStageEvidenceAvailabilityV1,
} from './vsi-master-fsd-read-api.types';

/** i18n key suffix under `master.intelligence.vsi.fsd.*` */
export function fsdCatalogAvailabilityKey(
  value: MasterFsdCatalogAvailabilityV1,
): `master.intelligence.vsi.fsd.catalog.${MasterFsdCatalogAvailabilityV1}` {
  return `master.intelligence.vsi.fsd.catalog.${value}`;
}

export function fsdStageEvidenceKey(
  value: MasterFsdStageEvidenceAvailabilityV1,
): `master.intelligence.vsi.fsd.stage.${MasterFsdStageEvidenceAvailabilityV1}` {
  return `master.intelligence.vsi.fsd.stage.${value}`;
}

export function fsdPresentationStateKey(
  value: MasterFsdSignalPresentationStateV1,
): `master.intelligence.vsi.fsd.presentation.${MasterFsdSignalPresentationStateV1}` {
  return `master.intelligence.vsi.fsd.presentation.${value}`;
}

export function fsdHistoricalColumnKey(
  value: string,
): `master.intelligence.vsi.fsd.historical.${string}` | 'master.intelligence.vsi.fsd.historical.special' {
  const known = [
    'NOT_EXECUTED',
    'NOT_AVAILABLE',
    'UNVERIFIED_LINK',
    'DECLARED_ONLY',
    'QUERY_PLANNED',
    'QUERY_ACCEPTED',
    'QUERY_FAILED',
    'OBSERVED',
    'NOT_EVALUABLE',
    'DEFERRED',
    'NULL_OBSERVED',
    'MISSING',
    'INVALID',
    'UNKNOWN',
    'PARTIAL',
  ];
  if (known.includes(value)) {
    return `master.intelligence.vsi.fsd.historical.${value}` as `master.intelligence.vsi.fsd.historical.${string}`;
  }
  return 'master.intelligence.vsi.fsd.historical.special';
}

export function fsdLedgerLifecycleKey(
  value: string,
): `master.intelligence.vsi.fsd.lifecycle.${string}` {
  return `master.intelligence.vsi.fsd.lifecycle.${value}` as `master.intelligence.vsi.fsd.lifecycle.${string}`;
}
