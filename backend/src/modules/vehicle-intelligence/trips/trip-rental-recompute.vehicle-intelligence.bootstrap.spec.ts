import { MODULE_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { TRIP_RENTAL_RECOMPUTE_PORT } from './ports/trip-rental-recompute.port';
import { TripAssignmentService } from './trip-assignment.service';
import { TripPostFinalizeAnalysisProducer } from '../driving-analysis-init/trip-post-finalize-analysis.producer';
import { TripRentalRecomputePortAdapter } from '@modules/rental-driving-analysis/trip-rental-recompute/trip-rental-recompute.adapter';
import { RentalDrivingAnalysisModule } from '@modules/rental-driving-analysis/rental-driving-analysis.module';
import { RentalDrivingAnalysisRecomputeTriggerService } from '@modules/rental-driving-analysis/rental-driving-analysis-recompute.trigger';
import { RentalDrivingAnalysisRecomputeJobHandler } from '@modules/rental-driving-analysis/rental-driving-analysis-recompute.handler';
import { VehicleIntelligenceModule } from '../vehicle-intelligence.module';
import { probeVehicleIntelligenceModuleCompile } from './vi-full-module-bootstrap.probe';

function moduleImports(mod: object): unknown[] {
  return (Reflect.getMetadata(MODULE_METADATA.IMPORTS, mod) as unknown[] | undefined) ?? [];
}

function referencesModule(imports: unknown[], target: unknown): boolean {
  return imports.some((entry) => {
    if (entry === target) return true;
    if (typeof entry === 'object' && entry !== null && 'forwardRef' in entry) {
      const forwardRef = (entry as { forwardRef: () => unknown }).forwardRef;
      return forwardRef() === target;
    }
    return false;
  });
}

describe('VehicleIntelligenceModule — P2-PR2 rental recompute bootstrap', () => {
  let probe: Awaited<ReturnType<typeof probeVehicleIntelligenceModuleCompile>>;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    probe = await probeVehicleIntelligenceModuleCompile();
    if (probe.outcome === 'PASS') {
      moduleRef = probe.moduleRef;
    }
  }, 180_000);

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('FULL_MODULE_BOOTSTRAP compiles VehicleIntelligenceModule (not BASELINE_BLOCKED)', () => {
    if (probe.outcome !== 'PASS') {
      throw new Error(`FULL_MODULE_BOOTSTRAP failed: ${probe.message}`);
    }
    expect(probe.outcome).toBe('PASS');
  });

  it('does not directly import RentalDrivingAnalysisModule', () => {
    const imports = moduleImports(VehicleIntelligenceModule);
    expect(referencesModule(imports, RentalDrivingAnalysisModule)).toBe(false);
  });

  it('resolves TRIP_RENTAL_RECOMPUTE_PORT, assignment, post-finalize, rental stack', () => {
    if (!moduleRef) {
      throw new Error('moduleRef missing after PASS compile');
    }
    const port = moduleRef.get(TRIP_RENTAL_RECOMPUTE_PORT);
    expect(port).toBeInstanceOf(TripRentalRecomputePortAdapter);

    const assignment = moduleRef.get(TripAssignmentService);
    const producer = moduleRef.get(TripPostFinalizeAnalysisProducer);
    expect(assignment).toBeDefined();
    expect(producer).toBeDefined();

    const trigger = moduleRef.get(RentalDrivingAnalysisRecomputeTriggerService);
    const handler = moduleRef.get(RentalDrivingAnalysisRecomputeJobHandler);
    expect(trigger).toBeDefined();
    expect(handler).toBeDefined();
  });
});

describe('RentalDrivingAnalysisModule — module boundary', () => {
  it('imports VehicleIntelligenceModule only (one-way)', () => {
    const imports = moduleImports(RentalDrivingAnalysisModule);
    expect(referencesModule(imports, VehicleIntelligenceModule)).toBe(true);
  });

  it('does not create a direct RentalDrivingAnalysisModule import on VehicleIntelligenceModule', () => {
    const viImports = moduleImports(VehicleIntelligenceModule);
    expect(referencesModule(viImports, RentalDrivingAnalysisModule)).toBe(false);
  });
});
