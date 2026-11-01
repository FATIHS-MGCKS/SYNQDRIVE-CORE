import * as fs from 'fs';
import * as path from 'path';
import {
  collectP2S4aFenceViolations,
  importsOf,
  isP2TripSpeedQualityFile,
  isUnauthorizedNonP2S4aImport,
  P2_ALLOWED_PRODUCTION_S4A_IMPORTS,
  P2_TRIP_SPEED_QUALITY_DIR,
  stripComments,
} from './di-v0-s4a-dormant-audit.p2-fence';
import {
  collectS4ResearchS4aFenceViolations,
  S4_RESEARCH_WORKER_DIR,
} from './di-v0-s4a-dormant-audit.research-fence';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const FOUNDATION_DIR = path.join(__dirname, '..');
/** Permitted dormant consumers; each has its own dormant audit (not AppModule-registered). */
const S4B_DIR = path.join(__dirname, '../../s4b-orchestration');
const S4C_DIR = path.join(__dirname, '../../s4c-executor');
const S4D_DIR = path.join(__dirname, '../../s4d-replay');
const S4E_DIR = path.join(__dirname, '../../s4e-drift-watcher');
const S4F_DIR = path.join(__dirname, '../../s4f-observability');
/** Shared DS4 fleet rollout policy (pure); consumed by S4B / S4E / motion-core / S4A repository. */
const FLEET_MOTION_ADMISSION_DIR = path.join(__dirname, '../../fleet-motion-admission');
const MOTION_CORE_SHADOW_DIR = path.join(__dirname, '../../motion-core-shadow-worker');
/** Post-S4 frozen M7A road-assignment shadow (default OFF); read-only S4 evidence + outbox — not S4A runtime. */
const M7A_ROAD_ASSIGNMENT_SHADOW_DIR = path.join(__dirname, '../../m7a-road-assignment-shadow-worker');
const S4_RESEARCH_DIR = S4_RESEARCH_WORKER_DIR;
const S4_RUNTIME_DIR = path.join(__dirname, '../../s4-runtime');
const TRIPS_DI_BOUNDARY_ADMISSION_DIR = path.join(__dirname, '../../../trips/di-boundary-admission');
/** PostgreSQL-only partial-extension → admission → discovery contract (PR #2293); not AppModule runtime. */
const TRIPS_PARTIAL_BOUNDARY_EXTENSION_PG_SPEC = path.join(
  REPO_ROOT,
  'backend/src/modules/vehicle-intelligence/trips/reconciliation/partial-boundary-extension-admission.postgres.integration.spec.ts',
);
const OFFLINE_RESEARCH_SCRIPTS_DIR = path.join(REPO_ROOT, 'backend/scripts/research');
const MOTION_CORE_SHADOW_TEST_SCRIPTS_DIR = path.join(REPO_ROOT, 'backend/scripts/test');

function walk(dir: string, pattern: RegExp, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) continue;
      walk(full, pattern, acc);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const productionFiles = fs
  .readdirSync(FOUNDATION_DIR)
  .filter(
    (name) =>
      name.endsWith('.ts') &&
      name !== 'di-v0-s4-control-kill-initializer.ts' && // operator-only SQL primitive (S4F-7A); not app bootstrap
      name !== 'di-v0-s4-global-kill-transition.ts', // Gate-6 operator-only GLOBAL kill transition (S4F-7AS); not app bootstrap
  )
  .map((name) => path.join(FOUNDATION_DIR, name));

const ALLOWED_IMPORTS = new Set([
  'crypto',
  'zlib',
  '@prisma/client',
  '@shared/database/prisma.service',
  '../../trips/boundary-repair.state.util',
  '../../trips/di-boundary-admission/trip-di-boundary-admission',
  '../core/versions',
  '../shadow-persistence/di-v0-shadow-completion',
  '../shadow-persistence/di-v0-shadow-idempotency',
  '../shadow-persistence/di-v0-shadow-persistence.repository',
  '../shadow-persistence/di-v0-shadow-types',
  '../shadow-persistence/di-v0-shadow-validation',
  '../s4d-replay/di-v0-s4d-replay-types',
  '../s4d-replay/di-v0-s4d-verified-snapshot',
  '../fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1',
]);

const ALLOWED_MUTATION_TABLES = new Set([
  'di_v0_s4_work_items',
  'di_v0_s4_evidence_snapshots',
  'di_v0_s4_pipeline_versions',
  'di_v0_s4_trip_primary_boundary_seq',
  'di_v0_shadow_runs',
]);

describe('DI V0 S4A dormant-by-construction audit', () => {
  it('has production files to audit', () => {
    expect(productionFiles.map((f) => path.basename(f)).sort()).toEqual([
      'di-v0-s4-settlement-policy-segment.ts',
      'di-v0-s4a-contract.ts',
      'di-v0-s4a-control-plane.ts',
      'di-v0-s4a-errors.ts',
      'di-v0-s4a-evidence-container-parse.ts',
      'di-v0-s4a-identity.ts',
      'di-v0-s4a-s2-fenced-persistence.ts',
      'di-v0-s4a-state-machine.ts',
      'di-v0-s4a-work-item.repository.ts',
    ]);
  });

  it('DI_S4A_RUNTIME_CALL_SITE_COUNT=0: nothing outside s4a-foundation and unregistered S4B/S4C/S4D/S4E/S4F packages imports it', () => {
    const roots = ['backend/src', 'backend/scripts', 'backend/prisma', 'backend/test', 'frontend/src'].map((r) =>
      path.join(REPO_ROOT, r),
    );
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root, /\.(ts|tsx|js|mjs|cjs)$/)) {
        if (
          file.startsWith(FOUNDATION_DIR + path.sep) ||
          file.startsWith(S4B_DIR + path.sep) ||
          file.startsWith(S4C_DIR + path.sep) ||
          file.startsWith(S4D_DIR + path.sep) ||
          file.startsWith(S4E_DIR + path.sep) ||
          file.startsWith(S4F_DIR + path.sep) ||
          file.startsWith(FLEET_MOTION_ADMISSION_DIR + path.sep) ||
          file.startsWith(MOTION_CORE_SHADOW_DIR + path.sep) ||
          file.startsWith(M7A_ROAD_ASSIGNMENT_SHADOW_DIR + path.sep) ||
          file.startsWith(S4_RESEARCH_DIR + path.sep) ||
          file.startsWith(S4_RUNTIME_DIR + path.sep) ||
          file.startsWith(TRIPS_DI_BOUNDARY_ADMISSION_DIR + path.sep) ||
          file === TRIPS_PARTIAL_BOUNDARY_EXTENSION_PG_SPEC ||
          file.startsWith(OFFLINE_RESEARCH_SCRIPTS_DIR + path.sep) ||
          (file.startsWith(MOTION_CORE_SHADOW_TEST_SCRIPTS_DIR + path.sep) &&
            path.basename(file).startsWith('motion-core-shadow')) ||
          file.endsWith('backend/scripts/ops/di-v0-s4-initialize-global-kill-row.ts') ||
          file.includes(`${path.sep}di-v0-s4-global-kill-init-production${path.sep}`) ||
          file.includes(`${path.sep}di-v0-s4-tiny-staging-production${path.sep}`) ||
          file.includes(`${path.sep}di-v0-s4-fresh-tiny-staging-production${path.sep}`) ||
          file.includes(`${path.sep}di-v0-s4-five-flag-tiny-activation-production${path.sep}`) ||
          file.includes(`${path.sep}di-v0-s4-gate6-open-rekill-production${path.sep}`) ||
          file.includes(`${path.sep}di-v0-s4-historical-backlog-quarantine-production${path.sep}`) ||
          file.includes(`${path.sep}platform-admin${path.sep}platform-ops-di-s4`)
        ) {
          continue;
        }
        const source = fs.readFileSync(file, 'utf8');
        if (isP2TripSpeedQualityFile(file)) {
          const p2Violations = collectP2S4aFenceViolations(file, source);
          if (p2Violations.length > 0) hits.push(...p2Violations.map((v) => `${file}: ${v}`));
          continue;
        }
        const researchViolations = collectS4ResearchS4aFenceViolations(file, source);
        if (researchViolations.length > 0) hits.push(...researchViolations.map((v) => `${file}: ${v}`));
        if (file.startsWith(S4_RESEARCH_DIR + path.sep)) continue;
        if (isUnauthorizedNonP2S4aImport(file, source)) hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  it('imports only pure helpers, Prisma types and the existing S2 persistence helpers', () => {
    const offending: string[] = [];
    const seen = new Set<string>();
    for (const file of productionFiles) {
      for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
        seen.add(spec);
        if (!spec.startsWith('./di-v0-s4a-') && !ALLOWED_IMPORTS.has(spec)) offending.push(`${path.basename(file)} -> ${spec}`);
      }
    }
    expect(offending).toEqual([]);
    expect([...ALLOWED_IMPORTS].filter((spec) => !seen.has(spec))).toEqual([]);
  });

  it('registers no Nest provider/module, scheduler, queue, worker, HTTP route or env read', () => {
    const forbidden: Array<[string, RegExp]> = [
      ['Nest decorator', /@(Injectable|Module|Controller|Processor|Process|Cron|Interval|Timeout|OnEvent|Get|Post|Put|Patch|Delete)\s*\(/],
      ['Nest import', /from\s+'@nestjs\//],
      ['BullMQ', /from\s+'bullmq'|BullModule|InjectQueue|new\s+(Queue|Worker|QueueEvents)\s*\(/],
      ['scheduler', /node-cron|@nestjs\/schedule|setInterval\s*\(|setTimeout\s*\(/],
      ['HTTP client / provider', /from\s+'(axios|node-fetch|undici|graphql-request)'|\bfetch\s*\(|from\s+'[^']*dimo[^']*'/i],
      ['env read', /process\.env/],
      ['event emitter', /EventEmitter|\.emit\s*\(/],
    ];
    const offending: string[] = [];
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const [label, re] of forbidden) {
        if (re.test(code)) offending.push(`${path.basename(file)}: ${label}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it('mutates only S4 work/evidence/registry tables and S2 runs; never the control row or canonical tables', () => {
    const offending: string[] = [];
    const targets = new Set<string>();
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const m of code.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE)\s+([a-z_][a-z0-9_]*)\b/g)) {
        const verb = m[1].replace(/\s+/g, ' ');
        const table = m[2];
        targets.add(table);
        if (!['INSERT INTO', 'UPDATE'].includes(verb) || !ALLOWED_MUTATION_TABLES.has(table)) {
          offending.push(`${path.basename(file)}: ${verb} ${table}`);
        }
      }
    }
    expect(offending).toEqual([]);
    expect([...targets].sort()).toEqual([...ALLOWED_MUTATION_TABLES].sort());
    expect(targets.has('di_v0_s4_control')).toBe(false);
  });

  it('never uses Prisma model delegates for S4 tables (all S4 SQL is explicit and fenced)', () => {
    const hits: string[] = [];
    for (const file of walk(path.join(REPO_ROOT, 'backend/src'), /\.ts$/)) {
      if (file.includes(`${path.sep}platform-admin${path.sep}platform-ops-di-s4`)) continue;
      if (file.startsWith(S4_RESEARCH_DIR + path.sep)) continue;
      if (/\.diV0S4[A-Za-z]*\s*\./.test(fs.readFileSync(file, 'utf8'))) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  it('exposes no generic status setter', () => {
    const offending: string[] = [];
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/\b(setStatus|updateStatus|forceStatus|transitionTo)\b/.test(code)) offending.push(path.basename(file));
      if (/SET\s+status\s*=\s*\$\{/.test(code)) offending.push(`${path.basename(file)}: parameterised status`);
    }
    expect(offending).toEqual([]);
  });

  it('S4 research worker S4A import fence (read-only allowlist)', () => {
    const violations: string[] = [];
    for (const file of walk(S4_RESEARCH_DIR, /\.ts$/)) {
      violations.push(...collectS4ResearchS4aFenceViolations(file, fs.readFileSync(file, 'utf8')));
    }
    expect(violations).toEqual([]);
  });

  describe('P2 trip-speed-quality S4A import fence (negative guards)', () => {
    it('P2 trip-speed-quality tree has no S4A fence violations', () => {
      const violations: string[] = [];
      for (const file of walk(P2_TRIP_SPEED_QUALITY_DIR, /\.ts$/)) {
        violations.push(...collectP2S4aFenceViolations(file, fs.readFileSync(file, 'utf8')));
      }
      expect(violations).toEqual([]);
      expect(Object.keys(P2_ALLOWED_PRODUCTION_S4A_IMPORTS).length).toBe(4);
    });

    it('detects synthetic unauthorized S4A import outside P2', () => {
      const fakeFile = path.join(REPO_ROOT, 'backend/src/modules/vehicle-intelligence/driving-intelligence/speed-qc/fake.ts');
      const fakeSource = `import { DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';`;
      expect(isUnauthorizedNonP2S4aImport(fakeFile, fakeSource)).toBe(true);
      expect(collectP2S4aFenceViolations(fakeFile, fakeSource)).toEqual([]);
    });

    it('detects synthetic forbidden P2 S4A mutation import', () => {
      const fakeP2 = path.join(P2_TRIP_SPEED_QUALITY_DIR, 'evil.ts');
      const fakeSource = `import { persistDiV0S4FencedS2Run } from '../s4a-foundation/di-v0-s4a-s2-fenced-persistence';`;
      expect(collectP2S4aFenceViolations(fakeP2, fakeSource).length).toBeGreaterThan(0);
    });

    it('detects synthetic disallowed P2 production S4A import', () => {
      const fakeP2 = path.join(P2_TRIP_SPEED_QUALITY_DIR, 'di-v0-trip-speed-quality-projection.service.ts');
      const fakeSource = `import { DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';`;
      expect(collectP2S4aFenceViolations(fakeP2, fakeSource).length).toBeGreaterThan(0);
    });
  });
});
