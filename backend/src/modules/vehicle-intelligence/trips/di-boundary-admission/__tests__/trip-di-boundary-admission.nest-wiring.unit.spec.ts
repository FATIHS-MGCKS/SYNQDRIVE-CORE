import * as fs from 'fs';
import * as path from 'path';

describe('Trip DI boundary admission Nest wiring', () => {
  it('registers TripDiBoundaryAdmissionService and injects it into trip finalize orchestration', () => {
    const repoRoot = path.join(__dirname, '../../../../../..');
    const moduleSrc = fs.readFileSync(
      path.join(repoRoot, 'src/modules/vehicle-intelligence/vehicle-intelligence.module.ts'),
      'utf8',
    );
    const orchestrationSrc = fs.readFileSync(
      path.join(repoRoot, 'src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts'),
      'utf8',
    );
    const reconciliationSrc = fs.readFileSync(
      path.join(repoRoot, 'src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service.ts'),
      'utf8',
    );
    expect(moduleSrc).toContain('TripDiBoundaryAdmissionService');
    expect(orchestrationSrc).toContain('private readonly diBoundaryAdmission: TripDiBoundaryAdmissionService');
    expect(orchestrationSrc).toContain('releaseLiveFsmSplitSegmentsAfterFinalization');
    expect(reconciliationSrc).toContain('private readonly diBoundaryAdmission: TripDiBoundaryAdmissionService');
    expect(reconciliationSrc).not.toContain('diBoundaryAdmission?: TripDiBoundaryAdmissionService');
    const serviceSrc = fs.readFileSync(
      path.join(
        repoRoot,
        'src/modules/vehicle-intelligence/trips/di-boundary-admission/trip-di-boundary-admission.service.ts',
      ),
      'utf8',
    );
    expect(serviceSrc).toContain('@Optional() private readonly tripMetrics?: TripMetricsService');
    expect(serviceSrc).toContain('getTripDiBoundaryAdmissionRecoveryMetrics(registry)');
  });
});
