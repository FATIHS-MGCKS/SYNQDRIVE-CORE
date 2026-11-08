import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');

const SOURCE_FILES = [
  'ds4-powertrain-demand-research.contract.v1.ts',
  'ds4-powertrain-demand-research.input-binding.v1.ts',
  'ds4-powertrain-demand-research.kernel.v1.ts',
  'ds4-powertrain-demand-kickdown-bucket-grid.v1.ts',
  'ds4-powertrain-demand-cold-engine.kernel.v1.ts',
  'ds4-powertrain-demand-cold-engine-bucket-grid.v1.ts',
  'ds4-powertrain-demand-cold-engine.input-binding.v1.ts',
  'ds4-powertrain-demand-sustained-load.kernel.v1.ts',
  'ds4-powertrain-demand-sustained-load.input-binding.v1.ts',
  'ds4-powertrain-demand-sustained-load-gap-aware.v1.ts',
  'ds4-powertrain-demand-sustained-load-reference.v1.ts',
  'ds4-powertrain-demand-sustained-load-powertrain.v1.ts',
  'ds4-powertrain-demand-multichannel-canonicalize.v1.ts',
];

const FORBIDDEN = [
  'misuse-cases',
  'trip-behavior-enrichment',
  'shadow-detector.persistence',
  'hf-abuse',
  'event-context-classifier',
  'detectKickdownLikeClusters',
  'detectSustainedHighLoadClusters',
];

describe('ds4-powertrain-demand-research import boundary', () => {
  it('isolates research module from production misuse and P38 cluster entrypoint', () => {
    for (const file of SOURCE_FILES) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const frag of FORBIDDEN) {
        expect(content.includes(frag)).toBe(false);
      }
    }
  });
});
