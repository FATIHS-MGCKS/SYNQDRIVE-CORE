import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import {
  pickBrakeReferenceSpecRowForEdit,
  pickLvBatterySpecRowForEdit,
  upsertBrakeReferenceSpecOnEdit,
  upsertLvBatterySpecOnEdit,
} from './master-vehicle-manual-baseline-edit.util';

vi.mock('../../lib/api', () => ({
  api: {
    vehicleIntelligence: {
      battery: vi.fn(),
      createBatterySpec: vi.fn(),
      updateBatterySpec: vi.fn(),
      brakes: vi.fn(),
      createBrakeSpec: vi.fn(),
      updateBrakeSpec: vi.fn(),
    },
  },
}));

describe('master-vehicle-manual-baseline-edit.util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pickLvBatterySpecRowForEdit prefers MANUAL then newest', () => {
    const row = pickLvBatterySpecRowForEdit([
      { id: 'a', sourceType: 'ENRICHMENT', createdAt: '2026-02-01' },
      { id: 'b', sourceType: 'MANUAL', createdAt: '2026-01-01' },
      { id: 'c', sourceType: 'MANUAL', createdAt: '2026-03-01' },
    ]);
    expect(row?.id).toBe('c');
  });

  it('pickBrakeReferenceSpecRowForEdit prefers user-confirmed row', () => {
    const row = pickBrakeReferenceSpecRowForEdit([
      { id: 'new', createdAt: '2026-03-01' },
      { id: 'confirmed', userConfirmedAt: '2026-01-01', createdAt: '2026-01-01' },
    ]);
    expect(row?.id).toBe('confirmed');
  });

  it('upsertLvBatterySpecOnEdit updates when a row exists', async () => {
    vi.mocked(api.vehicleIntelligence.battery).mockResolvedValueOnce([
      { id: 'bat-1', sourceType: 'MANUAL', createdAt: '2026-01-01' },
    ]);
    vi.mocked(api.vehicleIntelligence.updateBatterySpec).mockResolvedValueOnce({});

    await upsertLvBatterySpecOnEdit('veh-1', {
      batteryType: 'AGM',
      batteryAmpere: 70,
      batteryVolt: 12,
    });

    expect(api.vehicleIntelligence.updateBatterySpec).toHaveBeenCalledWith(
      'veh-1',
      'bat-1',
      expect.objectContaining({ batteryType: 'AGM', sourceType: 'MANUAL' }),
    );
    expect(api.vehicleIntelligence.createBatterySpec).not.toHaveBeenCalled();
  });

  it('upsertLvBatterySpecOnEdit creates when no row exists', async () => {
    vi.mocked(api.vehicleIntelligence.battery).mockResolvedValueOnce([]);
    vi.mocked(api.vehicleIntelligence.createBatterySpec).mockResolvedValueOnce({});

    await upsertLvBatterySpecOnEdit('veh-1', { batteryType: 'EFB', batteryAmpere: 60, batteryVolt: 12 });

    expect(api.vehicleIntelligence.createBatterySpec).toHaveBeenCalled();
    expect(api.vehicleIntelligence.updateBatterySpec).not.toHaveBeenCalled();
  });

  it('upsertBrakeReferenceSpecOnEdit updates confirmed row without changing sourceType', async () => {
    vi.mocked(api.vehicleIntelligence.brakes).mockResolvedValueOnce([
      { id: 'brk-1', userConfirmedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01' },
    ]);
    vi.mocked(api.vehicleIntelligence.updateBrakeSpec).mockResolvedValueOnce({});

    await upsertBrakeReferenceSpecOnEdit('veh-1', { frontPadThickness: 11 });

    expect(api.vehicleIntelligence.updateBrakeSpec).toHaveBeenCalledWith(
      'veh-1',
      'brk-1',
      expect.objectContaining({ frontPadThickness: 11, sourceConfidence: 1 }),
    );
    expect(api.vehicleIntelligence.updateBrakeSpec).toHaveBeenCalledWith(
      'veh-1',
      'brk-1',
      expect.not.objectContaining({ sourceType: expect.anything() }),
    );
  });

  it('upsertBrakeReferenceSpecOnEdit creates when no reference row exists', async () => {
    vi.mocked(api.vehicleIntelligence.brakes).mockResolvedValueOnce([]);
    vi.mocked(api.vehicleIntelligence.createBrakeSpec).mockResolvedValueOnce({});

    await upsertBrakeReferenceSpecOnEdit('veh-1', { frontPadThickness: 10 });

    expect(api.vehicleIntelligence.createBrakeSpec).toHaveBeenCalledWith(
      'veh-1',
      expect.objectContaining({ sourceType: 'manual_edit', frontPadThickness: 10 }),
    );
  });
});
