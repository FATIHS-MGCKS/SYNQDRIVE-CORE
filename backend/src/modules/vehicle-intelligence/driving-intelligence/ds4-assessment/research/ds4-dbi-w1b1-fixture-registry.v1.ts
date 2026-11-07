import {
  DS4_DBI_W0_HISTORICAL_FIXTURES_V1,
  type Ds4DbiW0HistoricalFixtureIdV1,
} from './ds4-dbi-w0-historical-replay.fixture-registry.v1';

export const DS4_DBI_W1B1_FIXTURE_REGISTRY_VERSION = 'ds4-dbi-w1b1-fixture-registry-v1' as const;

export type Ds4DbiW1b1FixtureIdV1 = 'W1B1_SYNTHETIC_POSITIVE' | 'TIG22' | 'TIG22_V4';

export type Ds4DbiW1b1FixtureClassificationV1 = 'SYNTHETIC' | 'HISTORICAL_RECORDING';

export type Ds4DbiW1b1FixtureRecordV1 = {
  fixtureId: Ds4DbiW1b1FixtureIdV1;
  classification: Ds4DbiW1b1FixtureClassificationV1;
  payloadRelPath: string;
  evidenceManifestRelPath: string;
  allowedReadRootsRel: readonly string[];
  /** Historical mapping for parity documentation. */
  historicalFixtureId: Ds4DbiW0HistoricalFixtureIdV1 | null;
};

const RESEARCH_FIXTURE_ROOT = 'architecture/drivingintelligence/research/fixtures';
const HISTORICAL_EVAL_ROOT = 'research/driving-intelligence/evaluations';

export const DS4_DBI_W1B1_FIXTURES_V1: Readonly<Record<Ds4DbiW1b1FixtureIdV1, Ds4DbiW1b1FixtureRecordV1>> = {
  W1B1_SYNTHETIC_POSITIVE: {
    fixtureId: 'W1B1_SYNTHETIC_POSITIVE',
    classification: 'SYNTHETIC',
    payloadRelPath: `${RESEARCH_FIXTURE_ROOT}/w1b1-synthetic-positive-v1/payload.json`,
    evidenceManifestRelPath: `${RESEARCH_FIXTURE_ROOT}/w1b1-synthetic-positive-v1/evidence_manifest.json`,
    allowedReadRootsRel: [RESEARCH_FIXTURE_ROOT],
    historicalFixtureId: null,
  },
  TIG22: {
    fixtureId: 'TIG22',
    classification: 'HISTORICAL_RECORDING',
    payloadRelPath: DS4_DBI_W0_HISTORICAL_FIXTURES_V1.TIG22.motionCoreShadowPayloadRelPath!,
    evidenceManifestRelPath: `${RESEARCH_FIXTURE_ROOT}/w1b1-historical-reference/tig22.evidence_manifest.json`,
    allowedReadRootsRel: [HISTORICAL_EVAL_ROOT, `${RESEARCH_FIXTURE_ROOT}/w1b1-historical-reference`],
    historicalFixtureId: 'TIG22',
  },
  TIG22_V4: {
    fixtureId: 'TIG22_V4',
    classification: 'HISTORICAL_RECORDING',
    payloadRelPath: DS4_DBI_W0_HISTORICAL_FIXTURES_V1.TIG22_V4.motionCoreShadowPayloadRelPath!,
    evidenceManifestRelPath: `${RESEARCH_FIXTURE_ROOT}/w1b1-historical-reference/tig22_v4.evidence_manifest.json`,
    allowedReadRootsRel: [HISTORICAL_EVAL_ROOT, `${RESEARCH_FIXTURE_ROOT}/w1b1-historical-reference`],
    historicalFixtureId: 'TIG22_V4',
  },
};
