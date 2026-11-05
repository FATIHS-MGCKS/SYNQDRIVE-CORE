import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256File(path: string): string {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

export function sha256CanonicalJson(value: unknown): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(value, Object.keys(value as object).sort()));
  return h.digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortJson(o[k]);
        return acc;
      }, {});
  }
  return value;
}

/** P16 pin self-hash: SHA-256 of manifest JSON without `manifest_sha256_self` (canonical sorted keys). */
export function sha256P16ManifestSelf(manifest: Record<string, unknown>): string {
  const copy = { ...manifest };
  delete copy.manifest_sha256_self;
  const h = createHash("sha256");
  h.update(JSON.stringify(sortJson(copy)));
  return h.digest("hex");
}

export function stableReportHash(report: Record<string, unknown>): string {
  const copy = structuredClone(report) as Record<string, unknown>;
  delete copy.generated_at_utc;
  const h = createHash("sha256");
  h.update(JSON.stringify(copy, sortKeysReplacer));
  return h.digest("hex");
}

function sortKeysReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = o[k];
        return acc;
      }, {});
  }
  return value;
}
