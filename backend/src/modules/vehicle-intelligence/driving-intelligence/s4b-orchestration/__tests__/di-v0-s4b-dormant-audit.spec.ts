import * as fs from 'fs';
import * as path from 'path';
import {
  REPLICA_LOCAL_SCHEDULER_NAMES,
  SAFE_DISTRIBUTED_SCHEDULER_NAMES,
  SINGLETON_GLOBAL_SCHEDULER_NAMES,
} from '@shared/scheduler-leader/scheduler-leader.registry';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const S4B_DIR = path.join(__dirname, '..');
const S4A_DIR = path.join(__dirname, '../../s4a-foundation');
const S4C_DIR = path.join(__dirname, '../../s4c-executor');
const S4D_DIR = path.join(__dirname, '../../s4d-replay');
const S4E_DIR = path.join(__dirname, '../../s4e-drift-watcher');
const S4F_DIR = path.join(__dirname, '../../s4f-observability');
const FLEET_MOTION_ADMISSION_DIR = path.join(__dirname, '../../fleet-motion-admission');
const S4_RUNTIME_DIR = path.join(__dirname, '../../s4-runtime');
const VI_MODULE = path.join(REPO_ROOT, 'backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts');
/** PostgreSQL-only partial-extension → admission → discovery contract (PR #2293); not AppModule runtime. */
const TRIPS_PARTIAL_BOUNDARY_EXTENSION_PG_SPEC = path.join(
  REPO_ROOT,
  'backend/src/modules/vehicle-intelligence/trips/reconciliation/partial-boundary-extension-admission.postgres.integration.spec.ts',
);

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

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:import|export)\s[^'"]*?from\s+'([^']+)'|require\('([^']+)'\)|import\('([^']+)'\)/g)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );

const productionFiles = fs
  .readdirSync(S4B_DIR)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => path.join(S4B_DIR, name));
const code = (file: string): string => stripComments(fs.readFileSync(file, 'utf8'));

const ALLOWED_IMPORTS = new Set([
  'crypto',
  'os',
  '@nestjs/common',
  '@prisma/client',
  '@shared/database/prisma.service',
  '@shared/scheduler-leader/scheduler-leader-guard.service',
  '../core/calibration/CALIBRATION_UNSET_V0',
  '../core/calibration/types',
  '../core/versions',
  '../native-event-evidence/di-v0-native-event-evidence.versions',
  '../position-acquisition/di-v0-position-acquisition.versions',
  '../position-acquisition/di-v0-position-source-family',
  '../r1-obd-acquisition/di-v0-r1-obd-acquisition.versions',
  '../s4a-foundation/di-v0-s4a-contract',
  '../s4a-foundation/di-v0-s4a-control-plane',
  '../s4a-foundation/di-v0-s4a-errors',
  '../s4a-foundation/di-v0-s4a-identity',
  '../s4a-foundation/di-v0-s4a-work-item.repository',
  '../fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1',
]);

describe('DI V0 S4B dormant-by-construction audit', () => {
  it('has the expected production files', () => {
    expect(productionFiles.map((f) => path.basename(f)).sort()).toEqual([
      'di-v0-s4b-claim-loop.scheduler.ts',
      'di-v0-s4b-claim-loop.ts',
      'di-v0-s4b-config.ts',
      'di-v0-s4b-discovery-containment.ts',
      'di-v0-s4b-discovery.scheduler.ts',
      'di-v0-s4b-discovery.service.ts',
      'di-v0-s4b-executor.port.ts',
      'di-v0-s4b-orchestration.module.ts',
      'di-v0-s4b-pipeline-manifest.ts',
      'di-v0-s4b-tokens.ts',
    ]);
  });

  it('S4B imports only via s4-runtime composition + VehicleIntelligenceModule (not AppModule)', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    expect(app.includes('DiV0S4bOrchestrationModule')).toBe(false);
    expect(app.includes('s4b-orchestration')).toBe(false);
    const vi = fs.readFileSync(VI_MODULE, 'utf8');
    expect(vi.includes('DiV0S4RuntimeModule')).toBe(true);
    const roots = ['backend/src', 'backend/scripts', 'backend/prisma', 'backend/test'].map((r) => path.join(REPO_ROOT, r));
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root, /\.(ts|tsx|js|mjs|cjs)$/)) {
        if (
          file.startsWith(S4B_DIR + path.sep) ||
          file.startsWith(S4A_DIR + path.sep) ||
          file.startsWith(S4C_DIR + path.sep) ||
          file.startsWith(S4D_DIR + path.sep) ||
          file.startsWith(S4E_DIR + path.sep) ||
          file.startsWith(S4F_DIR + path.sep) ||
          file.startsWith(FLEET_MOTION_ADMISSION_DIR + path.sep) ||
          file.startsWith(S4_RUNTIME_DIR + path.sep) ||
          file === TRIPS_PARTIAL_BOUNDARY_EXTENSION_PG_SPEC ||
          file === VI_MODULE
        ) {
          continue;
        }
        const source = fs.readFileSync(file, 'utf8');
        const importsS4b = importsOf(source).some((spec) => /s4b-orchestration|di-v0-s4b-/.test(spec));
        const namesS4b = /\b(DiV0S4bOrchestrationModule|DiV0S4DiscoveryService|DiV0S4ClaimLoop)\b/.test(stripComments(source));
        if (importsS4b || namesS4b) hits.push(path.relative(REPO_ROOT, file));
      }
    }
    expect(hits).toEqual([]);
  });

  it('imports only S4A foundation, version constants, the source-family resolver and Nest/Prisma infrastructure', () => {
    const offending: string[] = [];
    for (const file of productionFiles) {
      for (const spec of importsOf(fs.readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('./di-v0-s4b-') && !ALLOWED_IMPORTS.has(spec)) offending.push(`${path.basename(file)} -> ${spec}`);
      }
    }
    expect(offending).toEqual([]);
  });

  it('never invokes position/R1/native acquisition, DIMO/provider clients, BullMQ, trips or S2 persistence', () => {
    const forbidden: Array<[string, RegExp]> = [
      ['acquisition call', /\b(acquireDiV0\w*|runDiV0\w*Acquisition|normalizeDiV0\w*Evidence)\s*\(/],
      ['DIMO/provider', /from\s+'[^']*(dimo|provider|telemetry-client)[^']*'|\bfetch\s*\(|axios|graphql-request/i],
      ['BullMQ', /from\s+'bullmq'|BullModule|InjectQueue|new\s+(Queue|Worker|QueueEvents)\s*\(/],
      ['trip lifecycle', /from\s+'[^']*trips\/[^']*'|finalizeTrip|TripFsm|onTripFinalized/],
      ['S2 persistence', /persistDiV0S4FencedS2Run|shadow-persistence/],
      ['cron decorators', /@(Cron|Interval|Timeout)\s*\(|@nestjs\/schedule/],
      ['event emitter', /EventEmitter|@OnEvent\s*\(/],
      ['HTTP route', /@(Controller|Get|Post|Put|Patch|Delete)\s*\(/],
    ];
    const offending: string[] = [];
    for (const file of productionFiles) {
      for (const [label, re] of forbidden) if (re.test(code(file))) offending.push(`${path.basename(file)}: ${label}`);
    }
    expect(offending).toEqual([]);
  });

  it('reads process.env only at the composition boundary (di-v0-s4b-config.ts)', () => {
    const readers = productionFiles.filter((file) => /process\.env/.test(code(file))).map((f) => path.basename(f));
    expect(readers).toEqual(['di-v0-s4b-config.ts']);
    const controlPlane = path.join(S4B_DIR, '../s4a-foundation/di-v0-s4a-control-plane.ts');
    expect(/process\.env/.test(code(controlPlane))).toBe(false);
  });

  it('writes nothing directly: no INSERT/UPDATE/DELETE/DDL, no Prisma model delegates; T01/T02/T03/T07 go through the repository', () => {
    const offending: string[] = [];
    for (const file of productionFiles) {
      const c = code(file);
      if (/\b(INSERT\s+INTO|UPDATE\s+[a-z_]+\s+SET|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE)\b/i.test(c)) {
        offending.push(`${path.basename(file)}: SQL mutation`);
      }
      if (/\$executeRaw/.test(c)) offending.push(`${path.basename(file)}: $executeRaw`);
      if (/\.(vehicleTrip|vehicle|diV0\w*|tripRepair)\s*\.\s*(create|update|upsert|delete)/.test(c)) {
        offending.push(`${path.basename(file)}: model write`);
      }
    }
    expect(offending).toEqual([]);
    const repositoryCalls = new Set<string>();
    for (const file of productionFiles) {
      for (const m of code(file).matchAll(/this\.repository\.(\w+)\s*\(/g)) repositoryCalls.add(m[1]);
    }
    expect([...repositoryCalls].sort()).toEqual([
      'claim',
      'createWorkItem',
      'evaluateAttemptStartBoundary',
      'failRetryable',
      'heartbeat',
      'holderSupersede',
      'readExecutionPostcondition',
    ]);
  });

  it('discovery never allocates boundary occurrence and never uses hardwareType', () => {
    for (const file of productionFiles) {
      const c = code(file);
      expect(c).not.toMatch(/boundary_occurrence|boundaryOccurrence|di_v0_s4_trip_primary_boundary_seq/);
      expect(c).not.toMatch(/hardware_type|hardwareType/);
    }
    expect(code(path.join(S4B_DIR, 'di-v0-s4b-discovery.service.ts'))).toMatch(/resolveDiV0SourceFamily\(/);
  });

  it('classifies both S4B schedulers; discovery is leader-guarded, the claim loop is replica-local', () => {
    expect(SINGLETON_GLOBAL_SCHEDULER_NAMES).toContain('di_v0_s4_discovery');
    expect(REPLICA_LOCAL_SCHEDULER_NAMES).toContain('di_v0_s4_claim_loop');
    expect(SAFE_DISTRIBUTED_SCHEDULER_NAMES as readonly string[]).not.toContain('di_v0_s4_discovery');
    expect(SINGLETON_GLOBAL_SCHEDULER_NAMES as readonly string[]).not.toContain('di_v0_s4_claim_loop');
    const discovery = code(path.join(S4B_DIR, 'di-v0-s4b-discovery.scheduler.ts'));
    expect(discovery).toMatch(/leaderGuard\.shouldRun\('di_v0_s4_discovery'\)/);
    const claim = code(path.join(S4B_DIR, 'di-v0-s4b-claim-loop.scheduler.ts'));
    expect(claim).not.toMatch(/leaderGuard/);
    for (const file of [discovery, claim]) {
      expect(file.indexOf('isConfigured()')).toBeGreaterThan(-1);
      expect(file.indexOf('isConfigured()')).toBeLessThan(file.indexOf('setInterval('));
    }
  });
});
