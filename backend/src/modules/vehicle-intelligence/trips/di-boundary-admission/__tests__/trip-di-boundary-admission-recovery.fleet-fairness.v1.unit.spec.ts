import { rotateTripDiBoundaryAdmissionRecoveryFleetVehiclesV1 } from '../trip-di-boundary-admission-recovery.fleet-fairness.v1';

describe('trip-di-boundary-admission-recovery.fleet-fairness.v1', () => {
  const fleet = [
    { organizationId: 'org-a', vehicleId: 'veh-1' },
    { organizationId: 'org-a', vehicleId: 'veh-2' },
    { organizationId: 'org-b', vehicleId: 'veh-3' },
  ];

  it('rotates start index by pass seed so each vehicle leads over consecutive passes', () => {
    const leaders = new Set<string>();
    for (let seed = 0; seed < fleet.length; seed += 1) {
      const rotated = rotateTripDiBoundaryAdmissionRecoveryFleetVehiclesV1(fleet, seed);
      leaders.add(rotated[0]!.vehicleId);
    }
    expect(leaders.size).toBe(fleet.length);
  });

  it('visits every vehicle when budget allows one writer attempt per pass', () => {
    const visited = new Set<string>();
    for (let seed = 0; seed < fleet.length; seed += 1) {
      const rotated = rotateTripDiBoundaryAdmissionRecoveryFleetVehiclesV1(fleet, seed);
      visited.add(rotated[0]!.vehicleId);
    }
    expect([...visited].sort()).toEqual(['veh-1', 'veh-2', 'veh-3']);
  });
});
