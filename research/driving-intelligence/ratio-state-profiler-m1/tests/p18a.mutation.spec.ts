import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { P16_MANIFEST_SHA256_SELF, P16_SEALED_ARTIFACTS } from "../src/constants.js";
import {
  verifyP16Gate,
  resolveRepoRoot,
  resolvePackageRoot,
  loadManifestFromPath,
} from "../src/pin/p16_gate.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(join(here, ".."));
const pkgRoot = resolvePackageRoot(repoRoot);

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "p18a-mutation-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("P18A mutation / fail-closed gates", () => {
  it("FAIL_CLOSED on forged declared self-hash (temp manifest)", () => {
    withTempDir((dir) => {
      const src = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
      const tmpManifest = join(dir, "manifest.json");
      const obj = JSON.parse(readFileSync(src, "utf8"));
      obj.manifest_sha256_self = "0".repeat(64);
      writeFileSync(tmpManifest, JSON.stringify(obj, null, 2));
      const gateOk = verifyP16Gate(repoRoot, src, loadManifestFromPath(src));
      assert.equal(gateOk.verdict, "PASS");
      const forged = verifyP16Gate(repoRoot, tmpManifest, loadManifestFromPath(tmpManifest));
      assert.equal(forged.verdict, "FAIL_CLOSED");
    });
  });

  it("FAIL_CLOSED when manifest content digest no longer matches pin", () => {
    withTempDir((dir) => {
      const src = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
      const tmpManifest = join(dir, "manifest.json");
      let text = readFileSync(src, "utf8");
      text = text.replace('"trip_id"', '"trip_id_mutated"');
      writeFileSync(tmpManifest, text);
      const gate = verifyP16Gate(repoRoot, tmpManifest, loadManifestFromPath(tmpManifest));
      assert.equal(gate.verdict, "FAIL_CLOSED");
    });
  });

  it("FAIL_CLOSED on mutated P5 copy via sealedPathOverrides", () => {
    withTempDir((dir) => {
      const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
      const srcP5 = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");
      const tmpP5 = join(dir, "p5.csv");
      const text = readFileSync(srcP5, "utf8");
      const idx = text.indexOf("POSITIVE_RPM_VISUAL_CANDIDATE");
      assert.ok(idx >= 0);
      writeFileSync(
        tmpP5,
        text.slice(0, idx) + "POSITIVE_RPM_VISUAL_CANDIDATX" + text.slice(idx + "POSITIVE_RPM_VISUAL_CANDIDATE".length),
      );
      const gate = verifyP16Gate(repoRoot, manifestPath, loadManifestFromPath(manifestPath), {
        sealedPathOverrides: { p5_optical_qc_overlay: tmpP5 },
      });
      assert.equal(gate.verdict, "FAIL_CLOSED");
    });
  });

  it("FAIL_CLOSED on mutated analysis windows copy via override", () => {
    withTempDir((dir) => {
      const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
      const srcW = join(repoRoot, P16_SEALED_ARTIFACTS.find((a) => a.role === "analysis_windows_nine")!.repo_relative);
      const tmpW = join(dir, "windows.csv");
      const text = readFileSync(srcW, "utf8");
      const idx = text.indexOf("SPEED_INCREASE");
      assert.ok(idx >= 0);
      writeFileSync(tmpW, text.slice(0, idx) + "SPEED_INCREASEX" + text.slice(idx + "SPEED_INCREASE".length));
      const gate = verifyP16Gate(repoRoot, manifestPath, loadManifestFromPath(manifestPath), {
        sealedPathOverrides: { analysis_windows_nine: tmpW },
      });
      assert.equal(gate.verdict, "FAIL_CLOSED");
    });
  });

  it("FAIL_CLOSED when required sealed role path missing (override)", () => {
    withTempDir((dir) => {
      const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
      const missing = join(dir, "does-not-exist.csv");
      const gate = verifyP16Gate(repoRoot, manifestPath, loadManifestFromPath(manifestPath), {
        sealedPathOverrides: { p5_optical_qc_overlay: missing },
      });
      assert.equal(gate.verdict, "FAIL_CLOSED");
    });
  });
});
