// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { MasterVsiProfileDetailDto, MasterVsiSignalDetailDto } from './vsi-master-intelligence-api.types';
import {
  buildEngineRpmDualProvenanceView,
  parseEngineRpmCadenceEvidence,
} from './vsi-engine-rpm-dual-provenance.utils';
import { VsiEngineRpmDualProvenancePanel } from './VsiEngineRpmDualProvenancePanel';

function baseProfile(overrides: Partial<MasterVsiProfileDetailDto> = {}): MasterVsiProfileDetailDto {
  return {
    providerSourceLinkId: 'link-a',
    providerIdentity: 'dimo:x',
    provider: 'DIMO',
    profileRevision: 1,
    profileContractVersion: 'v2',
    evaluatedAt: '2026-10-29T22:21:14.704Z',
    lastMaterializedSourceTimestamp: '2026-10-29T17:32:37.000Z',
    lastMaterializedProviderFetchAt: '2026-10-29T22:21:14.621Z',
    profileLimitations: [],
    lvStandbyProfile: 'LV_8H_OBSERVED',
    lvClassificationDecisionCode: null,
    lvEvidenceConfidence: null,
    rpmActiveProfile: 'RPM_STANDARD',
    rpmApplicability: 'APPLICABLE',
    rpmClassificationDecisionCode: 'ROLLING_SUPERMAJORITY',
    observedDensityLabel: 'SUB_ONE_HZ',
    evaluationBlocked: false,
    evaluationBlockedCodes: [],
    contentFingerprintPrefix: 'abc…',
    signals: [],
    fetchTimeIsNotNewSignalProof: true,
    ...overrides,
  };
}

function engineSignal(
  cadence: Record<string, unknown> | null,
  overrides: Partial<MasterVsiSignalDetailDto> = {},
): MasterVsiSignalDetailDto {
  return {
    canonicalSignalKey: 'engine_rpm',
    providerNativeSignalName: 'powertrainCombustionEngineSpeed',
    declaredSupport: 'UNKNOWN',
    empiricalObservation: 'NEVER_OBSERVED',
    qualityClassification: 'NEVER_OBSERVED',
    confidenceLevel: 'LOW',
    lastValidObservationAt: null,
    lastSourceTimestamp: null,
    lastProviderFetchAt: '2026-10-29T22:21:14.621Z',
    freshnessClassification: 'UNKNOWN',
    evidenceProvenance: ['VEHICLE_LATEST_STATE'],
    limitations: ['ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE'],
    cadenceIntelligence: cadence,
    ...overrides,
  };
}

/** Production-shaped Audi A4 excerpt (read-only audit 2026-10-29). */
const AUDI_CADENCE: Record<string, unknown> = {
  provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS', 'CLICKHOUSE_TELEMETRY_HF_POINTS'],
  observedSampleCount: 2281,
  distinctTimestampCount: 2281,
  finalizedTripCount: 20,
  activeRpmProfile: {
    activeProfile: 'RPM_STANDARD',
    classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
    tripClassifications: [
      {
        tripId: 'f9e2fd66-62de-4867-b652-0ee446588ee2',
        profile: 'RPM_STANDARD',
        decisionCode: 'ACTIVE_SLOW_MEASUREMENT_SEQUENCES',
        rpmPointCount: 164,
      },
    ],
  },
};

const TIGUAN_CADENCE: Record<string, unknown> = {
  provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
  observedSampleCount: 5589,
  finalizedTripCount: 20,
  activeRpmProfile: {
    activeProfile: 'UNKNOWN',
    classificationDecisionCode: 'CONTRADICTORY_TRIP_EVIDENCE',
    tripClassifications: [
      {
        tripId: '20be43c4-6ed4-4854-868b-de9b9cf92b1a',
        profile: 'RPM_1HZ',
        decisionCode: 'ACTIVE_FAST_MEASUREMENT_SEQUENCES',
        rpmPointCount: 291,
      },
      {
        tripId: '4dcc7cbf-9d1c-4efa-b395-6ad540091143',
        profile: 'RPM_STANDARD',
        decisionCode: 'ACTIVE_SLOW_MEASUREMENT_SEQUENCES',
        rpmPointCount: 636,
      },
    ],
  },
};

describe('vsi-engine-rpm-dual-provenance.utils', () => {
  it('Audi: snapshot NEVER_OBSERVED with HF cadence evidence and RPM_STANDARD', () => {
    const signal = engineSignal(AUDI_CADENCE);
    const cadence = parseEngineRpmCadenceEvidence(signal);
    expect(cadence.hasHfEvidence).toBe(true);
    expect(cadence.observedSampleCount).toBe(2281);
    expect(cadence.activeRpmProfile).toBe('RPM_STANDARD');
    expect(signal.empiricalObservation).toBe('NEVER_OBSERVED');

    const dual = buildEngineRpmDualProvenanceView(baseProfile(), signal);
    expect(dual.snapshot.empiricalObservation).toBe('NEVER_OBSERVED');
    expect(dual.cadence.hasHfEvidence).toBe(true);
    expect(dual.cadence.activeRpmProfile).toBe('RPM_STANDARD');
  });

  it('Audi: combined availability PROVEN_HISTORICAL_ONLY from read DTO', () => {
    const signal = engineSignal(AUDI_CADENCE, {
      rpmCombinedEvidenceAvailabilityV1: 'PROVEN_HISTORICAL_ONLY',
      rpmCombinedEvidenceContractV1: 'vsi-rpm-combined-evidence-v1',
    });
    const dual = buildEngineRpmDualProvenanceView(baseProfile(), signal);
    expect(dual.combinedEvidenceAvailabilityV1).toBe('PROVEN_HISTORICAL_ONLY');
  });

  it('Tiguan: HF evidence with RPM profile UNKNOWN', () => {
    const signal = engineSignal(TIGUAN_CADENCE);
    const cadence = parseEngineRpmCadenceEvidence(signal);
    expect(cadence.hasHfEvidence).toBe(true);
    expect(cadence.activeRpmProfile).toBe('UNKNOWN');
    expect(cadence.tripClassifications.length).toBe(2);
  });

  it('no HF cadence: hasHfEvidence false', () => {
    const signal = engineSignal(null);
    const cadence = parseEngineRpmCadenceEvidence(signal);
    expect(cadence.hasHfEvidence).toBe(false);
    expect(cadence.observedSampleCount).toBeNull();
  });

  it('Tesla-style NOT_APPLICABLE at profile level', () => {
    const signal = engineSignal(null);
    const dual = buildEngineRpmDualProvenanceView(
      baseProfile({ rpmApplicability: 'NOT_APPLICABLE', rpmActiveProfile: 'UNKNOWN' }),
      signal,
    );
    expect(dual.rpmApplicability).toBe('NOT_APPLICABLE');
  });
});

describe('VsiEngineRpmDualProvenancePanel', () => {
  it('renders separate snapshot and HF sections for Audi fixture', async () => {
    const signal = engineSignal(AUDI_CADENCE);
    const dual = buildEngineRpmDualProvenanceView(baseProfile(), signal);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const t = (key: string) => key;

    await act(async () => {
      root.render(
        createElement(VsiEngineRpmDualProvenancePanel, {
          dual,
          formatTimestamp: () => '—',
          t,
        }),
      );
    });

    const panel = container.querySelector('[data-testid="vsi-engine-rpm-dual-provenance"]');
    expect(panel?.textContent).toContain('master.intelligence.vsi.signals.rpmDual.snapshotHeading');
    expect(panel?.textContent).toContain('NEVER_OBSERVED');
    expect(panel?.textContent).toContain('2281');
    expect(panel?.textContent).toContain('RPM_STANDARD');
    expect(panel?.textContent).not.toMatch(/^NEVER_OBSERVED$/);

    act(() => {
      root.unmount();
      container.remove();
    });
  });
});
