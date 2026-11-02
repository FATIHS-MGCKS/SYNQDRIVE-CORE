/**
 * Replay P0-a matrix assembly from exported production bundle JSON (read-only export).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assembleVsiP0aMatrixDocument,
  type VsiP0aProfileAuditBundle,
} from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-signal-integrity-audit.engine';
import {
  formatVsiP0aMatrixJson,
  formatVsiP0aMatrixMarkdown,
} from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-signal-integrity-audit.format';
import { VSI_P0A_DEFAULT_COHORT_V1 } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-audit-cohort.v1';
import type { VsiP0aProductionVerification } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-signal-integrity-audit.types';

type ExportRow = {
  vehicle: {
    id: string;
    label: string;
    powertrainClass: 'ICE' | 'EV';
    modality: string;
  };
  link: { id: string; provider: string; source_subtype: string | null };
  profile: {
    evaluated_at: string;
    last_materialized_provider_fetch_at: string | null;
    signals_snapshot: unknown;
    provider_source_link_id: string;
    provider_identity: string;
    profile_revision: number;
    profile_contract_version: string;
    profile_limitations: unknown;
    content_fingerprint: string;
    last_materialized_source_timestamp: string | null;
  };
};

function mapExportToBundle(row: ExportRow): VsiP0aProfileAuditBundle {
  const cohortVehicle = VSI_P0A_DEFAULT_COHORT_V1.vehicles.find((v) => v.vehicleId === row.vehicle.id);
  return {
    vehicle: cohortVehicle ?? {
      vehicleId: row.vehicle.id,
      vehicleLabel: row.vehicle.label,
      make: '',
      model: '',
      fuelType: null,
      powertrainClass: row.vehicle.powertrainClass,
      providerModality: row.vehicle.modality,
    },
    sourceLinkId: row.link.id,
    provider: row.link.provider,
    providerModality: row.vehicle.modality,
    profileRow: {
      evaluatedAt: new Date(row.profile.evaluated_at),
      lastMaterializedProviderFetchAt: row.profile.last_materialized_provider_fetch_at
        ? new Date(row.profile.last_materialized_provider_fetch_at)
        : null,
      signalsSnapshot: row.profile.signals_snapshot,
      providerSourceLinkId: row.profile.provider_source_link_id,
      providerIdentity: row.profile.provider_identity,
      profileRevision: row.profile.profile_revision,
      profileContractVersion: row.profile.profile_contract_version,
      profileLimitations: row.profile.profile_limitations,
      contentFingerprint: row.profile.content_fingerprint,
      lastMaterializedSourceTimestamp: row.profile.last_materialized_source_timestamp
        ? new Date(row.profile.last_materialized_source_timestamp)
        : null,
    },
    hfBySignal: {},
    verificationPartial: false,
  };
}

async function main() {
  const inPath = process.argv[2];
  const outDir = process.argv[3];
  if (!inPath || !outDir) {
    throw new Error('usage: replay.ts <bundles.json> <outDir>');
  }
  const raw = fs.readFileSync(inPath, 'utf8');
  const rows = JSON.parse(raw) as ExportRow[];
  const pv: VsiP0aProductionVerification = JSON.parse(
    process.env.VSI_P0A_PRODUCTION_VERIFICATION_JSON ?? '{}',
  ) as VsiP0aProductionVerification;

  const doc = assembleVsiP0aMatrixDocument({
    auditExecutedAt: new Date(process.env.VSI_P0A_AUDIT_AT ?? new Date().toISOString()),
    auditTimezone: 'Europe/Berlin',
    productionVerification: pv,
    cohort: VSI_P0A_DEFAULT_COHORT_V1,
    bundles: rows.map(mapExportToBundle),
  });

  fs.mkdirSync(outDir, { recursive: true });
  const dateSlug = doc.auditExecutedAt.slice(0, 10);
  const mdPath = path.join(outDir, `SIGNAL_INTEGRITY_MATRIX_${dateSlug}.md`);
  const jsonPath = path.join(outDir, `SIGNAL_INTEGRITY_MATRIX_${dateSlug}.json`);
  fs.writeFileSync(mdPath, formatVsiP0aMatrixMarkdown(doc), 'utf8');
  fs.writeFileSync(jsonPath, formatVsiP0aMatrixJson(doc), 'utf8');
  process.stdout.write(`${JSON.stringify({ mdPath, jsonPath, summary: doc.summary })}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e));
  process.exit(1);
});
