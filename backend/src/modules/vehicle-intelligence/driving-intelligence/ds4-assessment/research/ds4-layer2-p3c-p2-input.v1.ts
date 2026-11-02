import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
  DS4_LAYER2_P2_PINNED_11_EXCLUDED_VEHICLE_IDS_V1,
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1,
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
} from './ds4-layer2-p2-pinned-11.attestation.v1';

function sha256File(path: string): string {
  const content = readFileSync(path);
  return createHash('sha256').update(content).digest('hex');
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsvWithHeader(content: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = parseCsvLine(lines[0]!);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    columns.forEach((col, idx) => {
      row[col] = cells[idx] ?? '';
    });
    return row;
  });
  return { columns, rows };
}

export function assertDs4Layer2P2Pinned11PreflightV1(p2Dir: string): {
  p2EvaluationCodeSha: string;
  admissibleEventCount: number;
  tripIds: readonly string[];
} {
  for (const [file, expected] of Object.entries(DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1)) {
    const actual = sha256File(join(p2Dir, file));
    if (actual !== expected) {
      throw new Error(`P2 pinned checksum mismatch for ${file}: expected ${expected}, got ${actual}`);
    }
  }

  const manifest = JSON.parse(readFileSync(join(p2Dir, 'p2_manifest.json'), 'utf8')) as {
    evaluationCodeSha?: string;
    manifestChecksumSha256?: string;
  };
  if (manifest.evaluationCodeSha !== DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1) {
    throw new Error(
      `P2 evaluationCodeSha mismatch: expected ${DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1}, got ${manifest.evaluationCodeSha ?? 'null'}`,
    );
  }
  if (manifest.manifestChecksumSha256 !== DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1) {
    throw new Error('P2 manifestChecksumSha256 mismatch for pinned 11-trip cohort');
  }

  const events = parseCsvWithHeader(readFileSync(join(p2Dir, 'p2_longitudinal_events.csv'), 'utf8'));
  if (events.rows.length !== DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1) {
    throw new Error(
      `Expected ${DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1} admissible P2 events, got ${events.rows.length}`,
    );
  }

  const assessments = parseCsvWithHeader(
    readFileSync(join(p2Dir, 'p2_reconstructed_assessments.csv'), 'utf8'),
  );
  const vehicleIds = new Set(assessments.rows.map((r) => r.vehicle_id));
  for (const excluded of DS4_LAYER2_P2_PINNED_11_EXCLUDED_VEHICLE_IDS_V1) {
    if (vehicleIds.has(excluded)) {
      throw new Error(`Arteon vehicle ${excluded} must not appear in pinned P2 cohort`);
    }
  }

  const tripIds = new Set(assessments.rows.map((r) => r.trip_id));
  for (const expectedTrip of DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1) {
    if (!tripIds.has(expectedTrip)) {
      throw new Error(`Pinned trip missing from P2 assessments: ${expectedTrip}`);
    }
  }

  return {
    p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
    admissibleEventCount: events.rows.length,
    tripIds: DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1,
  };
}

export function loadDs4Layer2P2PinnedInputsFromDirV1(p2Dir: string): {
  admissibleEvents: import('./ds4-layer2-p3c-physics-diagnostics.v1.contract').Ds4Layer2P2AdmissibleEventRowV1[];
  assessmentTrips: import('./ds4-layer2-p3c-physics-diagnostics.v1.contract').Ds4Layer2P2AssessmentTripRowV1[];
} {
  assertDs4Layer2P2Pinned11PreflightV1(p2Dir);

  const assessments = parseCsvWithHeader(
    readFileSync(join(p2Dir, 'p2_reconstructed_assessments.csv'), 'utf8'),
  );
  const assessmentByTrip = new Map(
    assessments.rows.map((r) => [
      r.trip_id,
      {
        tripId: r.trip_id,
        vehicleId: r.vehicle_id,
        organizationId: r.organization_id,
        evaluationCodeSha: r.evaluation_code_sha,
        offlineReconstructionKey: r.offline_reconstruction_key,
        exposureSeconds: Number(r.exposure_seconds_Es),
        distanceKm: Number(r.distance_km_D),
        accelSpecificImpulseMps: r.accel_B_k_mps === '' ? null : Number(r.accel_B_k_mps),
        brakeSpecificImpulseMps: r.brake_B_k_mps === '' ? null : Number(r.brake_B_k_mps),
      },
    ]),
  );

  const events = parseCsvWithHeader(readFileSync(join(p2Dir, 'p2_longitudinal_events.csv'), 'utf8'));
  const admissibleEvents = events.rows.map((r) => {
    const trip = assessmentByTrip.get(r.trip_id)!;
    return {
      offlineReconstructionKey: r.offline_reconstruction_key,
      tripId: r.trip_id,
      vehicleId: trip.vehicleId,
      sourceMotionRunId: r.source_motion_run_id,
      eventIndex: Number(r.event_index),
      eventKind: r.event_kind,
      startLabelUtc: r.start_label_utc,
      endLabelUtc: r.end_label_utc,
      durationS: Number(r.duration_s),
      eligibilityClassification: r.eligibility_classification,
      meanAccelMps2: r.mean_accel_mps2 === '' ? null : Number(r.mean_accel_mps2),
      eventQuality: r.event_quality || null,
      speedAuthority: r.speed_authority || null,
    };
  });

  return {
    admissibleEvents,
    assessmentTrips: [...assessmentByTrip.values()],
  };
}
