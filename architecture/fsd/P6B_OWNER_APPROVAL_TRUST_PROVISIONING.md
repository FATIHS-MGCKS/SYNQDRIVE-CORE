# P6B — Owner approval trust provisioning (V1)

## Public trust store (root-controlled)

- Provision **Ed25519 public keys only** via VPS/root operator control.
- Runtime loading:
  - `FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON` (inline JSON), or
  - `FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE` (path outside git).
- Schema: `FSD3_LIVE_OWNER_APPROVAL_TRUST_SCHEMA_V1`
- Duplicate `keyId` and invalid `notBeforeIso` / `notAfterIso` windows are rejected fail-closed.
- Revocation: `revokedKeyIds` list in the same store.

No production private keys or production trust material belong in the git repository.

## Private signing key (owner, off-repo)

- Owner signs canonical approval payloads off-repo using `backend/scripts/ops/fsd3-live-owner-approval-sign.ts`.
- Private PEM path via `FSD3_OWNER_L2_SIGNING_KEY_PEM_FILE` only — never commit PEM files.
- Deliver signed envelope JSON to operators; operators store file with restrictive permissions.

## P6B scope

This phase documents and enforces verification only. **No production trust-store installation** is performed as part of P6B PR work.
