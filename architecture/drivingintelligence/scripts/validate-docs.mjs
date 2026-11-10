#!/usr/bin/env node
/**
 * Architecture-doc consistency validation for Driving Intelligence authority.
 * Counts and cross-checks are DERIVED from register contents — not hard-coded truth.
 *
 * Bounded scope (by design):
 * - DI-EVID graph resolution: only IDs cited in decisions, graph nodes, and invariants
 * - DI-EV chronology: EVIDENCE_INDEX DI-EV column tokens (numeric ranges expanded)
 * - Stale terminology: all authority .md + graph YAML; forensic-audit sections exempt
 * - Relative links: all authority markdown under architecture/drivingintelligence/
 *
 * Usage: node architecture/drivingintelligence/scripts/validate-docs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authorityDir = path.join(__dirname, '..');

const errors = [];
function fail(msg) {
  errors.push(msg);
}

function read(rel) {
  return fs.readFileSync(path.join(authorityDir, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(authorityDir, rel));
}

function walkAuthorityFiles(ext, base = authorityDir) {
  const out = [];
  for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
    const full = path.join(base, ent.name);
    if (ent.isDirectory()) out.push(...walkAuthorityFiles(ext, full));
    else if (ent.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function relFromAuthority(absPath) {
  return path.relative(authorityDir, absPath);
}

function parseSummaryInt(text, key) {
  const m = text.match(new RegExp(`${key}=\\*\\*(\\d+)\\*\\*`));
  return m ? Number(m[1]) : null;
}

function parseDefectLedger(text) {
  const rows = [];
  const rowRe = /\| (DI-DEF-\d+) \|(?:[^|]+\|){6} (FIXED_PRODUCTION_VALIDATED|FIXED_CODE_TESTED|FIXED|OPEN|PREVENTIVE) \|/g;
  for (const m of text.matchAll(rowRe)) {
    rows.push({ id: m[1], status: m[2] });
  }
  const total = rows.length;
  const fixed = rows.filter((r) => r.status === 'FIXED' || r.status === 'FIXED_CODE_TESTED' || r.status === 'FIXED_PRODUCTION_VALIDATED').length;
  const open = rows.filter((r) => r.status === 'OPEN').length;
  const summaryTotal = parseSummaryInt(text, 'TOTAL');
  const summaryFixed = parseSummaryInt(text, 'FIXED');
  const summaryOpen = parseSummaryInt(text, 'OPEN');
  return { rows, total, fixed, open, summaryTotal, summaryFixed, summaryOpen };
}

function parseExperimentRegister(text) {
  const rows = [];
  const rowRe = /\| (EXP-\d+) \|(?:[^|]+\|){4} ([^|]+) \|/g;
  for (const m of text.matchAll(rowRe)) {
    const result = m[2].trim();
    const pending = /\bNOT EXECUTED\b/i.test(result) || /\bPENDING\b/i.test(result);
    rows.push({ id: m[1], result, pending });
  }
  const total = rows.length;
  const pending = rows.filter((r) => r.pending).length;
  const executed = total - pending;

  const summaryTotal = (() => {
    const m = text.match(/EXPERIMENT_ENTRIES_TOTAL:\*\* (\d+)/);
    return m ? Number(m[1]) : null;
  })();
  const summaryExecuted = (() => {
    const m = text.match(/EXPERIMENTS_EXECUTED:\*\* (\d+)/);
    return m ? Number(m[1]) : null;
  })();
  const summaryPending = (() => {
    const m = text.match(/EXPERIMENTS_PENDING:\*\* (\d+)/);
    return m ? Number(m[1]) : null;
  })();

  return { rows, total, executed, pending, summaryTotal, summaryExecuted, summaryPending };
}

function parsePrTimeline(text) {
  const entries = [];
  const rowRe = /\| #(\d+) \| ([^|]+) \|/g;
  for (const m of text.matchAll(rowRe)) {
    const mergedCell = m[2].trim();
    const isDraft = mergedCell === '—' || mergedCell === '-';
    entries.push({ number: m[1], isDraft });
  }
  const allNumbers = entries.map((e) => e.number);
  const merged = entries.filter((e) => !e.isDraft);
  const mergedCount = merged.length;
  const summaryMatch = text.match(/\*\*RELEVANT_MERGED_PR_COUNT:\*\* \*\*(\d+)\*\*/);
  const summaryMerged = summaryMatch ? Number(summaryMatch[1]) : null;
  return { entries, allNumbers, mergedCount, summaryMerged };
}

function isHistoricalContext(text, index) {
  const windowStart = Math.max(0, index - 400);
  const snippet = text.slice(windowStart, index + 200);
  return /\b(historical|superseded|inaccuracy to avoid|do not say|stale|legacy claim)\b/i.test(snippet);
}

function validateRelativeLinks() {
  const mdFiles = walkAuthorityFiles('.md');
  const linkRe = /\]\(([^)]+)\)/g;
  for (const file of mdFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const fileDir = path.dirname(file);
    for (const m of text.matchAll(linkRe)) {
      const raw = m[1].trim();
      if (!raw || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('mailto:')) {
        continue;
      }
      const [targetPath, anchor] = raw.split('#');
      if (!targetPath) continue;
      if (targetPath.startsWith('docs/') || targetPath.startsWith('backend/') || targetPath.startsWith('architecture/')) {
        const repoPath = path.join(authorityDir, '..', '..', targetPath);
        if (!fs.existsSync(repoPath) && !isHistoricalContext(text, m.index ?? 0)) {
          fail(`Broken repo link in ${relFromAuthority(file)}: ${raw}`);
        }
        continue;
      }
      if (isHistoricalContext(text, m.index ?? 0)) continue;
      const resolved = path.normalize(path.join(fileDir, targetPath));
      if (!fs.existsSync(resolved)) {
        fail(`Broken relative link in ${relFromAuthority(file)}: ${raw}`);
      }
    }
  }
}

const requiredFiles = [
  'README.md',
  'CURRENT_STATE.md',
  'KNOWLEDGE_GRAPH.md',
  'WORKSTREAM_HISTORY.md',
  'COVERAGE_MATRIX.md',
  'AGENT_CONTRACT.md',
  'decisions/DECISION_REGISTER.md',
  'contradictions/CONTRADICTION_REGISTER.md',
  'research/CHANGE_LEDGER.md',
  'research/DI_EV_CHRONOLOGY.md',
  'research/PR_TIMELINE.md',
  'research/HYPOTHESIS_REGISTER.md',
  'research/EXPERIMENT_REGISTER.md',
  'research/DEFECT_LEDGER.md',
  'research/LESSONS_LEARNED.md',
  'research/OPEN_QUESTIONS.md',
  'evidence/EVIDENCE_INDEX.md',
  'evidence/reference-capture/RD003_RETROSPECTIVE.md',
  'evidence/reference-capture/RD004_RETROSPECTIVE.md',
  'evidence/signal-inventory/CADENCE_DENSITY.md',
  'graph/nodes.yaml',
  'graph/edges.yaml',
  'graph/invariants.yaml',
  'graph/schema.yaml',
];

console.log('==> Required files');
for (const f of requiredFiles) {
  if (!exists(f)) fail(`Missing required file: ${f}`);
  else console.log('  OK', f);
}

console.log('==> Relative links (all authority markdown)');
validateRelativeLinks();

console.log('==> Decision evidence references');
const decisionText = read('decisions/DECISION_REGISTER.md');
const evidenceIds = new Set();
for (const m of decisionText.matchAll(/\| \*\*EVIDENCE\*\* \| ([^|]+) \|/g)) {
  for (const id of m[1].matchAll(/DI-EVID-[A-Z0-9-]+/g)) evidenceIds.add(id[0]);
}
const nodesText = read('graph/nodes.yaml');
for (const id of evidenceIds) {
  if (!nodesText.includes(`id: ${id}`)) fail(`Decision EVIDENCE ${id} not found in graph nodes.yaml`);
}

console.log('==> Hypothesis register rows');
const hypText = read('research/HYPOTHESIS_REGISTER.md');
const hypIds = [...hypText.matchAll(/\| (DI-HYP-\d+) \|/g)].map((m) => m[1]);
for (const id of hypIds) {
  if (!nodesText.includes(`id: ${id}`)) fail(`Hypothesis ${id} missing from graph nodes.yaml`);
}

console.log('==> Defect ledger counts (derived)');
const defectText = read('research/DEFECT_LEDGER.md');
const defects = parseDefectLedger(defectText);
if (defects.summaryTotal === null || defects.summaryFixed === null || defects.summaryOpen === null) {
  fail('Defect ledger summary header missing TOTAL/FIXED/OPEN');
}
if (defects.total !== defects.summaryTotal) {
  fail(`Defect SUMMARY_TOTAL ${defects.summaryTotal} != derived row count ${defects.total}`);
}
if (defects.fixed !== defects.summaryFixed) {
  fail(`Defect SUMMARY_FIXED ${defects.summaryFixed} != derived FIXED ${defects.fixed}`);
}
if (defects.open !== defects.summaryOpen) {
  fail(`Defect SUMMARY_OPEN ${defects.summaryOpen} != derived OPEN ${defects.open}`);
}

console.log('==> Experiment register counts (derived)');
const expText = read('research/EXPERIMENT_REGISTER.md');
const experiments = parseExperimentRegister(expText);
if (experiments.summaryTotal === null || experiments.summaryExecuted === null || experiments.summaryPending === null) {
  fail('Experiment register summary missing TOTAL/EXECUTED/PENDING');
}
if (experiments.total !== experiments.summaryTotal) {
  fail(`Experiment SUMMARY_TOTAL ${experiments.summaryTotal} != derived ${experiments.total}`);
}
if (experiments.executed !== experiments.summaryExecuted) {
  fail(`Experiment SUMMARY_EXECUTED ${experiments.summaryExecuted} != derived ${experiments.executed}`);
}
if (experiments.pending !== experiments.summaryPending) {
  fail(`Experiment SUMMARY_PENDING ${experiments.summaryPending} != derived ${experiments.pending}`);
}

console.log('==> PR timeline uniqueness and required PRs');
const prText = read('research/PR_TIMELINE.md');
const pr = parsePrTimeline(prText);
const uniquePrs = new Set(pr.allNumbers);
if (uniquePrs.size !== pr.allNumbers.length) fail('Duplicate PR numbers in PR_TIMELINE');
for (const required of ['1505', '1507', '1511', '1529']) {
  if (!uniquePrs.has(required)) fail(`PR_TIMELINE missing required PR #${required}`);
}
if (pr.summaryMerged === null) fail('PR_TIMELINE missing RELEVANT_MERGED_PR_COUNT summary');
if (pr.mergedCount !== pr.summaryMerged) {
  fail(`PR_TIMELINE RELEVANT_MERGED_PR_COUNT ${pr.summaryMerged} != derived ${pr.mergedCount}`);
}

console.log('==> Cadence density canonical metrics');
const cadenceText = read('evidence/signal-inventory/CADENCE_DENSITY.md');
for (const token of [
  'RD002_SEALED_DT_P50_SECONDS',
  'RD002_SEALED_DT_P95_SECONDS',
  'RD002_SEALED_DT_MAX_SECONDS',
  'RD003_RELEVANT_MEDIAN_SECONDS',
  'RD002_AND_RD003_CADENCE_METRICS_SEMANTICALLY_SEPARATED = YES',
  'LTE_R1_3_6S_MEDIAN_CLAIM_AUDITED = YES',
  'LTE_R1_3_6S_METRIC_HAS_EXACT_POPULATION = NO',
]) {
  if (!cadenceText.includes(token)) fail(`CADENCE_DENSITY.md missing ${token}`);
}

console.log('==> Cadence / terminology guards');
const authorityTexts = walkAuthorityFiles('.md').map((f) => ({
  rel: relFromAuthority(f),
  text: fs.readFileSync(f, 'utf8'),
}));
authorityTexts.push({ rel: 'graph/invariants.yaml', text: read('graph/invariants.yaml') });
authorityTexts.push({ rel: 'graph/nodes.yaml', text: nodesText });

const stalePatterns = [
  { re: /median\s*3[–-]6\s*s/i, label: 'undefined LTE_R1 median 3–6s claim' },
  { re: /HF Recovery V2 exercised/i, label: 'anachronistic HF Recovery V2 exercised (RD002)' },
  { re: /\b16 executed experiments\b/i, label: 'stale 16 executed experiments' },
  { re: /\b5 reference drives\b/i, label: 'stale 5 reference drives' },
  { re: /\b11 fixed\b.*\b7 open\b/i, label: 'stale 11 fixed / 7 open defects' },
  { re: /RD002\/003[^\n]{0,40}~2s/i, label: 'combined RD002/003 ~2s cadence claim' },
  { re: /RD002\/003[^\n]{0,40}2\.00s/i, label: 'combined RD002/003 2.00s cadence claim' },
];

for (const { rel, text } of authorityTexts) {
  const lines = text.split('\n');
  let inForensicAuditSection = false;
  for (const line of lines) {
    if (/^## Forensic audit:/i.test(line)) inForensicAuditSection = true;
    if (inForensicAuditSection && /^## [^F]/.test(line)) inForensicAuditSection = false;
    if (inForensicAuditSection) continue;
    for (const { re, label } of stalePatterns) {
      if (re.test(line) && !isHistoricalContext(text, text.indexOf(line))) {
        fail(`${rel}: stale or unsupported ${label} — ${line.trim().slice(0, 80)}`);
      }
    }
  }
}

const wsText = read('WORKSTREAM_HISTORY.md');
if (/RD002[^\n]*~2s/i.test(wsText)) {
  fail('WORKSTREAM_HISTORY still attributes ~2s median to RD002');
}

console.log('==> DI-DEF references resolve');
const defectIdSet = new Set(defects.rows.map((r) => r.id));
for (const file of walkAuthorityFiles('.md')) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\| (DI-DEF-\d{3}) \|/g)) {
    if (!defectIdSet.has(m[1])) {
      fail(`${relFromAuthority(file)} references ${m[1]} not in DEFECT_LEDGER`);
    }
  }
}

function diEvCitedInChronology(diEvToken, chronologyText) {
  if (chronologyText.includes(`DI-EV-${diEvToken}`)) return true;
  const baseNum = Number(diEvToken.replace(/[A-Z].*$/, ''));
  if (!Number.isFinite(baseNum)) return false;
  for (const m of chronologyText.matchAll(/DI-EV-(\d{4})[–-](\d{4})/g)) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (baseNum >= start && baseNum <= end) return true;
  }
  return false;
}

function expandDiEvCell(cell) {
  const tokens = [];
  for (const part of cell.split(/[,/]/).map((s) => s.trim())) {
    if (!part || part === '—' || part === '-') continue;
    const range = part.match(/^(\d{4})[–-](\d{4})$/);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) {
        tokens.push(String(n).padStart(4, '0'));
      }
      continue;
    }
    const single = part.match(/^(\d{4}[A-Z]?)/)?.[1];
    if (single) tokens.push(single);
  }
  return tokens;
}

console.log('==> DI-EV chronology / evidence graph IDs (bounded scope)');
const chronologyText = read('research/DI_EV_CHRONOLOGY.md');
const evidenceIndexText = read('evidence/EVIDENCE_INDEX.md');
const invariantsText = read('graph/invariants.yaml');

// Bounded: DI-EVID refs cited by decisions, graph nodes, and invariants must resolve in nodes.yaml
const requiredEvidIds = new Set(evidenceIds);
for (const m of nodesText.matchAll(/- (DI-EVID-[A-Z0-9-]+)/g)) requiredEvidIds.add(m[1]);
for (const m of invariantsText.matchAll(/- (DI-EVID-[A-Z0-9-]+)/g)) requiredEvidIds.add(m[1]);
for (const id of requiredEvidIds) {
  if (!nodesText.includes(`id: ${id}`)) fail(`Authority cites ${id} but graph nodes.yaml has no node`);
}

// EVIDENCE_INDEX DI-EV column tokens should resolve in chronology (supports numeric ranges)
for (const row of evidenceIndexText.matchAll(/\| (DI-EVID-[A-Z0-9-]+) \|[^|]+\|[^|]+\|[^|]+\|[^|]+\| ([^|]+) \|/g)) {
  for (const token of expandDiEvCell(row[2].trim())) {
    if (!diEvCitedInChronology(token, chronologyText)) {
      fail(`EVIDENCE_INDEX ${row[1]} cites DI-EV-${token} missing from DI_EV_CHRONOLOGY`);
    }
  }
}

if (errors.length) {
  console.error('\n==> DOC VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

console.log('==> All doc validations passed');
console.log(`  decisions evidence refs: ${evidenceIds.size}`);
console.log(`  hypotheses checked: ${hypIds.length}`);
console.log(`  defects: ${defects.total} (${defects.fixed} fixed, ${defects.open} open) [derived]`);
console.log(`  experiments: ${experiments.total} (${experiments.executed} executed, ${experiments.pending} pending) [derived]`);
console.log(`  merged PRs in timeline: ${pr.mergedCount} [derived]`);
