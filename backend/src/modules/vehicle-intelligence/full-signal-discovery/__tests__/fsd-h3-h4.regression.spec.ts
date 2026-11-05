import {
  createDefaultFsdBudgetConfigV1,
  interpretFsdGraphqlProviderResponse,
  planFsdFullSignalDiscoveryV1,
  planFsdHistoricalQueries,
} from '../index';
import {
  FSD_P2E_HISTORICAL_WINDOW_V1,
  FSD_TESLA_P2E_DECLARED_FIELDS_V1,
} from '../__fixtures__/fsd-p2e-tesla.fixture.v1';

describe('FSD-1 H3/H4 safety regressions', () => {
  const tokenId = 4242;

  it('H3 — historical planner rejects window exceeding maxHistoricalWindowSeconds', () => {
    const budget = createDefaultFsdBudgetConfigV1({ maxHistoricalWindowSeconds: 100 });
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: ['speed'],
      window: FSD_P2E_HISTORICAL_WINDOW_V1,
      budget,
    });
    expect(plan.chunks).toHaveLength(0);
    expect(plan.budgetValidation.ok).toBe(false);
    if (!plan.budgetValidation.ok) {
      expect(plan.budgetValidation.reason).toBe('HISTORICAL_WINDOW_TOO_LONG');
    }
  });

  it('H3 — full discovery fail-closed when requested historical window is invalid', () => {
    const budget = createDefaultFsdBudgetConfigV1({ maxHistoricalWindowSeconds: 100 });
    const plan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: FSD_P2E_HISTORICAL_WINDOW_V1,
      budget,
    });
    expect(plan.executable).toBe(false);
    expect(plan.nonExecutableReason).toBe('HISTORICAL_WINDOW_TOO_LONG');
    expect(plan.executableProviderRequestCount).toBe(0);
    expect(plan.snapshot.documents).toHaveLength(0);
    expect(plan.historical?.chunks ?? []).toHaveLength(0);
    expect(plan.budgetValidation.ok).toBe(false);
    if (!plan.budgetValidation.ok) {
      expect(plan.budgetValidation.reason).toBe('HISTORICAL_WINDOW_TOO_LONG');
    }
  });

  it('H4 — GraphQL errors without resolvable path never accept document', () => {
    const interpretation = interpretFsdGraphqlProviderResponse({
      fieldNamesInDocument: ['speed', 'exteriorAirTemperature'],
      dataPresent: true,
      errors: [{ message: 'whole subtree rejected' }],
    });
    expect(interpretation.documentAccepted).toBe(false);
    for (const field of interpretation.fields) {
      expect(field.attribution).toBe('AMBIGUOUS');
      expect(field.evidence.queryAccepted).toBe(false);
      expect(field.evidence.queryFailed).toBeUndefined();
    }
  });

  it('H4 — preserves reliable field attribution when error path names the field', () => {
    const interpretation = interpretFsdGraphqlProviderResponse({
      fieldNamesInDocument: ['speed', 'exteriorAirTemperature'],
      dataPresent: true,
      errors: [{ path: ['signals', 0, 'exteriorAirTemperature'], message: 'failed' }],
    });
    expect(interpretation.documentAccepted).toBe(false);
    const speed = interpretation.fields.find((f) => f.fieldName === 'speed')!;
    const temp = interpretation.fields.find((f) => f.fieldName === 'exteriorAirTemperature')!;
    expect(speed.attribution).toBe('RELIABLE');
    expect(speed.evidence.queryAccepted).toBe(false);
    expect(temp.attribution).toBe('RELIABLE');
    expect(temp.evidence.queryFailed).toBe(true);
  });
});
