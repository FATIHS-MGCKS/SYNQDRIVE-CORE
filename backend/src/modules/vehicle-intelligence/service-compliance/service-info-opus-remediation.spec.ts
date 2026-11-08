import { computeMaintenanceForecast } from './maintenance-forecast/maintenance-forecast.engine';
import {
  evaluateServiceComplianceRentalBlocking,
  isHmServiceOverdue,
} from './service-compliance-rental-blocking.policy';
import { projectServiceComplianceOverdueNotifications } from '../../notifications/adapters/service-compliance-notification.projector';
import { eventCoversPosition, isEngineOilChangeWorkItem } from './maintenance-forecast/maintenance-coverage.util';
import type { MaintenanceEvidenceEvent, MaintenanceSchedulePosition } from './maintenance-forecast/maintenance-forecast.types';
import { ServiceComplianceService } from './service-compliance.service';
import type { ServiceComplianceEvaluation } from './service-compliance.types';
import { buildComplianceInsightCandidates } from './service-compliance-operational.signals';
import { InsightType } from '@prisma/client';

const NOW = new Date('2026-11-08T12:00:00.000Z');

function oilPosition(intervalKm = 15_000): MaintenanceSchedulePosition {
  return {
    positionId: 'manual:oil_change',
    kind: 'OIL_CHANGE',
    label: 'OIL_CHANGE',
    intervalMode: 'RECURRING',
    intervalKm,
    intervalMonths: 12,
    componentTerms: [],
    scheduleSource: 'MANUAL_INTERVAL',
    rawIntervalDescription: null,
  };
}

function baseThresholds() {
  return {
    warningKm: 1500,
    warningDays: 30,
    odometerStaleDays: 14,
    conflictKmTolerance: 1000,
    conflictDaysTolerance: 30,
  };
}

describe('SERVICE_INFO_V2_OPUS_REMEDIATION regressions', () => {
  describe('HIGH-1 — oil master-data bypass closed', () => {
    it('does not baseline OIL_CHANGE from vehicle master data when events lack engine-oil proof', () => {
      const result = computeMaintenanceForecast({
        now: NOW,
        positions: [oilPosition()],
        events: [
          {
            eventId: 'e1',
            eventType: 'OIL_CHANGE',
            eventDate: new Date('2026-06-01T00:00:00.000Z'),
            odometerKm: 80_000,
            performedWork: ['Rear axle: Oil change.'],
            serviceKind: null,
            eventSource: 'SERVICE_EVENT_ONEAUTO',
          },
        ],
        masterDataBaselines: {
          inspection: { date: null, odometerKm: null },
          oilChange: { date: new Date('2026-06-01T00:00:00.000Z'), odometerKm: 80_000 },
        },
        odometer: { km: 85_000, observedAt: NOW, source: 'VEHICLE_LATEST_STATE' },
        hm: null,
        thresholds: baseThresholds(),
      });
      const pos = result.positions[0]!;
      expect(pos.dueState).toBe('NO_BASELINE');
      expect(pos.baseline).toBeNull();
      expect(pos.dataQuality).not.toContain('BASELINE_FROM_MASTER_DATA');
    });

    it('still baselines OIL_CHANGE from proven structured work or explicit manual entry', () => {
      expect(isEngineOilChangeWorkItem('Motoröl erneuert')).toBe(true);
      expect(isEngineOilChangeWorkItem('Engine oil and filter replaced')).toBe(true);
      const ev: MaintenanceEvidenceEvent = {
        eventId: 'm1',
        eventType: 'OIL_CHANGE',
        eventDate: new Date('2026-06-01T00:00:00.000Z'),
        odometerKm: 50_000,
        performedWork: [],
        serviceKind: null,
        eventSource: 'SERVICE_EVENT_MANUAL',
      };
      expect(eventCoversPosition(ev, oilPosition())).toBe(true);
    });
  });

  describe('HIGH-2 — computed forecast is advisory for rental/notifications', () => {
    const computedOverdueEval: ServiceComplianceEvaluation = {
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'COMPUTED_MANUAL_INTERVAL',
        distanceToNextServiceKm: -500,
        timeToNextServiceDays: -12,
        lastUpdatedAt: NOW.toISOString(),
        serviceSourceLabel: 'computed',
        severity: 'CRITICAL',
        blocksRental: false,
        title: 'Service überfällig',
        description: 'computed',
        message: 'Service überfällig (berechnet)',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
        projectedDueDate: '2026-01-01T00:00:00.000Z',
      },
      tuvBokraft: {
        tuvValidTill: '2027-01-01T00:00:00.000Z',
        tuvRemainingMonths: 12,
        tuvRemainingDays: 365,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: '2027-01-01T00:00:00.000Z',
        bokraftRemainingMonths: 12,
        bokraftRemainingDays: 365,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    };

    it('does not treat computed CRITICAL as HM rental-blocking overdue', () => {
      expect(isHmServiceOverdue(computedOverdueEval)).toBe(false);
      const decision = evaluateServiceComplianceRentalBlocking(computedOverdueEval);
      expect(decision.serviceOverdue).toBe(false);
      expect(decision.serviceOverdueBlocksRental).toBe(false);
    });

    it('does not project SERVICE_OVERDUE notifications for computed sources', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        { id: 'v1', make: 'VW', model: 'Golf', licensePlate: 'X-1', homeStationId: null },
        computedOverdueEval,
      );
      expect(sources.some((s) => s.eventType === 'SERVICE_OVERDUE')).toBe(false);
    });

    it('maps computed CRITICAL to warning module health (advisory), HM remains critical', () => {
      const svc = Object.create(ServiceComplianceService.prototype) as ServiceComplianceService;
      const computedModule = svc.toRentalModuleHealth(computedOverdueEval, null, null, null, null, null);
      expect(computedModule.state).toBe('warning');

      const hmEval: ServiceComplianceEvaluation = {
        ...computedOverdueEval,
        nextService: { ...computedOverdueEval.nextService, source: 'HM_OEM' },
      };
      const hmModule = svc.toRentalModuleHealth(hmEval, null, null, null, null, null);
      expect(hmModule.state).toBe('critical');
    });

    it('does not emit fleet SERVICE_OVERDUE insight for computed-only overdue', () => {
      const candidates = buildComplianceInsightCandidates(
        { id: 'v1', make: 'VW', model: 'Golf', licensePlate: 'X-1', homeStationId: null },
        computedOverdueEval,
        { now: NOW, enabledTypes: [InsightType.SERVICE_OVERDUE] },
      );
      expect(candidates).toHaveLength(0);
    });
  });

  describe('MEDIUM — component and tier isolation', () => {
    it('does not reset OTHER positions from inspection-only work items (M-1)', () => {
      const pos: MaintenanceSchedulePosition = {
        positionId: 'oneauto:brake',
        kind: 'OTHER',
        label: 'Brake Fluid',
        intervalMode: 'RECURRING',
        intervalKm: null,
        intervalMonths: 36,
        componentTerms: ['brake_fluid'],
        scheduleSource: 'ONEAUTO_SCHEDULE',
        rawIntervalDescription: null,
      };
      const ev: MaintenanceEvidenceEvent = {
        eventId: 'e1',
        eventType: 'FULL_SERVICE',
        eventDate: NOW,
        odometerKm: 40_000,
        performedWork: ['Brake fluid check'],
        serviceKind: null,
        eventSource: 'SERVICE_EVENT_ONEAUTO',
      };
      expect(eventCoversPosition(ev, pos)).toBe(false);
    });

    it('does not blanket-reset distant INSPECTION tiers from unscoped FULL_SERVICE (M-3)', () => {
      const small: MaintenanceSchedulePosition = {
        positionId: 'oneauto:A',
        kind: 'INSPECTION',
        label: '15k',
        intervalMode: 'RECURRING',
        intervalKm: 15_000,
        intervalMonths: 12,
        componentTerms: [],
        scheduleSource: 'ONEAUTO_SCHEDULE',
        rawIntervalDescription: null,
      };
      const large: MaintenanceSchedulePosition = {
        ...small,
        positionId: 'oneauto:B',
        intervalKm: 60_000,
        label: '60k',
      };
      const ev: MaintenanceEvidenceEvent = {
        eventId: 'e1',
        eventType: 'FULL_SERVICE',
        eventDate: NOW,
        odometerKm: 15_000,
        performedWork: [],
        serviceKind: null,
        eventSource: 'SERVICE_EVENT_ONEAUTO',
      };
      expect(eventCoversPosition(ev, small)).toBe(false);
      expect(eventCoversPosition(ev, large)).toBe(false);
    });
  });
});
