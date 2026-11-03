# One Auto P4 — cross-vehicle HTTP 202 root cause (read-only forensics)

**Operation:** `ONEAUTO_P4_CROSS_VEHICLE_ROOT_CAUSE_INVESTIGATION`  
**Mode:** STRICT_READ_ONLY (2026-11-03)

## Confirmed root cause

`OE_VIN_LOOKUP_EU` on `api.oneautoapi.com` is **async-first**. P3 classified the SKU `SYNC_ONLY` because live E2 returned HTTP 200 on a single GET; forensics proved E2 was **cached retrieval** of E1’s completed async job (same Audi VIN, within ~24h provider retention). Production jobs for Arteon, Audi (same VIN as E2), and Tesla each received HTTP 202 once and failed with `ONEAUTO_ASYNC_POLL_UNVERIFIED` under P3 fail-closed policy.

**Ruled out:** request regression (URL/header parity confirmed in code), credential mismatch (sha256 prefix `b1fec515` parity).

## Evidence pointers

- Job IDs (production, masked VINs only): Arteon `cmw13fv6q002a13phnde3i3du`; Tesla `cmw1434v8007kz90oxw15dtub`; Audi `cmw143ln3007xz90opxhufuv2`.
- E1 `2026-11-02T10:50:58Z` → 202; E2 `2026-11-02T13:00:47Z` → 200; Audi retry `2026-11-03T19:59:57Z` → 202 (~33h after E1).

## Remediation split

- **PR-1 (this repo):** Registry + evidence correction → [P4_VIN_LOOKUP_ASYNC_CONTRACT_CORRECTION.md](./P4_VIN_LOOKUP_ASYNC_CONTRACT_CORRECTION.md)
- **PR-2:** `AWAITING_PROVIDER` lifecycle without poll/callback/retry
