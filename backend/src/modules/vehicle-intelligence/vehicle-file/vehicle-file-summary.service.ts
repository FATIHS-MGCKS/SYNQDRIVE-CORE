import { Injectable, NotFoundException } from '@nestjs/common';
import { FuelType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalHealthService } from '../../rental-health/rental-health.service';
import type { VehicleHealth } from '../../rental-health/rental-health.types';
import { ServiceComplianceService } from '../service-compliance/service-compliance.service';
import type { ServiceInfoStatusDto } from '../service-compliance/service-compliance.service';
import type {
  TechnicalSpecRow,
  VehicleFileSummary,
  VehicleFileTimelineItem,
} from './vehicle-file-summary.types';
import {
  mapNextServiceToDisplayItem,
  mapTuvBokraftToDisplayItem,
} from '../service-compliance/compliance-display.mapper';
import {
  buildDocumentCategories,
  MANDATORY_DOCUMENT_CATEGORY_IDS,
  resolveRowDocumentType,
  toExtractionSummary,
} from './vehicle-file-category.mapper';
import { canAccessZb1RegistrationCertificate } from '@modules/document-extraction/zb1/zb1-registration-certificate-access.policy';
import {
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import { MembershipRole } from '@prisma/client';
import type { VehicleDocumentExtraction } from '@prisma/client';

function centsToEuro(cents: number | null | undefined): number | null {
  if (cents == null) return null;
  return Math.round(cents) / 100;
}

function isEvPowertrain(fuelType: FuelType): boolean {
  return fuelType === FuelType.ELECTRIC || fuelType === FuelType.HYBRID || fuelType === FuelType.PLUGIN_HYBRID;
}

function mapRentalHealthStatus(
  health: VehicleHealth | null,
): VehicleFileSummary['canonicalStatus']['rentalHealthStatus'] {
  if (!health) return null;
  if (health.rental_blocked) return 'blocked';
  if (health.overall_state === 'good') return 'healthy';
  if (health.overall_state === 'warning') return 'warning';
  if (health.overall_state === 'critical') return 'critical';
  return 'unknown';
}

function specRow(
  key: string,
  label: string,
  value: string | number | null | undefined,
  source: string,
  updatedAt?: Date | string | null,
): TechnicalSpecRow | null {
  if (value == null || value === '') return null;
  return {
    key,
    label,
    value,
    source,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
  };
}

@Injectable()
export class VehicleFileSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalHealth: RentalHealthService,
    private readonly serviceCompliance: ServiceComplianceService,
  ) {}

  private filterRegistrationExtractionsForViewer<T extends VehicleDocumentExtraction>(
    extractions: T[],
    access: {
      membershipRole: MembershipRole | null;
      permissions: MembershipPermissionsMap | null;
    },
  ): T[] {
    return extractions.filter((row) => {
      if (resolveRowDocumentType(row) !== 'REGISTRATION_CERTIFICATE') {
        return true;
      }
      return canAccessZb1RegistrationCertificate(access);
    });
  }

  async buildSummary(
    vehicleId: string,
    viewer?: { id?: string; platformRole?: string | null },
  ): Promise<VehicleFileSummary> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        batterySpecs: { orderBy: { updatedAt: 'desc' }, take: 1 },
        latestState: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const orgId = vehicle.organizationId;

    const [extractionsRaw, serviceInfo, rentalHealth, insuranceCount, repairEvents, serviceCostEvents] =
      await Promise.all([
        this.prisma.vehicleDocumentExtraction.findMany({
          where: { vehicleId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.serviceCompliance.buildServiceInfoStatus(vehicleId),
        this.rentalHealth.getVehicleHealth(orgId, vehicleId).catch(() => null),
        this.prisma.vehicleInsuranceRecord.count({ where: { vehicleId, organizationId: orgId } }),
        this.prisma.vehicleServiceEvent.findMany({
          where: { vehicleId, eventType: 'REPAIR' },
          select: { costCents: true, eventDate: true },
          orderBy: { eventDate: 'desc' },
          take: 24,
        }),
        this.prisma.vehicleServiceEvent.findMany({
          where: {
            vehicleId,
            eventType: { in: ['FULL_SERVICE', 'GENERAL_INSPECTION', 'OIL_CHANGE'] },
          },
          select: { costCents: true, eventDate: true },
          orderBy: { eventDate: 'desc' },
          take: 24,
        }),
      ]);

    let extractions = extractionsRaw;
    if (viewer?.id) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { userId: viewer.id, organizationId: orgId, status: 'ACTIVE' },
        select: { role: true, permissions: true },
      });
      const access = {
        membershipRole: membership?.role ?? null,
        permissions: normalizeMembershipPermissions(membership?.permissions),
      };
      extractions = this.filterRegistrationExtractionsForViewer(extractions, access);
    }
    const complianceEval = await this.serviceCompliance.evaluateCompliance(vehicleId, {
      lastTuvDate: vehicle.lastTuvDate,
      nextTuvDate: vehicle.nextTuvDate,
      lastBokraftDate: vehicle.lastBokraftDate,
      nextBokraftDate: vehicle.nextBokraftDate,
    });

    const tuvCompliance = mapTuvBokraftToDisplayItem(complianceEval.tuvBokraft, 'tuv');
    const bokraftCompliance = mapTuvBokraftToDisplayItem(complianceEval.tuvBokraft, 'bokraft');
    const nextServiceCompliance = mapNextServiceToDisplayItem(complianceEval.nextService);

    const documentCategories = buildDocumentCategories({
      extractions,
      hasInsuranceRecords: insuranceCount > 0,
      hasLeasingMasterData: vehicle.leasingRateCents != null && vehicle.leasingRateCents > 0,
      hasTaxMasterData: vehicle.taxCostCents != null && vehicle.taxCostCents > 0,
      complianceCategoryStatus: {
        tuv_hu: tuvCompliance,
        bokraft: bokraftCompliance,
        service_proof: nextServiceCompliance,
      },
    });

    const mandatoryConfigured = MANDATORY_DOCUMENT_CATEGORY_IDS.filter((id) => {
      const cat = documentCategories.find((c) => c.id === id);
      return cat != null && (cat.uiStatus === 'verified' || cat.uiStatus === 'applied');
    }).length;

    const pending = extractions
      .filter((e) => e.status === 'READY_FOR_REVIEW')
      .map(toExtractionSummary);

    const fixedItems = this.buildFixedCosts(vehicle.leasingRateCents, vehicle.insuranceCostCents, vehicle.taxCostCents, extractions);
    const monthlyTotal = fixedItems
      .map((i) => i.amountMonthly)
      .filter((v): v is number => v != null)
      .reduce((a, b) => a + b, 0);

    const odometerKm =
      vehicle.latestState?.odometerKm != null
        ? Math.round(vehicle.latestState.odometerKm)
        : vehicle.mileageKm;

    return {
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        licensePlate: vehicle.licensePlate,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        odometerKm,
        organizationId: vehicle.organizationId,
      },
      canonicalStatus: {
        rentalHealthStatus: mapRentalHealthStatus(rentalHealth),
        rentalHealthSource: rentalHealth ? 'rental_health_service' : 'not_available',
        rentalBlocked: rentalHealth?.rental_blocked ?? false,
        blockingReasons: rentalHealth?.blocking_reasons ?? [],
        serviceCompliance: {
          tuv: tuvCompliance,
          bokraft: bokraftCompliance,
          nextService: nextServiceCompliance,
        },
        note: 'Compliance and rental status are read-only snapshots from RentalHealthService and ServiceComplianceService.',
      },
      documentCategories,
      mandatoryDocumentCoverage: {
        configured: mandatoryConfigured,
        total: MANDATORY_DOCUMENT_CATEGORY_IDS.length,
      },
      fixedCosts: {
        currency: 'EUR',
        monthlyTotal: monthlyTotal > 0 ? monthlyTotal : null,
        items: fixedItems,
      },
      variableCostAverages: this.buildVariableAverages(serviceCostEvents, repairEvents),
      technicalSpecs: this.buildTechnicalSpecs(vehicle, vehicle.batterySpecs[0] ?? null, vehicle.latestState),
      pendingReviews: {
        count: pending.length,
        items: pending,
      },
      evidenceCounts: {
        tuv: serviceInfo.tuvHistory.length,
        service: serviceInfo.serviceHistory.length,
        repair: await this.prisma.vehicleServiceEvent.count({
          where: { vehicleId, eventType: 'REPAIR' },
        }),
      },
      timeline: this.buildTimeline(extractions, serviceInfo),
    };
  }

  private buildFixedCosts(
    leasingCents: number | null,
    insuranceCents: number | null,
    taxCents: number | null,
    extractions: VehicleDocumentExtraction[],
  ) {
    const appliedInvoice = extractions.find(
      (e) =>
        (e.effectiveDocumentType ?? e.documentType) === 'INVOICE' &&
        (e.status === 'APPLIED' || e.status === 'CONFIRMED'),
    );

    const item = (
      key: VehicleFileSummary['fixedCosts']['items'][number]['key'],
      label: string,
      cents: number | null,
      evidence?: { id: string; name: string | null } | null,
    ): VehicleFileSummary['fixedCosts']['items'][number] => ({
      key,
      label,
      amountMonthly: centsToEuro(cents),
      amountYearly: cents != null ? centsToEuro(cents * 12) : null,
      source: cents != null ? 'vehicle_master_data' : 'not_available',
      evidenceDocumentId: evidence?.id ?? null,
      evidenceFileName: evidence?.name ?? null,
      status: cents != null ? 'verified' : 'not_configured',
    });

    return [
      item('leasing', 'Leasing / Finanzierung', leasingCents),
      item('insurance', 'Versicherung', insuranceCents),
      item('tax', 'Kfz-Steuer', taxCents),
      {
        key: 'telematics' as const,
        label: 'Telematik / Hardware',
        amountMonthly: null,
        amountYearly: null,
        source: 'not_available' as const,
        evidenceDocumentId: null,
        evidenceFileName: null,
        status: 'not_configured' as const,
      },
      item('other', 'Sonstige Fixkosten', null, appliedInvoice ? { id: appliedInvoice.id, name: appliedInvoice.sourceFileName } : null),
    ];
  }

  private buildVariableAverages(
    serviceEvents: Array<{ costCents: number | null }>,
    repairEvents: Array<{ costCents: number | null }>,
  ) {
    const avg = (rows: Array<{ costCents: number | null }>) => {
      const withCost = rows.map((r) => r.costCents).filter((c): c is number => c != null && c > 0);
      if (withCost.length === 0) return null;
      return centsToEuro(Math.round(withCost.reduce((a, b) => a + b, 0) / withCost.length));
    };
    return {
      serviceAverageMonthly: avg(serviceEvents),
      repairAverageMonthly: avg(repairEvents),
      sampleServiceEvents: serviceEvents.length,
      sampleRepairEvents: repairEvents.length,
      source: serviceEvents.length + repairEvents.length > 0 ? 'service_events' as const : 'not_available' as const,
    };
  }

  private buildTechnicalSpecs(
    vehicle: {
      vin: string | null;
      licensePlate: string | null;
      make: string;
      model: string;
      year: number;
      fuelType: FuelType;
      transmission: string | null;
      driveType: string | null;
      vehicleType: string | null;
      color: string | null;
      mileageKm: number | null;
      hvBatteryCapacityKwh: number | null;
      tankCapacityLiters: number | null;
      updatedAt: Date;
      curbWeightKg: number | null;
      idleRpm: number | null;
      maxRpm: number | null;
    },
    batterySpec: {
      batteryType: string | null;
      batteryAmpere: number | null;
      batteryVolt: number | null;
      sourceType: string;
      updatedAt: Date;
    } | null,
    latestState: {
      odometerKm: number | null;
      lvBatteryVoltage: number | null;
      evSoc: number | null;
      tractionBatterySohPercent: number | null;
      tractionBatteryTemperatureC: number | null;
      tractionBatteryGrossCapacityKwh: number | null;
      tractionBatteryCurrentVoltage: number | null;
      fuelLevelRelative: number | null;
      defLevel: number | null;
      lastSeenAt: Date | null;
      providerSource: string | null;
      sourceTimestamp: Date | null;
    } | null,
  ) {
    const general = [
      specRow('vin', 'VIN', vehicle.vin, 'vehicle_master_data', vehicle.updatedAt),
      specRow('licensePlate', 'Kennzeichen', vehicle.licensePlate, 'vehicle_master_data', vehicle.updatedAt),
      specRow('make', 'Marke', vehicle.make, 'vehicle_master_data', vehicle.updatedAt),
      specRow('model', 'Modell', vehicle.model, 'vehicle_master_data', vehicle.updatedAt),
      specRow('year', 'Baujahr', vehicle.year, 'vehicle_master_data', vehicle.updatedAt),
      specRow('vehicleType', 'Fahrzeugtyp', vehicle.vehicleType, 'vehicle_master_data', vehicle.updatedAt),
      specRow('fuelType', 'Kraftstoffart', vehicle.fuelType, 'vehicle_master_data', vehicle.updatedAt),
      specRow('transmission', 'Getriebe', vehicle.transmission, 'vehicle_master_data', vehicle.updatedAt),
      specRow('driveType', 'Antrieb', vehicle.driveType, 'vehicle_master_data', vehicle.updatedAt),
      specRow('color', 'Farbe', vehicle.color, 'vehicle_master_data', vehicle.updatedAt),
      specRow(
        'odometerKm',
        'Kilometerstand',
        latestState?.odometerKm != null ? Math.round(latestState.odometerKm) : vehicle.mileageKm,
        latestState?.odometerKm != null ? 'telemetry' : 'vehicle_master_data',
        latestState?.sourceTimestamp ?? latestState?.lastSeenAt,
      ),
    ].filter((r): r is TechnicalSpecRow => r != null);

    const lvBattery = [
      specRow('batteryType', 'Batterietyp', batterySpec?.batteryType, 'vehicle_battery_spec', batterySpec?.updatedAt),
      specRow('batteryVolt', 'Spannungssystem', batterySpec?.batteryVolt, 'vehicle_battery_spec', batterySpec?.updatedAt),
      specRow('batteryAmpere', 'Kapazität Ah', batterySpec?.batteryAmpere, 'vehicle_battery_spec', batterySpec?.updatedAt),
      specRow(
        'lvVoltage',
        'Aktuelle Spannung',
        latestState?.lvBatteryVoltage,
        latestState?.providerSource ?? 'telemetry',
        latestState?.sourceTimestamp ?? latestState?.lastSeenAt,
      ),
    ].filter((r): r is TechnicalSpecRow => r != null);

    const showHv = isEvPowertrain(vehicle.fuelType);
    const hvBattery = showHv
      ? [
          specRow('hvCapacityKwh', 'HV Kapazität kWh', vehicle.hvBatteryCapacityKwh, 'vehicle_master_data', vehicle.updatedAt),
          specRow(
            'hvGrossCapacityKwh',
            'Brutto Kapazität kWh',
            latestState?.tractionBatteryGrossCapacityKwh,
            'telemetry',
            latestState?.sourceTimestamp,
          ),
          specRow('evSoc', 'SoC %', latestState?.evSoc, 'telemetry', latestState?.sourceTimestamp),
          specRow('hvSoh', 'SOH %', latestState?.tractionBatterySohPercent, 'telemetry', latestState?.sourceTimestamp),
          specRow('hvTemp', 'HV Temperatur °C', latestState?.tractionBatteryTemperatureC, 'telemetry', latestState?.sourceTimestamp),
          specRow('hvVoltage', 'HV Spannung', latestState?.tractionBatteryCurrentVoltage, 'telemetry', latestState?.sourceTimestamp),
        ].filter((r): r is TechnicalSpecRow => r != null)
      : null;

    const tankEngine = !showHv || vehicle.fuelType === FuelType.HYBRID || vehicle.fuelType === FuelType.PLUGIN_HYBRID
      ? [
          specRow('fuelType', 'Kraftstoffart', vehicle.fuelType, 'vehicle_master_data', vehicle.updatedAt),
          specRow('tankCapacityLiters', 'Tankvolumen L', vehicle.tankCapacityLiters, 'vehicle_master_data', vehicle.updatedAt),
          specRow('fuelLevel', 'Tankstand %', latestState?.fuelLevelRelative, 'telemetry', latestState?.sourceTimestamp),
          specRow('defLevel', 'AdBlue/DEF %', latestState?.defLevel, 'telemetry', latestState?.sourceTimestamp),
          specRow('curbWeightKg', 'Leergewicht kg', vehicle.curbWeightKg, 'vehicle_master_data', vehicle.updatedAt),
          specRow('idleRpm', 'Leerlauf RPM', vehicle.idleRpm, 'vehicle_master_data', vehicle.updatedAt),
          specRow('maxRpm', 'Max RPM', vehicle.maxRpm, 'vehicle_master_data', vehicle.updatedAt),
        ].filter((r): r is TechnicalSpecRow => r != null)
      : null;

    return { general, lvBattery, hvBattery, tankEngine };
  }

  private buildTimeline(
    extractions: VehicleDocumentExtraction[],
    serviceInfo: ServiceInfoStatusDto,
  ): VehicleFileTimelineItem[] {
    const items: VehicleFileTimelineItem[] = [];

    for (const ext of extractions.slice(0, 30)) {
      items.push({
        id: `doc-${ext.id}`,
        kind: 'document',
        title: resolveRowDocumentType(ext).replace(/_/g, ' '),
        subtitle: ext.sourceFileName,
        occurredAt: ext.createdAt.toISOString(),
        uiStatus: toExtractionSummary(ext).uiStatus,
        source: 'document_extraction',
        relatedExtractionId: ext.id,
        relatedServiceEventId: ext.serviceEventId,
      });
    }

    const pushService = (
      row: { id: string; date: string; workshopName: string | null },
      title: string,
    ) => {
      items.push({
        id: `svc-${row.id}`,
        kind: 'service_event',
        title,
        subtitle: row.workshopName,
        occurredAt: row.date,
        uiStatus: 'info',
        source: 'service_events',
        relatedExtractionId: null,
        relatedServiceEventId: row.id,
      });
    };

    for (const row of serviceInfo.tuvHistory.slice(0, 10)) pushService(row, 'TÜV / HU');
    for (const row of serviceInfo.serviceHistory.slice(0, 10)) pushService(row, 'Service');
    for (const row of serviceInfo.bokraftHistory.slice(0, 10)) pushService(row, 'BOKraft');

    return items
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, 40);
  }
}
