import type {
  ActiveRpmProfileLabel,
  IceRpmApplicability,
  LvStandbyProfileLabel,
  ObservedRpmDensityLabel,
  ProfileConfidenceLevel,
} from './master-intelligence.types';
import type { MasterVsiProfileSummaryDto } from './vsi-master-intelligence-api.types';

export function mapSummaryToLvBadge(profile: MasterVsiProfileSummaryDto): {
  profile: LvStandbyProfileLabel;
  limitationCode: string | null;
} {
  const limitationCode =
    profile.evaluationBlocked && profile.evaluationBlockedCodes.length > 0
      ? profile.evaluationBlockedCodes[0]!
      : profile.lvStandbyProfile === 'UNKNOWN' && profile.profileLimitations.length > 0
        ? profile.profileLimitations[0]!
        : null;
  return {
    profile: profile.lvStandbyProfile,
    limitationCode,
  };
}

export function mapSummaryToRpmBadge(profile: MasterVsiProfileSummaryDto): {
  profile: ActiveRpmProfileLabel;
  applicability: IceRpmApplicability;
} {
  return {
    profile: profile.rpmActiveProfile,
    applicability: profile.rpmApplicability,
  };
}

export function mapConfidenceLevel(raw: string | null | undefined): ProfileConfidenceLevel {
  if (raw === 'HIGH' || raw === 'MEDIUM' || raw === 'LOW') return raw;
  return 'UNKNOWN';
}

export function mapObservedDensity(raw: string | null | undefined): ObservedRpmDensityLabel {
  if (
    raw === 'SUB_ONE_HZ' ||
    raw === 'ONE_SECOND_BUCKETS_UNPROVEN' ||
    raw === 'IRREGULAR' ||
    raw === 'NOT_APPLICABLE'
  ) {
    return raw;
  }
  return 'UNKNOWN';
}

export function evidenceKindFromSummary(
  profile: MasterVsiProfileSummaryDto,
): 'evaluation_blocked' | 'observed' | 'insufficient_evidence' {
  if (profile.evaluationBlocked) return 'evaluation_blocked';
  if (
    profile.lvStandbyProfile === 'UNKNOWN' &&
    profile.rpmActiveProfile === 'UNKNOWN' &&
    profile.rpmApplicability === 'UNKNOWN'
  ) {
    return 'insufficient_evidence';
  }
  return 'observed';
}

const EMPIRICAL_I18N_KEYS: Record<string, string> = {
  NOT_APPLICABLE: 'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE',
  NEVER_OBSERVED: 'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED',
  OBSERVED: 'master.intelligence.vsi.signals.empirical.OBSERVED',
  OBSERVED_STALE: 'master.intelligence.vsi.signals.empirical.OBSERVED_STALE',
};

export function empiricalObservationLabelKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return EMPIRICAL_I18N_KEYS[raw] ?? null;
}
