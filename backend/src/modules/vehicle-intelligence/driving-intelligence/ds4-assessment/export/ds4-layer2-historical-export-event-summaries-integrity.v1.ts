import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
} from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';
import { Ds4Layer2HistoricalExportIntegrityErrorV1 } from './ds4-layer2-historical-export.v1';

const CLASSIFICATIONS = new Set([
  'EXCLUDED_ARTEFACT',
  'UNRATED',
  'ADMISSIBLE_FULL',
  'ADMISSIBLE_BIN_ONLY',
]);

const DURATION_TIERS = new Set(['FULL_ELIGIBLE', 'BIN_ONLY', 'UNRATED']);

const KINDS = new Set(['ACCELERATION', 'DECELERATION', 'OTHER']);

const SPEED_AUTHORITIES = new Set<Ds4SpeedAuthorityPartitionV1>(['C4_ONLY', 'C5_1_PREFERRED']);

const EXPORT_SUPPORTED_EVENT_ROW_CONTRACTS = new Set<string>([
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY,
]);

function fail(assessmentId: string, detail: string): never {
  throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
    `Assessment ${assessmentId}: persisted eventSummariesJson integrity failure — ${detail}`,
  );
}

function assertRecordShape(
  assessmentId: string,
  record: unknown,
  index: number,
): asserts record is Ds4EventIntensityEligibilityRecordV1 {
  if (record == null || typeof record !== 'object' || Array.isArray(record)) {
    fail(assessmentId, `eventIntensityRecords[${index}] is not an object`);
  }
  const r = record as Record<string, unknown>;
  if (!Number.isInteger(r.eventIndex) || (r.eventIndex as number) < 0) {
    fail(assessmentId, `eventIntensityRecords[${index}].eventIndex invalid`);
  }
  if (typeof r.kind !== 'string' || !KINDS.has(r.kind)) {
    fail(assessmentId, `eventIntensityRecords[${index}].kind invalid`);
  }
  if (typeof r.classification !== 'string' || !CLASSIFICATIONS.has(r.classification)) {
    fail(assessmentId, `eventIntensityRecords[${index}].classification invalid`);
  }
  if (typeof r.durationTier !== 'string' || !DURATION_TIERS.has(r.durationTier)) {
    fail(assessmentId, `eventIntensityRecords[${index}].durationTier invalid`);
  }
  if (typeof r.eventQuality !== 'string') {
    fail(assessmentId, `eventIntensityRecords[${index}].eventQuality invalid`);
  }
  if (
    r.speedAuthority != null &&
    (typeof r.speedAuthority !== 'string' || !SPEED_AUTHORITIES.has(r.speedAuthority as Ds4SpeedAuthorityPartitionV1))
  ) {
    fail(assessmentId, `eventIntensityRecords[${index}].speedAuthority invalid`);
  }
  if (r.meanAccelMps2 != null && (typeof r.meanAccelMps2 !== 'number' || !Number.isFinite(r.meanAccelMps2))) {
    fail(assessmentId, `eventIntensityRecords[${index}].meanAccelMps2 invalid`);
  }
  if (r.durationS != null && (typeof r.durationS !== 'number' || !Number.isFinite(r.durationS))) {
    fail(assessmentId, `eventIntensityRecords[${index}].durationS invalid`);
  }
  if (r.steps != null && (!Number.isInteger(r.steps) || (r.steps as number) < 0)) {
    fail(assessmentId, `eventIntensityRecords[${index}].steps invalid`);
  }
  if (r.coverageRatio != null && (typeof r.coverageRatio !== 'number' || !Number.isFinite(r.coverageRatio))) {
    fail(assessmentId, `eventIntensityRecords[${index}].coverageRatio invalid`);
  }
  if (!Array.isArray(r.reasonCodes) || !r.reasonCodes.every((c) => typeof c === 'string')) {
    fail(assessmentId, `eventIntensityRecords[${index}].reasonCodes invalid`);
  }
  if (typeof r.startLabel !== 'string' || typeof r.endLabel !== 'string') {
    fail(assessmentId, `eventIntensityRecords[${index}] start/end labels invalid`);
  }
}

/**
 * Fail-closed gate before canonical coercion — never silently drop corrupt persisted evidence.
 */
export function assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1(input: {
  assessmentId: string;
  eventRowContract: string | null;
  eventSummariesJson: unknown;
}): void {
  const { assessmentId, eventRowContract, eventSummariesJson } = input;

  if (eventRowContract == null || !EXPORT_SUPPORTED_EVENT_ROW_CONTRACTS.has(eventRowContract)) {
    fail(
      assessmentId,
      `unsupported or missing event_row_contract (${String(eventRowContract)})`,
    );
  }

  if (eventSummariesJson == null || typeof eventSummariesJson !== 'object' || Array.isArray(eventSummariesJson)) {
    fail(assessmentId, 'eventSummariesJson must be a JSON object');
  }

  const raw = eventSummariesJson as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(raw, 'eventIntensityRecords')) {
    fail(assessmentId, 'eventIntensityRecords array is required');
  }
  if (!Array.isArray(raw.eventIntensityRecords)) {
    fail(assessmentId, 'eventIntensityRecords must be an array');
  }

  const seen = new Set<number>();
  for (let i = 0; i < raw.eventIntensityRecords.length; i += 1) {
    assertRecordShape(assessmentId, raw.eventIntensityRecords[i], i);
    const rec = raw.eventIntensityRecords[i] as Ds4EventIntensityEligibilityRecordV1;
    if (seen.has(rec.eventIndex)) {
      fail(assessmentId, `duplicate eventIndex ${rec.eventIndex}`);
    }
    seen.add(rec.eventIndex);
  }
}
