# P3-PR11C — Distributed Core App M2M rate limiting

**Status:** DRAFT (code merged path only; **no production flag activation** in this PR)  
**Depends on:** P3-PR11B (product-bound vehicle read), existing `RedisModule` / `RedisService`

## Objective

Share rate-limit quotas across **both** production backend replicas for:

1. `POST /api/v1/auth/core-app/token` (M2M exchange)
2. `GET /api/v1/core/app/read/v1/organizations/:orgId/products/:productSlug/vehicles[...]` (vehicle list/detail)

## Redis dependency

Uses the **same** Redis instance as the rest of the backend (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`). No second Redis stack.

Implementation: `CoreAppM2mRedisRateLimitService` with atomic Lua `INCR` + `PEXPIRE` on first increment (`core-app-m2m-rate-limit.redis-script.ts`).

## Key patterns (no secrets)

| Surface | Key shape | Identity |
|--------|-----------|----------|
| Exchange | `synqdrive:core-app-m2m:rl:exchange:ip:{trustedIp}:w:{bucket}` | Server `req.ip` / socket only — **not** raw `X-Forwarded-For` |
| Vehicle list | `synqdrive:core-app-m2m:rl:vehicle:{clientId}:{orgId}:list:w:{bucket}` | Verified M2M principal |
| Vehicle detail | `synqdrive:core-app-m2m:rl:vehicle:{clientId}:{orgId}:detail:w:{bucket}` | Verified M2M principal |

Window bucket: `floor(nowMs / windowMs)`.

TTL on keys: `windowMs + 5000` ms (prevents unbounded growth).

## Configurable thresholds (defaults — not production-tuned)

| Variable | Default | Notes |
|----------|---------|--------|
| `CORE_APP_M2M_EXCHANGE_RATE_LIMIT_MAX` | 20 | Preserves P1B exchange policy |
| `CORE_APP_M2M_EXCHANGE_RATE_LIMIT_WINDOW_MS` | 60000 | |
| `CORE_APP_M2M_VEHICLE_READ_LIST_RATE_LIMIT_MAX` | 120 | Per client + org + minute |
| `CORE_APP_M2M_VEHICLE_READ_DETAIL_RATE_LIMIT_MAX` | 60 | Per client + org + minute |
| `CORE_APP_M2M_VEHICLE_READ_RATE_LIMIT_WINDOW_MS` | 60000 | Shared window for list/detail |

Do **not** treat these as production SLAs until operator review.

## Failure behavior

| Condition | Exchange | Vehicle read |
|-----------|----------|----------------|
| Limit exceeded | HTTP **429** | HTTP **429** |
| Redis unavailable | HTTP **503** (fail-closed) | HTTP **503** (fail-closed) |

No in-memory fallback on Redis errors (replica-local quota multiplication avoided).

Operator JWT and other routes are unchanged.

## Monitoring signals (required before live M2M)

- Counter: `core_app_m2m_rate_limit_denied_total` (label: `surface=exchange|vehicle_list|vehicle_detail`) — **recommended follow-up**
- Counter: `core_app_m2m_rate_limit_unavailable_total`
- Alert on sustained 503 from `/auth/core-app/token` or vehicle read paths when Redis is degraded
- Dashboard: Redis latency / error rate for the shared instance

## Deployment prerequisites

1. Redis reachable from **all** API replicas with identical `REDIS_*` config
2. Express/nginx trust proxy configured so `req.ip` reflects the **trusted** client IP (do not rate-limit on unvalidated `X-Forwarded-For`)
3. M2M and vehicle-read feature flags remain **off** until independent architecture audit completes

## Rollback

1. Revert PR11C deploy artifact (or roll back to previous SHA on VPS)
2. No schema migration; Redis keys expire automatically (≤ window + 5s)
3. Optional cleanup: `SCAN` + `DEL` keys matching `synqdrive:core-app-m2m:rl:*` on non-production Redis DBs only

## Tests

- Unit: `core-app-m2m-redis-rate-limit.service.spec.ts`, config spec
- Redis integration (opt-in): `CORE_APP_M2M_RATE_LIMIT_REDIS_INTEGRATION=1` + isolated `CORE_APP_M2M_RATE_LIMIT_REDIS_TEST_DB` (default **14**)
- Two-replica shared quota: same integration suite (two service instances, one Redis)