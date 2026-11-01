import type { TireCalibrationCenterTab } from './tire-calibration-center-api.types';

const TAB_IDS: TireCalibrationCenterTab[] = ['overview', 'snapshots', 'accuracy', 'quality'];

export type TireCalibrationCenterUrlState = {
  tab: TireCalibrationCenterTab;
  orgId: string | null;
  vehicleId: string | null;
  tireSetupId: string | null;
  wheelPosition: string | null;
  mountPeriodId: string | null;
  snapshotId: string | null;
};

export const EMPTY_TIRE_CALIBRATION_CENTER_URL: TireCalibrationCenterUrlState = {
  tab: 'overview',
  orgId: null,
  vehicleId: null,
  tireSetupId: null,
  wheelPosition: null,
  mountPeriodId: null,
  snapshotId: null,
};

export function readTireCalibrationCenterUrl(search: string): TireCalibrationCenterUrlState {
  const params = new URLSearchParams(search);
  const tabRaw = params.get('tccTab') ?? 'overview';
  const tab = TAB_IDS.includes(tabRaw as TireCalibrationCenterTab)
    ? (tabRaw as TireCalibrationCenterTab)
    : 'overview';

  return {
    tab,
    orgId: params.get('orgId'),
    vehicleId: params.get('vehicleId'),
    tireSetupId: params.get('tireSetupId'),
    wheelPosition: params.get('wheelPosition'),
    mountPeriodId: params.get('mountPeriodId'),
    snapshotId: params.get('snapshotId'),
  };
}

export function writeTireCalibrationCenterUrl(
  state: TireCalibrationCenterUrlState,
  replace = false,
): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('view', 'tire-v3-calibration-center');
  params.set('tccTab', state.tab);
  if (state.orgId) params.set('orgId', state.orgId);
  else params.delete('orgId');
  if (state.vehicleId) params.set('vehicleId', state.vehicleId);
  else params.delete('vehicleId');
  if (state.tireSetupId) params.set('tireSetupId', state.tireSetupId);
  else params.delete('tireSetupId');
  if (state.wheelPosition) params.set('wheelPosition', state.wheelPosition);
  else params.delete('wheelPosition');
  if (state.mountPeriodId) params.set('mountPeriodId', state.mountPeriodId);
  else params.delete('mountPeriodId');
  if (state.snapshotId) params.set('snapshotId', state.snapshotId);
  else params.delete('snapshotId');

  const next = `${window.location.pathname}?${params.toString()}`;
  if (replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
}

export function patchTireCalibrationCenterUrl(
  patch: Partial<TireCalibrationCenterUrlState>,
  replace = true,
): TireCalibrationCenterUrlState {
  const current = readTireCalibrationCenterUrl(window.location.search);
  const next = { ...current, ...patch };
  writeTireCalibrationCenterUrl(next, replace);
  return next;
}
