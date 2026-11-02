# One Auto — Produktions-One-Shot-Attestation (OE_VIN_LOOKUP_EU)

**Isoliertes CLI.** Kein Master Admin, kein `ONEAUTO_ENABLED`, keine BullMQ/Prisma, keine automatische Registry-Promotion.

## 1. Produktions-API-Key konfigurieren

Key **niemals** als CLI-Argument übergeben. Nur Runtime-Umgebung (lokal oder geschützte Shell):

```bash
export ONEAUTO_PRODUCTION_ATTESTATION_API_KEY='<vom Owner bereitgestellt>'
```

## 2. Autorisierte VIN bereitstellen

Nur eine vom Owner freigegebene echte VIN (kein OpenAPI-Beispiel ohne Vendor-Bestätigung):

```bash
export ONEAUTO_PRODUCTION_ATTESTATION_VIN='<17-stellige VIN>'
```

## 3. Offline-Preflight (Pflicht)

Im Repository-Root, Backend:

```bash
cd backend
npm run ops:oneauto:sandbox-attestation:offline
```

Erwartung: JSON-Array aller Fixtures, **kein** Netzwerk, `attemptedOutboundRequests: 0` bei Preflight-Fehlern, `attestationEnvironment: OFFLINE`.

Einzel-Fixture:

```bash
npx ts-node scripts/ops/oneauto-p25e-c-sandbox-attestation.ts --fixture http-200-success-true --json
```

## 4. Billing-Risiko prüfen

- Produktions-Host: `api.oneautoapi.com`
- Endpoint: `GET /ezyvin/vinlookup/?vehicle_identification_number=…`
- **Ein** Request kann kostenpflichtig sein — auch bei `success: false` oder HTTP-Fehler (`billingStatus: UNKNOWN` in Evidence).
- One-Auto-Antworten zur Sandbox/PrePay-Billing abwarten oder intern dokumentieren.

## 5. Explizite Owner-Freigaben setzen

Alle Werte müssen **`1`** sein (keine Freigabe allein durch gesetzten API-Key):

```bash
export ONEAUTO_PRODUCTION_ATTESTATION_OWNER_AUTHORIZED=1
export ONEAUTO_PRODUCTION_ATTESTATION_VIN_USE_AUTHORIZED=1
export ONEAUTO_PRODUCTION_ATTESTATION_BILLING_ACK=1
export ONEAUTO_PRODUCTION_ATTESTATION_ONE_GET_CONFIRMED=1
```

## 6. Genau einen Produktions-GET ausführen

```bash
cd backend
npx ts-node scripts/ops/oneauto-p25e-c-sandbox-attestation.ts --live-production --json \
  > /tmp/oneauto-production-attestation-evidence.json
```

- Exit-Code `0` nur bei `attestationQualified: true` (HTTP 200 und `success===true`).
- Maximal **ein** outbound GET (`attemptedOutboundRequests` ≤ 1).
- Keine Retries, kein Polling, keine Callback-Query-Parameter.

## 7. Redacted Evidence prüfen

Evidence enthält **keinen** API-Key, **keine** volle VIN, **keinen** Raw-Body — nur u. a.:

- `recordedAtUtc`, `attestationEnvironment: PRODUCTION`, `targetHostname`, `httpStatus`, `envelopeSuccess`, `diagnosticCategory`, `evidenceSha256`, `vinSha256Prefix`

Evidence **nicht** automatisch committen. Optional manuell anhand `architecture/oneauto-provider/evidence/P25E_C_ATTESTATION_TEMPLATE.md` archivieren.

## Verboten

- Sandbox-Host in Produktions-Modus
- Custom `ONEAUTO_BASE_URL` / Host-Overrides
- API-Key in Logs oder Git
- Automatische `EXECUTION_VERIFIED`-Promotion aus Evidence
