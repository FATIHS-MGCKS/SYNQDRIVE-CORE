import { describe, expect, it, vi } from 'vitest';
import { buildOemFieldSavePatch } from './connected-vehicle-oem-specifications.util';
import { saveMasterVehicleOemSpecificationField } from './master-vehicle-oem-specification';

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { api } from '../../lib/api';

describe('master-vehicle-oem-specification', () => {
  it('PATCHes single OEM field with confirmedFieldKeys', async () => {
    await saveMasterVehicleOemSpecificationField({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      fieldKey: 'oemTransmissionCode',
      value: '0D9',
      userConfirmed: true,
    });
    expect(api.vehicles.update).toHaveBeenCalledWith(
      'org-1',
      'veh-1',
      buildOemFieldSavePatch('oemTransmissionCode', '0D9', true),
    );
  });
});
