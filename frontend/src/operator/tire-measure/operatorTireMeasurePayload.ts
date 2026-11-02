import { api } from '../../lib/api';
import type {
  OperatorTireContextForm,
  OperatorTireSetupOption,
  OperatorTireTreadForm,
} from './operatorTireMeasure.types';
import { parseTreadMm, SEASON_LABELS } from './operatorTireMeasure.utils';

export function resolveActiveTireSetup(setupsRaw: unknown): Record<string, unknown> | null {
  const setups = Array.isArray(setupsRaw) ? setupsRaw : [];
  return (
    (setups.find((s) => s?.status === 'ACTIVE' && !s?.removedAt) as Record<string, unknown> | undefined) ??
    (setups.find((s) => s?.status === 'ACTIVE') as Record<string, unknown> | undefined) ??
    (setups.find((s) => !s?.removedAt) as Record<string, unknown> | undefined) ??
    (setups[0] as Record<string, unknown> | undefined) ??
    null
  );
}

export function buildTireSetupOptions(setupsRaw: unknown): OperatorTireSetupOption[] {
  const setups = Array.isArray(setupsRaw) ? setupsRaw : [];
  const active = resolveActiveTireSetup(setupsRaw);
  const activeId = active?.id ? String(active.id) : null;

  const options: OperatorTireSetupOption[] = setups
    .filter((s) => s && typeof s === 'object' && s.id)
    .map((s) => {
      const row = s as Record<string, unknown>;
      const season = row.tireSeason ? String(row.tireSeason) : null;
      const seasonLabel = season ? (SEASON_LABELS[season] ?? season) : 'Unbekannt';
      const brand = [row.brandModelFront, row.brandModelRear].filter(Boolean).join(' / ');
      const name = row.name ? String(row.name) : brand || seasonLabel;
      const status = row.status ? String(row.status) : '';
      const isActive = activeId != null && String(row.id) === activeId;
      return {
        id: String(row.id),
        label: `${name}${status === 'STORED' ? ' (gelagert)' : isActive ? ' (montiert)' : ''}`,
        season,
        isActive,
      };
    });

  if (options.length === 0) {
    options.push({ id: '__unknown__', label: 'Unbekannt — kein Reifenset hinterlegt', season: null, isActive: false });
  }

  return options;
}

export function defaultTireSetupSelection(options: OperatorTireSetupOption[]): string {
  const active = options.find((o) => o.isActive);
  if (active) return active.id;
  if (options.length === 1) return options[0]!.id;
  return options[0]!.id;
}

export async function submitOperatorTireMeasurement(params: {
  vehicleId: string;
  tireSetupId: string | null;
  tread: OperatorTireTreadForm;
  context: OperatorTireContextForm;
}): Promise<{ v3Ingestion?: { warnings?: Array<{ code: string }>; evidenceClass?: string } }> {
  const { vehicleId, tireSetupId, tread, context } = params;
  const treadPayload = {
    frontLeftMm: parseTreadMm(tread.fl),
    frontRightMm: parseTreadMm(tread.fr),
    rearLeftMm: parseTreadMm(tread.rl),
    rearRightMm: parseTreadMm(tread.rr),
    source: context.source,
    workshopName: context.workshopName.trim() || undefined,
  };

  const odometerRaw = context.odometerKm.trim().replace(',', '.');
  const odometer = odometerRaw ? parseFloat(odometerRaw) : undefined;

  const useSetupEndpoint =
    tireSetupId != null &&
    tireSetupId !== '__unknown__' &&
    context.measuredAt.trim().length > 0;

  const manualConfirmOdometer =
    context.source === 'workshop' ||
    (context.source === 'manual' && context.confirmOdometerKm);

  if (useSetupEndpoint) {
    const measuredAt = new Date(context.measuredAt);
    return api.vehicleIntelligence.addTireMeasurement(vehicleId, tireSetupId!, {
      ...treadPayload,
      odometerAtMeasurement: Number.isFinite(odometer!) ? odometer : undefined,
      measuredAt: measuredAt.toISOString(),
      manualConfirmOdometer: manualConfirmOdometer || undefined,
    });
  }

  return api.vehicleIntelligence.addTireHealthMeasurement(vehicleId, {
    ...treadPayload,
    odometerKm: Number.isFinite(odometer!) ? odometer : undefined,
    measuredAt: context.measuredAt.trim() ? new Date(context.measuredAt).toISOString() : undefined,
    manualConfirmOdometer: manualConfirmOdometer || undefined,
  });
}

export function dispatchTireMeasurementSaved(vehicleId: string, bookingId?: string): void {
  window.dispatchEvent(
    new CustomEvent('operator:tire-measurement-saved', {
      detail: { vehicleId, bookingId },
    }),
  );
}
