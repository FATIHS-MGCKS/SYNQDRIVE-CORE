# DS4 Layer-2 P3C — Offline physics diagnostics sidecar

**Status:** Research-only sidecar. Does **not** modify P2 canonical CSVs or production assessment/admission paths.

**Schema:** `DS4_LAYER2_P3C_PHYSICS_DIAGNOSTICS_V1`  
**Formulas:** `DS4_LAYER2_P3C_PHYSICS_FORMULAS_V1`

## Purpose

Attach versioned Motion Physics diagnostics to the **pinned 11-trip P2 cohort** (129 admissible events @ P2 evaluation SHA `355d9cb6…`) without changing kinematic Layer-2 outputs (B/I/Phi/S) or event admission.

## Inputs

| Input | Provenance |
|-------|------------|
| P2 artifacts (`p2_*.csv`, manifest) | Read-only; checksums in `ds4-layer2-p2-pinned-11.attestation.v1.ts` |
| Motion Physics reference | P3B resolver (`resolveDs4Layer2MotionPhysicsContextV1`) via fixture or Prisma factory |
| Trip temporal window | Min/max admissible event labels per trip |

**P2 evaluation code** remains pinned separately from **P3C implementation SHA** (manifest records both).

## Diagnostics (derived only)

| Id | Formula | Notes |
|----|---------|--------|
| A | `a_ref = (100/3.6) / accel0To100S` | Average acceleration reference (m/s²), not instantaneous limit |
| B | `r_a = \|a_event\| / a_ref` | ACCELERATION events only |
| C | `F_est = m × a_signed` | Idealized net longitudinal force (N) |
| D | `Σ(a_i × T_i)` | Consistency check vs P2 `accel_B_k_mps` / `brake_B_k_mps`; does not rewrite P2 |

## Temporal gates

Reference resolved at **trip end** (`asOfUtc`) using P3B on the selected row. Window overlap checks (`effectiveFrom` / `effectiveTo`) are **not** historical proof.

**Temporal provenance** (separate from evidence tier and numeric availability):

| Value | Meaning |
|-------|---------|
| `HISTORICALLY_EVIDENCED` | Persisted point-in-time row (`PERSISTED_POINT_IN_TIME`) with `createdAt ≤ tripEnd` |
| `RETROSPECTIVE_REFERENCE` | Fixture snapshot or active-only lookup — exploratory, not historical proof |
| `TEMPORAL_EVIDENCE_MISSING` | Window/postdate/expiry ambiguity |
| `IDENTITY_MISMATCH` | Identity gate failure |
| `REFERENCE_UNAVAILABLE` | No usable row |

Fixture `effectiveFrom` dates are **authoring metadata only** and must not be treated as independently evidenced historical applicability.

## Outputs

- `p3c_physics_context.csv`
- `p3c_event_diagnostics.csv`
- `p3c_limitations.csv`
- `p3c_manifest.json`

## Entry points

- Library: `buildDs4Layer2P3cPhysicsDiagnosticsV1`, `buildDs4Layer2P3cSidecarArtifactsV1`
- Harness: `backend/scripts/research/ds4-layer2-p3c-offline-physics-diagnostics.cli.ts`
- Tests: `npm run test:di:ds4-layer2-p3c-physics`

## Integration boundary

Do not import from motion-core shadow processor, DS4 assessment worker, admission, C5.1, Driving Impact, Tire Intelligence, or Brake Health.

## Change record

- 2026-10-31: Initial P3C sidecar (pinned 11-trip cohort fixtures + reference snapshot fixture).
