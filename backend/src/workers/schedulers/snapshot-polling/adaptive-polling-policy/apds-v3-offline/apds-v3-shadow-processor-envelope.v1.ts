import type { TripDetectionState } from '@prisma/client';
import type { DimoSnapshotJobData } from '../../../../snapshot-wake/snapshot-wake.types';

/** Preloaded on the snapshot critical path (no extra V3-only DB round trips). */
export type ApdsV3ShadowProcessorEnvelope = {
  job: { id?: string; attemptsMade?: number; data: DimoSnapshotJobData };
  organizationId: string;
  vehicleId: string;
  baselineProviderSourceLinkId: string | null;
  pollStartedAtMs: number;
  tripDetectionState: TripDetectionState | null;
  vehicleFuelType: string | null;
  lastTrustworthyLvSourceMs: number | null;
  lastTopLevelProviderSourceMs: number | null;
  r9WakeKnown: boolean;
  providerGapOpen: boolean;
  deviceReconnectRecent: boolean;
  providerReconnectRecent: boolean;
};
