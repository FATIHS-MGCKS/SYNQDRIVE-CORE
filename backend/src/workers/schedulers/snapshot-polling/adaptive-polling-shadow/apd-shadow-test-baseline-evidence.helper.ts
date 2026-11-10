import type { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';

/** Minimal Prisma stub for unit tests (next baseline poll lookup). */
export function apdShadowBaselinePollEvidenceForTests(
  prisma: {
    dimoPollLog?: { findFirst: jest.Mock };
    apdShadowReconciliationDecision?: {
      findMany?: jest.Mock;
      updateMany?: jest.Mock;
      count?: jest.Mock;
    };
  } = {},
  metrics?: AdaptivePollingShadowMetricsService,
): ApdShadowBaselinePollEvidenceService {
  const dimoPollLog = prisma.dimoPollLog ?? {
    findFirst: jest.fn().mockResolvedValue(null),
  };
  const apdShadowReconciliationDecision = {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    ...prisma.apdShadowReconciliationDecision,
  };
  return new ApdShadowBaselinePollEvidenceService(
    { dimoPollLog, apdShadowReconciliationDecision } as never,
    metrics,
  );
}
