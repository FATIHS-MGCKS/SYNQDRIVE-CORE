# VSI 2.0 P2 Master Intelligence — localization policy (2026-11-10)

## Decision (option B — approved English fallback)

For PR **#2395** closeout, **all 151** `master.intelligence.vsi.*` keys added in Integration 1B.2 scope exist in **all 9 product locales** (`de`, `en`, `pl`, `fr`, `cs`, `nl`, `es`, `tr`, `it`).

**Native copy status**

| Locale | VSI 2.0 P2 strings |
|--------|-------------------|
| `en` | Authoritative English source |
| `de` | Full German product copy |
| `pl`, `fr`, `cs`, `nl`, `es`, `tr`, `it` | **Structural coverage only** — keys present; body text largely mirrors English until a dedicated localization workstream lands |

## Non-goals

- No claim of “9-locale complete” UI copy for VSI 2.0 tabs beyond `de` / `en`.
- No `...en` dictionary spread masquerading as translation completeness.

## Follow-up

- Track remaining translation debt in rental i18n Integration 2 / product localization backlog.
- `npm run i18n:check` continues to enforce key presence and structure.

## Agent reporting

Report **`I18N_LOCALIZATION=EN_FALLBACK_POLICY_APPROVED`** (not `COMPLETE`).

