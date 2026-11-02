# SynqDrive Rental Architecture — Canonical Module Registry

**Purpose:** This is the **mandatory first routing point** for agents working on SynqDrive rental product and shared frontend/backend runtime domains — including frontend, backend, APIs, UI contracts, persistence, workers, schedulers, integrations, signals, and cross-module runtime flows. It is an index and governance authority — **not** a replacement for module-specific documentation.

**Normative audit standard:** [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md) — mandatory for current-state audits, module directory structure, repository/Production evidence requirements, Production read-only safety, and promotion from `AUDIT_IN_PROGRESS` to `AUTHORITY_ACTIVE`.

**Central registry validator:** `bash architecture/scripts/validate-module-registry.sh`

**Last updated:** 2026-10-28 (DS4 authoritative assessment migration PR-0: DI design doc + owner decision; Brakes Health / Rental Driving Analysis / Rental Health → `AUDIT_IN_PROGRESS`)

---

## Module inventory overview

Canonical overview of known modules. **Every row includes module name, mini description, and registry status.** Detailed authority sections below apply only where registry coverage status is `AUTHORITY_ACTIVE`.

| Module | Mini description | Registry status | Authority-native status | Authority path |
|--------|------------------|-----------------|-------------------------|----------------|
| Account & Self-Service | End-user account profile, preferences, and self-service account operations for authenticated users. | `NOT_STARTED` | N/A — inventory only | — |
| Activity Log & HTTP Audit | Captures HTTP mutation audit trails and exposes activity-log APIs for org and master-admin review. | `NOT_STARTED` | N/A — inventory only | — |
| AI Platform (Fleet Chat & Tools) | Org-scoped fleet AI chat, LLM gateway, document and vehicle AI tools, limits, and routing. | `NOT_STARTED` | N/A — inventory only | — |
| Auth API | Tenant authentication API surface including token refresh and auth endpoints backing Clerk integration. | `NOT_STARTED` | N/A — inventory only | — |
| Automatic Trip Enrichment (ATE) | Orchestrates post-finalize trip behavior enrichment, hardware routing, and reconciliation-driven enrichment chains. | `AUTHORITY_ACTIVE` | `CANONICAL` (per [GRAPH.yaml](knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml)) | [`architecture/knowledge-graphs/automatic-trip-enrichment/`](knowledge-graphs/automatic-trip-enrichment/) |
| Battery V2 | Documents Battery V2 health model, signal authority, lifecycle, execution, persistence, and consumer contracts. | `AUTHORITY_ACTIVE` | Phase 4 resolution planning · gaps remain open | [`architecture/battery-v2/`](battery-v2/) |
| Billing (SynqDrive SaaS) | Tenant subscription billing, Stripe SaaS catalog, usage metering, and master billing reconciliation. | `NOT_STARTED` | N/A — inventory only | — |
| Bookings | Rental booking lifecycle from wizard through handover, eligibility gates, pickup gate, and payment coupling. | `NOT_STARTED` | N/A — inventory only | — |
| Brakes Health | Brake component lifecycle, wear evidence, recalculation jobs, and brake health APIs for vehicle detail views. | `AUDIT_IN_PROGRESS` | Bootstrap V0.1 · DS4 migration consumer (PR-8) · Production audit not started | [`architecture/brakes-health/`](brakes-health/) |
| Business Audit | Durable business-event audit outbox with scheduled processing for operational audit records. | `NOT_STARTED` | N/A — inventory only | — |
| Business Insights | Detector-based dashboard insight signals such as utilization, shortages, and fleet operational patterns. | `NOT_STARTED` | N/A — inventory only | — |
| Communication Center | Omnichannel conversation persistence and operator inbox across WhatsApp, SMS, and voice projections. | `NOT_STARTED` | N/A — inventory only | — |
| Customer Verification (Didit) | Identity verification workflows and Didit webhook handling for rental eligibility. | `NOT_STARTED` | N/A — inventory only | — |
| Customers | Org-scoped rental customer records, profiles, and customer management APIs. | `NOT_STARTED` | N/A — inventory only | — |
| Damages | Structured vehicle damage records with pin and image semantics and org-facing damage management. | `NOT_STARTED` | N/A — inventory only | — |
| Dashboard Utilization | Fleet utilization metrics and dashboard aggregates for rental operations. | `NOT_STARTED` | N/A — inventory only | — |
| Data Analyse | Advanced org analytics including driving analyses and misuse-case views for permitted roles. | `NOT_STARTED` | N/A — inventory only | — |
| Data Authorizations | Tenant data-access consent and authorization enforcement for AI and sensitive APIs. | `NOT_STARTED` | N/A — inventory only | — |
| Deployment Security & Release Governance (DSRG) | Cross-cutting production deployment security, pinned executors, release attestation, authorization, privilege boundaries, rollback and enforcement. | `AUTHORITY_ACTIVE` | Cross-cutting deployment governance · Gate A complete (DSRG-03 R3); runtime enforcement separate | [`architecture/dsrg/`](dsrg/) |
| DIMO Integration | DIMO auth, telemetry, segments, triggers, webhooks, device-connection episodes, and provider gateway. | `AUDIT_IN_PROGRESS` | Bootstrap audit · R9 webhook cross-module trigger (2026-09-07) | [`architecture/dimo-integration/`](dimo-integration/) |
| Document Extraction (AI Upload) | Shared upload-to-extraction-to-review-to-apply flow for operational document intake. | `NOT_STARTED` | N/A — inventory only | — |
| Documents | Document storage, legal texts, rental contracts, booking document bundles, retention, and integrity controls. | `NOT_STARTED` | N/A — inventory only | — |
| Driving Intelligence | Transforms vehicle telemetry and completed trip boundaries into driving-behavior events, operational-load scoring, durable post-trip analysis, misuse signals, and API/UI projections. | `AUTHORITY_ACTIVE` | Retrospective expansion V2 (2026-09-06) · SUBSTANTIAL reconstruction | [`architecture/drivingintelligence/`](drivingintelligence/) |
| DTC / Error Codes | Diagnostic trouble code storage, knowledge enrichment, alerts, and error-code health surfaces. | `AUDIT_IN_PROGRESS` | Audit in progress — Production baseline 2026-10-15 | [`architecture/dtc-error-codes/`](dtc-error-codes/) |
| Energy Event Detection (EED) | Owns REFUEL/RECHARGE detection semantics, ERD physical EV charge sessions, coalescing, and energy-event API/UI contracts. | `AUTHORITY_ACTIVE` | `APPROVED_FOR_CANONICAL_MERGE` — PR #1486 merged on `main` (`182731fe48cd25578668f102ed847f4791fbaabd`); authority metadata not yet promoted to `CANONICAL` (see [EED section](#energy-event-detection-eed--kg-eed)) | [`architecture/knowledge-graphs/energy-event-detection/`](knowledge-graphs/energy-event-detection/) |
| Evaluations Analytics | Entity-scoped evaluation analytics including insights, quality, and recommendation layers. | `NOT_STARTED` | N/A — inventory only | — |
| Evaluations Finance | Financial evaluation analytics APIs for rental operational finance views. | `NOT_STARTED` | N/A — inventory only | — |
| Fines | Traffic and parking fine record management for fleet operations. | `NOT_STARTED` | N/A — inventory only | — |
| High Mobility Integration | HM telemetry ingestion, vehicle registration, compatibility intelligence, and webhooks. | `NOT_STARTED` | N/A — inventory only | — |
| IAM Data Retention | GDPR user deletion, IAM retention policies, and master-admin deletion workflows. | `NOT_STARTED` | N/A — inventory only | — |
| IAM MFA | Multi-factor authentication enrollment, step-up grants, and MFA administration. | `NOT_STARTED` | N/A — inventory only | — |
| Insurances | Vehicle insurance policy management and insurance partner channel adapters. | `NOT_STARTED` | N/A — inventory only | — |
| Integrations Hub | Tenant integrations configuration and connection management surface. | `NOT_STARTED` | N/A — inventory only | — |
| Internationalization (i18n) | Owns locale selection, translation catalogs, runtime translation delivery, Rental UI localization, fallback behavior, translation coverage, hardcoded-copy prevention, and i18n governance/CI. | `AUTHORITY_ACTIVE` | Bootstrap audit V1 (2026-09-10) · Gate A satisfied · runtime-bearing frontend module · product migration debt documented | [`architecture/internationalization/`](internationalization/) |
| Invoices | Operational invoice records, issue and send flows, and accounts-receivable management for rentals. | `NOT_STARTED` | N/A — inventory only | — |
| Notifications | Multi-channel notification evaluation, preferences, delivery outbox, and in-app notification consumption. | `NOT_STARTED` | N/A — inventory only | — |
| Organizations & Tenancy | Multi-tenant organization profiles, operational settings, and tenant-scoped configuration. | `NOT_STARTED` | N/A — inventory only | — |
| Outbound Email | Resend-based outbound email for org, platform, and booking-document delivery. | `NOT_STARTED` | N/A — inventory only | — |
| Parts & Accessories | Parts procurement integrations including Alzura and eBay marketplace adapters. | `NOT_STARTED` | N/A — inventory only | — |
| Payments (Rental Collections) | Stripe Connect payment collection for booking and organization payment requests. | `NOT_STARTED` | N/A — inventory only | — |
| Platform Admin | Master-admin operations dashboard, security governance, and cross-tenant platform controls. | `NOT_STARTED` | N/A — inventory only | — |
| Pricing & Deposits | Rental tariff pricing rules, publish flow, and deposit resolution for checkout. | `NOT_STARTED` | N/A — inventory only | — |
| Products (Rental Catalog) | Rental product catalog definitions and org product assignments. | `NOT_STARTED` | N/A — inventory only | — |
| Prospects | Pre-customer prospect and lead records for master-admin sales pipeline. | `NOT_STARTED` | N/A — inventory only | — |
| Rental Driving Analysis | Rental-period driving analysis aggregation for bookings and drivers consuming trip intelligence. | `AUDIT_IN_PROGRESS` | Bootstrap V0.1 · Consumer Audit V1 traceability · DS4 consumer PR-6 | [`architecture/rental-driving-analysis/`](rental-driving-analysis/) |
| Rental Health | Fleet-level health aggregation consuming source vehicle health modules without recalculating. | `AUDIT_IN_PROGRESS` | Bootstrap V0.1 · DS4 cross-module governance PR-0 | [`architecture/rental-health/`](rental-health/) |
| Rental Rules | Org-level rental policy and rules configuration governing bookings and operations. | `NOT_STARTED` | N/A — inventory only | — |
| Scaling Process | Documents horizontal scaling, multi-replica coordination, scheduler leader election, and production scale gates. | `AUTHORITY_ACTIVE` | Bootstrap established · living architecture authority | [`architecture/scaling-process/`](scaling-process/) |
| Service Cases | Operational service-case tracking linked to fleet maintenance and vendor work. | `NOT_STARTED` | N/A — inventory only | — |
| Service Events & Compliance | Oil change, TÜV, service intervals, and compliance task materialization for vehicles. | `NOT_STARTED` | N/A — inventory only | — |
| SMS & Twilio Messaging | SMS conversation persistence and Twilio provider provisioning for messaging channels. | `NOT_STARTED` | N/A — inventory only | — |
| Stations | Rental station locations, geofencing, booking rules, transfers, and Stations V2 configuration. | `NOT_STARTED` | N/A — inventory only | — |
| Support | Customer and operator support ticket APIs and in-app support surfaces. | `NOT_STARTED` | N/A — inventory only | — |
| Tankstellenerkennung | Identifies physical fuel stations after a REFUEL `VehicleEnergyEvent` has been persisted. | `AUTHORITY_ACTIVE` | Bootstrap V1 · incremental/open scientific workstream | [`architecture/tankstellenerkennung/`](tankstellenerkennung/) |
| Tasks & Work Orders | Work orders, task domain V2, and task automation outbox processing. | `NOT_STARTED` | N/A — inventory only | — |
| Technical Observations | Operator technical observation records feeding notifications and workflow triggers. | `NOT_STARTED` | N/A — inventory only | — |
| Tires Health | Tire wear modeling (V2, frozen), lifecycle, measurements/ground truth, health alerts, tire trip-usage ledger, rental-health tire policy input, and future DS4 Motion Engine driving-load integration (shadow only). | `AUDIT_IN_PROGRESS` | Bootstrap V0.1 · Tire Intelligence P1 (2026-10-24) · owner decisions PROPOSED · Production VERIFIED_READ_ONLY @ `c169ddfab` · not promoted | [`architecture/tires/`](tires/) |
| Trip Detection & Lifecycle | Live trip FSM, start/end detection, Qualified Stop V1, R9 wake ingress, reconciliation, route artifacts. | `AUTHORITY_ACTIVE` | Phase 0–5 complete · Gate A 2026-09-26 · Production VERIFIED_READ_ONLY @ `2b54a357…` | [`architecture/trip-detection-lifecycle/`](trip-detection-lifecycle/) |
| Users & Invites | Org user management, custom roles, invites, and IAM audit outbox scheduling. | `NOT_STARTED` | N/A — inventory only | — |
| Vehicle & Device Connectivity | Provider-neutral vehicle and connectivity-device lifecycle, hardware/provider freshness, standby/disconnect/reconnect semantics, physical/device evidence, fault classification, and connectivity-state projection across DIMO hardware and OEM/cloud providers. | `AUDIT_IN_PROGRESS` | Phase 1–3 complete (2026-09-11): repo audit, Production LTE_R1 forensics, reconciliation/decisions/backlog · promotion deferred | [`architecture/vehicle-device-connectivity/`](vehicle-device-connectivity/) |
| Vehicle Health Summary | Aggregated vehicle health summary, dashboard warning lights, and AI health-care projection layer. | `NOT_STARTED` | N/A — inventory only | — |
| Vehicle Onboarding / Vehicle Registry | Governed path from provider discovery to canonical tenant `Vehicle`; identity, provider mappings, org/station baseline, onboarding readiness (VO-1 target). | `AUDIT_IN_PROGRESS` | VO-1 target architecture (2026-09-30) · VO-0B seal · VO-0A evidence | [`architecture/vehicle-onboarding/`](vehicle-onboarding/) |
| Vehicle Signal Intelligence (VSI) | Per-link signal capability profiles: declared vs observed reconciliation, fingerprints, continuous capability maintenance; charter + P0–P7 roadmap. | `AUDIT_IN_PROGRESS` | P0+P1 **merged** #2034 · charter/roadmap 2026-10-15 | [`architecture/vehicle-signal-intelligence/`](vehicle-signal-intelligence/) |
| Vehicles (Fleet Operations) | Core vehicle CRUD, fleet map, connectivity consent, and operational vehicle projections. | `NOT_STARTED` | N/A — inventory only | — |
| Vendors | Third-party vendor and workshop directory including geocoding helpers for fleet operations. | `NOT_STARTED` | N/A — inventory only | — |
| Voice Assistant Platform | Voice agent control plane, webhook ingestion, call orchestration, MCP gateway, billing, and protection. | `NOT_STARTED` | N/A — inventory only | — |
| WhatsApp Business | Meta WhatsApp Business API integration, webhooks, and tenant WhatsApp configuration. | `NOT_STARTED` | N/A — inventory only | — |
| Workflows | Configurable workflow engine with maker-checker, shadow mode, rollout gates, and audit trails. | `NOT_STARTED` | N/A — inventory only | — |

**Inventory boundary:** The overview table above is the canonical complete module inventory as of 2026-09-06, plus **DSRG** registered 2026-10-11 (previously absent from inventory; hub docs existed under `architecture/dsrg/` before registry row). Rows with `NOT_STARTED` are inventoried only — they are not audited, Production-verified, or safe for substantive work without following [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md). Discovery evidence: [`MODULE_INVENTORY_DISCOVERY_2026-09-06.md`](MODULE_INVENTORY_DISCOVERY_2026-09-06.md). Do not infer module understanding from flat `architecture/*.md` mentions alone.

---

## Registry coverage status model

Registry coverage status answers: **Is there a usable architecture authority for this module?** It is separate from each module authority’s own native lifecycle, maturity, epistemic, and validation statuses.

Examples of **authority-native** statuses (not registry coverage): `CANONICAL`, `APPROVED_FOR_CANONICAL_MERGE`, `PRODUCTION_VALIDATED`, Bootstrap V1, Phase 4 resolution planning.

| Registry status | Meaning |
|-----------------|---------|
| **`NOT_STARTED`** | The module name and a short inventory-level description are known, but no complete current-state audit or canonical module authority exists. |
| **`AUDIT_IN_PROGRESS`** | Reconstruction and documentation have started but remain incomplete. Partial documentation must **not** be treated as complete authority. |
| **`AUTHORITY_ACTIVE`** | A structured, usable, living module authority exists and **must** be consulted before substantive work. It may still contain explicit gaps or open questions. |
| **`SUPERSEDED`** | This registry entry is no longer authoritative. Agents must follow the named successor authority. |

### Status transitions (not automatic)

```
NOT_STARTED → AUDIT_IN_PROGRESS → AUTHORITY_ACTIVE → SUPERSEDED
```

Transition arrows are **not** automatic. Each transition requires the gates defined in [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md). All future repository-wide inventory rows begin as `NOT_STARTED` unless a usable authority is verified. Finding flat `architecture/*.md` documents does **not** satisfy the standard.

### Inventory placeholder semantics (future repository-wide inventory)

When modules are added in the separate inventory workstream:

| Field | `NOT_STARTED` placeholder |
|-------|---------------------------|
| Registry coverage status | `NOT_STARTED` |
| Authority-native status | `N/A — inventory only` (exact) |
| Authority path | `—` (exact) |
| Transition on reconstruction | Set `AUDIT_IN_PROGRESS` as soon as authority reconstruction begins |

Do not add undiscovered modules in governance-only PRs.

### SUPERSEDED successor notation

Record an explicit successor using the prefix `Successor:` in one or more of:

- overview **Authority-native status** (for example `Successor: Battery V2`)
- overview **Mini description** (only when necessary)
- detail section **Successor** row (for example `Successor: [Battery V2](#battery-v2)` or `Successor: [architecture/battery-v2/](battery-v2/)`)

The successor must name a registered module or provide a resolvable registry anchor / authority link. Broken or unnamed successors fail central validation.

### Registry synchronization protocol

After **every substantive module workstream**:

1. Re-read the **overview row** for each affected module (always).
2. For `AUTHORITY_ACTIVE`, also re-read the **mandatory detailed authority section**.
3. For `AUDIT_IN_PROGRESS`, review partial detail/authority material when present.
4. `NOT_STARTED` does not require an active detailed section.
5. `SUPERSEDED` follows its documented historical section and successor pointer when present.
6. Modify this registry **only when registry facts changed** (module name, mini description, registry coverage status, authority-native status, authority path, scope, boundaries, mandatory entry documents, validation commands, successor, Last updated).
7. `AUTHORITY_ACTIVE` does **not** change merely because implementation code changed.
8. Report every affected module as `UPDATED` or `UNCHANGED` with before/after coverage status and reason. `UNCHANGED` requires an explicit review — never skip.
9. Cross-module work requires **independent review** of all affected rows.
10. Run `bash architecture/scripts/validate-module-registry.sh` before completion.

### Knowledge classification axes (authority artifacts)

When bootstrapping or updating authorities, use **three separate axes** — never merge into one status field:

| Axis | Examples | Notes |
|------|----------|-------|
| **Registry coverage status** | `NOT_STARTED`, `AUDIT_IN_PROGRESS`, `AUTHORITY_ACTIVE`, `SUPERSEDED` | Governed by this registry |
| **Epistemic state** | `CONFIRMED`, `INFERRED`, `HISTORICAL`, `UNKNOWN`, `CONTRADICTED` | What is known about a claim |
| **Decision / validation status** | `PROPOSED`, `EXPERIMENTAL`, `VALIDATED`, `PRODUCTION_VALIDATED`, `REJECTED`, `SUPERSEDED` | Maturity of a decision or change |

Follow the owning module authority’s exact schema where it defines equivalent vocabulary. Do not require every example status if the domain uses another documented equivalent.

---

## 1. Why this registry exists

SynqDrive has multiple living architecture authorities with explicit epistemic discipline, validation scripts, and cross-module boundaries. Without a central registry, agents risk:

- reading stale flat `architecture/*.md` memos as current truth
- silently reconstructing module knowledge per task
- conflating ownership across related domains (for example REFUEL detection vs fuel-station enrichment)
- treating an inventoried module name as if it were already audited and safe to change
- shipping behavior changes without updating canonical architectural memory

This registry routes every agent to the correct authority **before** code inspection or implementation.

---

## 2. Source-of-truth hierarchy

Apply this order when facts conflict:

| Priority | Layer | Role |
|----------|-------|------|
| 1 | **Code + verified runtime evidence** | What the system actually does today |
| 2 | **Registered module authority** (`AUTHORITY_ACTIVE`) | Canonical architectural memory, navigation, decisions, gaps, validation |
| 3 | **Supporting root-level phase/change records** | Historical evidence (`architecture/P1_*`, `architecture/BATTERY_V2_*`, etc.) unless a registered authority explicitly elevates one |
| 4 | **Plans, hypotheses, open questions** | **Not facts** — do not promote to architecture without evidence |

When code and registered authority disagree: **record the conflict**, investigate, update the authority in the same workstream/PR, and never silently overwrite either side.

---

## 3. Mandatory agent routing algorithm

```
1. READ this registry (SYNQDRIVE_RENTAL_ARCHITECTURE.md)
2. READ MODULE_AUTHORITY_STANDARD.md when status is NOT_STARTED or AUDIT_IN_PROGRESS
3. FIND module in inventory overview table
4. BRANCH on registry coverage status:
     AUTHORITY_ACTIVE:
       a. Read all mandatory entry documents (detailed sections below)
       b. Read cross-referenced owning authorities when boundaries overlap
       c. Check open questions / contradictions before assuming facts
     NOT_STARTED:
       a. Treat as NO authority — do not assume understanding from inventory row
       b. Read and execute MODULE_AUTHORITY_STANDARD.md (Phases 0–5)
       c. Set AUDIT_IN_PROGRESS when reconstruction begins
       d. Update registry row + detailed section in same workstream/PR
     AUDIT_IN_PROGRESS:
       a. Continue under MODULE_AUTHORITY_STANDARD.md
       b. Read partial audit artifacts only — not complete authority
       c. Complete missing repository + Production audit surfaces
       d. Promote to AUTHORITY_ACTIVE only via standard promotion gate
     SUPERSEDED:
       a. Follow successor pointer; do not extend superseded authority
     ABSENT from inventory:
       a. Add row as NOT_STARTED (name, mini description, registry status)
       b. Then execute MODULE_AUTHORITY_STANDARD.md when substantive work is requested
5. IMPLEMENT with authority updates in same workstream/PR when substantive
6. RUN applicable authority validators
7. REPORT which authorities and change records were updated
```

---

## 4. Registered authorities (`AUTHORITY_ACTIVE`)

Detailed sections for modules with usable living authorities. See [Module inventory overview](#module-inventory-overview) for the canonical status summary.

### Tankstellenerkennung (Fuel Station Identification)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | OSM fuel-station reference data, candidate lookup/scoring, `FuelStationLocationResolver` V1, async station enrichment persistence + BullMQ orchestration, cutover/no-backfill policy, API projection (Phase E), Fahrverlauf timeline presentation (Phase F). **Begins after** a REFUEL `VehicleEnergyEvent` exists. |
| **Authority directory** | [`architecture/tankstellenerkennung/`](tankstellenerkennung/) |
| **Authority-native status** | **Bootstrap V1** (2026-09-01) · Incremental / open scientific workstream · Runtime impact: documentation and knowledge graph only |
| **Ownership boundary** | **Does NOT decide whether refueling happened.** REFUEL detection belongs to **KG-EED**. Three confidence domains must never be conflated: event confidence (A), station match confidence (B), presentation trust (C). |
| **Mandatory entry documents** | [README.md](tankstellenerkennung/README.md) · [CURRENT_STATE.md](tankstellenerkennung/CURRENT_STATE.md) · [KNOWLEDGE_GRAPH.md](tankstellenerkennung/KNOWLEDGE_GRAPH.md) · [AGENT_CONTRACT.md](tankstellenerkennung/AGENT_CONTRACT.md) · [decisions/DECISION_REGISTER.md](tankstellenerkennung/decisions/DECISION_REGISTER.md) · [research/CHANGE_LEDGER.md](tankstellenerkennung/research/CHANGE_LEDGER.md) |
| **Validation** | `bash architecture/tankstellenerkennung/scripts/validate-graph.sh` (or `node architecture/tankstellenerkennung/scripts/validate-graph.mjs`) |

---

### Trip Detection & Lifecycle

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` — promoted 2026-09-26 via Phase 5 Gate A (17/17; TDL-DEC-PHASE5-001); explicit non-blocking limitations tracked in authority |
| **Scope** | Live trip FSM (`VehicleTripDetectionState`), snapshot-triggered start evaluation, **R9 adaptive provider-wake start-liveness ingress** (`SnapshotWakeIntakeService`, `SnapshotWakeCoordinatorService`, durable Redis mailboxes, handoff queue), BullMQ `dimo.trip-tracking` execution loop, start/end detection policies and detectors, `TripDecisionEngine` lifecycle mutations, terminal recovery, reconciliation/repair (`TripRepair`), route artifacts (Route V2), trip API read models and rental UI trip surfaces. |
| **Authority directory** | [`architecture/trip-detection-lifecycle/`](trip-detection-lifecycle/) |
| **Authority-native status** | Phase 0–5 complete — full live FSM graph (5 states / 14 transitions; `ENDED` SCHEMA_COMPAT_ONLY); TDL-OQ-001…010 closed; Production **VERIFIED_READ_ONLY** @ `2b54a357…` / `20260926094359_v4994`; Qualified Stop V1 **`PASS_WITH_EVIDENCE_GAPS`** (explicit limitation) · updated 2026-09-26 |
| **Ownership boundary** | **Owns** canonical trip start/end, live FSM, lifecycle state, tracking queue, boundary persistence, recovery/reconciliation, canonical route artifacts, **R9 wake ingress/handoff** (merged #1553), **Qualified Stop Contract V1** shared duration authority (#1753 on Production). **Does NOT own** post-trip behavior/scoring (→ Driving Intelligence), post-finalize enrichment orchestration (→ KG-ATE), REFUEL/RECHARGE semantics (→ KG-EED), multi-replica leader/mutex algorithms (→ Scaling Process), battery health (→ Battery V2), DIMO provider transport/auth/webhook gateway (→ [DIMO Integration](dimo-integration/), `AUDIT_IN_PROGRESS`). Historical FSM audits under `docs/audits/trip-fsm/` are **supporting evidence only**. |
| **Reconstruction status** | Phases **0–5** complete — Phase **1** @ `REPO_CURRENT` `0b44b146f…`; Phase **2** read-only Production @ `2b54a357…`; Phase **3** CX/GAP promotion-classified; Phase **4** full FSM/execution/authority/failure graph + decision register; Phase **5** Gate A PASS ([evidence](trip-detection-lifecycle/evidence/TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md)). |
| **Mandatory entry documents** | [README.md](trip-detection-lifecycle/README.md) · [AUDIT_MANIFEST.md](trip-detection-lifecycle/AUDIT_MANIFEST.md) · [CURRENT_STATE.md](trip-detection-lifecycle/CURRENT_STATE.md) · [AGENT_CONTRACT.md](trip-detection-lifecycle/AGENT_CONTRACT.md) · [KNOWLEDGE_GRAPH.md](trip-detection-lifecycle/KNOWLEDGE_GRAPH.md) · [decisions/DECISION_REGISTER.md](trip-detection-lifecycle/decisions/DECISION_REGISTER.md) · [evidence/EVIDENCE_INDEX.md](trip-detection-lifecycle/evidence/EVIDENCE_INDEX.md) · [evidence/PRODUCTION_BASELINE.md](trip-detection-lifecycle/evidence/PRODUCTION_BASELINE.md) |
| **Validation** | `bash architecture/scripts/validate-module-registry.sh` · `bash architecture/trip-detection-lifecycle/scripts/validate-graph.sh` |

---

### Internationalization (i18n)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` — structured living authority; open product/runtime gaps documented explicitly |
| **Scope** | Platform locale contract (9 official locales), `LanguageProvider` / `translateKey` runtime, translation catalogs (`frontend/src/i18n/translations/`), locale persistence and fallback, Rental/Operator/Master/Login consumer integration (post Integration 2C), translation coverage baselines, hardcoded-copy inventory and phased enforce-clean, i18n governance scripts/CI (P2.3), targeted backend DE/EN copy (billing email, evaluations metrics). |
| **Authority directory** | [`architecture/internationalization/`](internationalization/) |
| **Authority-native status** | **Bootstrap audit V1** (2026-09-10) · platform runtime CONFIRMED · Rental migration SUBSTANTIAL · hardcoded-copy IN_PROGRESS · governance CONFIRMED on main · **promoted Gate A 2026-09-10** |
| **Ownership boundary** | **Owns** frontend i18n runtime, catalogs, locale contract, governance/CI, hardcoded-copy scanner/inventory. **Does NOT own** general backend API localization, legal document authoritative text, Rental business logic (except `t()` usage patterns), DIMO/trip/health modules. Flat `architecture/I18N_*` and `audit-campaign/architecture/I18N_*` are **supporting evidence only**. |
| **Reconstruction status** | Phase **0–3** complete; Phase **4** graph validators active; Phase **5** promotion gate satisfied (authority coverage). Remaining **product debt**: partial locales, 1,658 enforce-clean findings (current scan), Master surface migration, no per-locale Production UX probe. |
| **Mandatory entry documents** | [README.md](internationalization/README.md) · [AUDIT_MANIFEST.md](internationalization/AUDIT_MANIFEST.md) · [CURRENT_STATE.md](internationalization/CURRENT_STATE.md) · [AGENT_CONTRACT.md](internationalization/AGENT_CONTRACT.md) · [KNOWLEDGE_GRAPH.md](internationalization/KNOWLEDGE_GRAPH.md) · [decisions/DECISION_REGISTER.md](internationalization/decisions/DECISION_REGISTER.md) · [evidence/EVIDENCE_INDEX.md](internationalization/evidence/EVIDENCE_INDEX.md) · [evidence/PRODUCTION_BASELINE.md](internationalization/evidence/PRODUCTION_BASELINE.md) |
| **Validation** | `bash architecture/internationalization/scripts/validate-graph.sh` · `bash architecture/scripts/validate-module-registry.sh` · `cd frontend && npm run i18n:check:ci && npm run i18n:pr-gate:test` |

---

### Vehicle Onboarding / Vehicle Registry

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` — VO-0B bootstrap; **not** a complete usable authority; **not** implementation-complete |
| **Module key** | `VEHICLE_ONBOARDING` |
| **Scope** | Provider-discovered or manually introduced vehicle → canonical tenant-operational `Vehicle`; canonical identity and VIN policy; provider mapping (`VehicleDataSourceLink`, `Vehicle.dimoVehicleId`, HM linkage); organization/station baseline at onboarding; technical/administrative baseline orchestration; onboarding readiness and activation contract (target). **Does not** own telemetry freshness, trip FSM, driving/battery/health conclusions, booking lifecycle, billing policy, or provider transport. |
| **Authority directory** | [`architecture/vehicle-onboarding/`](vehicle-onboarding/) |
| **Authority-native status** | **VO-1 target contract** (`VO-DEC-1-001` VALIDATED) (2026-09-30) · current-state seal VO-0A/0B · Production Phase 2 audit **pending** |
| **Ownership boundary** | **Owns/coordinates** canonical `Vehicle` establishment, registration identity, provider mapping into `Vehicle`, org/station onboarding baseline, baseline orchestration into tire/brake/battery/service modules. **Does NOT own** normalized telemetry (→ VDC), DIMO/HM provider runtime (→ DIMO Integration / HM), trip boundaries (→ Trip Detection), driving/battery/health conclusions, billing semantics, rental readiness calculations owned elsewhere. External Book II IDs B2-04-013, B2-04-014, B2-05-020, B2-05-021, B2-06-023–026 recorded as **external** references — normative text **not** in repository. |
| **Reconstruction status** | Phase **0–1** complete (VO-0A/0B); **VO-1 architecture** complete; Phase **2** Production read-only **not** started; Phase **5** promotion **not** eligible. |
| **Mandatory entry documents (partial)** | [README.md](vehicle-onboarding/README.md) · [TARGET_ARCHITECTURE.md](vehicle-onboarding/TARGET_ARCHITECTURE.md) · [CURRENT_STATE.md](vehicle-onboarding/CURRENT_STATE.md) · [governance/AUTHORITY_BOUNDARIES.md](vehicle-onboarding/governance/AUTHORITY_BOUNDARIES.md) · [decisions/DECISION_REGISTER.md](vehicle-onboarding/decisions/DECISION_REGISTER.md) · [contradictions/KNOWLEDGE_GAPS.md](vehicle-onboarding/contradictions/KNOWLEDGE_GAPS.md) · [research/VO1_QUESTION_RESOLUTIONS.md](vehicle-onboarding/research/VO1_QUESTION_RESOLUTIONS.md) |
| **Validation** | `bash architecture/scripts/validate-module-registry.sh` · `bash architecture/vehicle-onboarding/scripts/validate-graph.sh` |

---

### Deployment Security & Release Governance (DSRG)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` — promoted via DSRG-03 R6 (Gate A complete @ R3 Production audit); **effective on authorized merge** of promotion PR |
| **Module key** | `DSRG` |
| **Scope** | Production VPS deploy governance: pinned executor install and integrity, deploy preflight and admission, human authorization and attestation, security-floor and bypass enforcement libraries, OS privilege boundary (sudoers/wrapper), rollback and emergency containment contracts, cloud-agent connectivity staging, coexistence with APDS shadow epochs, EXP021 Gate-6, and RFRF rollback. **Does not** own vehicle onboarding product logic, APDS epoch activation, EXP021 experiment semantics, or RFRF stage definitions. |
| **Authority directory** | [`architecture/dsrg/`](dsrg/) |
| **Authority-native status** | Cross-cutting deployment governance authority · DSRG-01/#1970 · DSRG-02 pin sealed · DSRG-03 graph + validators · **runtime enforcement / OS boundary activation not claimed** |
| **Ownership boundary** | **Owns** cross-cutting deploy governance architecture and ops execution contracts. **Does not own** VO5C admission/MFA product flags (→ Vehicle Onboarding evidence), APDS approved release pin (→ APDS), EXP021 scheduler/Gate-6 (→ Driving Intelligence / EXP021 ops), RFRF rollback traps (→ RFRF). Runtime implementation remains `backend/scripts/ops/*` on VPS; VO5C historical evidence stays under `architecture/vehicle-onboarding/evidence/`. |
| **Reconstruction status** | Phase **0–5** architecture reconstruction **COMPLETE** (DSRG-03 R3 Gate A); **P4B16 R0** attestation design in progress; **runtime activation** (enforcement, sudoers, attestation automation) remains **separate** — see [GATE_A_READINESS.md](dsrg/evidence/GATE_A_READINESS.md) enforcement track |
| **Mandatory entry documents** | [README.md](dsrg/README.md) · [PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md](dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md) · [AUDIT_MANIFEST.md](dsrg/AUDIT_MANIFEST.md) · [CURRENT_STATE.md](dsrg/CURRENT_STATE.md) · [AGENT_CONTRACT.md](dsrg/AGENT_CONTRACT.md) · [KNOWLEDGE_GRAPH.md](dsrg/KNOWLEDGE_GRAPH.md) · [decisions/DECISION_REGISTER.md](dsrg/decisions/DECISION_REGISTER.md) · [evidence/EVIDENCE_INDEX.md](dsrg/evidence/EVIDENCE_INDEX.md) · [evidence/PRODUCTION_BASELINE.md](dsrg/evidence/PRODUCTION_BASELINE.md) · [contradictions/KNOWLEDGE_GAPS.md](dsrg/contradictions/KNOWLEDGE_GAPS.md) · [contradictions/OPEN_CONTRADICTIONS.md](dsrg/contradictions/OPEN_CONTRADICTIONS.md) |
| **Validation** | `bash architecture/scripts/validate-module-registry.sh` · `bash architecture/dsrg/scripts/validate-graph.sh` |

---

### DIMO Integration

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` — bootstrap reconstruction **in progress**; **not** a complete usable authority |
| **Scope** | DIMO auth/token/JWT paths, telemetry provider clients, snapshot fetching, segments, triggers, webhooks (`DimoWebhookController`), device-connection episodes, provider gateway/budget/rate limiting, vehicle/data-source binding, scheduler/worker wiring. |
| **Authority directory** | [`architecture/dimo-integration/`](dimo-integration/) |
| **Authority-native status** | **Bootstrap audit · R9 webhook cross-module trigger** (2026-09-07) · repository + read-only Production baseline started; **not** promoted |
| **Ownership boundary** | **Owns** provider-facing DIMO webhook endpoint, webhook authentication/verification/envelope handling, provider signal ingestion contract, DIMO trigger/provider gateway semantics, provider transport/authentication, DIMO telemetry acquisition boundary. **Does NOT own** Trip FSM / wake eligibility / mailboxes / handoff cadence (→ [Trip Detection & Lifecycle](trip-detection-lifecycle/)). R9 contract: webhook → `SnapshotWakeIntakeService` → `wakeOutcome` response. |
| **Reconstruction status** | Phase **0** complete; Phase **1** initial consolidated repository audit; Phase **2** read-only Production baseline (2026-09-07); Phase **3–5** pending. |
| **Mandatory entry documents (partial)** | [README.md](dimo-integration/README.md) · [AUDIT_MANIFEST.md](dimo-integration/AUDIT_MANIFEST.md) · [CURRENT_STATE.md](dimo-integration/CURRENT_STATE.md) · [AGENT_CONTRACT.md](dimo-integration/AGENT_CONTRACT.md) · [KNOWLEDGE_GRAPH.md](dimo-integration/KNOWLEDGE_GRAPH.md) · [decisions/DECISION_REGISTER.md](dimo-integration/decisions/DECISION_REGISTER.md) · [evidence/EVIDENCE_INDEX.md](dimo-integration/evidence/EVIDENCE_INDEX.md) · [evidence/PRODUCTION_BASELINE.md](dimo-integration/evidence/PRODUCTION_BASELINE.md) |
| **Validation** | `bash architecture/dimo-integration/scripts/validate-graph.sh` |

---

### Battery V2

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | Battery V2 architectural memory: ICE/HEV/PHEV/BEV profiles, HV/LV signal authority, health model (capacity, SOH, publication readiness), lifecycle (charge sessions, REST bridge, trip-to-battery), execution (jobs, locking, idempotency, DLQ), persistence, API/frontend consumers, Phase 4 resolution planning. |
| **Authority directory** | [`architecture/battery-v2/`](battery-v2/) |
| **Authority-native status** | **Phase 4 resolution planning** (2026-09-01) · Incremental / open scientific workstream — implementation packages defined, gaps remain open · Runtime impact: documentation and knowledge graph only |
| **Ownership boundary** | Owns Battery V2 behavior, policy, lifecycle, signals, health model, queues, persistence, scheduling, reconciliation, publication, and safety boundaries. **ERD (KG-EED)** owns physical HV charge **session semantics**; Battery V2 **consumes** session evidence — implementation code remains under `battery-health/hv-charge-session/*` (transitional host). |
| **Mandatory entry documents** | [README.md](battery-v2/README.md) · [BATTERY_INTELLIGENCE_ARCHITECTURE.md](battery-v2/BATTERY_INTELLIGENCE_ARCHITECTURE.md) · [CURRENT_STATE.md](battery-v2/CURRENT_STATE.md) · [KNOWLEDGE_GRAPH.md](battery-v2/KNOWLEDGE_GRAPH.md) · [AGENT_CONTRACT.md](battery-v2/AGENT_CONTRACT.md) · [resolution/README.md](battery-v2/resolution/README.md) · [research/CHANGE_LEDGER.md](battery-v2/research/CHANGE_LEDGER.md) |
| **Validation** | `bash architecture/battery-v2/scripts/validate-graph.sh` (or `node architecture/battery-v2/scripts/validate-graph.mjs`) |

---

### Driving Intelligence

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | DIMO telemetry acquisition (live + post-trip HF), trip-window association, HF reconstruction and behavior event detection, native DIMO driving events, driving impact/stress scoring (V1 production), tire and brake operational load proxies, V2 durable post-trip pipeline (stage orchestrator, assessability, evidence), reference capture/HF recovery testbed, rental and driver-subject aggregation, health module inputs, API and fleet/rental UI projection. **Consumes** completed trips and enriches them. |
| **Authority directory** | [`architecture/drivingintelligence/`](drivingintelligence/) |
| **Authority-native status** | **Retrospective expansion V2** (2026-09-06) · **SUBSTANTIAL reconstruction** — full workstream 2026-08-30 → present · Runtime impact: documentation and knowledge graph only |
| **Ownership boundary** | **Does NOT own canonical trip boundaries** — Trip Detection / DIMO Segments own trip start/end and live trip FSM. **Does NOT own** REFUEL/RECHARGE energy events (→ KG-EED). **Does NOT own** fuel-station identification (→ Tankstellenerkennung). Three confidence domains must never be conflated: assessability dimension status (A), event provenance native vs HF-reconstructed (B), driving stress score as operational load not driver quality (C). |
| **Mandatory entry documents** | [README.md](drivingintelligence/README.md) · [CURRENT_STATE.md](drivingintelligence/CURRENT_STATE.md) · [design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md](drivingintelligence/design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md) · [design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md](drivingintelligence/design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md) · [KNOWLEDGE_GRAPH.md](drivingintelligence/KNOWLEDGE_GRAPH.md) · [AGENT_CONTRACT.md](drivingintelligence/AGENT_CONTRACT.md) · [COVERAGE_MATRIX.md](drivingintelligence/COVERAGE_MATRIX.md) · [decisions/DECISION_REGISTER.md](drivingintelligence/decisions/DECISION_REGISTER.md) · [evidence/EVIDENCE_INDEX.md](drivingintelligence/evidence/EVIDENCE_INDEX.md) · [evidence/CONSUMER_AUDIT_V1_FINDINGS_REGISTER.md](drivingintelligence/evidence/CONSUMER_AUDIT_V1_FINDINGS_REGISTER.md) · [contradictions/CONTRADICTION_REGISTER.md](drivingintelligence/contradictions/CONTRADICTION_REGISTER.md) · [research/OPEN_QUESTIONS.md](drivingintelligence/research/OPEN_QUESTIONS.md) |
| **Validation** | `bash architecture/drivingintelligence/scripts/validate-graph.sh` · `bash architecture/drivingintelligence/scripts/validate-docs.sh` |

---

### Scaling Process

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | Horizontal scaling, multi-replica coordination, production scale gates, deployment lifecycle: scheduler leader election, DIMO global provider budget, reconciliation execution mutex, BullMQ/worker model, PM2/nginx topology, failure/recovery, scaling envelopes, validation evidence. |
| **Authority directory** | [`architecture/scaling-process/`](scaling-process/) |
| **Authority-native status** | **Bootstrap established** 2026-09-01 · Living architecture authority (not a final report) |
| **Ownership boundary** | Owns scheduler leader election, DIMO provider budget algorithm, reconciliation mutex, multi-replica deploy/rollback lifecycle. Shared infrastructure referenced by KG-ATE (leader, mutex, budget) — ATE documents usage, not algorithm internals. |
| **Mandatory entry documents** | [README.md](scaling-process/README.md) · [CURRENT_STATE.md](scaling-process/CURRENT_STATE.md) · [SCALING_PROCESS_KNOWLEDGE_GRAPH.md](scaling-process/SCALING_PROCESS_KNOWLEDGE_GRAPH.md) · [AGENT_MAINTENANCE_POLICY.md](scaling-process/AGENT_MAINTENANCE_POLICY.md) · [SYSTEM_TOPOLOGY.md](scaling-process/SYSTEM_TOPOLOGY.md) · [DECISION_LOG.md](scaling-process/DECISION_LOG.md) · [VALIDATION_EVIDENCE.md](scaling-process/VALIDATION_EVIDENCE.md) · [OPEN_QUESTIONS_AND_FUTURE_WORK.md](scaling-process/OPEN_QUESTIONS_AND_FUTURE_WORK.md) |
| **Validation** | Per [AGENT_MAINTENANCE_POLICY.md](scaling-process/AGENT_MAINTENANCE_POLICY.md): `node architecture/scaling-process/scripts/validate-open-questions.mjs` when editing OQ IDs; `node architecture/scaling-process/scripts/validate-current-state-keys.mjs` when editing CURRENT_STATE machine header |

---

### Automatic Trip Enrichment (ATE) — KG-ATE

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` |
| **Scope** | Post-finalize trip behavior enrichment orchestration: enqueue/sync lifecycle, hardware-path routing (SMART5 HF vs LTE_R1 native), route/safety enrichment stage, misuse trigger, driving-impact job enqueue, reconciliation repair → enrichment chain, `behaviorEnrichmentStatus` FSM, UI/manual fallback paths. |
| **Authority directory** | [`architecture/knowledge-graphs/automatic-trip-enrichment/`](knowledge-graphs/automatic-trip-enrichment/) |
| **Authority-native status** | **`CANONICAL`** (per [GRAPH.yaml](knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml) and [README.md](knowledge-graphs/automatic-trip-enrichment/README.md)) · Canonicalized 2026-09-01 @ `4843a4ebc` |
| **Ownership boundary** | **MAY_TRIGGER** `detectEnergyEvents` from reconciliation step 5. **Does NOT own** REFUEL/RECHARGE semantics (→ KG-EED), DI V2 scoring (→ KG-Driving-Intelligence), DIMO budget internals (→ Scaling Process), Battery HV sessions (→ Battery V2). See [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/automatic-trip-enrichment/governance/AUTHORITY_BOUNDARIES.md). |
| **Mandatory entry documents** | [README.md](knowledge-graphs/automatic-trip-enrichment/README.md) · [GRAPH.yaml](knowledge-graphs/automatic-trip-enrichment/GRAPH.yaml) · [governance/AGENT_PROTOCOL.md](knowledge-graphs/automatic-trip-enrichment/governance/AGENT_PROTOCOL.md) · [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/automatic-trip-enrichment/governance/AUTHORITY_BOUNDARIES.md) · [graph/nodes.yaml](knowledge-graphs/automatic-trip-enrichment/graph/nodes.yaml) · [graph/edges.yaml](knowledge-graphs/automatic-trip-enrichment/graph/edges.yaml) · [graph/invariants.yaml](knowledge-graphs/automatic-trip-enrichment/graph/invariants.yaml) · [open-questions/OPEN_QUESTIONS.md](knowledge-graphs/automatic-trip-enrichment/open-questions/OPEN_QUESTIONS.md) |
| **Validation** | `node architecture/knowledge-graphs/automatic-trip-enrichment/scripts/validate-graph.mjs` |

---

### Energy Event Detection (EED) — KG-EED

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUTHORITY_ACTIVE` — a structured, usable authority exists and **must** be consulted before substantive EED work |
| **Scope** | REFUEL detection; **ERD** (EV Recharge Detection) canonical physical charge sessions and native>fallback contracts; RECHARGE product projection semantics; parsing, coalescing, persistence; `durationSeconds` vs `fuelLevelRiseDurationSeconds`; sibling reconciliation; `VehicleEnergyEvent` and API DTO semantics; trip timeline energy card UI semantics. |
| **Authority directory** | [`architecture/knowledge-graphs/energy-event-detection/`](knowledge-graphs/energy-event-detection/) |
| **Authority-native status** | **`APPROVED_FOR_CANONICAL_MERGE`** per [GRAPH.yaml](knowledge-graphs/energy-event-detection/GRAPH.yaml) (`status` and `authority_state`; `main_sha_at_canonicalization: null`) and [README.md](knowledge-graphs/energy-event-detection/README.md) |
| **Lifecycle inconsistency (explicit)** | PR #1486 is **already merged** on `main` (merge commit `182731fe48cd25578668f102ed847f4791fbaabd`). EED’s own lifecycle metadata has **not** been promoted to `CANONICAL`. This post-merge promotion gap is an explicit documentation/lifecycle inconsistency requiring a **separate EED-authority follow-up**. Until that follow-up occurs, agents must **not** infer or silently assign `CANONICAL`. |
| **Last updated** | 2026-09-24 — ERD E1 canonical physical charge authority (Model A); KG + registry scope/boundary refresh |
| **Ownership boundary** | **OWNS** REFUEL detection; **ERD owns** physical EV/PHEV charging episode semantics (`HvChargeSession` semantic model; implementation code under Battery V2 tree). **OWNS** RECHARGE product projection contract (`VehicleEnergyEvent.RECHARGE` after E5 cutover). Coalescing, persist gates, fuel-rise derivation, sibling reconciliation, energy API/UI contracts. **KG-ATE** may trigger `detectEnergyEvents` only — EED owns meaning. **Battery V2** consumes canonical HV charge session evidence for battery analysis — does not own physical charging authority. Fuel station enrichment trust detail is downstream (Tankstellenerkennung consumes persisted REFUEL events). See [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/energy-event-detection/governance/AUTHORITY_BOUNDARIES.md). |
| **Mandatory entry documents** | [README.md](knowledge-graphs/energy-event-detection/README.md) · [GRAPH.yaml](knowledge-graphs/energy-event-detection/GRAPH.yaml) · [governance/AGENT_PROTOCOL.md](knowledge-graphs/energy-event-detection/governance/AGENT_PROTOCOL.md) · [governance/AUTHORITY_BOUNDARIES.md](knowledge-graphs/energy-event-detection/governance/AUTHORITY_BOUNDARIES.md) · [decisions/ERD-E1-CANONICAL-PHYSICAL-CHARGE-AUTHORITY-2026-09-24.md](knowledge-graphs/energy-event-detection/decisions/ERD-E1-CANONICAL-PHYSICAL-CHARGE-AUTHORITY-2026-09-24.md) · [graph/nodes.yaml](knowledge-graphs/energy-event-detection/graph/nodes.yaml) · [graph/edges.yaml](knowledge-graphs/energy-event-detection/graph/edges.yaml) · [graph/invariants.yaml](knowledge-graphs/energy-event-detection/graph/invariants.yaml) · [open-questions/OPEN_QUESTIONS.md](knowledge-graphs/energy-event-detection/open-questions/OPEN_QUESTIONS.md) |
| **Validation** | `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs` |

---

### Tires Health

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` — bootstrap authority created 2026-10-24 (Tire Intelligence P1); **not** a complete usable authority; **not** promoted |
| **Scope** | Tire setups and lifecycle, tread/pressure measurements (ground truth), Tire Wear Model V2 (`tire-wear-v2`, frozen), snapshots and fingerprint dedupe, trip-usage ledger and canonical-finalization attribution, health alerts, tire REST surface, tire UI surfaces, rental-health tire policy **input**, and the future DS4 Motion Engine driving-load integration (**shadow only**, no implementation yet). |
| **Authority directory** | [`architecture/tires/`](tires/) |
| **Authority-native status** | **Bootstrap V0.1** · owner decisions recorded as `PROPOSED` (preserve stack; V2 frozen/to be superseded; DS4 shadow-only; conservative admission; no double counting) · Production `VERIFIED_READ_ONLY` @ `c169ddfab` (2026-10-24) |
| **Ownership boundary** | **Owns** tire lifecycle, measurements, V2 model/snapshots/alerts, ledger, tire API/UI, future tire shadow adapter/store. **Does NOT own** Driving-Impact aggregates or DS4 Motion Engine / Event Detector / shadow worker (→ [Driving Intelligence](drivingintelligence/)), rental gate semantics (→ Rental Health, consumes `TireHealthSummary`), trip boundaries (→ [Trip Detection & Lifecycle](trip-detection-lifecycle/)). |
| **Reconstruction status** | Repository audit + read-only Production baseline complete for P1 scope; V2 ↔ DS4 comparison and target architecture documented; promotion gate open (setup-count reconciliation, DI graph DS4 node, post-adapter Production baseline). |
| **Mandatory entry documents (partial)** | [README.md](tires/README.md) · [AUDIT_MANIFEST.md](tires/AUDIT_MANIFEST.md) · [CURRENT_STATE.md](tires/CURRENT_STATE.md) · [integration/DS4_MOTION_INTEGRATION_AUDIT.md](tires/integration/DS4_MOTION_INTEGRATION_AUDIT.md) · [AGENT_CONTRACT.md](tires/AGENT_CONTRACT.md) · [KNOWLEDGE_GRAPH.md](tires/KNOWLEDGE_GRAPH.md) · [decisions/DECISION_REGISTER.md](tires/decisions/DECISION_REGISTER.md) · [evidence/EVIDENCE_INDEX.md](tires/evidence/EVIDENCE_INDEX.md) · [evidence/PRODUCTION_BASELINE.md](tires/evidence/PRODUCTION_BASELINE.md) · [contradictions/KNOWLEDGE_GAPS.md](tires/contradictions/KNOWLEDGE_GAPS.md) · [contradictions/OPEN_CONTRADICTIONS.md](tires/contradictions/OPEN_CONTRADICTIONS.md) |
| **Validation** | `bash architecture/tires/scripts/validate-graph.sh` |

---

### Brakes Health

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` — bootstrap 2026-10-28 (DS4 authority migration PR-0); **not** promoted |
| **Scope** | Brake component lifecycle, wear evidence, recalculation jobs, brake health APIs; consumption of Driving Impact braking rates (today COMPLETE\|PARTIAL TDI filter). |
| **Authority directory** | [`architecture/brakes-health/`](brakes-health/) |
| **Authority-native status** | Bootstrap V0.1 · DS4 migration consumer track (PR-8) · Production `NOT_AUDITED` in PR-0 |
| **Ownership boundary** | **Owns** brake health persistence and APIs. **Does NOT own** Driving Impact or DS4 motion assessment (→ Driving Intelligence). |
| **Mandatory entry documents (partial)** | [README.md](brakes-health/README.md) · [AUDIT_MANIFEST.md](brakes-health/AUDIT_MANIFEST.md) · [CURRENT_STATE.md](brakes-health/CURRENT_STATE.md) · [AGENT_CONTRACT.md](brakes-health/AGENT_CONTRACT.md) |
| **Validation** | Registry validator only until graph script exists |

---

### Rental Driving Analysis

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` — bootstrap 2026-10-28 (DS4 authority migration PR-0) |
| **Scope** | Booking/driver rental-period driving analysis aggregation, `rental_driving_analyses` persistence, rental UI stress cards, bookings detail usage fields, BI detectors. |
| **Authority directory** | [`architecture/rental-driving-analysis/`](rental-driving-analysis/) |
| **Authority-native status** | Bootstrap V0.1 · Consumer Audit V1 findings register linked |
| **Ownership boundary** | **Owns** rental analysis rows and rental-specific assessment publication. **Consumes** trip driving impact (→ Driving Intelligence). **Does NOT own** trip boundaries or DS4 motion runs. |
| **Mandatory entry documents (partial)** | [README.md](rental-driving-analysis/README.md) · [AUDIT_MANIFEST.md](rental-driving-analysis/AUDIT_MANIFEST.md) · [CURRENT_STATE.md](rental-driving-analysis/CURRENT_STATE.md) · [AGENT_CONTRACT.md](rental-driving-analysis/AGENT_CONTRACT.md) |
| **Validation** | Registry validator only until graph script exists |

---

### Rental Health

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` — bootstrap 2026-10-28 (DS4 authority migration PR-0) |
| **Scope** | Fleet-level rental health aggregation consuming tire/brake/vehicle health summaries without recalculating source modules. |
| **Authority directory** | [`architecture/rental-health/`](rental-health/) |
| **Authority-native status** | Bootstrap V0.1 |
| **Ownership boundary** | **Owns** rental gate aggregation semantics. **Does NOT own** DS4 shadow tables or Driving Impact scoring. |
| **Mandatory entry documents (partial)** | [README.md](rental-health/README.md) · [AUDIT_MANIFEST.md](rental-health/AUDIT_MANIFEST.md) · [CURRENT_STATE.md](rental-health/CURRENT_STATE.md) · [AGENT_CONTRACT.md](rental-health/AGENT_CONTRACT.md) |
| **Validation** | Registry validator only until graph script exists |

---

## 5. `NOT_STARTED`, `AUDIT_IN_PROGRESS`, and absent-module bootstrap

When registry coverage status is `NOT_STARTED`, or a module is absent and added as `NOT_STARTED`, the module is **inventoried only** — equivalent to having no authority.

**Execute [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md)** — it defines:

- mandatory repository and read-only Production-VPS audit phases
- exact mandatory authority directory structure and file content
- Production read-only safety rules
- evidence and three-axis status requirements
- the promotion gate to `AUTHORITY_ACTIVE`

Summary: set `AUDIT_IN_PROGRESS` when reconstruction begins; inspect repository truth and applicable Production truth separately; never promote a deployed runtime-bearing module while `PRODUCTION_ACCESS_UNAVAILABLE`; update the registry row and detailed authority section in the same workstream/PR when promotion criteria are met.

**Existing flat `architecture/*.md` documents** remain supporting evidence. They do **not** automatically become canonical authorities and do **not** satisfy the standard.

---

## 6. Definition of done — architecture-affecting work

A workstream is **not complete** until:

- [ ] Affected registered authorities updated in the **same PR** when substantive behavior/architecture changed
- [ ] BEFORE / WHY / CHANGE / alternatives / expected effect / validation / observed effect / non-effects / tradeoffs / gaps recorded where applicable
- [ ] Open questions and contradictions updated — not silently deleted
- [ ] Cross-module boundaries consulted; every owning authority updated for cross-cutting changes
- [ ] Applicable module authority validators run (or limitation documented if validators require unavailable runtime deps)
- [ ] **Registry synchronization** completed for every affected module (overview row always; detailed section for `AUTHORITY_ACTIVE`; partial material for `AUDIT_IN_PROGRESS`; no active detail for `NOT_STARTED`)
- [ ] Registry metadata reviewed: module name, mini description, registry coverage status, authority-native status, authority path, scope, boundaries, mandatory entry documents, validation commands, successor, Last updated
- [ ] Each affected module reported as `REGISTRY_REVIEWED: UPDATED` or `REGISTRY_REVIEWED: UNCHANGED` with before/after coverage status and reason
- [ ] Central registry validator passes: `bash architecture/scripts/validate-module-registry.sh`
- [ ] Final agent report includes `ARCHITECTURE_GOVERNANCE` completion block (see [`.cursor/rules/Architectur-Updates.mdc`](../.cursor/rules/Architectur-Updates.mdc))
- [ ] This registry updated **only if** any reviewed metadata fact changed

---

## 7. Registry maintenance triggers

Update this file when:

| Trigger | Action |
|---------|--------|
| Module **added** to inventory | Add overview row with name, mini description, registry status |
| Authority **created**, **renamed**, **moved**, **split**, **merged**, or **superseded** | Update overview row and detailed section; link successor for `SUPERSEDED` |
| **Registry coverage status** changes | Update overview table and routing behavior |
| **Authority-native status** or maturity changes | Update authority-native column; preserve historical note in module authority |
| **Entry documents** or graph entry points change | Update mandatory entry document links |
| **Validation commands** change | Update validation column |
| **Ownership boundaries** change | Update boundary text; ensure both sides of cross-graph contracts updated |

---

## Vehicle Signal Intelligence (VSI) — authority entry (AUDIT_IN_PROGRESS)

| Field | Value |
|-------|-------|
| **Registry coverage** | `AUDIT_IN_PROGRESS` |
| **Scope** | Signal capability discovery, per-link profiles, declared vs observed reconciliation, fingerprints, future APDS read consumer |
| **Boundaries** | Does not own trip boundaries, APDS shadow activation, or domain health algorithms — see cross-workstream contracts |
| **Mandatory entry documents** | [`VSI_PRODUCT_CHARTER.md`](vehicle-signal-intelligence/VSI_PRODUCT_CHARTER.md), [`VSI_MASTER_ROADMAP.md`](vehicle-signal-intelligence/VSI_MASTER_ROADMAP.md), [`VSI_CROSS_WORKSTREAM_CONTRACTS.md`](vehicle-signal-intelligence/VSI_CROSS_WORKSTREAM_CONTRACTS.md), [`CURRENT_STATE.md`](vehicle-signal-intelligence/CURRENT_STATE.md) |
| **Validation** | `bash architecture/scripts/validate-module-registry.sh`; backend `npm test -- --testPathPattern=vehicle-signal-intelligence/vsi-profile` |
| **P0+P1 merge** | PR #2034 @ `eb5f1f2ee` on `main` — **MERGED ≠ DEPLOYED** |

---

## Cross-authority quick reference

```
REFUEL detected?     → KG-EED
Station identified?  → Tankstellenerkennung (after REFUEL event exists)
Trip enrichment?     → KG-ATE
Driving behavior & impact? → Driving Intelligence (consumes trip boundaries; does not own Trip Detection/DIMO Segments, EED, or Tankstellenerkennung)
Battery health?      → Battery V2
Signal capability per link? → Vehicle Signal Intelligence (declared vs observed profiles; not polling policy)
Multi-replica/scale? → Scaling Process
```

Do not conflate confidence domains across Tankstellenerkennung and KG-EED. Do not document energy-event field semantics in KG-ATE.
