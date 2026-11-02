# VSI P1a — Native Signal Discovery Inventory Migration Contract

| Field | Value |
|-------|-------|
| **Operation** | `VSI_UNIVERSAL_DISCOVERY_P1A` (planned — not in this PR) |
| **Depends on** | P0 contract `vsi-native-signal-discovery-v1` (this repository) |
| **Production baseline** | `a27ca9059b9fa9e8aa88696e811107fb427cb369` |

## 1. Prisma schema change

Add to `VehicleSignalCapabilityProfile`:

```prisma
nativeSignalDiscoveryInventory Json @default("[]") @map("native_signal_discovery_inventory")
```

Optional header (same migration or follow-up):

```prisma
discoveryContractVersion String? @map("discovery_contract_version")
```

**Do not** alter `signalsSnapshot` column type or `profileContractVersion` default (`vsi-signal-profile-v2`).

**Revision table:** `VehicleSignalCapabilityProfileRevision` — **no** `nativeSignalDiscoveryInventory` column in P1a (operational HEAD-only; see as-of guard).

## 2. Default and backfill

- Migration SQL: `DEFAULT '[]'` or application default empty inventory object matching `emptyNativeSignalDiscoveryInventory()` shape.
- Existing rows: empty array `[]` **or** canonical empty object `{ contractVersion, scope, evaluatedAt, entries: [], profileLimitations: [] }` — pick one in P1a migration script; readers must accept both until normalize pass (document in P1a PR).

## 3. Writer rules (P1b preview)

| Field | Update path | Bumps `profileRevision`? | Bumps semantic fingerprint? |
|-------|-------------|--------------------------|----------------------------|
| `signalsSnapshot` (12 keys) | Semantic materialization | Yes, when semantic delta | Yes |
| `nativeSignalDiscoveryInventory` | Operational CAS (`buildOperationalProfileRefreshCasWhere`) | **No** | **No** |
| `contentFingerprint` on inventory-only write | Copy existing semantic hash | No | No |

## 4. Reader compatibility

| Consumer | Change in P1a |
|----------|----------------|
| `parseSignalsSnapshot` / Master read | Unchanged — ignore new column until P5 |
| Capability resolver / APDS P5 | Unchanged — use `resolveNativeDiscoveryInventoryForConsumerContext` |
| P5-H1 revision as-of | Unchanged — revisions exclude inventory |
| P0-a audit | Unchanged until explicit matrix rows added in P2+ |

## 5. Rollback

- Drop column migration reversible; data loss acceptable (operational rediscovery on next refresh).
- Feature flags remain OFF: `VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED`, `VSI_DISCOVERY_HF_INVENTORY_ENABLED`.

## 6. Validation commands (P1a PR)

```bash
cd backend && npx prisma migrate dev --name vsi_native_signal_discovery_inventory
cd backend && npm test -- --testPathPatterns=vsi-native-signal-discovery
bash architecture/scripts/validate-module-registry.sh
```

## 7. GO / NO-GO (P1a)

| Gate | Criterion |
|------|-----------|
| GO | Migration applies on disposable DB; existing profiles readable; P0 contract tests PASS |
| NO-GO | Any change to `signalsSnapshot` array contract or semantic fingerprint inputs |
