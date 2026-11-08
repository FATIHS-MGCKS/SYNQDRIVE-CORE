import type { OneAutoOeServiceScheduleService } from '../../../../oneauto-provider/service-schedule/oneauto-service-schedule-eu.types';
import { mapOneAutoScheduleToPositions } from './oneauto-schedule.adapter';

/** Production-shaped fixture (field-level shape of the stored OE_SERVICE_SCHEDULE callback, no identifiers). */
function oilService(id: string): OneAutoOeServiceScheduleService {
  return {
    service_id: id,
    service_interval_desc: 'every 24 months,regardless of mileage',
    service_months: 24,
    service_kms: null as unknown as number,
    service_description: 'Oil service',
    service_tasks: [
      { task_id: '1', task_description: 'Engine Oil', task_action: 'Replace' },
      { task_id: '2', task_description: 'Oil Filter', task_action: 'Replace' },
      { task_id: '3', task_description: 'Sealing Plug - oil sump', task_action: 'Replace' },
    ],
  };
}

function inspectionService(id: string): OneAutoOeServiceScheduleService {
  return {
    service_id: id,
    service_interval_desc: 'every 30000 km or 24 months',
    service_months: 24,
    service_kms: 30000,
    service_description: 'Inspection service',
    service_tasks: Array.from({ length: 40 }, (_, i) => ({
      task_id: String(i),
      task_description: i === 0 ? 'Engine Oil' : `Check item ${i}`,
      task_action: i === 0 ? 'Replace' : 'Check',
    })),
  };
}

function combinedService(id: string): OneAutoOeServiceScheduleService {
  return {
    service_id: id,
    service_interval_desc: 'Oil and inspection service combined',
    service_months: null as unknown as number,
    service_kms: null as unknown as number,
    service_description: 'Oil and inspection service combined',
    service_tasks: Array.from({ length: 41 }, (_, i) => ({ task_id: String(i), task_description: `Item ${i}` })),
  };
}

function extra(id: string, desc: string, months: number | null, kms: number | null, component: string): OneAutoOeServiceScheduleService {
  return {
    service_id: id,
    service_interval_desc: desc,
    service_months: months as unknown as number,
    service_kms: kms as unknown as number,
    service_description: component,
    service_tasks: [{ task_id: '1', task_description: component, task_action: 'Replace' }],
  };
}

describe('mapOneAutoScheduleToPositions', () => {
  it('maps recurring intervals, classifies kinds, skips unscheduled and collapses duplicate variants', () => {
    const result = mapOneAutoScheduleToPositions({
      normalServices: [
        oilService('SID1001'),
        inspectionService('SID1002'),
        combinedService('SID1003'),
        oilService('SID1004'),
        inspectionService('SID1005'),
        combinedService('SID1006'),
      ],
      extraServices: [
        extra('SID1010', 'every 36 months,regardless of mileage', 36, null, 'Brake Fluid'),
        extra('SID1011', 'every 60000 km or 24 months', 24, 60000, 'Interior air filter'),
        extra('SID1012', 'every 60000 km or 48 months', 48, 60000, 'Spark Plug'),
        extra('SID1013', 'every 90000 km or 72 months', 72, 90000, 'Air Filter'),
        extra('SID1014', 'every 120000 km,regardless of elapsed time', null, 120000, 'Automatic Transmission Oil'),
        extra('SID1020', 'every 36 months,regardless of mileage', 36, null, 'Brake Fluid'),
      ],
    });

    const byId = Object.fromEntries(result.positions.map((p) => [p.positionId, p]));

    expect(byId['oneauto:SID1001']).toMatchObject({
      kind: 'OIL_CHANGE',
      intervalMode: 'RECURRING',
      intervalKm: null,
      intervalMonths: 24,
      scheduleSource: 'ONEAUTO_SCHEDULE',
    });
    expect(byId['oneauto:SID1002']).toMatchObject({ kind: 'INSPECTION', intervalKm: 30000, intervalMonths: 24 });
    expect(byId['oneauto:SID1003']).toBeUndefined();
    expect(result.unscheduledPositions).toEqual([
      { positionId: 'oneauto:SID1003', label: 'Oil and inspection service combined', scheduleSource: 'ONEAUTO_SCHEDULE' },
    ]);

    expect(byId['oneauto:SID1010']).toMatchObject({ kind: 'OTHER', intervalKm: null, intervalMonths: 36, componentTerms: ['brake_fluid'] });
    expect(byId['oneauto:SID1011']!.componentTerms).toEqual(['cabin_filter']);
    expect(byId['oneauto:SID1012']!.componentTerms).toEqual(['spark_plug']);
    expect(byId['oneauto:SID1013']!.componentTerms).toEqual(['air_filter']);
    expect(byId['oneauto:SID1014']).toMatchObject({ intervalKm: 120000, intervalMonths: null, componentTerms: ['transmission_oil'] });

    // duplicates collapsed: SID1004-1006 and SID1020
    expect(byId['oneauto:SID1004']).toBeUndefined();
    expect(byId['oneauto:SID1020']).toBeUndefined();
    expect(result.positions).toHaveLength(7);
    expect(result.flags).toEqual(expect.arrayContaining(['SCHEDULE_VARIANTS_COLLAPSED', 'SCHEDULE_POSITION_UNSCHEDULED']));
  });

  it('never produces ABSOLUTE_MILESTONE positions from OneAuto data', () => {
    const result = mapOneAutoScheduleToPositions({ normalServices: [inspectionService('X')], extraServices: [] });
    expect(result.positions.every((p) => p.intervalMode === 'RECURRING')).toBe(true);
  });
});
