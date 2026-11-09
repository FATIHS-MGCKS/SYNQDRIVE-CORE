import * as fs from 'fs';
import * as path from 'path';

const DRIVING_INTELLIGENCE_ROOT = path.join(__dirname, '..', '..');
const FIXTURE_PACKAGE_FRAGMENT = 'dbi-p2c15-binding-envelope-fixtures';
const P2C3_PACKAGE_DIR = path.join(__dirname, '..');

function listRuntimeTsFiles(dir: string, opts?: { excludeTests?: boolean }): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' && opts?.excludeTests) continue;
      files.push(...listRuntimeTsFiles(full, opts));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('dbi-p2c3 reverse import boundary', () => {
  it('P2-C3 runtime sources do not import the P2-C1.5 fixture package', () => {
    const runtimeSources = listRuntimeTsFiles(P2C3_PACKAGE_DIR, { excludeTests: true });
    for (const file of runtimeSources) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content.includes(FIXTURE_PACKAGE_FRAGMENT)).toBe(false);
    }
  });

  it('driving-intelligence runtime still forbids fixture imports outside fixture package', () => {
    const runtimeSources = listRuntimeTsFiles(DRIVING_INTELLIGENCE_ROOT).filter(
      (f) =>
        !f.includes(FIXTURE_PACKAGE_FRAGMENT) &&
        !f.includes('__tests__') &&
        !f.includes('dbi-p2c3-offline-evidence-reconciliation'),
    );
    for (const file of runtimeSources) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content.includes(FIXTURE_PACKAGE_FRAGMENT)).toBe(false);
    }
  });
});
