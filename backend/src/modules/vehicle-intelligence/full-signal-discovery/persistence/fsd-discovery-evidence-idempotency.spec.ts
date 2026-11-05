import {
  buildEffectiveEvidenceStateV1,
  isEvidenceStateUnchangedV1,
} from './fsd-discovery-evidence-idempotency.v1';

describe('FSD-2 evidence idempotency', () => {
  const base = {
    stageId: 'stage-1',
    evidenceState: 'QUERY_PLANNED' as const,
    declaredByProvider: true,
    schemaShape: 'float',
    queryPlanned: true,
    queryAccepted: null as boolean | null,
    observedValue: null as boolean | null,
    provenanceJson: { source: 'catalog' },
    qualityJson: { confidence: 'HIGH' },
  };

  it('treats identical replay as unchanged including json fields', () => {
    const input = {
      evidenceState: 'QUERY_PLANNED' as const,
      queryPlanned: true,
      schemaShape: 'float',
      declaredByProvider: true,
      provenanceJson: { source: 'catalog' },
      qualityJson: { confidence: 'HIGH' },
    };
    const effective = buildEffectiveEvidenceStateV1(base, input, base);
    expect(isEvidenceStateUnchangedV1(base, effective)).toBe(true);
  });

  it('detects provenance and queryAccepted changes', () => {
    const effective = buildEffectiveEvidenceStateV1(base, {
      evidenceState: 'QUERY_PLANNED',
      provenanceJson: { source: 'historical' },
    }, base);
    expect(isEvidenceStateUnchangedV1(base, effective)).toBe(false);
    const withAccepted = buildEffectiveEvidenceStateV1(base, {
      evidenceState: 'QUERY_PLANNED',
      queryAccepted: true,
    }, base);
    expect(isEvidenceStateUnchangedV1(base, withAccepted)).toBe(false);
  });
});
