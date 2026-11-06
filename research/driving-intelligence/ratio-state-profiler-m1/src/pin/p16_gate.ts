import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { P16_MANIFEST_SHA256_SELF, P16_SEALED_ARTIFACTS } from "../constants.js";
import { sha256File } from "../hash.js";

export interface P16GateResult {
  verdict: "PASS" | "FAIL_CLOSED";
  manifest_sha256_self_declared: string;
  manifest_sha256_self_recomputed: string;
  manifest_sha256_self_expected: string;
  manifest_content_integrity: "MATCH" | "MISMATCH" | "RECOMPUTE_FAILED";
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
      present?: boolean;
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

export function resolveSealedInputPath(
  repoRoot: string,
  entry: { role: string; repo_relative?: string; path?: string },
): string {
  const pinned = P16_SEALED_ARTIFACTS.find((a) => a.role === entry.role);
  if (pinned?.repo_relative) {
    return join(repoRoot, pinned.repo_relative);
  }
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

/** Canonical P16 self-hash (Python json.dumps sort_keys, compact separators, ensure_ascii). */
export function recomputeManifestSelfHashFromFile(manifestPath: string): string {
  const script = `
import json, hashlib, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    obj = json.load(f)
obj.pop("manifest_sha256_self", None)
payload = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
print(hashlib.sha256(payload).hexdigest())
`;
  return execFileSync("python3", ["-c", script, manifestPath], { encoding: "utf8" }).trim();
}

export interface P16GateOptions {
  /** Test-only: override resolved paths for sealed artifact hash checks. */
  sealedPathOverrides?: Partial<Record<(typeof P16_SEALED_ARTIFACTS)[number]["role"], string>>;
}

export function verifyP16Gate(
  repoRoot: string,
  manifestPath: string,
  manifest: P16Manifest,
  options?: P16GateOptions,
): P16GateResult {
  const errors: string[] = [];
  const declaredSelf = manifest.manifest_sha256_self ?? "MISSING";

  let recomputed = "RECOMPUTE_FAILED";
  let contentIntegrity: P16GateResult["manifest_content_integrity"] = "RECOMPUTE_FAILED";
  try {
    recomputed = recomputeManifestSelfHashFromFile(manifestPath);
    contentIntegrity = recomputed === P16_MANIFEST_SHA256_SELF ? "MATCH" : "MISMATCH";
    if (recomputed !== P16_MANIFEST_SHA256_SELF) {
      errors.push(
        `manifest content digest mismatch: recomputed ${recomputed}, expected ${P16_MANIFEST_SHA256_SELF}`,
      );
    }
    if (declaredSelf !== P16_MANIFEST_SHA256_SELF) {
      errors.push(
        `manifest_sha256_self declared field mismatch: got ${declaredSelf}, expected ${P16_MANIFEST_SHA256_SELF}`,
      );
    }
    if (declaredSelf !== recomputed) {
      errors.push(`declared self-hash does not match recomputed content digest`);
    }
  } catch (e) {
    errors.push(`manifest recompute failed: ${String(e)}`);
  }

  for (const required of P16_SEALED_ARTIFACTS) {
    const resolved =
      options?.sealedPathOverrides?.[required.role] ?? join(repoRoot, required.repo_relative);
    if (!existsSync(resolved)) {
      errors.push(`missing required artifact role=${required.role} path=${resolved}`);
      continue;
    }
    const digest = sha256File(resolved);
    if (digest !== required.sha256) {
      errors.push(`sha256 mismatch role=${required.role} path=${resolved}`);
    }
  }

  const sealed_inputs: P16GateResult["sealed_inputs"] = [];
  for (const required of P16_SEALED_ARTIFACTS) {
    const resolved =
      options?.sealedPathOverrides?.[required.role] ?? join(repoRoot, required.repo_relative);
    const digest = existsSync(resolved) ? sha256File(resolved) : "MISSING";
    sealed_inputs.push({
      role: required.role,
      resolved_path: resolved,
      sha256: digest,
      sha256_expected: required.sha256,
      match: digest === required.sha256,
    });
  }

  const manifestRoles = new Set(
    (manifest.SOURCE_INTEGRITY?.sealed_inputs ?? []).map((e) => e.role),
  );
  for (const required of P16_SEALED_ARTIFACTS) {
    if (required.role === "analysis_windows_nine") {
      if (!manifestRoles.has("analysis_windows_optional") && !manifestRoles.has("analysis_windows_nine")) {
        errors.push("manifest missing analysis windows role entry (expected analysis_windows_optional)");
      }
    }
  }

  return {
    verdict: errors.length === 0 ? "PASS" : "FAIL_CLOSED",
    manifest_sha256_self_declared: declaredSelf,
    manifest_sha256_self_recomputed: recomputed,
    manifest_sha256_self_expected: P16_MANIFEST_SHA256_SELF,
    manifest_content_integrity: contentIntegrity,
    sealed_inputs,
    errors,
  };
}

export function loadManifestFromPath(manifestPath: string): P16Manifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as P16Manifest;
}
