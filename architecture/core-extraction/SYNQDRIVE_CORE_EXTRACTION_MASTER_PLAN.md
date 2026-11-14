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

**API-Prefix (P3):** `/api/v1/core/read/v1/organizations/{orgId}` — **Vehicle-Identity v1** (PR #14); **Trip-Read v1** (P3-PR2 **MERGED** #15); **Driving-Assessment-Read v1** (P3-PR3 **MERGED** #16); **Battery-Read v1** (P3-PR4 **MERGED** #17); **DTC-Read v1** (P3-PR5 **MERGED** #18); **Service-Intelligence-Read v1** (P3-PR6 **MERGED** #19); **Tire-Read v1** (P3-PR7 Draft); weitere Health-Reads **noch nicht** implementiert.

- **P3-PR1 Product-Scope (verbindlich):** Listen/Detail sind **organisationsweite** Vehicle-Registry-Reads für berechtigte User-JWTs (`fleet.read` + Org-Scope). `?productSlug=` bestätigt nur eine **aktive `OrganizationProduct`-Lizenz** — **keine** produktbezogene Fahrzeugzuordnung, **kein** ProductVehicle-Filter. Explizite **ProductVehicle-/Produkt-Grants** sind **Voraussetzung für spätere** App-/M2M-Read-Anbindung (DESIGNED, nicht in P3-PR1).
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
| **P1A** | Core-Entitlement-Read-API + EntitlementsQueryService + Tests + AGENTS-Governance | **MERGED** (`main` `78e66dce…`, PR #2) | JWT+OrgScoping; nicht produktiv deployed | P1B Service Auth |
| **P1B** | Core App M2M Foundation (Entitlements allowlist only) | **MERGED** (PR #3 → `main` `77e9843aa…`) | `CORE_APP_M2M_ENABLED` default off; M2M live weiter blockiert (distributed RL) | P2 Trip/Booking |
| **P2** | Trip ↔ Booking Entkopplung | **DONE** (P2-PR1–PR8 merged; fachlich abgeschlossen) | Core VI booking/recompute/reconcile über Rental-Ports | P6 RentalTripLink Cutover |
| **P6** | RentalTripLink Overlay + Cutover | **IN_PROGRESS** (P6-PR1 **MERGED** #12; P6-PR2 **MERGED** #13) | Schema + Resolver + Backfill paging/classify; **kein** Live-Cutover | G2 **BLOCKED_BY_DATA_EVIDENCE** |
| **P3** | Provider-/Vehicle-/Health-/Driving-Read-Contracts | **IN_PROGRESS** (P3-PR1 **MERGED** #14; P3-PR2 **MERGED** #15; P3-PR3 **MERGED** #16; P3-PR4 **MERGED** #17; P3-PR5 **MERGED** #18; P3-PR6 **MERGED** #19; P3-PR7 Tire Read Draft) | Versionierte DTOs, Provenance, Privacy, Tenant-Tests | Bestands-API weiter betreiben |
| **P4** | Voice, WhatsApp, AI, Documents, Tasks trennen | **NOT_STARTED** | Keine direkte Core→Rental-Booking-Injection | Adapter-/Compatibility-Layer |
| **P5** | Worker/Queue/Ereignis-Isolation | **NOT_STARTED** | Core-Jobs unabhängig von Rental; keine doppelten Verbraucher | Gesicherte Worker-Gates |
| **P6** | Datenhoheit Prisma/Schemata trennen | **NOT_STARTED** | Exklusive Schreib-Owner, Migrationsplan, Backfill-/Cutover-Prüfung | DB-Snapshot, Restore-Pfad, Reconciliation |
| **P7** | Frontend Builds und App-Repos trennen | **NOT_STARTED** | Master Admin im Core, Rental und Operator als separate App | Alte SPA bleibt bis Freigabe |
| **P8** | Staging, End-to-End und Produktions-Cutover | **NOT_STARTED** | Auth/Entitlements/Trips/Events/Monitoring/CI/rollback nachgewiesen | Owner GO, gesicherter Rollback |

**Wichtig:** Phasennummern sind Planungsbezeichner dieses Dokuments und nicht die bestehenden P1/P2-Kürzel fachlicher SYNQDRIVE-Workstreams wie VSI, DBI oder APDS. Diese werden nicht umbenannt oder eigenmächtig aktiviert.

### 6.1 P1A — **MERGED** (PR #2 → `main` `78e66dce51a09d98550eebf780dda25a189d3d2d`)

Entitlements Read API v1 auf `main`; **nicht** als produktiv deployed markiert.

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

### 6.2 P1B-PR1 — Core App Service Auth (Draft-PR #3, Entitlements-Allowlist only)

**GitHub:** PR #3 · Branch `cursor/p1b-service-auth-foundation-5019` · Base `78e66dce51a09d98550eebf780dda25a189d3d2d` · HEAD siehe Journal (Merge-Gate).

**Status (klar trennen):**

| Dimension | Stand |
|---|---|
| **Merge readiness (PR #3)** | Security-Closeout + isolierte Postgres-Verifikation (siehe Journal `FINAL_MERGE_GATE`) — **kein** Automerge |
| **GitHub CI** | Actions **deaktiviert** — kein CI-PASS |
| **Produktions-Deploy** | **NEIN** — P1B nicht auf Production |
| **M2M live activation** | `CORE_APP_M2M_ENABLED=false` (default); `m2mProductionReady` nur bei explizitem `CORE_APP_M2M_PRODUCTION_READY=true` **zusätzlich** zu Enable — nicht synonym |
| **LIVE_ACTIVATION_BLOCKER** | Verteiltes Rate-Limiting (Exchange + Throttler pro Replica in-memory) |

**Entscheidung:** Voice-MCP-ähnliche kurzlebige Service-JWTs mit eigenem `CORE_APP_M2M_SIGNING_SECRET`, getrennt von User-JWT und Voice-MCP.

**Implementiert (Repository, Feature-Gate default OFF):**

- Prisma: `core_app_service_clients`, `core_app_service_org_grants` (Migration `20261112120000_core_app_m2m_p1b_pr1`)
- Exchange: `POST /api/v1/auth/core-app/token` (client credentials + org + scope)
- Admin: `POST/PATCH /api/v1/admin/core-app-service-clients/*` (`MASTER_ADMIN` + `MasterAdminMfaGuard` / `MASTER_API_KEYS` step-up, kein UI)
- Verifier: `CoreAppM2mTokenService` + `CoreAppEntitlementsAuthGuard`; `AuthGuard` lehnt Service-JWT auf Nicht-Allowlist ab
- **Allowlist (M2M):** nur `GET /api/v1/core/entitlements/v1/organizations/:orgId` und `.../products/:productSlug` — **ein Produkt pro Service-Client** (Listenfilter + 403 auf fremdes `productSlug`)
- Env: `CORE_APP_M2M_ENABLED=false` (default); `CORE_APP_M2M_SIGNING_SECRET` required when enabled; **fail-closed** wenn Secret = `JWT_SECRET` oder `VOICE_MCP_TOKEN_SECRET` oder &lt; 32 Zeichen
- API-Feld `m2mProductionReady`: `CORE_APP_M2M_PRODUCTION_READY=true` **und** M2M enabled — **nicht** allein durch `CORE_APP_M2M_ENABLED=true`
- TTL ≤ 300s; Revocation via client/grant status + `credentialVersion`/`grantVersion`; **Live-Recheck** `OrganizationProduct` + `allowedScopes` auf jedem geschützten M2M-Request (nicht nur beim Exchange)
- Exchange rate-limit: **nur** Express/Nest `req.ip` (kein Client-`x-forwarded-for`); in-memory Buckets mit Ablauf + Obergrenze; Repository: **kein** `trust proxy` in `main.ts`

**Security closeout (`SYNQDRIVE_CORE_P1B_PR1_SECURITY_CLOSEOUT`):** Produkt-Isolation, Entitlement-Revocation auf API, Scope-Recheck, Signing-Isolation, Admin MFA + Grant↔Client-Bindung, Audit-Redaction für `client_secret`, HTTP-Negativtests.

**Limitierungen / LIVE_ACTIVATION_BLOCKER:**

- **Distributed rate limiting:** Nest `ThrottlerModule` + Exchange-Limiter sind **pro Replica in-memory**; Redis (BullMQ) wird **nicht** als Throttler-Storage genutzt → **M2M bleibt mit `CORE_APP_M2M_ENABLED=false` bis verteiltes Rate-Limit verifiziert**
- Kein Vehicle/Trip/Master-Admin für Service-JWT; keine auto-provisioned clients; **kein Produktions-Deploy** in diesem Workstream
- **Postgres greenfield `migrate deploy` (447 Migrations):** historische `CREATE INDEX CONCURRENTLY`-Migrationen schlagen in Prisma-Transaktion fehl — **nicht** der P1B-PR1-Normpfad; Production incrementell deployen
- **P1B-Migration verifiziert (Merge-Gate):** disposable DB `synqdrive_core_p1b_disposable_merge_gate` @ `127.0.0.1` — Main-Schema-Baseline (`78e66dce` `schema.prisma` + `db push`), `migrate resolve` für 446 Vorgänger, `prisma migrate deploy` → nur `20261112120000_core_app_m2m_p1b_pr1`; `migrate status` up-to-date; Jest `CORE_APP_M2M_POSTGRES_INTEGRATION=1`
- GitHub Actions **deaktiviert** — kein CI-PASS behauptet

**B1:** teilweise adressiert (Foundation + Closeout); weitere APIs in Folge-PRs.

### 6.3 P2-PR1 — Trip Booking Overlap Port (MERGED → `main` `af34303d8…`, PR #4)

**Scope:** Core-owned `TripBookingOverlapPort` (`TRIP_BOOKING_OVERLAP_PORT`) unter `vehicle-intelligence/trips/ports/`; Rental-Implementierung `TripBookingOverlapPrismaAdapter` + `TripBookingOverlapModule` (nur `PrismaModule`, **kein** `BookingsModule`-Zyklus).

**Refactor:** `TripAssignmentService.findBookingAssignment` und `CanonicalTripHydrationBatchLoader` (Booking-Queries + Driver-Pools) nutzen ausschließlich den Port — **keine** `prisma.booking`-Aufrufe mehr in diesen Core-Pfaden.

**Tenant (Closeout):** `findFirstOverlapForTrip` erfordert `organizationId`; Quelle = **`Vehicle.organizationId`** (serverseitig in `TripAssignmentService`, kein Caller-Trust; öffentliches `resolveForTrip` akzeptiert **kein** `organizationId`-Option-Override). `applyAssignmentToTrip` nutzt intern `resolveForTripInternal` mit bereits aus Vehicle gelesener Org. Fehlt Vehicle/Org → fail-closed.

**Bootstrap reconciliation (PR #4):** Full `VehicleIntelligenceModule` probe = **`BASELINE_BLOCKED`** (`PlatformAdminModule` imports[5] undefined; gleicher Scope-Chain wie `main`@`77e9843aa` **vor** `TripBookingOverlapModule`). Kein P2-Regression-Nachweis. **Scoped runtime DI** (`TripBookingOverlapModule` + Core-Services) = verbindlicher Port-Nachweis.

**Unverändert:** Trip-FSM, Finalize, DS4/DBI-Pipelines, Assignment-Outcomes (gültige Daten), `VehicleTrip`-Booking-Spalten, Rental-Recompute-Hooks, Query-Batching/`queryCount`.

**Offen (P2):** weitere VI→Rental-Trigger außerhalb Port-Pfade, Legacy-Spalten-Cutover, RentalTripLink.

### 6.5 P2-PR3 — TripAttribution Booking decoupling (MERGED → `main` `3c5576168…`, PR #6)

**Scope:** `TripAttributionService` nutzt ausschließlich `TRIP_BOOKING_OVERLAP_PORT` für Overlap- und Driver-Pool-Loads (keine direkten `prisma.booking`-Queries, keine `resolveBookingDriverPool`/`assertBookingInOrganization`-Imports in Core).

**Port-Erweiterung:** `findFirstOverlapForTrip` optional `bookingId` (SQL-Filter vor `findFirst`, gleiche ACTIVE/COMPLETED + Inclusive-Overlap + `startDate desc` Semantik); `loadDriverPoolForBooking` mit `NotFoundException`-Kontrakt (Rental-Adapter).

**Unverändert:** `resolveAttribution`-Entscheidungslogik, PRIVATE/EXPLICIT/TIME_WINDOW, Batch-Hydration über Port, Full VI Bootstrap **BASELINE_BLOCKED** (separates Thema).

### 6.6 P2-PR4 — Remaining recompute call sites (MERGED → `main` `d5b528569…`, PR #7)

**Scope:** `TRIP_RENTAL_RECOMPUTE_PORT` um `notifyAttributionChanged`, `notifyTripAnalysisCompleted`, `notifyMisuseReconciled` erweitert; Core-Call-Sites `DriverAttributionService`, `DrivingAnalysisStageOrchestratorService`, `DrivingMisuseReconcileJobHandler` — keine direkten `RentalDrivingAnalysisRecomputeTriggerService`-Imports mehr in diesen drei Pfaden.

**Parität:** Rental-Reasons und Correlation-IDs unverändert; Attribution/Misuse **await** + Fehlerpropagation; Stage-Orchestrator weiterhin `void` + `catch` + Warn-Log.

**Nicht in Scope:** `DrivingIntelligenceJobHandlerRegistry`, DriverAttribution `prisma.booking`, RentalTripLink, Schema, Events/Outbox, VI-Vollboot.

**Bootstrap:** Full `VehicleIntelligenceModule` **BASELINE_BLOCKED** unverändert.

### 6.7 P2-PR5 — DriverAttribution booking decoupling (MERGED → `main` `263c6d84c…`, PR #8)

**Scope:** `DriverAttributionService` nutzt `TRIP_BOOKING_OVERLAP_PORT` für `loadBookingAttributionContext`, `findPickupHandoverProofForTrip`, `loadDriverPoolForBooking` — keine direkten `prisma.booking` / `bookingHandoverProtocol`-Queries, keine `booking-allowed-drivers.util`-Imports in Core.

**Port-Erweiterung:** `loadBookingAttributionContext` (customerId, assignedDriverId, customerType; null bei fehlendem Booking); `findPickupHandoverProofForTrip` (±6h PICKUP + Signatur; `performedAt desc`).

**Security note (unverändert):** leerer `allowedDriverIds`-Pool erlaubt weiterhin jeden Driver (`isDriverInBookingPool`-Semantik in Core gespiegelt) — separates Härtungs-Thema, nicht Teil dieses strukturellen PR.

**Bootstrap:** Full VI **BASELINE_BLOCKED** unverändert.

### 6.8 P2-PR6 — Driving intelligence job booking validation (MERGED → `main` `1c96544f9…`, PR #9)

**Scope:** `DrivingIntelligenceJobRepository.assertBookingInOrg` → `TRIP_BOOKING_OVERLAP_PORT.resolveBookingVehicleForOrganization`.

**Parität:** Idempotency-Short-Circuit vor Validierung; `NotFoundException` / `Booking vehicle mismatch for organization`; nullable `vehicleId`.

**Offen (Architektur):** Langfristige **Core-vs-Rental Job-Ownership** für `RENTAL_DRIVING_ANALYSIS_RECOMPUTE` bleibt **UNRESOLVED** (separat von Booking-Validierung).

**Bootstrap:** Full VI **BASELINE_BLOCKED** unverändert.

### 6.9 P2-PR7 — Rental reconciliation port slice (MERGED → `main` `35fdb1a24…`, PR #10)

**Scope:** `RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT` — `BOOKING_WITHOUT_RENTAL_ANALYSIS` Scan+Remediate in Rental-Adapter.

**Parität:** Idempotency, `REPAIR_FINALIZE`, `RENTAL_DRIVING_ANALYSIS_RECOMPUTE` enqueue; `recordReconciliation` nur in Core.

**Bootstrap:** Full VI **BASELINE_BLOCKED** unverändert.

### 6.10 P2-PR8 — Rental recompute job handler port (MERGED → `main` `1ccb2bf1b…`, PR #11)

**Scope:** `RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT`; Registry ohne direkten Rental-Klassenimport; `useExisting` auf `RentalDrivingAnalysisRecomputeJobHandler`.

**Fail-closed:** Fehlender Port → Dispatch wirft (kein Stub-`COMPLETED` für `RENTAL_DRIVING_ANALYSIS_RECOMPUTE`).

**Bootstrap:** Full VI **BASELINE_BLOCKED** unverändert.

**P2 Abschluss:** Structurelle Entkopplung Trip↔Booking/Recompute/Reconcile über Rental-Ports abgeschlossen. Verbleibende Legacy-**Daten** auf `VehicleTrip` (`assignedBookingId`, …) = **P6** RentalTripLink, nicht weitere P2-PRs.

### 6.11 P6-PR1 — RentalTripLink foundation (MERGED → `main` `07e09b434…`, PR #12)

**Scope (foundation only):** Additive Prisma `RentalTripLink` + Migration `20261112194500_rental_trip_link_p6_pr1`; Partial-Unique `(organization_id, trip_id) WHERE superseded_at IS NULL` (current = ACTIVE **oder** UNLINKED); Rental-Modul `rental-trip-link/*` (`RentalTripLinkRepository`, `RentalTripLinkResolver`, `RentalTripLinkBackfillDryRunService`).

**Read path:** Overlay-first; Legacy-Fallback nur ohne aktuelle Overlay-Zeile; **UNLINKED** overlay darf Legacy nie wiederbeleben; EXPLICIT blockiert automatische TIME_WINDOW-Supersession (Schreibpfad vorbereitet, **keine** produktiven Write-Switches).

**Backfill (PR1):** Read-only Dry-Run (`analyze`); Idempotenz-Fingerprint = `sha256(assignedBookingId|linkSource|customerId)` (32 hex); kein Auto-Backfill, keine Legacy-Mutation.

**Unverändert:** Trip FSM, Legacy-Write-Pfade, VI-Reader, Recompute-Jobs, Production-Deploy, Shadow-Read.

### 6.12 P6-PR2 — Backfill analyzer hardening (**MERGED** → `main`, PR #13)

**Scope:** `analyzePage` mit Cursor-Paging `(startTime desc, id desc)`, `totalTripsInOrg` / `nextCursor` / `coverageCompleteThisScan`; Klassifikation `SAFE_ACTIVE` vs `SKIP_*` vs `BLOCK_*`; Bulk-Reads für Bookings + Current-Overlays pro Seite; **kein** Schema.

**G2:** Tooling-Gate verbessert; **G2_DATA_EVIDENCE = BLOCKED** bis Owner-isolierte repräsentative Datenquelle + Dry-Run-Lauf — synthetische Tests ≠ Produktionsparität.

**P6 Cutover Gates (Owner-RFC G1–G7):**

| Gate | Inhalt | Status |
|---|---|---|
| G1 | Schema + migration review (partial unique current row, CHECK invariants, `booking_id` **RESTRICT**) | **DONE** (PR #12) |
| G2 | Backfill dry-run sign-off auf **repräsentativer Datenquelle** | **BLOCKED_BY_DATA_EVIDENCE** (Analyzer PR2; kein Prod-Stichprobennachweis) |
| G3 | Kritische Leser auf Overlay-only-Write umstellen; **ein** autorisierter Legacy-Kompatibilitätsprojektor (`RentalTripLinkResolver`); Shadow-Compare | NOT_STARTED |
| G4 | W1 dual-write (overlay + legacy) — **keine** ungeplante Aktivierung außerhalb Owner-Freigabe | NOT_STARTED |
| G5 | W2 read switch (overlay-first produktiv) | NOT_STARTED |
| G6 | Legacy-Spalten-Deprecation nach stabiler Parität | NOT_STARTED |
| G7 | Production cutover + rollback drill; nach Overlay-only-Writes **explizite Daten-Reconciliation** vor Legacy-Read-Rückfall | NOT_STARTED |

**Booking FK:** `ON DELETE RESTRICT` — Buchungslöschung darf referenzierte Overlay-Historie nicht still auf NULL setzen; Cutover-Reconciliation separat.

### 6.13 P3-PR1 — Versioned Vehicle Identity Read API (Draft-PR #14)

**Scope:** `GET /api/v1/core/read/v1/organizations/:orgId/vehicles` und `.../vehicles/:vehicleId`; explizites DTO `core.vehicle.read.v1` (`vehicleId`, `make`, `model`, `year`, `fuelType`, `registryLifecycle`); Modul `core-vehicle-read/*`.

**Product scope (Closeout H1):** Org-weite Registry-Liste/Detail (`where: organizationId`); `productSlug` = Lizenznachweis (`OrganizationProduct` ACTIVE), **nicht** Fahrzeug-Produkt-Mapping. **Keine** ProductVehicle-Isolation in diesem PR. Folge: ProductVehicle Grants + Allowlist-Erweiterung **separater** Gate vor App-/M2M-Reads.

**Pagination (Closeout H2):** `page`/`limit` positive Ganzzahlen (ungültig → 400); `limit` max **100**; Sortierung `createdAt desc`, `id desc`; Response-`pagination` spiegelt validierte Parameter; `skip`/`take` Safe-Integer + Prisma-Int32-Grenze.

**Auth (User-JWT only):** global `AuthGuard` + `OrgScopingGuard` + `PermissionsGuard` (`fleet.read`) + `CoreVehicleReadProductGuard` (`?productSlug=` + aktive `OrganizationProduct`).

**M2M:** **Keine** Erweiterung der P1B-Service-JWT-Allowlist (nur Entitlements-Reads); Service-Tokens auf Vehicle-Read-Routen **401** — **nicht** als App-to-Core-M2M produktionsbereit behandeln.

**Unverändert:** Trip FSM, DS4, DBI, Health, Rental-Ports, Schema, bestehende `vehicles.controller` Verträge, Production-Deploy.

### 6.14 P3-PR2 — Versioned Trip Read API (MERGED → `main`, PR #15)

**Scope:** `GET .../vehicles/:vehicleId/trips` und `.../trips/:tripId`; DTO `core.trip.read.v1` (`tripId`, `vehicleId`, `tripStatus`, `startTime`, `endTime`, `distanceKm`); Modul `core-trip-read/*`; **READ_ONLY** auf `VehicleTrip`.

**Privacy / Sichtbarkeit (Opus-Remediation, Architekturentscheid F1):** `core.trip.read.v1` ist ein technischer, organisationsautorisierter Trip-Read-Vertrag und klassifiziert **nicht** zwischen Privat- und Geschäftsfahrten. `isPrivateTrip` ist der Booking-/Fahrer-Attribution-Fallback (`PRIVATE_UNASSIGNED`, gesetzt erst nach Abschluss + Enrichment, abhängig von Booking-Overlap) und **kein** verlässliches Privacy-Signal — er steuert die Sichtbarkeit **nicht** (vorheriger Filter entfernt; ONGOING und unzugeordnete abgeschlossene Fahrten sind lesbar; Sichtbarkeit unabhängig von Booking-Zuordnung). Nur minimale technische Felder; keine Booking-/Customer-/Driver-/GPS-/Provider-/Analyse-/`rawDetectionMeta`-Felder. Privacy-/Consent-Eignung für künftige App-Consumer erfordert ein **separates Gate**; dieser Vertrag autorisiert **weder** M2M **noch** Production-Aktivierung.

**Gap-Split-Sichtbarkeit (F2):** Wiederverwendung `listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList` + `applyHiddenCustomerSuffixTripExclusion` (identisch zur Customer-Trip-Liste): nur nachweislich rekonziliierte, absorbierte CANCELLED-Suffixe ausgeblendet — Liste, `pagination.total` und Detail (→ 404); andere CANCELLED-Fahrten bleiben lesbar. Ein Raw-Lookup pro Request (fahrzeuggebunden), kein N+1.

**Auth:** Gleiches Muster wie P3-PR1 (User JWT, `fleet.read`, Lizenz-`productSlug`, Fahrzeug `organizationId`-Bindung, Trip `vehicleId`-Bindung). **M2M-Allowlist unverändert.**

**Pagination/Sort:** Wiederverwendung `parseCoreVehicleReadPagination`; `startTime desc`, `id desc`.

**Unverändert:** Trip FSM, Legacy-Writes, VI-Services, Rental-Overlay, Schema, Production-Deploy.

### 6.15 P3-PR3 — Versioned Driving Assessment Read API (MERGED → `main`, PR #16)

**Scope:** `GET .../vehicles/:vehicleId/trips/:tripId/driving-assessment`; DTO `core.driving.assessment.read.v1`; Modul `core-driving-assessment-read/*`; **READ_ONLY** auf `di_v0_ds4_trip_assessment_v1` / `di_v0_ds4_trip_driving_impact_v2` (explizite Prisma-Select-Allowlist).

**Sichtbarkeit:** Identisch `core.trip.read.v1` (kein `isPrivateTrip`-Filter; Gap-Split-Suffix-Ausblendung; Trip 404).

**Publication safety:** Kein numerischer Impact-V2-Score; nur `assessmentStatus` (L2 berechnet/bewertet) und `scorePublicationStatus` (Publikationsgate, z. B. `DISABLED_MODEL_NOT_CALIBRATED`). `assessmentAvailability=NOT_AVAILABLE` wenn keine Assessment-Zeile. Kein `evidenceQuality` / sparse-channelOutcome im Core-Vertrag (Opus-F1-Closeout). Keine Fingerprints, `eventSummaries`, `processingError`, DBI-Outputs. **Kein** M2M; **keine** Produktiv-Score-Freigabe.

**Auth:** Wie P3-PR1/P3-PR2 (User JWT, `fleet.read`, Lizenz-`productSlug`). M2M-Allowlist unverändert.

**Unverändert:** DS4-Worker/Processor, Recompute, Schema, Rental, bestehende VI `trips/:tripId/ds4-assessment` Internal-Read.

### 6.16 P3-PR4 — Versioned Battery Read API (MERGED → #17)

**Scope:** `GET .../vehicles/:vehicleId/battery?productSlug=`; DTO `core.battery.read.v1`; Modul `core-battery-read/*`; **READ_ONLY** via `CanonicalBatteryHealthService.getSummary` (keine Algorithmusänderung).

**Fail-closed disclosure (technisch, keine Publikationsnumerik):** Kein `estimatedHealthScore` / `displayBars`, kein `lvPublishedHealthPercent`, kein `aggregateHealthStatus` (keine indirekten Score-Bänder). `primaryTruthSource` nur als Label; `lvPublicationCustomerVisible` spiegelt das bestehende Gate `isLvPublishedSohCustomerVisible` wider — **ohne** numerische LV-Werte in Core v1. HV-Livetelemetrie nur bei decision-fresh `currentTelemetry.observationFreshness`. Keine Rental-Readiness-/Block-Felder.

**`batteryAvailability`:** `AVAILABLE` wenn `getSummary` ein Ergebnis liefert; `NOT_AVAILABLE` wenn `null` (`resolvedAt` dann `null`).

**DI:** `CanonicalBatteryHealthConsumerModule` exportiert `CANONICAL_BATTERY_HEALTH_CONSUMER_EXPORT` (`useExisting` → `CanonicalBatteryHealthService`); kein Rental-Import im Core-Modul.

**Auth:** User JWT, `fleet.read`, Lizenz-`productSlug`, Fahrzeug-`organizationId`. **M2M unverändert.**

**Unverändert:** Battery-V2-Pipeline, Publication-Flags in Prod, Rental-Health, Schema, Worker.

### 6.17 P3-PR5 — Versioned DTC Read API (MERGED → #18)

**Scope:** `GET .../vehicles/:vehicleId/dtc?productSlug=`; DTO `core.dtc.read.v1`; Modul `core-dtc-read/*`; **READ_ONLY** via `DtcService.getSummary`.

**Fail-closed:** `stale|unavailable` → null counts / empty preview (inkl. 01A mixed-mode). **DI:** `DtcConsumerModule` / `DTC_CONSUMER_EXPORT`. **Auth:** User JWT, `fleet.read`, Lizenz, Org-Fahrzeug-Bindung. **M2M unverändert.**

### 6.18 P3-PR6 — Versioned Service Intelligence Read API (Draft-PR)

**Scope:** `GET .../vehicles/:vehicleId/service-intelligence?productSlug=`; DTO `core.service.intelligence.read.v1`; Modul `core-service-intelligence-read/*`; **READ_ONLY** via `ServiceComplianceService.evaluateNextServiceDetailed` (ein Aufruf pro Request; kein `buildServiceInfoStatus`, keine OneAuto-Requests).

**Quellenpräzedenz (unverändert):** Frische HM/OEM-Headline; sonst berechnete OneAuto/Manual-Headline; `computedComparison` nur aus Upstream; Konflikte aus `forecast.conflicts` wenn Forecast existiert, sonst `nextService.conflicts`. Keine Rental-/TÜV-/History-Felder.

**Positionen:** Engine-Reihenfolge, max. 20 mit `positionsTotal` / `positionsTruncated`.

**DI:** `ServiceComplianceConsumerModule` / `SERVICE_COMPLIANCE_CONSUMER_EXPORT` (`useExisting` → `ServiceComplianceService`); kein RentalHealth-Import.

**Auth:** User JWT, `fleet.read`, Lizenz, Org-Fahrzeug-Bindung. **M2M unverändert.**

**Unverändert:** Forecast-Engine, OneAuto/HM-Ingestion, Rental Health, TÜV/BOKraft, Service History, Schema, Worker.

### 6.19 P3-PR7 — Versioned Tire Read API (Draft-PR)

**Scope:** `GET .../vehicles/:vehicleId/tires?productSlug=`; DTO `core.tire.read.v1`; Modul `core-tire-read/*`; **READ_ONLY** via `TireHealthService.getSummary(vehicleId, { hmTirePressure })` mit HM-Druck-Prefetch wie VI/Rental.

**Fail-closed:** Kein raw `TireHealthSummary`; keine `overallPercent`/`overallRemainingKm`; V3 unavailable ohne fabriciertes `computedAt`; V3 authoritative Tread-Provenienz aus niedrigster Rad-Evidence-Klasse; getrennte `remainingV2` (nur presentation-reliable) / `remainingV3` (Intervall, kein exakter Forecast).

**DI:** `TireHealthConsumerModule` / `TIRE_HEALTH_CONSUMER_EXPORT` (`useExisting` → `TireHealthService`); kein RentalHealth-Import.

**Auth:** User JWT, `fleet.read`, Lizenz, Org-Fahrzeug-Bindung. **M2M unverändert.**

**Unverändert:** Wear-Model V2/V3 Berechnung, Cutover-Flags, DS4-Shadow, Rental Health, Worker, Schema.

### 6.4 P2-PR2 — Trip Rental Recompute Port (MERGED → `main` `98a6068f8…`, PR #5)

**Scope:** Core-owned `TripRentalRecomputePort` (`TRIP_RENTAL_RECOMPUTE_PORT`); Rental `TripRentalRecomputePortAdapter` in `RentalDrivingAnalysisModule` (`tripRentalRecomputePortProviders`).

**Refactor:** `TripPostFinalizeAnalysisProducer` + `TripAssignmentService` entfernen direkte Imports von `RentalDrivingAnalysisRecomputeTriggerService` / Rental-Reason-Enums.

**Parität:** `notifyTripCompleted` → `TRIP_COMPLETED`; `notifyBookingAssignmentCorrected` → `BOOKING_ASSIGNMENT_CORRECTED`; unveränderte Correlation-Strings, void+catch, keine Finalize-Blockade bei Recompute-Fehler.

**Module:** `VehicleIntelligenceModule` ↔ `RentalDrivingAnalysisModule` `forwardRef` **unverändert** (Modul-Zyklus nicht Teil von P2-PR2).

**Bootstrap:** Full `VehicleIntelligenceModule` `Test.createTestingModule` weiterhin **BASELINE_BLOCKED** (`PlatformAdminModule` imports[5] undefined — gleiche Signatur wie P2-PR1-Baseline). Scoped runtime DI = verbindlicher Port-Nachweis. VI-Vollboot-/Modulzyklus-Closeout (`f0f4da93f`) auf PR #5 **zurückgenommen** — separates Architektur-Thema.

**Scope recovery (PR #5):** P2-PR2 beschränkt auf Port/Adapter + zwei Core-Call-Sites; keine Modulextraktionen, kein PlatformAdmin/Voice/Organizations-`forwardRef` in diesem PR.

### 6.6 Ursprünglich geplanter erster PR — Outbox (verschoben)

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
| 2026-11-12 | `SYNQDRIVE_CORE_P1A_FINAL_DOCUMENTATION_CORRECTION` | **DRAFT_PR #2** · GitHub Base `97b5a27c48a7521ff6f909f764d46fee4940eaec` · Code-Review **PASS** | Journal/Handoff; CI=Actions aus | PR #2 merged |
| 2026-11-12 | `SYNQDRIVE_CORE_P1A` merge | **MERGED PR #2** → `main` `78e66dce51a09d98550eebf780dda25a189d3d2d` | Entitlements API v1 on main; no prod deploy | P1B-PR1 |
| 2026-11-12 | `SYNQDRIVE_CORE_P1B_PR1_SERVICE_AUTH_FOUNDATION` | **DRAFT_PR #3** · Base `78e66dce51a09d98550eebf780dda25a189d3d2d` | Core App M2M foundation; migration `20261112120000_core_app_m2m_p1b_pr1`; gate default OFF | Security closeout |
| 2026-11-12 | `SYNQDRIVE_CORE_P1B_PR1_SECURITY_CLOSEOUT` | **DRAFT_PR #3** · HEAD `d2076e504e90962bb73c9bef3fa9b68d9a2d3e45` | R1–R5 Fixes + Tests; Masterplan §6.2; **kein** Deploy/Prod/CI | Merge-Gate |
| 2026-11-12 | `SYNQDRIVE_CORE_P1B_PR1_FINAL_MERGE_GATE` | **DRAFT_PR #3** · Base `78e66dce51a09d98550eebf780dda25a189d3d2d` · HEAD nach Commit | Disposable-Postgres: P1B `migrate deploy` + Constraint-Test; `m2mProductionReady`-Semantik; CI weiter aus | Owner merge PR #3 (manuell); M2M live weiter blockiert (distributed RL) |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_TRIP_BOOKING_DECOUPLING_AUDIT` | **READ_ONLY** · `main` `77e9843aa…` | Dependency map; P2-PR1 = Booking Overlap Port; DESIGN_READY | P2-PR1 Implementierung |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR1_BOOKING_OVERLAP_PORT` | **DRAFT_PR #4** · Base `77e9843aa…` · HEAD `9236a5923…` | Port + Adapter; Tests lokal; **kein** Schema/Deploy | Tenant closeout |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR1_TENANT_AND_INTEGRATION_CLOSEOUT` | **DRAFT_PR #4** (aktualisiert) | Org-scope via Vehicle; Nest-DI + disposable Postgres 3/3 PASS | P2 review / optional merge |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR1_FINAL_SECURITY_DI_CLOSEOUT` | **DRAFT_PR #4** | Tenant-Override entfernt (`resolveForTrip` nur Vehicle-Lookup); VI full `Test.createTestingModule` **BLOCKED** (PlatformAdminModule imports[5] undefined / cycle) | VI boot graph fix out-of-scope oder Folge-PR |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR1_BASELINE_BOOTSTRAP_RECONCILIATION` | **DRAFT_PR #4** | Baseline `main`@`77e9843aa`: identischer `PlatformAdminModule`/`imports[5]`-Fehler (vor TripBookingOverlap); scoped runtime DI PASS; full VI boot = **BASELINE_BLOCKED** (kein PASS) | Merge mit Baseline-Exception; VI full boot separates Architektur-Thema |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR1` | **MERGED** · PR #4 → `main` `af34303d8dc0a4eadb2090a6f923697d14e39d06` | Booking Overlap Port + Tenant closeout | P2-PR2 Recompute Port |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR2_RENTAL_RECOMPUTE_PORT` | **DRAFT_PR #5** · Base `af34303d8…` · structural HEAD `e197dc806…` | Recompute Port; Trigger-Delegation; Scoped DI PASS | Review / merge gate |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR2_BOOTSTRAP_AND_MODULE_CYCLE_CLOSEOUT` | **DRAFT_PR #5** · Commit `f0f4da93f` (reverted on branch) | Experiment: PlatformAdmin/VI-cycle; **nicht** P2-PR2-Scope | Separates Follow-up |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR2_SCOPE_RECOVERY` | **DRAFT_PR #5** · Base `af34303d8…` | P2-PR2 Scope wiederhergestellt (Port/Adapter/Call-Sites); Modulextraktionen + unrelated `forwardRef` entfernt; full VI boot **BASELINE_BLOCKED** unverändert; **kein** Prod | Merge mit Baseline-Exception |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR2` | **MERGED** · PR #5 → `main` `98a6068f8b1cceb2f8b48be5773a5f8ad6e8826b` | Recompute Port | P2-PR3 Attribution |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR3_TRIP_ATTRIBUTION_BOOKING_DECOUPLING` | **DRAFT_PR #6** · Base `98a6068f8…` | TripAttribution → `TripBookingOverlapPort`; **kein** Schema/Deploy | Review |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR3` | **MERGED** · PR #6 → `main` `3c55761682812c086d8dc3c056ea1345ca5151f6` | Attribution Booking-Port | P2-PR4 Recompute |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_REMAINING_COUPLING_AND_CUTOVER_AUDIT` | **READ_ONLY** · `main` `3c5576168…` | DESIGN_READY; 3 nächste PRs identifiziert | P2-PR4 |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR4_REMAINING_RECOMPUTE_CALLS` | **DRAFT_PR #7** · Base `3c5576168…` | Recompute Port +3 notifications; 3 Core-Trigger-Imports entfernt; Registry unverändert | Review |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR4` | **MERGED** · PR #7 → `main` `d5b52856921a928fb3c22456f0b855f35a2677d5` | Recompute fan-out | P2-PR5 DriverAttribution |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR5_DRIVER_ATTRIBUTION_BOOKING_DECOUPLING` | **DRAFT_PR #8** · Base `d5b528569…` | Overlap-Port für Attribution/Handover/Driver-Pool; **kein** Schema | Review |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR5` | **MERGED** · PR #8 → `main` `263c6d84c56936549300517dd4926307b121cee1` | DriverAttribution Booking-Port | P2-PR6 Jobs |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR6_JOB_BOOKING_VALIDATION_DECOUPLING` | **DRAFT_PR #9** · Base `263c6d84c…` | Job repo booking validation via Overlap-Port | Review |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR6` | **MERGED** · PR #9 → `main` `1c96544f9e19f4b4367c79b2527982f3aaded5a0` | Job booking assert via Overlap-Port | P2-PR7 Reconciliation |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_POST_PR6_REMAINING_RENTAL_COUPLING_AUDIT` | **READ_ONLY** · `main` `1c96544f9…` | P2-PR7 Scope bestätigt | P2-PR7 Implementierung |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR7_RENTAL_RECONCILIATION_PORT` | **DRAFT_PR #10** · Base `1c96544f9…` | Rental reconciliation port; kein Schema | Review |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR7` | **MERGED** · PR #10 → `main` `35fdb1a24c131961ffe2d2c15aceed00cdef1fc1` | Rental reconciliation port | P2-PR8 Handler |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR8_RENTAL_JOB_HANDLER_DECOUPLING` | **DRAFT_PR #11** · Base `35fdb1a24…` | Job handler port; fail-closed rental dispatch | Review |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_PR8` | **MERGED** · PR #11 → `main` `1ccb2bf1b31450bca5def6c47ef759fa2350f1d1` | Job handler port | P6 RentalTripLink |
| 2026-11-12 | `SYNQDRIVE_CORE_P2_POST_PR8_TRIP_BOOKING_OWNERSHIP_PREFLIGHT` | **READ_ONLY** · `main` `1ccb2bf1b…` | Legacy read/write map; P6 scope bestätigt | P6-PR1 Foundation |
| 2026-11-12 | `SYNQDRIVE_CORE_P6_RENTAL_TRIP_LINK_OWNER_RFC` | **DESIGN_APPROVED** | Overlay owner RFC; current-row invariant | P6-PR1 Implementierung |
| 2026-11-12 | `SYNQDRIVE_CORE_P6_PR1_RENTAL_TRIP_LINK_FOUNDATION` | **MERGED** · PR #12 → `main` `07e09b434…` | Schema + Resolver + backfill dry-run | P6-PR2 analyzer |
| 2026-11-12 | `SYNQDRIVE_CORE_P6_G2_BACKFILL_READINESS_AUDIT` | **READ_ONLY** | G2 BLOCKED — keine repräsentative Datenquelle | P6-PR2 |
| 2026-11-12 | `SYNQDRIVE_CORE_P6_PR2_BACKFILL_ANALYZER_HARDENING` | **DRAFT_PR** · Base `07e09b434…` | Paging + classify + bulk reads | G2 data evidence |
| 2026-11-12 | `SYNQDRIVE_CORE_P6_PR1_ARCHITECTURE_REMEDIATION` | **DRAFT_PR #12** (update) | Supersession fix, CHECK/RESTRICT, backfill SKIP semantics | PG gate (isolated) |
| 2026-11-13 | `SYNQDRIVE_CORE_P6_PR2_BACKFILL_ANALYZER_HARDENING` | **MERGED PR #13** · Base `07e09b434…` | Analyzer paging/classify; G2 tooling | G2 data evidence |
| 2026-11-13 | `SYNQDRIVE_CORE_P3_PR1_VERSIONED_VEHICLE_READ_API` | **DRAFT_PR** · Base `93ded35cdd76d60470080806d8b15958ffc8f930` | Core vehicle read v1 API; M2M unchanged | Architect review |
| 2026-11-13 | `SYNQDRIVE_CORE_P3_PR1_FINAL_CONTRACT_CLOSEOUT` | **DRAFT_PR #14** update | Product-scope contract; pagination 400; stable sort | Architect review |
| 2026-11-13 | `SYNQDRIVE_CORE_P3_PR2_VERSIONED_TRIP_READ_API` | **DRAFT_PR** · Base `1dcd03083…` | Trip read v1; private trip exclude; M2M unchanged | Architect review |
| 2026-11-13 | `SYNQDRIVE_CORE_P3_PR2_OPUS_REMEDIATION` | **DRAFT_PR #15** update · Head vorher `bf9fbc6e4…` | F1 isPrivateTrip-Filter entfernt + Vertrag dokumentiert; F2 Gap-Split-Suffix-Ausblendung (Liste/Count/Detail); F3 Same-Org-Vehicle-Binding-Tests | Architect review |
| 2026-11-13 | `SYNQDRIVE_CORE_P3_PR3_VERSIONED_DRIVING_ASSESSMENT_READ_API` | **DRAFT_PR** · Base `e60949ebe…` | Driving assessment read v1; DS4 L2 metadata only; score publication gate; trip visibility parity; M2M unchanged | Architect review |

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
5. Das Workstream-Gate ermitteln: P0/P1-Design abgeschlossen; **P1A MERGED** (PR #2); **P1B-PR1 MERGED** (PR #3 → `main` `77e9843aaafa7210e75a03ba80898f0a62fc9e20`); **P2 Trip/Booking** läuft (P2-PR1 Booking Overlap Port). M2M **nicht** produktiv aktivieren (`CORE_APP_M2M_ENABLED` default off; distributed RL = LIVE_ACTIVATION_BLOCKER).
6. Vor jeglichem Code die bereits vorhandenen Contracts, Guards, Prisma-Modelle, Outbox-, Billing- und Trip-Eigentumsgrenzen untersuchen; keine Neuentwicklung vorhandener Systeme.
7. Nur den explizit autorisierten Scope bearbeiten. Kein automatischer Merge/Deploy/Prod-Zugriff; keine Secret-Offenlegung; keine Änderungen in Alpha ohne Erlaubnis.
8. Abschlussreport mit OPERATION, Base/New SHA, PR, Änderungen, Tests, CI, DB/Prod-Status, Risiken, Owner-Gates ausgeben und dieses Fortschrittsjournal aktualisieren.

### Kurzkontext für neue Chats

> Wir spalten `FATIHS-MGCKS/SYNQDRIVE-alpha` in ein zentrales `FATIHS-MGCKS/SYNQDRIVE-CORE` und eigenständige **eigene** App-Repositories auf. **Aktuell:** `main` `77e9843aaafa7210e75a03ba80898f0a62fc9e20` — **P1A MERGED** (PR #2); **P1B MERGED** (PR #3, M2M foundation auf `main`, **nicht** prod-aktiviert). **P2** Trip↔Booking: P2-PR1 Booking Overlap Port (Draft-PR). M2M live = **blockiert** (distributed RL). **GitHub Actions deaktiviert**. Kein Deploy ohne Owner-Freigabe. Journal §10.

---

**Wartungsverantwortung:** Owner und jeweils ausführender Implementierungs-/Architektur-Agent. Änderungen am Masterplan sind dokumentiert und reviewbar zu halten. Der nächste Agent soll den Plan **fortschreiben**, nicht einen konkurrierenden zweiten Plan erfinden.
