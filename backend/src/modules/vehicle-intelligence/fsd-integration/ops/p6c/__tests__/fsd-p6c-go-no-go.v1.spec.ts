import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import type { FsdP6cFleetDiscoveryPlanReportV1 } from '../fsd-p6c-fleet-plan.v1';
import {
  buildFsdP6cLiveTestGoNoGoV1,
  isFsdP6cLiveGoEligibleV1,
} from '../fsd-p6c-go-no-go.v1';

function productionPlanReport(): FsdP6cFleetDiscoveryPlanReportV1 {
  return {
    schemaVersion: 'FSD_P6C_FLEET_PLAN_REPORT_V1',
    organizationId: '11111111-1111-4111-8111-111111111111',
    budget: createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 12 }),
    historicalWindow: { fromUtc: '2026-11-04T04:32:00.000Z', toUtc: '2026-11-04T04:57:37.477Z' },
    vehicles: [],
    fleetCumulativePlannedProviderRequests: 7,
    fleetSequentialPlannedProviderRequests: 7,
    peakInFlightProviderRequests: 1,
    maxPlannedProviderRequestsPerVehicle: 7,
    allExecutable: true,
    anyCatalogPending: false,
    planCompleteness: 'FULL',
    planBinding: 'PRODUCTION_DECLARED_FIELDS',
  };
}

function guardOk() {
  return {
    ok: true as const,
    peakInFlightProviderRequests: 1,
    fleetCumulativePlannedProviderRequests: 7,
    fleetSequentialPlannedProviderRequests: 7,
    offlineReferenceOnly: false,
    notes: [],
  };
}

describe('FSD P6C GO/NO-GO correctness', () => {
  it('allows GO only for fully satisfied live execute gates', () => {
    const go = buildFsdP6cLiveTestGoNoGoV1({
      planReport: productionPlanReport(),
      providerBudgetGuard: guardOk(),
      context: 'EXECUTE',
      liveProvider: 'dimo_live',
      ownerAuthorizationSatisfied: true,
      productionManifestValid: true,
      architectureReviewCleared: true,
    });
    expect(go.decision).toBe('GO');
    expect(isFsdP6cLiveGoEligibleV1(go.gates)).toBe(true);
    expect(go.gates.offlineReferenceOnly).toBe(false);
  });

  it('rejects BUDGET_TRUNCATED even when allExecutable and provider guard appear OK', () => {
    const plan = {
      ...productionPlanReport(),
      allExecutable: true,
      planCompleteness: 'BUDGET_TRUNCATED' as const,
    };
    const decision = buildFsdP6cLiveTestGoNoGoV1({
      planReport: plan,
      providerBudgetGuard: guardOk(),
      context: 'EXECUTE',
      liveProvider: 'dimo_live',
      ownerAuthorizationSatisfied: true,
      productionManifestValid: true,
      architectureReviewCleared: true,
    }).decision;
    expect(decision).toBe('NO_GO');

    const gates = buildFsdP6cLiveTestGoNoGoV1({
      planReport: plan,
      providerBudgetGuard: guardOk(),
      context: 'EXECUTE',
      liveProvider: 'dimo_live',
      ownerAuthorizationSatisfied: true,
      productionManifestValid: true,
      architectureReviewCleared: true,
    }).gates;
    expect(gates.allPlansExecutable).toBe(true);
    expect(gates.providerBudgetGuardOk).toBe(true);
    expect(gates.planCompletenessFull).toBe(false);
    expect(isFsdP6cLiveGoEligibleV1(gates)).toBe(false);
  });

  it('rejects OFFLINE, mock execute, missing owner, missing architecture, bad manifest', () => {
    const plan = productionPlanReport();
    const guard = guardOk();

    expect(
      buildFsdP6cLiveTestGoNoGoV1({
        planReport: { ...plan, planBinding: 'OFFLINE_REFERENCE' },
        providerBudgetGuard: { ...guard, offlineReferenceOnly: true },
        context: 'OFFLINE_PLAN',
        liveProvider: 'mock',
        ownerAuthorizationSatisfied: false,
        productionManifestValid: false,
        architectureReviewCleared: false,
      }).decision,
    ).toBe('NO_GO');

    expect(
      buildFsdP6cLiveTestGoNoGoV1({
        planReport: plan,
        providerBudgetGuard: guard,
        context: 'EXECUTE',
        liveProvider: 'mock',
        ownerAuthorizationSatisfied: true,
        productionManifestValid: true,
        architectureReviewCleared: true,
      }).decision,
    ).toBe('NO_GO');

    expect(
      buildFsdP6cLiveTestGoNoGoV1({
        planReport: plan,
        providerBudgetGuard: guard,
        context: 'EXECUTE',
        liveProvider: 'dimo_live',
        ownerAuthorizationSatisfied: false,
        productionManifestValid: true,
        architectureReviewCleared: true,
      }).decision,
    ).toBe('NO_GO');

    expect(
      buildFsdP6cLiveTestGoNoGoV1({
        planReport: plan,
        providerBudgetGuard: guard,
        context: 'EXECUTE',
        liveProvider: 'dimo_live',
        ownerAuthorizationSatisfied: true,
        productionManifestValid: true,
        architectureReviewCleared: false,
      }).decision,
    ).toBe('NO_GO');

    expect(
      buildFsdP6cLiveTestGoNoGoV1({
        planReport: plan,
        providerBudgetGuard: guard,
        context: 'EXECUTE',
        liveProvider: 'dimo_live',
        ownerAuthorizationSatisfied: true,
        productionManifestValid: false,
        architectureReviewCleared: true,
      }).decision,
    ).toBe('NO_GO');
  });
});
