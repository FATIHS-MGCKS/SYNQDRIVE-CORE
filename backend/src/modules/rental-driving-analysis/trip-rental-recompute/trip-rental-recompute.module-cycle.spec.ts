import { MODULE_METADATA } from '@nestjs/common/constants';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis.module';

function importsOf(mod: object): unknown[] {
  return (Reflect.getMetadata(MODULE_METADATA.IMPORTS, mod) as unknown[] | undefined) ?? [];
}

function referencesModule(imports: unknown[], target: object): boolean {
  return imports.some((entry) => {
    if (entry === target) return true;
    if (typeof entry === 'object' && entry !== null && 'forwardRef' in entry) {
      return (entry as { forwardRef: () => unknown }).forwardRef() === target;
    }
    return false;
  });
}

describe('P2-PR2 — VI / RentalDrivingAnalysis module graph', () => {
  it('VehicleIntelligenceModule does not directly import RentalDrivingAnalysisModule', () => {
    expect(referencesModule(importsOf(VehicleIntelligenceModule), RentalDrivingAnalysisModule)).toBe(
      false,
    );
  });

  it('RentalDrivingAnalysisModule imports VehicleIntelligenceModule (one-way)', () => {
    expect(referencesModule(importsOf(RentalDrivingAnalysisModule), VehicleIntelligenceModule)).toBe(
      true,
    );
  });
});
