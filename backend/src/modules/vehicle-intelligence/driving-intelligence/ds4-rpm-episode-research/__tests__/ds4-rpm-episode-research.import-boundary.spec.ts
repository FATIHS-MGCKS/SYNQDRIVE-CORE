import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');

const SOURCE_FILES = [
  'ds4-rpm-episode-research.contract.v1.ts',
  'ds4-rpm-episode-research.input-binding.v1.ts',
  'ds4-rpm-episode-research.kernel.v1.ts',
];

const FORBIDDEN_IMPORT_FRAGMENTS = [
  'misuse-cases',
  'trip-behavior-enrichment',
  'shadow-detector.persistence',
  'ds4-dbi-w0',
  'ds4-dbi-w1c',
  'motion-core-shadow-worker',
];

describe('ds4-rpm-episode-research import boundary', () => {
  it('does not import production misuse or persistence paths', () => {
    for (const file of SOURCE_FILES) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const forbidden of FORBIDDEN_IMPORT_FRAGMENTS) {
        expect(content.includes(forbidden)).toBe(false);
      }
    }
  });
});
