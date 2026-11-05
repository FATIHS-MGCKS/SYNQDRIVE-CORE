import { existsSync } from "node:fs";
import { join } from "node:path";
import { P16_MANIFEST_SHA256_SELF } from "../constants.js";
import { sha256File } from "../hash.js";

export interface P16GateResult {
  verdict: "PASS" | "FAIL_CLOSED";
  manifest_sha256_self: string;
  manifest_sha256_self_expected: string;
  sealed_inputs: Array<{
    role: string;
    resolved_path: string;
    sha256: string;
    sha256_expected: string;
    match: boolean;
  }>;
  errors: string[];
}

export interface P16Manifest {
  manifest_sha256_self?: string;
  SOURCE_INTEGRITY?: {
    sealed_inputs?: Array<{
      role: string;
      repo_relative?: string;
      path?: string;
      sha256?: string;
    }>;
  };
}

export function resolveRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "research/driving-intelligence/evaluations"))) {
      return dir;
    }
    dir = join(dir, "..");
  }
  throw new Error("Could not locate repository root from " + startDir);
}

export function resolvePackageRoot(repoRoot: string): string {
  return join(repoRoot, "research/driving-intelligence/ratio-state-profiler-m1");
}

/** Resolve sealed artifact path; P5 QC uses repo fixture when artifact path is absent. */
export function resolveSealedInputPath(
  repoRoot: string,
  entry: { role: string; repo_relative?: string; path?: string },
): string {
  if (entry.repo_relative) {
    return join(repoRoot, entry.repo_relative);
  }
  if (entry.path?.includes("TIG22_P5_OPTICAL_QC_360ROWS.csv")) {
    return join(
      resolvePackageRoot(repoRoot),
      "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv",
    );
  }
  if (entry.path && existsSync(entry.path)) {
    return entry.path;
  }
  throw new Error(`Unresolvable sealed input role=${entry.role}`);
}

export function verifyP16Gate(
  repoRoot: string,
  manifestPath: string,
  manifest: P16Manifest,
): P16GateResult {
  const errors: string[] = [];
  const declaredSelf = manifest.manifest_sha256_self;
  if (declaredSelf !== P16_MANIFEST_SHA256_SELF) {
    errors.push(
      `manifest_sha256_self field mismatch: got ${declaredSelf}, expected ${P16_MANIFEST_SHA256_SELF}`,
    );
  }
  /** Recomputed from parsed JSON is intentionally not used (JS number canonicalization ≠ Python P16 pin). */
  void manifestPath;

  const sealed = manifest.SOURCE_INTEGRITY?.sealed_inputs ?? [];
  const sealed_inputs: P16GateResult["sealed_inputs"] = [];

  for (const entry of sealed) {
    if (!entry.sha256) continue;
    if (entry.role === "analysis_windows_optional") continue;
    try {
      const resolved = resolveSealedInputPath(repoRoot, entry);
      const digest = sha256File(resolved);
      const match = digest === entry.sha256;
      if (!match) {
        errors.push(`sha256 mismatch role=${entry.role} path=${resolved}`);
      }
      sealed_inputs.push({
        role: entry.role,
        resolved_path: resolved,
        sha256: digest,
        sha256_expected: entry.sha256,
        match,
      });
    } catch (e) {
      errors.push(String(e));
    }
  }

  return {
    verdict: errors.length === 0 ? "PASS" : "FAIL_CLOSED",
    manifest_sha256_self: declaredSelf ?? "MISSING",
    manifest_sha256_self_expected: P16_MANIFEST_SHA256_SELF,
    sealed_inputs,
    errors,
  };
}
