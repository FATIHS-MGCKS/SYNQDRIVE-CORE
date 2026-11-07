/**
 * Historical cohort D8 validation report (research only) — compare distinct shadow runs.
 */

import { computeDs4DbiW0MbfFromPayloadV1 } from './ds4-dbi-w0-mbf-kernel.v1';
import { buildDs4DbiW0HistoricalD8CompatibilityReportV1 } from './ds4-dbi-w0-historical-replay-d8-compat.v1';
import type { Ds4DbiW0HistoricalFixtureIdV1 } from './ds4-dbi-w0-historical-replay.fixture-registry.v1';
import {
  loadDs4DbiW0HistoricalMotionFixtureV1,
  type Ds4DbiW0HistoricalReplayLoadSuccessV1,
} from './ds4-dbi-w0-historical-replay.loader.v1';

export type Ds4DbiW0HistoricalCohortArmSummaryV1 = {
  fixtureId: Ds4DbiW0HistoricalFixtureIdV1;
  sourceMotionRunId: string;
  shadowBundleVersion: string;
  payloadFileSha256: string;
  contractSpeedAuthority: string | null;
  speedAuthorityBindingSource: string | null;
  eventsTotal: number;
  eventsQualityOk: number;
  acceptedEventsRunMeta: number | null;
  exposureSecondsEs: number;
  canonical: {
    d4: string;
    d5: string;
    d6: string;
    d8: string;
    d8ReasonCodes: string[];
  };
  researchAdaptedD8: {
    status: string;
    reasonCodes: string[];
    admittedEventCount: number;
    nonEmptyWindowCount: number | null;
    totalWindowSlots: number | null;
    eventCount: number | null;
  };
};

function armSummary(load: Ds4DbiW0HistoricalReplayLoadSuccessV1): Ds4DbiW0HistoricalCohortArmSummaryV1 {
  const kernel = computeDs4DbiW0MbfFromPayloadV1({
    payload: load.payload,
    tripMeta: load.tripMeta,
    qualityTier: 'STRICT',
    expectedContentFingerprint: load.payloadFileSha256,
    expectedShadowBundleVersion: load.tripMeta.shadowBundleVersion,
    evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
  });
  const d8compat = buildDs4DbiW0HistoricalD8CompatibilityReportV1(load);
  const eventsOk = load.payload.events.filter((e) => e.quality === 'OK').length;
  return {
    fixtureId: load.fixture.fixtureId,
    sourceMotionRunId: load.tripMeta.sourceMotionRunId,
    shadowBundleVersion: load.tripMeta.shadowBundleVersion,
    payloadFileSha256: load.payloadFileSha256,
    contractSpeedAuthority: load.payload.contract?.speedAuthority ?? null,
    speedAuthorityBindingSource: load.speedAuthorityBinding.ok ? load.speedAuthorityBinding.source : null,
    eventsTotal: load.payload.events.length,
    eventsQualityOk: eventsOk,
    acceptedEventsRunMeta: null,
    exposureSecondsEs: load.tripMeta.exposureSecondsEs,
    canonical: {
      d4: kernel.d4SpeedVariabilityRobustCv.status,
      d5: kernel.d5SpeedRoughnessMeanAbsDeltaKmhPerS.status,
      d6: kernel.d6StopStructure.status,
      d8: kernel.d8Burstiness.status,
      d8ReasonCodes: kernel.d8Burstiness.reasonCodes,
    },
    researchAdaptedD8: {
      status: d8compat.researchAdapted.d8?.status ?? 'NOT_RUN',
      reasonCodes: d8compat.researchAdapted.d8?.reasonCodes ?? [],
      admittedEventCount: d8compat.researchAdapted.clock?.admittedEventCount ?? 0,
      nonEmptyWindowCount: d8compat.researchAdapted.clock?.nonEmptyWindowCount ?? null,
      totalWindowSlots: d8compat.researchAdapted.d8?.totalWindowSlots ?? null,
      eventCount: d8compat.researchAdapted.d8?.eventCount ?? null,
    },
  };
}

export type Ds4DbiW0HistoricalCohortD8ReportV1 = {
  contractVersion: 'ds4-dbi-w0-historical-cohort-d8-v1';
  bindingTier: 'RELAXED';
  independentScientificValidationStatus: 'NOT_EVALUATED';
  arms: Ds4DbiW0HistoricalCohortArmSummaryV1[];
  comparisonNotes: string[];
  otherRealDrivesInRepo: string[];
  bestD8ValidationCandidate: {
    fixtureId: Ds4DbiW0HistoricalFixtureIdV1 | 'NONE';
    reason: string;
  };
};

export function buildDs4DbiW0HistoricalCohortD8ReportV1(input: {
  fixtureIds: Ds4DbiW0HistoricalFixtureIdV1[];
  repositoryRoot: string;
}): Ds4DbiW0HistoricalCohortD8ReportV1 {
  const arms: Ds4DbiW0HistoricalCohortArmSummaryV1[] = [];
  const notes: string[] = [];

  for (const fixtureId of input.fixtureIds) {
    const load = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId,
      bindingTier: 'RELAXED',
      repositoryRoot: input.repositoryRoot,
    });
    if (!load.ok) {
      notes.push(`${fixtureId}: load failed — ${load.codes.join(',')}`);
      continue;
    }
    arms.push(armSummary(load));
  }

  const eligible = arms.filter(
    (a) =>
      a.researchAdaptedD8.status === 'KNOWN' &&
      a.researchAdaptedD8.admittedEventCount >= 10 &&
      (a.researchAdaptedD8.nonEmptyWindowCount ?? 0) >= 10,
  );

  let best: Ds4DbiW0HistoricalCohortD8ReportV1['bestD8ValidationCandidate'] = {
    fixtureId: 'NONE',
    reason: 'No in-repo historical arm satisfies frozen D8 gates under research-adapted clock',
  };
  if (eligible.length > 0) {
    const pick = eligible.sort(
      (a, b) => (b.researchAdaptedD8.nonEmptyWindowCount ?? 0) - (a.researchAdaptedD8.nonEmptyWindowCount ?? 0),
    )[0]!;
    best = {
      fixtureId: pick.fixtureId,
      reason: 'Research-adapted D8 KNOWN with ≥10 admitted events and ≥10 nonempty windows',
    };
  } else if (arms.length > 0) {
    const richest = [...arms].sort(
      (a, b) => (b.researchAdaptedD8.nonEmptyWindowCount ?? 0) - (a.researchAdaptedD8.nonEmptyWindowCount ?? 0),
    )[0]!;
    best = {
      fixtureId: richest.fixtureId,
      reason: `Closest cohort arm: research D8 ${richest.researchAdaptedD8.status}; ${richest.researchAdaptedD8.nonEmptyWindowCount ?? 0} nonempty windows`,
    };
  }

  if (arms.some((a) => a.fixtureId === 'TIG22' && arms.some((b) => b.fixtureId === 'TIG22_V4'))) {
    const pre = arms.find((a) => a.fixtureId === 'TIG22')!;
    const v4 = arms.find((a) => a.fixtureId === 'TIG22_V4')!;
    notes.push(
      `TIG22_PRE_FABLE vs TIG22_V4: same trip, distinct runs (${pre.sourceMotionRunId} vs ${v4.sourceMotionRunId}); OK events ${pre.eventsQualityOk} vs ${v4.eventsQualityOk}; research admitted ${pre.researchAdaptedD8.admittedEventCount} vs ${v4.researchAdaptedD8.admittedEventCount}; nonempty windows ${pre.researchAdaptedD8.nonEmptyWindowCount} vs ${v4.researchAdaptedD8.nonEmptyWindowCount}`,
    );
  }

  return {
    contractVersion: 'ds4-dbi-w0-historical-cohort-d8-v1',
    bindingTier: 'RELAXED',
    independentScientificValidationStatus: 'NOT_EVALUATED',
    arms,
    comparisonNotes: notes,
    otherRealDrivesInRepo: [
      'No additional in-repo Motion-Core JSON for Audi/Arteon/Tesla/Tiguan beyond TIG22 variants and TES16 (no payload bytes)',
    ],
    bestD8ValidationCandidate: best,
  };
}
