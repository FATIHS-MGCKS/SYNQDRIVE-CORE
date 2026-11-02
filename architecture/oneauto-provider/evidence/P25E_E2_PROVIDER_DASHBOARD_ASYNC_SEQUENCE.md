# One Auto P2.5E-E2 — Provider dashboard async sequence (audit notes)

**Epistemic status:** Owner-supplied portal rows + SYNQDRIVE attestation evidence. **Not** proof of callback delivery to SynqDrive or of a complete result payload received by SynqDrive.

## Observed provider portal (owner report)

| Timestamp (UTC) | Portal HTTP | Notes |
|-----------------|-------------|--------|
| 2026-11-02 11:50:58 | **202** | Matches isolated attestation E1 (`HTTP_202_ASYNC`, ~308 response bytes). |
| 2026-11-02 11:51:20 | **200** | ~22s later; portal marks `is_sqs_call=Y`; same Audi VIN. |

## What SynqDrive attestation captured (E1)

- **Exactly one** outbound GET from the P25E-C CLI harness.
- Redacted evidence: `diagnosticCategory=HTTP_202_ASYNC`, `attestationQualified=false`, `attemptedOutboundRequests=1`.
- **No** second HTTP response body or headers from SynqDrive to One Auto in that run.

## Interpretation (fail-closed)

| Claim | Status |
|-------|--------|
| Provider accepted async work (202) | **CONFIRMED** (SynqDrive saw 202 + portal row) |
| Provider later completed internal processing (portal 200 + SQS flag) | **INFERRED** from portal only — not observed on SynqDrive wire |
| SynqDrive received HTTP 200 result JSON from One Auto | **NOT CLAIMED** — no second attestation GET; no stored 200 body |
| Callback/webhook delivered result to SynqDrive | **UNKNOWN** — callbacks not sent by attestation harness; no webhook evidence in repo |
| Same-URL poll would be free | **UNKNOWN** — `asyncPollSameUrlWithoutNewCharge=false` on documented contract |

## Offline fixture mapping

| Fixture id | Role |
|------------|------|
| `http-202-production-e1-parity` | Single mocked GET returns **202** (~308 B) — models **only** E1 SynqDrive-visible acceptance. |
| `http-200-success-true` | Separate offline run models **sync 200** envelope success — **not** the portal’s second audit row and **not** chained to E1. |

**Do not** merge fixture outputs across runs to simulate a two-hop provider sequence inside one attestation execution.

## Billing

Portal rows may represent **one or two** billable events — vendor-defined. SynqDrive evidence keeps `billingStatus: UNKNOWN` until vendor + account attestation exists.
