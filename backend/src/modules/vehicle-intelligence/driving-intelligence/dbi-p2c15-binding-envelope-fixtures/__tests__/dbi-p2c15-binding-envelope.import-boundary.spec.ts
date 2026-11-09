import * as fs from 'fs';
import * as path from 'path';

const FIXTURE_ROOT = path.join(__dirname, '..');

const FORBIDDEN_IMPORT_FRAGMENTS = [
  'clickhouse',
  'prisma',
  'misuse-cases',
  'trip-behavior-enrichment',
  'shadow-detector.persistence',
  'detectKickdownLikeClusters',
  'detectSustainedHighLoadClusters',
  'detectHighRpmStationaryClusters',
  'detectExcessiveIdlingFromHf',
  'process.env',
  'Date.now(',
  'Math.random(',
];

const FIXTURE_SOURCE_FILES = fs
  .readdirSync(FIXTURE_ROOT)
  .filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));

describe('dbi-p2c15-binding-envelope import boundary', () => {
  it('keeps fixture library test-only and free of production readers', () => {
    for (const file of FIXTURE_SOURCE_FILES) {
      const content = fs.readFileSync(path.join(FIXTURE_ROOT, file), 'utf8');
      for (const frag of FORBIDDEN_IMPORT_FRAGMENTS) {
        expect(content.includes(frag)).toBe(false);
      }
    }
  });
});
