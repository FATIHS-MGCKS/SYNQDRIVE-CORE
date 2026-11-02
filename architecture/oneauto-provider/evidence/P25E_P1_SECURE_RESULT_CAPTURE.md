# One Auto P2.5E-P1 — Secure attestation result capture

**Epistemic status:** Implementation design for isolated attestation CLI only. **Not** product `OneAutoProviderJob` storage. **Not** EXECUTION_VERIFIED promotion.

## Defaults

- Attestation evidence remains **fingerprint-only** (`oneauto-sandbox-attestation-v2`).
- Result capture is **opt-in** via CLI `--capture-redacted-result`.

## Authorization (all required)

| Gate | Env / flag |
|------|------------|
| Live production attestation | Existing P25E-C owner + billing + one-GET env flags |
| Capture enabled | `ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED=1` |
| Capture owner ack | `ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTHORIZED=1` |
| Output path | `ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH` (absolute file path) |

## Eligibility

Capture runs **only** when:

- HTTP **200**
- OpenAPI envelope `success === true`
- Provider result VIN matches expected attestation VIN (normalized)
- Attestation category `SYNC_ATTESTATION_SUCCESS`

**Never** captures: HTTP 202, HTTP 206, envelope failures, VIN mismatch.

## Artifact

- Schema: `oneauto-attestation-result-capture-v1`
- Separate from shareable attestation JSON (no raw provider body in evidence)
- Publish: temp file `.oneauto-capture-*.tmp` in the **same resolved directory** (mode **0600**), then atomic `rename` to destination with **no-clobber** (destination must not exist); temp removed on failure
- Path must be absolute; no `..`; reject symlinks on path segments; target must not exist; parent directory resolved with `realpath`
- **Never commit** capture files to git

## Redaction

Stored vehicle object includes **17** allowlisted non-VIN OpenAPI result fields only: make, model range, derivative, vehicle/oem descriptions, manufactured/oem model year, fuel, engine, transmission, drivetrain, **body type** (`oem_body_type_desc` → `bodyType`), **interior trim** (`oem_interior_trim_desc` → `interiorTrim`), power kW/BHP, colour, date last updated.

Omitted from artifact:

- Full VIN (only `vinSha256Prefix` at document root)
- API keys, tokens, credentials, email/phone/address-like keys
- `vehicle_identification_number` field name/value

## Retention & deletion

Operator responsibility: delete local capture artifacts within **90 days** unless legal hold applies. SynqDrive does not upload capture files to production DB or object storage in P1.

## Non-effects

- No `ONEAUTO_EXECUTION_VERIFIED` registry changes
- No vehicle specification writes
- No polling/callbacks
- No additional provider requests beyond the single attestation GET
