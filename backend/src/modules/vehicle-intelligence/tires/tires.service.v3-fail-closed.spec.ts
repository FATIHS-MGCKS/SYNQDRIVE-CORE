import { TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION } from './tire-health-v3-read.adapter';
import { TireHealthV3ReadService } from './tire-health-v3-read.service';
import { TiresService } from './tires.service';

describe('TiresService wear analysis V3 authority', () => {
  it('I — authoritative failed V3 exposes unavailable wearV3 payload (not null v3 label)', async () => {
    const v3Read = new TireHealthV3ReadService(
      {
        get: () => ({ customerReadEnabled: true, customerReadAuthoritative: true }),
      } as never,
      undefined,
    );
    const service = new TiresService(
      {
        vehicleTireSetup: {
          findFirst: jest.fn().mockResolvedValue({ id: 'setup-1' }),
        },
      } as never,
      { computeWearAnalysis: jest.fn().mockResolvedValue({ frontLeftMm: 6 }) } as never,
      v3Read,
    );
    const out = (await service.getWearAnalysis('veh-1')) as {
      wearReadModel?: string;
      wearV3?: { modelVersion: string };
    };
    expect(out?.wearReadModel).toBe('v3');
    expect(out?.wearV3).toBeDefined();
    expect(out?.wearV3?.modelVersion).toBe(TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION);
    expect(out?.wearV3).not.toBeNull();
  });

  it('flags OFF returns raw wear analysis without V3 fields', async () => {
    const v3Read = new TireHealthV3ReadService(
      {
        get: () => ({ customerReadEnabled: false, customerReadAuthoritative: false }),
      } as never,
      { computeForSetup: jest.fn() } as never,
    );
    const analysis = { frontLeftMm: 6 };
    const service = new TiresService(
      { vehicleTireSetup: { findFirst: jest.fn() } } as never,
      { computeWearAnalysis: jest.fn().mockResolvedValue(analysis) } as never,
      v3Read,
    );
    await expect(service.getWearAnalysis('veh-1')).resolves.toEqual(analysis);
  });
});
