# DS4 Layer-2 P4B — Event kinematics evidence sidecar (V1)

**Schema:** `DS4_LAYER2_P4B_EVENT_KINEMATICS_EVIDENCE_V1`  
**Mode:** Research-only read-only sidecar; does not modify P2 CSV fixtures, motion-core, or event admission.

## Purpose

Join canonical P2 admissible events (`tripId` + `sourceMotionRunId` + `eventIndex`) to persisted Motion V2 shadow payloads (`payload_gzip`) and emit boundary speed evidence plus optional in-window speed statistics. Peak acceleration/deceleration is explicitly **unavailable** (`NOT_PERSISTED_IN_MOTION_V2_CONTRACT`).

## Inputs

- Pinned 11-trip P2 fixtures (`research/fixtures/ds4-layer2-p2-pinned-11/`) with attested checksums.
- Pinned source motion run IDs and content fingerprints (`ds4-layer2-p4b-pinned-source-runs.v1.ts`).
- Read-only load of `di_v0_motion_core_shadow_runs_v1.payload_gzip` for pinned runs only.

## Artifacts

| File | Role |
|------|------|
| `p4b_manifest.json` | Provenance, evaluation SHAs, pinned runs, checksums |
| `p4b_event_speed_evidence.csv` | Per-event boundary + window speed evidence |
| `p4b_join_exclusions.csv` | Failed joins with reason codes |
| `p4b_coverage_summary.json` | Coverage rollups (vehicle, source family, C4/C5.1, BIN_ONLY, repairs) |

## Commands

```bash
cd backend && npm run test:di:ds4-layer2-p4b-event-speed
cd backend && npm run research:ds4-layer2-p4b-event-speed -- --out-dir=/tmp/ds4-p4b-out
```

CLI requires `DATABASE_URL` and read access to production-like shadow run rows for the pinned organization.

## Hard rules

- No production writes, backfill, or motion-engine changes.
- No peak reconstruction from flags, derivatives, or trip maxima.
- No silent substitution of motion revisions (fingerprint gate on load).
