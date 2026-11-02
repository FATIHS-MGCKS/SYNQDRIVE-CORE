import {
  buildVehicleSpecJsonSchema,
  VEHICLE_SPEC_FIELD_KEYS,
} from './vehicle-spec-ai.schema.util';
import {
  applyVariantConfidenceGate,
  normalizeVehicleSpecValues,
} from './vehicle-spec-ai.normalize.util';
import { postProcessVehicleSpecOutput } from './vehicle-spec-ai.postprocess.util';

describe('vehicle-spec-ai systemPowerDefinition', () => {
  it('includes systemPowerDefinition in schema with motion enum', () => {
    expect(VEHICLE_SPEC_FIELD_KEYS).toContain('systemPowerDefinition');
    const schema = buildVehicleSpecJsonSchema() as {
      properties: Record<string, { enum?: string[]; anyOf?: Array<{ enum?: string[] }> }>;
    };
    const prop = schema.properties.systemPowerDefinition;
    const enumValues = prop.enum ?? prop.anyOf?.find((v) => v.enum)?.enum;
    expect(enumValues).toEqual([
      'OEM_RATED_MOTOR_KW',
      'OEM_RATED_SYSTEM_KW',
      'OEM_RATED_SYSTEM_KW_ESTIMATED',
    ]);
  });

  it('normalizes valid enum tokens and rejects unknown values', () => {
    const normalized = normalizeVehicleSpecValues({
      systemMotorPowerKw: 150,
      systemPowerDefinition: 'oem_rated_motor_kw',
    });
    expect(normalized.systemPowerDefinition).toBe('OEM_RATED_MOTOR_KW');
    const legacy = normalizeVehicleSpecValues({
      systemMotorPowerKw: 110,
      systemPowerDefinition: 'OEM_RATED_ENGINE_KW',
    });
    expect(legacy.systemPowerDefinition).toBe('OEM_RATED_MOTOR_KW');
    const invalid = normalizeVehicleSpecValues({
      systemMotorPowerKw: 150,
      systemPowerDefinition: 'COMBINED_SYSTEM',
    });
    expect(invalid.systemPowerDefinition).toBeNull();
  });

  it('clears definition when systemMotorPowerKw is absent', () => {
    const normalized = normalizeVehicleSpecValues({
      systemPowerDefinition: 'OEM_RATED_SYSTEM_KW',
    });
    expect(normalized.systemPowerDefinition).toBeNull();
  });

  it('clears definition under variant confidence gate', () => {
    const specs = {
      variantConfidence: 0.4,
      systemMotorPowerKw: 150,
      systemPowerDefinition: 'OEM_RATED_MOTOR_KW',
    };
    applyVariantConfidenceGate(specs);
    expect(specs.systemPowerDefinition).toBeNull();
    expect(specs.systemMotorPowerKw).toBeNull();
  });

  it('does not derive definition from electrification level alone', () => {
    const { specs } = postProcessVehicleSpecOutput({
      electrificationLevel: 'BEV',
      systemPowerDefinition: null,
    });
    expect(specs.systemPowerDefinition).toBeNull();
    expect(specs.electrificationLevel).toBe('BEV');
  });
});
