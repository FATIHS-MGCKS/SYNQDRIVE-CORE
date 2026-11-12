# SYNQDRIVE Core – Masterplan zur Entkopplung und Multi-App-Plattform

> **Verbindliches Übergabe- und Fortschrittsdokument für Owner, Cursor-Agenten und neue ChatGPT-Chats.**  
> Zielpfad im GitHub-Repository: `architecture/core-extraction/SYNQDRIVE_CORE_EXTRACTION_MASTER_PLAN.md`  
> Dokumentversion: **V1.0** · Erstellt: **2026-11-12** · Sprache: DE  
> Referenz-Repository: `FATIHS-MGCKS/SYNQDRIVE-CORE`  
> Audit-Baseline: `1e6a267c8c7951e2a11633e89ab96714844ea846`  
> Status: **P0 AUDIT COMPLETE · P1 DESIGN READY · IMPLEMENTIERUNG NOCH NICHT BEGONNEN**

## 0. So wird dieses Dokument verwendet

Dieses Dokument ist der **zentrale Migrationsplan und das fortlaufende Übergabeprotokoll** für die Aufteilung von SYNQDRIVE. Jeder neue Agent muss es **vor Beginn eines Umbau-Workstreams vollständig lesen** und den aktuellen Repository-Stand gegen die dokumentierte Baseline abgleichen.

**Wichtig: Die Aussagen sind in drei Evidenzklassen zu unterscheiden:**

- **OWNER_DECISION**: Vom Eigentümer verbindlich vorgegebene Zielarchitektur und Produktausrichtung.
- **VERIFIED_REPO / AUDIT_REPORTED**: Im Repository direkt belegter Sachverhalt beziehungsweise aus dem abgeschlossenen Cursor-Audit übernommene Feststellung. `AUDIT_REPORTED` ist keine Produktionsverifikation.
- **DESIGNED / PLANNED / UNKNOWN**: Architekturentwurf, noch nicht umgesetzter Schritt oder ausdrücklich ungelöster Punkt.

**Dieses Dokument ersetzt nicht** `AGENTS.md`, `architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`, `architecture/MODULE_AUTHORITY_STANDARD.md` oder bestehende Modul-Authorities. Bei Widerspruch müssen Quellcode, aktuell verifizierte Runtime-Evidenz und zuständige Modul-Authority gesondert geprüft werden. Ein geplanter Vertrag ist kein bereits existierender API-Endpunkt.

**Fortschrittsregel:** Nach jeder genehmigten Arbeitsphase diese Datei im selben Dokumentations-PR oder im zugehörigen Implementierungs-PR aktualisieren: Datum, Operation, Branch/PR, SHA, Ergebnisse, Tests, Migrationen, offene Blocker, Produktionsstatus und Nächstes Gate. Alte Erkenntnisse in der Fortschrittshistorie nicht stillschweigend überschreiben.

## 1. Strategisches Ziel (OWNER_DECISION)

SYNQDRIVE wird von einem **NestJS-Modular-Monolithen mit gemeinsamer Vite/React-SPA** zu **einem zentralen SYNQDRIVE-CORE** und mehreren **eigenständigen, ausschließlich selbst betriebenen Apps** entwickelt.

**SYNQDRIVE-CORE ist nicht nur eine Algorithmus-Bibliothek.** Core ist das zentrale Hauptsystem mit:

1. **Vollständigem Master-Admin-Bereich** (Frontend, API, Plattform-Operations und Administration).
2. **Platform System-of-Record** für Organisationen, Nutzeridentitäten, IAM, Produktkatalog, Freischaltungen, SaaS-Abrechnung, Master-Support und Security Governance.
3. **Zentraler Fahrzeugdaten- und Intelligence-Verarbeitung** von Providerzugriff und Signalerfassung bis Trip FSM, DS4, DBI, Gesundheit und Service.
4. **Gemeinsamen Backend-Diensten** einschließlich kontrollierter Jobs, Queues, Scheduler, Audit, Observability, Outbox, sicheren internen APIs und späteren SDKs.

**Eigenständige Produkt-Apps:** SYNQDRIVE Rental, VYMOD, digitales Fahrtenbuch, Schülertransport/Fahrerbewertung und weitere künftige Produkte. Apps konsumieren Core-Daten und -Dienste; ihre **produktindividuelle Fachlogik** und ihre Daten gehören ihnen selbst.

**Kein separates Master-Admin-Repository.** Master Admin bleibt vollständig im `SYNQDRIVE-CORE`-Repository. Plattformdienste sind **innerhalb Core logisch abgegrenzt**; ein zusätzliches `synqdrive-platform`-Repository wird zunächst nicht geschaffen.

**Kein öffentliches Drittanbieter-B2B-API-Produkt geplant.** Hintergrund: Die Telemetrie ist von DIMO/Providern abhängig. Dennoch werden für eigene Apps sauber versionierte, abgesicherte interne APIs benötigt. Anbieterrechte, Consent, Budgets und Datenfreigaben bleiben verbindlich.

### 1.1 Nicht verhandelbare Daten- und Eigentumsgrenzen

| Domäne | Fachlicher Schreib-Owner | Konsum / Darstellung |
|---|---|---|
| Organisation, Plattformkonten, Rollen, Produktzuweisung | Core Platform | Alle berechtigten Apps |
| Produktlizenz und SaaS-Abrechnung | Core Platform | Master Admin, Produkt-Backends |
| Kanonische Fahrzeug-ID, VIN, Provider-Links, Consent-Verankerung | Core Vehicle Registry | Berechtigte Apps |
| DIMO/HM/OneAuto, Telemetrie, Signal-Capabilities, Polling | Core | Keine duplizierte Provider-Ingestion in Apps |
| Kanonische Trip-Grenzen, Route, technische Fahrtdaten | Core Trip Intelligence | Rental, Logbook, VYMOD usw. |
| DS4/DBI, Vehicle Health und technische Evidenz | Core | Apps konsumieren versionierte Ergebnisse |
| Mietbuchungen, Kautionen, Mietverträge, Rental Health Policy | Rental | Master Admin darf autorisierte Verwaltungsansichten haben |
| Mietrechnung und Endkunden-Zahlung einer Buchung | Rental | Core darf SaaS-Rechnungen davon nicht vermischen |
| Zuordnung Rental-Buchung ↔ Core-Trip | Rental | Core bleibt unabhängig von Rental |
| Fahrtenbuch-Klassifizierung, rechtssichere Benutzerkorrekturen | Logbook | Core liefert kanonische Trips |
| Consumer-App-UX und produktbezogene Abläufe | Jeweilige App | Core liefert Berechtigungen und technische Ergebnisse |

**Wichtig:** Dass eine Master-Admin-Seite aktuell Rental-Daten anzeigt, verschiebt **nicht** die Seite aus Core heraus. Sie bleibt Master Admin; nur die fachliche Datenbeschaffung wird später über eine abgesicherte, versionierte Schnittstelle entkoppelt.

## 2. Ausgangslage und Repository-Historie

| Feld | Stand / Evidenz |
|---|---|
| Ursprungsrepository | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| Core-Repository | `FATIHS-MGCKS/SYNQDRIVE-CORE` |
| Git-Transfer | **Abgeschlossen** – nur `main`, vollständige erreichbare Main-Historie; keine alten Feature-Branches/Tags |
| Übertragener Main-SHA | `1e6a267c8c7951e2a11633e89ab96714844ea846` |
| Tree-SHA | `f4d6a18ae533bcefe549210f4bfb5a054e3d513c` |
| Main-Commits | 3.688 (Cursor-Transferprüfung) |
| Ziel-Branches / Tags nach Transfer | 1 Branch (`main`), 0 Tags |
| Original verändert | **Nein**, laut Transferbericht |
| Produktionsdeploy durch Transfer | **Nein** |
| Actions im Core | Laut Owner manuell deaktiviert; mangels API-Read nicht unabhängig bestätigt |
| Sichtbarkeit des Core-Repositories | **PUBLIC** am 2026-11-12 geprüft – Owner sollte bei gewünschter Vertraulichkeit auf PRIVATE umstellen |
| Produktive Laufzeit | Nicht durch P0/P1 auditiert; **nicht mit neuem Core gleichsetzen** |
| Cursor-Umgebung | Multi-Repo `SYNQDRIVE V1`; beim Transfer Alpha und Core eingebunden |

**Synchronisationsregel:** Alpha und Core sind ab dem Kopierpunkt eigenständige Git-Repositories. Änderungen in Alpha landen **nicht automatisch** in Core. Während der Übergangsphase pro Phase schriftlich bestimmen, welche neuen Alpha-Änderungen gezielt in Core übernommen werden. Keine unkontrollierten Merges, Force-Pushes oder automatischen Spiegelungen. Das Original bleibt bis zu einem freigegebenen Cutover ungestört.

### 2.1 Abgleich Masterplan-Bootstrap (VERIFIED_REPO, 2026-11-12)

Geprüft gegen lokalen Clone / `origin/main` zum Zeitpunkt `SYNQDRIVE_CORE_MASTER_PLAN_BOOTSTRAP`:

| Prüfpunkt | Dokumentiert | Repository-Ist | Abweichung |
|---|---|---|---|
| `main` HEAD-SHA | `1e6a267c8c7951e2a11633e89ab96714844ea846` | identisch | keine |
| Tree-SHA | `f4d6a18ae533bcefe549210f4bfb5a054e3d513c` | identisch | keine |
| Commit-Anzahl `main` | 3.688 | 3.688 (`git rev-list --count main`) | keine |
| Pfad Masterplan | `architecture/core-extraction/…` | vor Bootstrap **fehlend** (werdend angelegt) | erwartet, kein Phasen-Rückschritt |
| Phase P0 / P1 Design | abgeschlossen (read-only / design-only) | keine Contract-Implementierung im Code (`/api/v1/core/entitlements/v1` etc. nicht vorhanden) | keine |
| Phase P1A | `DRAFT_PR #2` (Code auf Branch, **nicht** auf `main`) | `main` enthält P1A noch nicht; Implementierung nur auf `cursor/p1a-core-entitlements-5019` | erwartet bis Merge PR #2 |
| Phase P1B+ | `NOT_STARTED` | unverändert | keine |
| GitHub-Sichtbarkeit | PUBLIC | `private: false` (API) | keine |

**Keine zusätzlichen abgeschlossenen Migrationsphasen** über M0, P0, P1D und dieses Docs-Bootstrap hinaus behauptet.

## 3. Ist-Architektur – P0-Feststellungen

**P0-Operation:** `SYNQDRIVE_CORE_P0_FULL_ARCHITECTURE_OWNERSHIP_AUDIT`  
**Ergebnis:** `ASSESSMENT_COMPLETE`, STRICT_READ_ONLY, keine Code-/DB-/Produktionsänderungen.

- **Backend:** NestJS Modular Monolith, ein `backend/src/app.module.ts` mit Core- und Rental-Modulen.
- **Frontend:** Vite/React SPA, `frontend/src/App.tsx`; Hauptbereiche `/master`, `/rental`, `/operator`.
- **Datenbank:** Gemeinsames PostgreSQL-/Prisma-Schema mit **424 Modellen** laut Cursor-Audit.
- **Worker:** Gemeinsames `WorkersModule`, **41 Processor- und 52 Scheduler-Einträge** laut Cursor-Audit. Keine eigenständige Worker-Binary-Topologie verifiziert.
- **Modul-Audit:** 69 Registry-Module, ~70 Top-Level-Backend-Packages gemäß P0-Audit. Viele Authority-Status weiterhin `NOT_STARTED` oder `AUDIT_IN_PROGRESS`.
- **Ergebnis:** **16** konkrete `SPLIT_REQUIRED`-Grenzen identifiziert; keine davon umgesetzt.
- **Produktion:** Nicht geprüft. Repo-Stand ist nicht gleich Produktionsstand.

### 3.1 Core-interne Hauptmodule (Zielgruppierung)

| Hauptmodul | Zugeordnete Module / Workstreams | Status |
|---|---|---|
| **Master Administration** | gesamtes `frontend/src/master/**`, `platform-admin`, Master Dashboard, Organization/Users/Products/Billing-Control-Center, Prospects, Support, Platform Ops, Security Governance, Integration- und Master-Intelligence-Ansichten | OWNER_DECISION: CORE_KEEP; physische Trennung offen |
| **Platform IAM & Entitlements** | Auth, Account, Organization/Membership, Users/Roles/Invites, MFA, IAM Retention, Product, OrganizationProduct, ProductLicenseGuard, Data Authorizations | CORE_PLATFORM; Multi-App-Vertrag DESIGNED |
| **Platform SaaS Billing** | Billing, Pricing/Pricebook für SaaS, Subscriptions, Stripe-SaaS, Usage, Lizenzzuweisung, Rechnungs-/Zahlungsabgleich für SYNQDRIVE-Plattform | CORE_PLATFORM; Rental-Kundenzahlungen ausdrücklich ausgenommen |
| **Shared Platform & Ops** | Activity Log, Business Audit, Notification, Outbound Email, Support, Observability, ClickHouse, Health, IAM-Audit, allgemeine Document-/AI-/Workflow-/Communication-Primitiven | CORE_PLATFORM; gemischte App-Adapter SPLIT_REQUIRED |
| **Vehicle Registry** | Vehicle Identity/VIN, Vehicle Onboarding/Offboarding, Org Vehicle, Registry Lifecycle, VehicleDataSourceLink, Consent/Source Links, technische Baselines | CORE_KEEP; Rental-Status/Stationsregeln trennen |
| **Provider & Device Connectivity** | DIMO, High Mobility, OneAuto Provider, PDI Physical Device Inventory, VDC Connectivity, device episodes, VLS, Freshness | CORE_KEEP |
| **Signal Intelligence** | FSD Full Signal Discovery, VSI, APDS, Signal Catalog/Profiles, Snapshot/Historical Discovery, RPM HF Acquisition, Signal Quality/Provenance, Provider Budgeting | CORE_KEEP; bestehende Shadow/Live-Gates respektieren |
| **Trip Intelligence** | Trip Detection/Lifecycle, Trip FSM, Decision Engine, Reconciliation, GPS/Route, Trip Attribution Truth, Trip Quality | CORE_KEEP; Booking-Kopplung entflechten |
| **Driving Intelligence** | DS4 Motion, DBI, Driving Intelligence V2, Driving Impact, RPM-Belastungsanalyse nach Validierung, Behavior/Assessability | CORE_KEEP; Shadow ist nicht automatisch Produkt-Autorität |
| **Vehicle Health** | Battery V2 LV/HV, Tire Intelligence, Brake Health, DTC, Vehicle Health Findings/Warnings | CORE_KEEP; Rental Health Policy bleibt Rental |
| **Energy & Maintenance** | Energy Event Detection, Refuel/Recharge, Tankstellen/Charging, Service Events, Service Compliance, Maintenance Forecast, OneAuto History/Schedule | CORE_KEEP; app-spezifische Serviceverkäufe bleiben App |
| **Evidence & Quality** | Source/Temporal Provenance, Input Fingerprints, Evidence Quality, Model Versioning, Reference Capture, Replay/Shadow/Validation | Gemeinsame Querschnittsstandards; fachliche Authority bleibt bei den Modulen |

**Strukturhinweis:** Hauptmodulnamen sind **Ziel-Kategorien**, nicht die Behauptung, dass entsprechende Verzeichnisse/Services bereits existieren oder dass jede Komponente sofort physisch verschoben wird. Keine Big-Bang-Microservices.

### 3.2 Rental-exklusive Bereiche (P0-Kandidaten)

**Backend – `RENTAL_EXTRACT`:**

- bookings, pricing (Rental Pricing), rental-rules, rental-driving-analysis
- customers, customer-verification, payments (Rental/Endcustomer), invoices (Rental), deposit
- dashboard-utilization, evaluations-metrics, evaluations-analytics, evaluations-finance
- evaluations-insights, evaluations-quality, evaluations-recommendations, business-insights
- technical-observations, rental-health

**Frontend – `RENTAL_EXTRACT`:** `frontend/src/rental/**`, voraussichtlich `frontend/src/operator/**` (finale langfristige Operator-Zuordnung noch verifizieren).

**Gemischt / Unsicher:** Stations V2, Services Cases, Parts & Accessories, Insurance, Fines, Vendors, Tasks, Documents und Kommunikationskanäle werden **nicht blind gelöscht**; technische Plattformprimitive und Rental-Fachlogik können innerhalb derselben Verzeichnisse liegen. `PaymentEmailProcessor` bleibt `UNKNOWN` bis zur detaillierten Prüfung.

### 3.3 Master-Admin-Inventar – Core bleibt UI-Owner

Navigation: `frontend/src/master/navigation/master-nav.config.ts`; Einstieg: `frontend/src/master/App.tsx`.

Bestehende Verwaltungsflächen umfassen Dashboard, Organizations, Prospects, Security & Access, Connected Vehicles, PDI, Vehicle Logbook, Billing Control Center, Platform Integrations, VSI/ APDS Intelligence, High Mobility, Parts & Accessories, Insurances, Voice Assistant, Platform Ops, Support, Battery/Tire Engineering, Architektur/Changes.

**Grenze:** Plattformabrechnung gehört Core; Rechnungen aus Mietbuchungen gehören Rental. Voice/WhatsApp/AI können zentrale Transportkanäle sein, aber ihre Booking-Aktionen müssen später über Rental-adapter/Contracts laufen.

## 4. P0 – 16 erkannte Entkopplungen (`SPLIT_REQUIRED`)

| ID | Problem / betroffene Dateien | Ziel |
|---|---|---|
| S01 | `vehicle-intelligence/trips/trip-assignment.service.ts`, `trip-analytics-canonical.service.ts`, `VehicleTrip.assignedBookingId*` | Core Trips unabhängig von Booking-Tabellen |
| S02 | `vehicles/operational/fleet-booking-context.util.ts` → Booking-Day-Window | Technische Verfügbarkeit vs. Rental-Kalender sauber trennen |
| S03 | `platform-admin/security-governance-permissions.util.ts` | Produkt-namensraumbezogene IAM-Berechtigungen |
| S04 | Prisma `ProductSlug` aktuell nur RENTAL / FLEET / TAXI | Künftige Produktregistrierung kontrolliert erweitern |
| S05 | `voice-mcp-gateway`, `whatsapp`, `ai` importieren `BookingsModule` | Booking-Funktionen als Rental-App-Adapter/API |
| S06 | `communication/ops/communication-quick-action.executor.ts` | Produktbezogene Aktionen über App-Grenze |
| S07 | `documents/**` + `bookings/booking-pickup-gate/**` | Core Dokumentenprimitive vs. Miet-Dokumentpakete |
| S08 | `stations/**`, `VehicleStationTransfer` | Registry-/Location-Fakten vs. Rental-Stationenregeln |
| S09 | `tasks/task-bucket.util.ts`, `invoices/invoice-payment-task.util.ts` | Gemeinsame Tasks vs. Rental Invoice Tasks |
| S10 | `pricing` ↔ `BookingWizardCheckoutContextService` | Rental Checkout vollständig zu Rental |
| S11 | `rental-rules.service.ts` → `BookingEligibilityRecheckService` | Rental Eligibility intern zu Rental |
| S12 | `evaluations-insights.repository.ts` → `isWizardDraftBooking` | Rental Analytics vs. allgemeine Analysebibliothek |
| S13 | `backend/src/workers/workers.module.ts` | Core- und Rental-Queues/Worker trennen |
| S14 | `frontend/src/App.tsx` | Master-App-Build in Core, Rental/Operator eigene Builds |
| S15 | `frontend/src/master/App.tsx`, `products.service.ts` | Master-Admin-UI behält Produktsteuerung; App nutzt Versioned API |
| S16 | `rental-health.module.ts` / Booking Eligibility | Core Health = Messfakten; Rental Health = Mietentscheidung |

Diese 16 Positionen sind **Audit-Befunde und keine Umsetzungsgenehmigung**. Bevor Code gelöscht wird, müssen Compile-Time-Imports, Laufzeit-Injection, Prisma-Leser/Schreiber, Queues, Verträge, Tests und Rückfallweg nachgewiesen werden.

## 5. P1 – Boundary Contract Design (ABGESCHLOSSEN: NUR DESIGN)

**Operation:** `SYNQDRIVE_CORE_P1_BOUNDARY_CONTRACT_DESIGN`  
**Baseline:** `1e6a267c8c7951e2a11633e89ab96714844ea846`  
**Ergebnis:** `DESIGN_READY`, Code-Änderungen: **NONE**, Deployment: **NONE**.

### 5.1 Contract A – Product Entitlements

**API-Prefix:** `/api/v1/core/entitlements/v1` — **implementiert in Draft PR #2** (`cursor/p1a-core-entitlements-5019`). **Nicht Bestandteil von `origin/main`** bis Merge von PR #2; nicht produktiv deployed.

| Methode | Pfad (nach globalem `api/v1`) | Auth |
|---|---|---|
| `GET` | `core/entitlements/v1/organizations/:orgId` | User JWT + `OrgScopingGuard` |
| `GET` | `core/entitlements/v1/organizations/:orgId/products/:productSlug` | User JWT + `OrgScopingGuard` |

**Code:** `backend/src/modules/products/entitlements/` (`EntitlementsQueryService`, `entitlements-policy.ts`, `CoreEntitlementsReadController`).  
**Schreibpfad unverändert:** `admin/products` (`ProductsController` / `ProductsService`).  
**Keine Entitlement-Outbox in P1A** (Folge-PR empfohlen).

- **Write Owner:** Core Master Admin / `admin/products`.
- **Read Owner:** Core, geschützt und tenant-spezifisch für Apps.
- Statusmodell: `ACTIVE`, `TRIAL`, `SUSPENDED`, `CANCELLED`.
- Zwei unterschiedliche fachliche Prüfungen: `canAccessProductUi` und `canActivateVehicles` – konkrete TRIAL-Regeln noch festzulegen.
- Bestand: `backend/prisma/schema.prisma` (ProductSlug, OrganizationProduct), `backend/src/modules/products/*`, `backend/src/shared/guards/product-license.guard.ts`, `backend/src/modules/vehicle-onboarding/readiness/product-entitlement.authority.ts`.
- **Wichtige Ist-Lücke:** ProductLicenseGuard akzeptiert aktuell nur `ACTIVE`; andere Produktflächen betrachten `ACTIVE` und `TRIAL`. Keine Änderung ohne Entscheidung zur Semantik.
- **VYMOD:** später eigener `ProductSlug`/Seed + `OrganizationProduct` je Org; nicht dieselbe Freischaltung wie RENTAL. SaaS-Abrechnungsprodukt-Schlüssel (`BASE_BILLING_PRODUCT_KEYS`) getrennt betrachten.
- **Auth:** Bestands-User-JWT; für echte Backend-to-Backend-Aufrufe fehlt noch die freigegebene M2M-Service-Token-Issuer-/Verifier-Architektur (**B1**).

### 5.2 Contract B – Vehicle & Intelligence Read API

**Geplanter API-Prefix:** `/api/v1/core/read/v1/organizations/{orgId}` (noch **nicht** implementiert).

- Tenant-geschützte, versionierte Leseverträge: Vehicle Identity/Registry, technische Fahrt, Driving Assessment, Vehicle Health, Provenance, Modell-/Qualitätsstatus.
- Keine Cross-Repo-Prisma-Zugriffe, keine Exposition providerinterner Rohdaten oder Rental-Booking-Felder als kanonische Trip-API.
- Relevante Ist-Pfade: `backend/src/modules/vehicles/vehicles.controller.ts`, `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts`, `trip-analytics-canonical.service.ts`, `vehicle-intelligence-tenant.scope.ts`.
- Der Master-Intelligence-Admin-Pfad `admin/master-intelligence/*` bleibt separat und `MASTER_ADMIN`-geschützt.
- Berechtigung: Organization Scope, Vehicle Ownership und Produktfreigabe; Consent/Providerrechte separat beachten.

### 5.3 Contract C – Trip / Booking Separation

- **Core:** kanonische Trip-FSM, technische Enrichment-/Driving-Daten, eigenständige Trip-Finalisierung.
- **Rental:** fachlicher `RentalTripLink`-Overlay mit Booking/Customer/LinkSource im Rental-Eigentum.
- Legacy-Spalten `VehicleTrip.assignedBookingId`, `bookingLinkSource`, `bookingCustomerId` zunächst **lesen / einfrieren**, später nach geregeltem Cutover deprecaten. **Noch nicht löschen.**
- Geplanter Gate-Name: `CORE_TRIP_AUTO_BOOKING_ASSIGN` (**nicht** ungeprüft als bereits implementiertes Flag behandeln).
- Kritische Ist-Pfade: `trip-assignment.service.ts`, `trip-canonical-hydration.batch.ts`, `trip-behavior-enrichment.service.ts` → `applyAssignmentToTrip`, `rental-driving-analysis-recompute.trigger.ts`.
- **Kein paralleles unkoordiniertes Dual-Write**. Rollback nur mit dokumentierter Daten-Autorität und geprüfter Read-Compatibility.

### 5.4 Minimales Event-Set (DESIGNED)

| Event | Vorgesehener Publisher | Geplanter Consumer | Stand |
|---|---|---|---|
| `core.entitlement.changed.v1` | Core ProductsService / Outbox | App-Cache/Entitlement-Projektion | DESIGNED |
| `core.vehicle-trip.finalized.v1` | Core Trip Lifecycle / Outbox | Rental Link-Kandidaten, weitere Apps | DESIGNED |
| `rental.trip-link.changed.v1` | Rental | Rental Driving Analysis | DESIGNED |

Infra-Vorgabe: Vorhandenes Postgres-Outbox-Muster aus Billing Domain Event Outbox und Vehicle Registry Lifecycle Outbox prüfen; bei Bedarf BullMQ-Fan-out. **Keinen neuen Message Broker** nur für die Trennung einführen. Eventnamen nicht als bereits existierende Produktionsereignisse ausgeben.

### 5.5 IAM/Tenant-Sicherheitsvorgaben

- Vorhandene Mechanismen: OrgScopingGuard, VehicleOwnershipGuard, `assertVehicleInOrganization`.
- Eigene App-Backends benötigen später begrenzte, authentifizierte Dienstidentitäten/M2M.
- Jede App-Abfrage muss Tenant, Product Entitlement, Vehicle Ownership, Scope und gegebenenfalls Provider Consent nachweisbar prüfen.
- Browser erhalten keine langfristigen M2M-Secrets. Master-Admin-Berechtigungen werden nicht pauschal an Produkt-Apps vererbt.
- Product-scoped Permission Namespaces bleiben separate Folgearbeit.

### 5.6 P1-BLOCKER (offen)

| ID | Thema | Status / Gate |
|---|---|---|
| B1 | M2M-Token-Issuer/Verifier/Service-to-Service-Auth | UNKNOWN, vor produktiver Inter-App-API verbindlich definieren |
| B2 | ProductLicenseGuard derzeit nicht überall verdrahtet | Nachweis, wo Guard und Entitlement-Lesevertrag tatsächlich enforced werden |
| B3 | ProductSlug-Enum aktuell RENTAL/FLEET/TAXI | VYMOD-Erweiterung später gesonderter Schema-/Seed-PR |
| B4 | Fehlende Trip-Finalized-Outbox | Vor externem Trip-Event implementieren/validieren |
| B5 | TRIAL-Regel für Fahrzeugaktivierung | Produktentscheidung erforderlich, keine Default-Annahme |

**Bestimmte spätere Schemaänderungen:** VYMOD/ProductSlug, Rental-eigene RentalTripLink-Tabelle, eventuell ein gemeinsames Plattform-/Entitlement-Outbox-Schema (letzteres noch **UNKNOWN**). Nichts davon gehört ohne gesonderte Freigabe in den ersten PR.

## 6. Vorgegebene Migrationsreihenfolge und Gates

| Phase | Ziel | Status | Erfolgskriterium | Rollback/Schutz |
|---|---|---|---|---|
| **M0** | Alpha → Core Main-only Kopie | **DONE** | SHA/Tree/History parity | Alpha unverändert |
| **P0** | Repository-Ownership und Dependency Audit | **DONE** | 16 Kopplungen dokumentiert | READ_ONLY |
| **P1D** | Entitlement, Core-Read, Trip-Link Contract Design | **DONE – DESIGN_ONLY** | DESIGN_READY | Keine Codeänderung |
| **P1A** | Core-Entitlement-Read-API + EntitlementsQueryService + Tests + AGENTS-Governance | **DRAFT_PR** (nicht gemergt, nicht produktiv) | JWT+OrgScoping; keine Outbox/VYMOD/Trip-Änderung | Owner-Review; kein Deploy |
| **P1B** | M2M/Service-Auth und Product-scoped IAM festigen | **NOT_STARTED** | Eindeutige Token-Aussteller, Audience, Scope, Rotation, Denial-Tests | Bestehende JWT-Flows schützen |
| **P2** | Trip ↔ Booking Entkopplung | **NOT_STARTED** | Trip-FSM ohne Booking-Imports oder Booking-DB-Join; RentalLink im Rental-Owner | Gated Cutover, keine unkontrollierten Dual Writes |
| **P3** | Provider-/Vehicle-/Health-/Driving-Read-Contracts | **NOT_STARTED** | Versionierte DTOs, Provenance, Privacy, Tenant-Tests | Bestands-API weiter betreiben |
| **P4** | Voice, WhatsApp, AI, Documents, Tasks trennen | **NOT_STARTED** | Keine direkte Core→Rental-Booking-Injection | Adapter-/Compatibility-Layer |
| **P5** | Worker/Queue/Ereignis-Isolation | **NOT_STARTED** | Core-Jobs unabhängig von Rental; keine doppelten Verbraucher | Gesicherte Worker-Gates |
| **P6** | Datenhoheit Prisma/Schemata trennen | **NOT_STARTED** | Exklusive Schreib-Owner, Migrationsplan, Backfill-/Cutover-Prüfung | DB-Snapshot, Restore-Pfad, Reconciliation |
| **P7** | Frontend Builds und App-Repos trennen | **NOT_STARTED** | Master Admin im Core, Rental und Operator als separate App | Alte SPA bleibt bis Freigabe |
| **P8** | Staging, End-to-End und Produktions-Cutover | **NOT_STARTED** | Auth/Entitlements/Trips/Events/Monitoring/CI/rollback nachgewiesen | Owner GO, gesicherter Rollback |

**Wichtig:** Phasennummern sind Planungsbezeichner dieses Dokuments und nicht die bestehenden P1/P2-Kürzel fachlicher SYNQDRIVE-Workstreams wie VSI, DBI oder APDS. Diese werden nicht umbenannt oder eigenmächtig aktiviert.

### 6.1 P1A-Implementierung (Draft PR #2 — noch nicht auf `main`)

**GitHub PR #2 (Stand Abruf via API):** Base `97b5a27c48a7521ff6f909f764d46fee4940eaec` (`main` nach Merge PR #1) · Head `d55383a0e48bcf15aba8343fa5433aa389973806` · Branch `cursor/p1a-core-entitlements-5019` · State: **OPEN / Draft**.  
**`origin/main` HEAD** (ohne P1A-Code): weiterhin `97b5a27c48a7521ff6f909f764d46fee4940eaec`, bis PR #2 gemergt ist.

**Code-Review P1A:** bestanden (Owner/Review). Merge/Deploy weiterhin nur mit expliziter Owner-Freigabe.

**GitHub CI:** Repository-Workflows **deaktiviert** (Owner) — für PR #2 werden **keine** automatischen Checks gemeldet; Qualitätsnachweis derzeit **lokal** (Jest/tsc/Registry-Validator in der Agent-Umgebung), nicht durch GitHub Actions bestätigt.

**Umgesetzt:** `EntitlementsQueryService`, zentrale Capability-Policy (`canAccessProductUi` / `canActivateVehicles`), versionierte Read-DTOs `core.entitlements.v1`, geschützte GET-Endpunkte, Unit-/Security-Metadaten-Tests, `AGENTS.md` Abschnitt „SYNQDRIVE CORE EXTRACTION — MANDATORY HANDOFF“.

**TRIAL (B5):** `canAccessProductUi=true`, `canActivateVehicles=false` (fail-closed für Fahrzeugaktivierung; aligned mit `product-entitlement.authority` ACTIVE-only für VO).

**Guard-Parität (B2/B5 — P1A-Closeout):**

| Pfad | Durchsetzung |
|---|---|
| `core.entitlements.v1` HTTP API | JWT + `OrgScopingGuard` nur; keine `ProductLicenseGuard`-Verdrahtung |
| `EntitlementsQueryService.capabilities` | **Deklarativ** — keine Route-/Guard-Enforcement; Apps dürfen nicht als produktiv durchgesetzt behandeln |
| `ProductLicenseGuard` | `status === ACTIVE` nur — **kein TRIAL**, kein `expiresAt` |
| VO-4 `assertOrganizationProductEntitled` | **ACTIVE** only — kein `expiresAt` |
| Billing `EntitlementResolverService` (legacy) | `ACTIVE` \| `TRIAL` status — kein `expiresAt` |

**`OrganizationProduct.expiresAt`:** Schema-Feld vorhanden, **in keiner bestehenden Authority durchgesetzt**. P1A liefert `licenseTermExpired` (faktisch) + `expiresAtPolicy=NOT_ENFORCED_STATUS_ONLY_PARITY`; Capabilities folgen weiterhin nur `OrgProductStatus` (Parität zu Guards). **Produktive Nutzung expiry-basierter Denial blockiert** bis Owner-Entscheidung.

**Tests:** Unit-Policy, Query-Service, Controller-Metadaten, **HTTP-Integration** (`AuthGuard` + `OrgScopingGuard`, gemocktes Prisma) — auf PR-Branch verifiziert; **nicht** als `main`-CI belegt.

**Nicht in P1A:** Entitlement-Outbox, M2M (B1), Trip/DBI/VSI, VYMOD-Slug, Schema-Migration, Produktions-Deploy.

### 6.2 Ursprünglich geplanter erster PR — Outbox (verschoben)

Änderungen an Produktzuweisungen über geprüfte Outbox/Ereignislogik: **nicht** in P1A (kein Schema-Umbau). Separater Follow-up-PR nach Owner-Freigabe.

**Vor dem PR:** B1/B5 soweit für API-Durchsetzung erforderlich präzisieren; Statussemantik und tatsächliche Einbindung von `ProductLicenseGuard` prüfen. Wenn Outbox den Umfang stark vergrößert: in minimale auditierbare PRs aufteilen statt zu overengineeren.

**Abnahmekriterien:** Alte Rental-Lizenzen/Plattform-Billing unverändert, Tenant-Isolation deny-by-default, keine fremden Org-Daten, `ACTIVE`/`TRIAL`-Semantik explizit getestet, nur erlaubte Produktänderungen, Audit-Provenance, Unit/Integration/CI grün, keine unautorisierte Schemaänderung, kein automatischer Deploy.

## 7. Technischer Zielvertrag für die eigenen Apps

**Verbindungsarchitektur:**

- **REST/HTTP** für autorisierte Reads und Commands; ein versioniertes TypeScript-SDK für wiederverwendbare Clients ist **geplant**, noch nicht implementiert.
- **Persistente Outbox/Events** für zuverlässige Backend-Ereignisse; Wiederholung, Idempotenz und Replay sind wichtiger als Sofortigkeit.
- **WebSockets** nur für nutzerorientierte Live-Aktualisierungen/Telemetrie nach Berechtigungsprüfung; **kein Ersatz** für persistente Event-Zustellung.
- **Private Service-zu-Service-Kommunikation**, wo möglich, mit Dienstidentitäten, Rate Limits, Auditing und Tenant/Vehicle Scope.
- Provider-Datenbeschaffung bleibt zentral in Core, um DIMO-Kosten, Quoten, Zustimmung und Datenkonsistenz nicht pro App zu duplizieren.

**Beispiel der künftigen logischen Reihenfolge:** DIMO → Core Signal Intelligence → Trip FSM → DS4/DBI → versionierter Core-Read-/Event-Contract → Rental/VYMOD/Logbook. Kein Schritt dieser Kette impliziert, dass alle Module bereits produktreif oder aktiviert sind.

## 8. Schutz des bestehenden Systems

1. `SYNQDRIVE-alpha` bleibt bis zu ausdrücklicher Owner-Freigabe das unveränderte Referenz-/Produktionsprojekt.
2. `SYNQDRIVE-CORE` darf **nicht** ungeprüft mit derselben produktiven Datenbank, denselben Queues/Job-Namen, Provider-Keys oder denselben Tailscale-/SSH-Ressourcen gestartet werden. Doppelter DIMO-Poll, doppelte Scheduler, doppelte Stripe-/Billing-Webhooks und konkurrierende Worker wären kritisch.
3. **Keine Secrets, privaten Schlüssel oder Provider-Tokens in Git-/Markdown-Dateien**. Nur Variablennamen und Berechtigungsklassen dokumentieren; Test-/Staging-Identitäten getrennt halten.
4. **Kein Merge, Deploy, Flag-On, Migration, Backfill oder Produktionszugriff** ohne jeweils neue ausdrückliche Owner-Freigabe.
5. FSD/APDS/VSI/DS4/DBI-Shadow-, Discovery-, Readiness- und Live-Gates aus den jeweiligen Workstreams gelten weiter. Repository-Kopie = keine Aktivierung.
6. Vor dem Entfernen von Verzeichnissen: vollständiges Dependency-Mapping zu NestJS-Imports, Prisma-Modellen, Zyklen, Scheduler-/Queue-Consumers, Cron-Namen, UI-Routes, API-Clients, IAM/Stripe und Dokumentation; Tests + Migrations-Rollback.
7. Veröffentlichungsstatus und Sicherheitskonfiguration prüfen: Core wurde als PUBLIC beobachtet; GitHub Actions nur laut Owner manuell deaktiviert.
8. Bei jeder Änderung Repo- und Produktionswahrheit strikt trennen. Ein GitHub-Commit ist kein bestätigter Deployment-Zustand.

## 9. Offen / noch nicht verifiziert

- **PRODUCTION_RUNTIME**: aktuelle Produktiv-SHAs, echte Worker-Typologie, Queue-Namen-Kollisionen und DB-Lifecycle; P0/P1 ohne VPS-Audit.
- **DB_SPLIT_STRATEGY**: spätere separate DBs vs. getrennte Schemas; zunächst technische und fachliche Schreibgrenzen.
- **M2M_AUTH**: Token-Aussteller, Audience/Scope, Autorisierung, Rotation, Revocation.
- **TRIAL_POLICY**: Zugriff auf UI vs. Fahrzeugaktivierung (P1A API deklariert UI für TRIAL; Guards enforce nur ACTIVE).
- **ORG_PRODUCT_EXPIRES_AT**: DB-Feld ohne Laufzeit-Durchsetzung in Guards/Billing/VO — Owner-Entscheidung offen.
- **MESSAGE_DELIVERY**: exakte Outbox-Transaktionsgrenzen, Retry, Idempotenz, Tenant Fan-out.
- **APP_REPOS**: Ziel-Rental-Repo/-Name und exakter Deploy-Cutover; nicht aus dem historischen `SYNQDRIVE-alpha`-Namen ableiten.
- **SHARED_DOMAIN_CLASSIFICATION**: Stations, Service Cases, Insurance, Parts, Fines, Vendors, Tasks, Docs, PaymentEmailProcessor, Operator.
- **PRODUCTION_PROVIDER_RIGHTS**: Umfang, erlaubte Weitergabe und Consent je DIMO/HM/OneAuto-Vertrag.
- **REPO_SYNC**: Prozess für gezielte Cherry-picks/Bugfix-Übernahme aus Alpha während des Übergangs.
- **SAAS_BILLING_VS_RENTAL_PAYMENTS**: Datenmodell, Stripe-Webhooks und Mandanten-Konten getrennt detaillieren.

## 10. Fortschrittsjournal (append-only)

| Datum | Operation | Ergebnis | Code-/Deploy-Wirkung | Nächstes Gate |
|---|---|---|---|---|
| 2026-11-11/12 | `SYNQDRIVE_CORE_MAIN_ONLY_MIGRATION` | **PASS**; Main-SHA/Tree/History identisch, 1 Ziel-Branch, 0 Tags | Keine Codeänderung, kein Deploy | P0 Ownership Audit |
| 2026-11-12 | `SYNQDRIVE_CORE_P0_FULL_ARCHITECTURE_OWNERSHIP_AUDIT` | **ASSESSMENT_COMPLETE**, 16 `SPLIT_REQUIRED`, Master Admin = Core | STRICT_READ_ONLY | P1 Contract Design |
| 2026-11-12 | `SYNQDRIVE_CORE_P1_BOUNDARY_CONTRACT_DESIGN` | **DESIGN_READY**, Entitlements/Read/Trip-Link/Event-Verträge entworfen; B1–B5 offen | Keine Codeänderung, kein Deploy | Docs-Handoff + freigegebener kleiner P1A-PR |
| 2026-11-12 | Masterplan V1.0 (Entwurf) | **DOKUMENTIERT**, nur Plan/Übergabe – keine Implementierung | Docs-only, Repo-PR/Commit separat nachzuweisen | Owner-Review, dann P1A-Scope |
| 2026-11-12 | `SYNQDRIVE_CORE_MASTER_PLAN_BOOTSTRAP` | **PASS** (Repo-Abgleich §2.1); Masterplan unter `architecture/core-extraction/`; PR #1 merged | Docs-only | P1A |
| 2026-11-12 | `SYNQDRIVE_CORE_P1A_ENTITLEMENTS_AND_AGENT_GOVERNANCE` | **DRAFT_PR #2** · GitHub Base `97b5a27c48a7521ff6f909f764d46fee4940eaec` · Branch `cursor/p1a-core-entitlements-5019` | Entitlements Read API v1 + `AGENTS.md` Governance; **nur PR-Branch, nicht `main`**; kein Deploy/Prod | Security closeout |
| 2026-11-12 | `SYNQDRIVE_CORE_P1A_SECURITY_AND_SEMANTIC_CLOSEOUT` | **DRAFT_PR #2** · Commit `6eec326886699d0e731d16f09c030bf5ee887008` (Closeout-Code) | expiresAt-Transparenz; HTTP Auth/Tenant-Tests; Guard-Parität | Doc-SHA-Korrektur |
| 2026-11-12 | `SYNQDRIVE_CORE_P1A_FINAL_DOCUMENTATION_CORRECTION` | **DRAFT_PR #2** · GitHub Head `d55383a0e48bcf15aba8343fa5433aa389973806` · Code-Review **PASS** | Journal/Handoff-SHAs an GitHub-Refs; CI=Actions aus; P1A bis Merge nicht auf `main` | Owner-Merge PR #2 (wenn freigegeben) |

**Updatevorlage für neue Einträge:**

- **Datum / OPERATION / Repository / Base SHA / Branch / PR:**
- **Was beschlossen wurde (OWNER_DECISION):**
- **Tatsächlich geändert (Pfad / Modell / API / Event):**
- **Tests / CI / Migration / Staging / Production:**
- **Neue Abhängigkeiten, Risiken, Blocker, Unknowns:**
- **Rollback / Compat-Gates:**
- **Nächster zulässiger Schritt; explizite Freigabe erforderlich:**

## 11. Handoff: Startanweisung für neue Cursor-Agenten

1. Dieses Dokument vollständig lesen und exakt zu Beginn den **aktuell letzten** Journal-Eintrag identifizieren.
2. `AGENTS.md`, `architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`, `architecture/MODULE_AUTHORITY_STANDARD.md` lesen; betroffene spezifische Module-Authorities konsultieren.
3. Den **wirklichen aktuellen Main-SHA** in `SYNQDRIVE-CORE` ermitteln; dokumentierte Baseline und offene PRs abgleichen. Nicht von einer unveränderten Kopie ausgehen.
4. OWNER_DECISION respektieren: **Master Admin komplett in Core; Plattform-SoR und Vehicle Intelligence in Core; Rental und Consumer-Fachlogik in Apps.**
5. Das Workstream-Gate ermitteln: P0 und P1-Design abgeschlossen; **P1A implementiert auf Draft PR #2**, aber **nicht auf `main`** bis Merge — `git rev-parse origin/main` vs. PR-Head (`gh pr view …`) immer trennen.
6. Vor jeglichem Code die bereits vorhandenen Contracts, Guards, Prisma-Modelle, Outbox-, Billing- und Trip-Eigentumsgrenzen untersuchen; keine Neuentwicklung vorhandener Systeme.
7. Nur den explizit autorisierten Scope bearbeiten. Kein automatischer Merge/Deploy/Prod-Zugriff; keine Secret-Offenlegung; keine Änderungen in Alpha ohne Erlaubnis.
8. Abschlussreport mit OPERATION, Base/New SHA, PR, Änderungen, Tests, CI, DB/Prod-Status, Risiken, Owner-Gates ausgeben und dieses Fortschrittsjournal aktualisieren.

### Kurzkontext für neue Chats

> Wir spalten `FATIHS-MGCKS/SYNQDRIVE-alpha` in ein zentrales `FATIHS-MGCKS/SYNQDRIVE-CORE` und eigenständige **eigene** App-Repositories auf. Core hält Master Admin, Plattform-IAM, Entitlements, SaaS-Billing und Fahrzeugintelligenz; Rental-Apps konsumieren versionierte Core-APIs/Events. **Aktuell:** `main` nach Masterplan-Bootstrap `97b5a27c48a7521ff6f909f764d46fee4940eaec`; **P1A Entitlements Read API** ist implementiert und review-bestanden auf **Draft PR #2** (Head laut GitHub), **nicht** auf `main` bis Merge. P0/P1D Design abgeschlossen. **GitHub Actions deaktiviert** — keine automatische PR-CI; siehe Journal §10. Kein Deploy/Prod ohne Owner-Freigabe. Fortschritt: Journal dieser Datei.

---

**Wartungsverantwortung:** Owner und jeweils ausführender Implementierungs-/Architektur-Agent. Änderungen am Masterplan sind dokumentiert und reviewbar zu halten. Der nächste Agent soll den Plan **fortschreiben**, nicht einen konkurrierenden zweiten Plan erfinden.
