import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { parseBucketLabelMs } from '../../core/kinematics/motion-core-grid';

/**
 * P2 index-padding placeholders use epoch labels (see ds4-layer2-p4b-test-payload-synth.v1.ts).
 * W0 research must not pass them through as confirmed manoeuvre evidence.
 */
export const DS4_DBI_W0_SYNTHETIC_PLACEHOLDER_EXCLUDED_BEFORE_MS_V1 = Date.UTC(2000, 0, 1, 0, 0, 0);

/** Documented P2 placeholder start label for missing event indices. */
export const DS4_DBI_W0_P2_PLACEHOLDER_EVENT_START_LABEL_V1 = '1970-01-01T00:00:00Z';

export function isW0SyntheticPlaceholderEventV1(row: DiV0MotionCoreShadowPayloadV1['events'][number]): boolean {
  if (row.quality !== 'OK') {
    return true;
  }
  const startMs = parseBucketLabelMs(row.startLabel);
  const endMs = parseBucketLabelMs(row.endLabel);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return true;
  }
  return (
    startMs < DS4_DBI_W0_SYNTHETIC_PLACEHOLDER_EXCLUDED_BEFORE_MS_V1 ||
    endMs < DS4_DBI_W0_SYNTHETIC_PLACEHOLDER_EXCLUDED_BEFORE_MS_V1
  );
}

/** Admissible W0 research events: OK quality with post-2000 temporal labels (excludes P2 padding). */
export function filterW0SyntheticResearchAdmittedEventsV1(
  events: DiV0MotionCoreShadowPayloadV1['events'],
): DiV0MotionCoreShadowPayloadV1['events'] {
  return events.filter((e) => !isW0SyntheticPlaceholderEventV1(e));
}
