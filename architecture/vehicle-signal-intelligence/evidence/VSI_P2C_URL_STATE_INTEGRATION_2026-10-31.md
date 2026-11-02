# VSI P2-C — Evidence Ledger URL-state integration contract (2026-10-31)

Status: `PROPOSED` · Scope: extend existing Master Intelligence URL shell (P2-D/P2-E implementation). **No second URL-state manager.**

## Canonical owner today

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Parse / build scope | `master-intelligence-url.ts` | `orgId`, `vehicleId`, `providerSourceLinkId`, `physicalDeviceId`, APDS fields, `asOf`, `rejectedParams` |
| React binding | `MasterIntelligenceContextProvider` | `context`, `setContextInUrl`, `navigateCrossLink`, `popstate` sync |
| View selection | Master SPA `?view=vsi-intelligence` | Not React Router paths |

P2-C components are **presentational only**; they do not read or write `window.location`.

## Planned ledger params (P2-D / P2-E)

| Param | Sanitization | Default | Notes |
|-------|--------------|---------|-------|
| `tab` | `overview` \| `ledger` \| `revisions` | `overview`; auto `ledger` when `signalKey` set (P2-E) | Extend `parseMasterIntelligenceContext` or add `parseVsiLedgerUrlState` colocated in `master-intelligence-url.ts` that merges into one object — still one parser entry point |
| `signalKey` | `^[a-z0-9_]{1,64}$` | absent | Opens `SignalDetailSheet`; invalid → `rejectedParams` |
| `q` | trim, max 128 | absent | Substring filter |
| `appl`, `obs`, `fresh`, `rpm` | comma-separated enums | absent | Unknown tokens → `rejectedParams` |
| `lim`, `hf`, `hideNA` | `1` only | absent | Boolean flags |

Existing scope keys remain unchanged.

## History semantics

| Action | API | History |
|--------|-----|---------|
| Open signal detail | `pushMasterIntelligenceUrl(view, { …context, signalKey }, { replace: false })` | `pushState` — browser **Back** closes sheet |
| Close signal detail | `pushMasterIntelligenceUrl(view, { …context, signalKey: null }, { replace: true })` | `replaceState` — avoids back-stack clutter |
| Change filter | `replace: true` | Filters shareable but do not fork history per keystroke |
| Change vehicle | `setContextInUrl` clearing `signalKey` + all ledger filter keys | Full reset of detail + filters |
| Change source link | `setContextInUrl` clearing `signalKey` only | Preserve filters where signal keys still apply |
| Tab switch | `replace: true` unless entering detail from overview row (`pushState` optional) |

`MasterIntelligenceContextProvider` already listens to `popstate`; P2-E must re-parse **ledger params** on the same event (extend parser, not a parallel listener).

## Focus restoration (P2-E)

1. Table row click sets `data-signal-key` + `ref` on trigger.
2. Sheet `onOpenChange(false)` after close restores focus to originating row button.
3. Radix `Sheet` provides focus trap + `Esc`; do not nest a second trap.

## Cross-link preservation

`navigateMasterIntelligenceCrossLink` must continue to pass `orgId`, `vehicleId`, `providerSourceLinkId` unchanged. Ledger params should be **stripped** on cross-view navigation (APDS, vehicles, PDI) unless explicitly scoped in a future ADR.

## Implementation checklist (P2-D)

- [ ] Extend `MasterIntelligenceContextState` or add nested `ledgerUrlState` typed slice parsed from the same `URLSearchParams`
- [ ] Extend `buildMasterIntelligenceSearch` to emit ledger params when set
- [ ] Unit tests mirroring `master-intelligence.test.ts` history cases for `signalKey` back/forward
- [ ] Wire `VsiMasterIntelligenceView` tabs + table (P2-E) — out of scope for P2-C

## References

- Design: `VSI_P2B_FABLE_UX_ARCHITECTURE_2026-10-31.md` (branch `cursor/vsi-p2b-ux-architecture-f8cd`, commit `e7dad077f`)
- Components: `frontend/src/master/intelligence/ledger/*`
