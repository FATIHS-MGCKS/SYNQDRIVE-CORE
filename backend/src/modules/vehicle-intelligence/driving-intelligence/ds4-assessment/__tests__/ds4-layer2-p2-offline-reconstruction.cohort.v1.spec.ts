import {
  assertDs4Layer2P2PilotCohortIntegrityV1,
  DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1,
  DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1,
} from '../export/ds4-layer2-p2-offline-reconstruction.cohort.v1';
import { DS4_ASSESSMENT_CALIBRATION_COHORT_V1 } from '../ds4-assessment-calibration-cohort.v1';

describe('DS4 Layer-2 P2 pilot cohort', () => {
  it('pins exactly eight feasibility-audit trip identities', () => {
    assertDs4Layer2P2PilotCohortIntegrityV1();
    expect(DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1).toHaveLength(8);
    expect(new Set(DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.map((c) => c.tripId)).size).toBe(8);
  });

  it('matches Audi 4 / Tiguan 3 / Tesla 1 authority partition', () => {
    const audi = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((c) => c.vehicleLine === 'AUDI_A4');
    const tiguan = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((c) => c.vehicleLine === 'VW_TIGUAN');
    const tesla = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((c) => c.vehicleLine === 'TESLA_MODEL_3');
    expect(audi.every((c) => c.expectedSpeedAuthority === 'C4_ONLY')).toBe(true);
    expect(tiguan.every((c) => c.expectedSpeedAuthority === 'C5_1_PREFERRED')).toBe(true);
    expect(tesla.every((c) => c.expectedSpeedAuthority === 'C5_1_PREFERRED')).toBe(true);
    expect(audi).toHaveLength(4);
    expect(tiguan).toHaveLength(3);
    expect(tesla).toHaveLength(1);
  });

  it('scopes pilot organization id', () => {
    expect(DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1).toBe('faa710c9-6d91-4079-a7d5-91fdccdec14a');
  });

  it('pins expected vehicle UUIDs from DS4 calibration cohort (not display names)', () => {
    const audiVehicle = DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find((v) => v.role === 'AUDI_A4_R1')!.vehicleId;
    const tiguanVehicle = DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find((v) => v.role === 'VW_TIGUAN_R1')!.vehicleId;
    const teslaVehicle = DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find(
      (v) => v.role === 'TESLA_MODEL_3_SOFTWARE_INTEGRATION',
    )!.vehicleId;
    expect(DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((c) => c.vehicleLine === 'AUDI_A4').every(
      (c) => c.expectedVehicleId === audiVehicle,
    )).toBe(true);
    expect(DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((c) => c.vehicleLine === 'VW_TIGUAN').every(
      (c) => c.expectedVehicleId === tiguanVehicle,
    )).toBe(true);
    expect(
      DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.find((c) => c.vehicleLine === 'TESLA_MODEL_3')!.expectedVehicleId,
    ).toBe(teslaVehicle);
    expect(
      DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.find((c) => c.tripId === 'b304e9ad-0dcb-4b69-a93e-5364078a20a1')!
        .expectedSourceFamily,
    ).toBe('API_SYNTHETIC');
  });
});
