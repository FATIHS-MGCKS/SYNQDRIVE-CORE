# VSI 2.0 P2 Master Intelligence — localization policy (2026-11-10)

## Decision (updated 2026-11-11 — native copy complete)

For PR **#2395** closeout and P2 hardening, **all 161** `master.intelligence.vsi.*` keys in the VSI 2.0 Master Intelligence surface exist in **all 9 product locales** (`de`, `en`, `pl`, `fr`, `cs`, `nl`, `es`, `tr`, `it`).

**Native copy status**

| Locale | VSI 2.0 P2 strings |
|--------|-------------------|
| `en` | Authoritative English source (`master.intelligence.vsi-v2.en.ts`) |
| `de` | Full German product copy |
| `pl`, `fr`, `cs`, `nl`, `es`, `tr`, `it` | **Native product copy** — dedicated `master.intelligence.vsi-v2.<locale>.ts` modules (no English dictionary spread) |

## Structural guardrails

- Vitest: `frontend/src/i18n/vsi-v2-native-locale.test.ts`
  - Key parity with English across `pl`, `fr`, `cs`, `nl`, `es`, `tr`, `it`, `de`
  - `{{interpolation}}` placeholder parity
  - No empty values
  - Flags locale strings identical to English except documented international tokens (`FSD`, `VSI`, `HTTP`, `JSON`, `UTC`, `NULL`, `read-only`, loanwords such as `Snapshot`, etc.)

Run:

```bash
cd frontend && npm run test -- --run src/i18n/vsi-v2-native-locale.test.ts
```

## Non-goals

- No `...en` dictionary spread masquerading as translation completeness.
- English fallback is **not** the policy for the seven non-`de` locales above for this key family.

## Agent reporting

Report **`I18N_LOCALIZATION=VSI_V2_P2_NATIVE_COMPLETE`** for this key family (not `EN_FALLBACK_POLICY_APPROVED`).

Localization debt outside `master.intelligence.vsi.*` VSI 2.0 modules remains tracked in the broader Integration 2 backlog; `npm run i18n:check` continues to enforce platform-wide key presence.
