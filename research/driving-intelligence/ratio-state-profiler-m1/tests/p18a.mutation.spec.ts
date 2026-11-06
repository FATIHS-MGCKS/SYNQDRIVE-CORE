import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { P16_MANIFEST_SHA256_SELF } from "../src/constants.js";
import {
  verifyP16Gate,
  resolveRepoRoot,
  resolvePackageRoot,
  loadManifestFromPath,
} from "../src/pin/p16_gate.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(join(here, ".."));
const pkgRoot = resolvePackageRoot(repoRoot);

describe("P18A mutation / fail-closed gates", () => {
  it("FAIL_CLOSED on forged declared self-hash", () => {
    const src = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
    const tmp = join(pkgRoot, "fixtures/.tmp-forged-manifest.json");
    const obj = JSON.parse(readFileSync(src, "utf8"));
    obj.manifest_sha256_self = "0".repeat(64);
    writeFileSync(tmp, JSON.stringify(obj, null, 2));
    const gateOk = verifyP16Gate(repoRoot, src, loadManifestFromPath(src));
    assert.equal(gateOk.verdict, "PASS");
    const forged = verifyP16Gate(repoRoot, tmp, loadManifestFromPath(tmp));
    assert.equal(forged.verdict, "FAIL_CLOSED");
    unlinkSync(tmp);
  });

  it("FAIL_CLOSED when manifest content bytes change", () => {
    const src = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
    const tmp = join(pkgRoot, "fixtures/.tmp-mutated-manifest.json");
    copyFileSync(src, tmp);
    let text = readFileSync(tmp, "utf8");
    text = text.replace(P16_MANIFEST_SHA256_SELF, "f".repeat(64));
    writeFileSync(tmp, text);
    const gate = verifyP16Gate(repoRoot, tmp, loadManifestFromPath(tmp));
    assert.equal(gate.verdict, "FAIL_CLOSED");
    unlinkSync(tmp);
  });

  it("FAIL_CLOSED on changed P5 sealed fixture byte", () => {
    const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
    const p5 = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");
    const backup = p5 + ".bak";
    copyFileSync(p5, backup);
    const text = readFileSync(p5, "utf8");
    writeFileSync(p5, text.replace("POSITIVE_RPM_VISUAL_CANDIDATE", "POSITIVE_RPM_VISUAL_CANDIDATX"));
    const gate = verifyP16Gate(repoRoot, manifestPath, loadManifestFromPath(manifestPath));
    assert.equal(gate.verdict, "FAIL_CLOSED");
    copyFileSync(backup, p5);
    unlinkSync(backup);
  });

  it("FAIL_CLOSED on changed analysis windows fixture", () => {
    const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
    const wins = join(
      repoRoot,
      "research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/reference/TIGUAN_2026-10-22_analysis_windows.csv",
    );
    const backup = wins + ".p18a.bak";
    copyFileSync(wins, backup);
    writeFileSync(wins, readFileSync(wins, "utf8").replace("SPEED_INCREASE", "SPEED_INCREASEX"));
    const gate = verifyP16Gate(repoRoot, manifestPath, loadManifestFromPath(manifestPath));
    assert.equal(gate.verdict, "FAIL_CLOSED");
    copyFileSync(backup, wins);
    unlinkSync(backup);
  });
});
