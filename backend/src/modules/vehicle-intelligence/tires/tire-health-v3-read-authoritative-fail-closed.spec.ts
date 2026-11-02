import { ConfigService } from '@nestjs/config';
import { TireHealthV3ReadService } from './tire-health-v3-read.service';
import type { TireHealthSummary } from './tire-health.service';
import {
  buildAuthoritativeV3UnavailableRead,
  mapV3SetupToCustomerRead,
  TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION,
} from './tire-health-v3-read.adapter';
import { minimalPriorResult, baseSummary } from './tire-health-v3-read.service.spec';

function svc(
  cutover: { customerReadEnabled: boolean; customerReadAuthoritative: boolean },
  prior?: { computeForSetup: jest.Mock },
) {
  const config = { get: () => cutover };
  return new TireHealthV3ReadService(config as never, prior as never);
}

describe('TireHealthV3ReadService authoritative fail-closed', () => {
  it('A — flags OFF preserves legacy summary (no V3 fields)', async () => {
    const computeForSetup = jest.fn();
    const service = svc({ customerReadEnabled: false, customerReadAuthoritative: false }, {
      computeForSetup,
    });
    const summary = baseSummary();
    const out = await service.enrichSummary(summary, 'setup-1', 'SUMMER', []);
    expect(out).toEqual(summary);
    expect(computeForSetup).not.toHaveBeenCalled();
  });

  it('B — ENABLED=false AUTHORITATIVE=true stays inactive (V2)', async () => {
    const computeForSetup = jest.fn();
    const service = svc({ customerReadEnabled: false, customerReadAuthoritative: true }, {
      computeForSetup,
    });
    expect(service.isCustomerReadEnabled()).toBe(false);
    const summary = baseSummary();
    const out = await service.enrichSummary(summary, 'setup-1', 'SUMMER', []);
    expect(out.overallStatus).toBe('GOOD');
    expect(out.wearV3).toBeUndefined();
    expect(computeForSetup).not.toHaveBeenCalled();
  });

  it('C — non-authoritative attaches wearV3 but keeps V2 overallStatus', async () => {
    const computeForSetup = jest.fn().mockResolvedValue(minimalPriorResult());
    const service = svc({ customerReadEnabled: true, customerReadAuthoritative: false }, {
      computeForSetup,
    });
    const out = await service.enrichSummary(baseSummary(), 'setup-1', 'SUMMER', []);
    expect(out.wearReadModel).toBe('v2');
    expect(out.overallStatus).toBe('GOOD');
    expect(out.wearV3).toBeDefined();
  });

  it('D — both flags true with successful compute applies authoritative V3', async () => {
    const computeForSetup = jest.fn().mockResolvedValue(minimalPriorResult());
    const service = svc({ customerReadEnabled: true, customerReadAuthoritative: true }, {
      computeForSetup,
    });
    const out = await service.enrichSummary(baseSummary(), 'setup-1', 'SUMMER', []);
    expect(out.wearReadModel).toBe('v3');
    expect(out.displayMode).toBe('UNKNOWN');
    expect(out.overallStatus).toBe('UNKNOWN');
  });

  it.each([
    ['no_result', jest.fn().mockResolvedValue(null)],
    ['compute_failed', jest.fn().mockRejectedValue(new Error('boom'))],
  ] as const)('E/F — authoritative fail-closed when prior %s', async (_label, computeForSetup) => {
    const service = svc({ customerReadEnabled: true, customerReadAuthoritative: true }, {
      computeForSetup,
    });
    const legacy = baseSummary();
    const out = await service.enrichSummary(legacy, 'setup-1', 'SUMMER', []);
    expect(out.wearReadModel).toBe('v3');
    expect(out.wearV3?.modelVersion).toBe(TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION);
    expect(out.wearV3?.insufficientEvidence).toBe(true);
    expect(out.displayMode).toBe('UNKNOWN');
    expect(out.overallStatus).toBe('UNKNOWN');
    expect(out.overallStatus).not.toBe(legacy.overallStatus);
    expect(out.lowestTreadMm).toBeNull();
  });

  it('G — missing optional prior dependency fail-closed when authoritative', async () => {
    const service = svc({ customerReadEnabled: true, customerReadAuthoritative: true });
    const out = await service.enrichSummary(baseSummary(), 'setup-1', 'SUMMER', []);
    expect(out.wearReadModel).toBe('v3');
    expect(out.wearV3?.verificationQualityFlags).toContain('V3_READ_DEPENDENCY_UNAVAILABLE');
    expect(out.displayMode).toBe('UNKNOWN');
  });

  it('non-authoritative returns legacy summary when compute unavailable', async () => {
    const service = svc({ customerReadEnabled: true, customerReadAuthoritative: false });
    const legacy = baseSummary();
    const out = await service.enrichSummary(legacy, 'setup-1', 'SUMMER', []);
    expect(out).toEqual(legacy);
  });

  it('J — successful V3 insufficient evidence does not fabricate mm', async () => {
    const read = mapV3SetupToCustomerRead(minimalPriorResult());
    expect(read.wheels[0]?.treadDepthMm).toBeNull();
    expect(buildAuthoritativeV3UnavailableRead('compute_failed').lowestTreadMm).toBeNull();
  });
});