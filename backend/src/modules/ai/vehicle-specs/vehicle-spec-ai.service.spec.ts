import { VehicleSpecAiService } from './vehicle-spec-ai.service';
import { TireSpecAiService } from './tire-spec-ai.service';
import { LlmGatewayService } from '../llm/llm-gateway.service';

describe('VehicleSpecAiService', () => {
  const scopeVehicle = { make: 'VW', model: 'Golf', year: 2020 };

  it('returns config failure when LLM is not configured', async () => {
    const llm = { isConfigured: jest.fn().mockReturnValue(false) };
    const svc = new VehicleSpecAiService(llm as any);

    const res = await svc.getVehicleSpecs([872], scopeVehicle);
    expect(res.success).toBe(false);
    expect(res.configFailure).toBe(true);
    expect(llm.isConfigured).toHaveBeenCalled();
  });

  it('parses structured JSON from Mistral gateway', async () => {
    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      activeProviderId: 'mistral',
      completeJson: jest.fn().mockResolvedValue({
        data: {
          curbWeightKg: 1350,
          drivetrain: 'FWD',
          tankCapacityLiters: 50,
          variantConfidence: 0.9,
        },
        rawContent: '{"curbWeightKg":1350}',
        model: 'json-model',
      }),
    };
    const svc = new VehicleSpecAiService(llm as any);

    const res = await svc.getVehicleSpecs(undefined, scopeVehicle);
    expect(res.success).toBe(true);
    expect(res.providerId).toBe('mistral');
    expect(res.specs?.curbWeightKg).toBe(1350);
    expect(res.knowledgeOnlyFallback).toBe(true);
    expect(llm.completeJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'json',
        schemaName: 'synqdrive_vehicle_specs',
      }),
    );
  });

  it('emits SSE result event on stream success', async () => {
    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      activeProviderId: 'mistral',
      completeJson: jest.fn().mockResolvedValue({
        data: { curbWeightKg: 1400, variantConfidence: 0.9 },
        model: 'json-model',
      }),
    };
    const svc = new VehicleSpecAiService(llm as any);
    const events: Array<{ event: string; data: unknown }> = [];

    await svc.getVehicleSpecsStream(undefined, scopeVehicle, (event, data) => {
      events.push({ event, data });
    });

    const result = events.find((e) => e.event === 'result');
    expect(result).toBeDefined();
    expect((result!.data as any).agentId).toBe('mistral');
    expect((result!.data as any).specs.curbWeightKg).toBe(1400);
    expect((result!.data as any).degraded).toBe(false);
    expect((result!.data as any).knowledgeOnlyFallback).toBe(true);
  });
});

describe('TireSpecAiService', () => {
  it('emits config error when LLM is not configured', async () => {
    const llm = { isConfigured: jest.fn().mockReturnValue(false) };
    const svc = new TireSpecAiService(llm as any);
    const events: Array<{ event: string; data: unknown }> = [];

    await svc.getTireSpecsStream({ brand: 'Michelin', model: 'Pilot Sport' }, (event, data) => {
      events.push({ event, data });
    });

    expect(events.some((e) => e.event === 'error' && (e.data as any).configFailure)).toBe(true);
  });

  it('calls completeJson with tire schema', async () => {
    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      activeProviderId: 'mistral',
      completeJson: jest.fn().mockResolvedValue({
        data: {
          schemaVersion: 'tire_v3_compact',
          matchedBrand: 'Michelin',
          matchedModel: 'Pilot Sport',
        },
        model: 'json-model',
      }),
    };
    const svc = new TireSpecAiService(llm as any);
    const events: Array<{ event: string; data: unknown }> = [];

    await svc.getTireSpecsStream(
      { brand: 'Michelin', model: 'Pilot Sport', tireSize: '225/45R17' },
      (event, data) => events.push({ event, data }),
    );

    expect(llm.completeJson).toHaveBeenCalledWith(
      expect.objectContaining({ schemaName: 'synqdrive_tire_specs' }),
    );
    const result = events.find((e) => e.event === 'result');
    expect((result!.data as any).specs.matchedBrand).toBe('Michelin');
  });
});
