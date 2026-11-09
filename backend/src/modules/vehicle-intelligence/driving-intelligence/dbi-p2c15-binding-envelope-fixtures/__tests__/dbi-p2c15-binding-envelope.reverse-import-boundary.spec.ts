import * as fs from 'fs';
import * as path from 'path';

const DRIVING_INTELLIGENCE_ROOT = path.join(__dirname, '..', '..');
const FIXTURE_PACKAGE_FRAGMENT = 'dbi-p2c15-binding-envelope-fixtures';

function listTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === FIXTURE_PACKAGE_FRAGMENT || entry.name === '__tests__' || entry.name === 'node_modules') {
        continue;
      }
      files.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('dbi-p2c15 reverse import boundary', () => {
  it('forbids runtime modules from importing the fixture package', () => {
    const runtimeSources = listTsFiles(DRIVING_INTELLIGENCE_ROOT);
    for (const file of runtimeSources) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content.includes(FIXTURE_PACKAGE_FRAGMENT)).toBe(false);
    }
  });
});
