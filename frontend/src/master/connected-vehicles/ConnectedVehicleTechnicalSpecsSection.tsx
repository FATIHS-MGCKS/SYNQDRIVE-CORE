import { Loader2, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  driveTypeLabelKey,
  formatSpecsNumber,
  motionPhysicsEvidenceTierLabelKey,
  provenanceLabelKey,
  specValueState,
  specValueStateLabelKey,
  type ConnectedVehicleTechnicalSpecsView,
  type MotionPhysicsEvidenceTierUi,
  type SpecProvenanceUi,
  type SpecValueState,
} from './connected-vehicle-technical-specs.util';

type ConnectedVehicleTechnicalSpecsSectionProps = {
  specs: ConnectedVehicleTechnicalSpecsView | null;
  evidenceTier: MotionPhysicsEvidenceTierUi;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  editLoading?: boolean;
  onEdit?: () => void;
  onRetry?: () => void;
};

export function ConnectedVehicleTechnicalSpecsSection({
  specs,
  evidenceTier,
  loading,
  error,
  canEdit,
  editLoading = false,
  onEdit,
  onRetry,
}: ConnectedVehicleTechnicalSpecsSectionProps) {
  const { t } = useLanguage();

  const evidenceTone =
    evidenceTier === 'VERIFIED'
      ? 'success'
      : evidenceTier === 'CONFIRMED'
        ? 'info'
        : evidenceTier === 'ESTIMATED'
          ? 'warning'
          : 'neutral';

  return (
    <section className="space-y-3" data-testid="cv-technical-specs-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('master.cv.technicalSpecs.sectionTitle')}
        </h3>
        {canEdit && onEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={editLoading}
            onClick={onEdit}
            data-testid="cv-edit-specifications-button"
          >
            {editLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
            ) : (
              <Pencil className="h-4 w-4 mr-2" aria-hidden />
            )}
            {t('master.cv.technicalSpecs.editAction')}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('master.cv.technicalSpecs.loading')}
        </p>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground" role="alert">
            {t('master.cv.technicalSpecs.loadError')}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('master.cv.technicalSpecs.retry')}
            </Button>
          ) : null}
        </div>
      ) : specs ? (
        <>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={evidenceTone} dot>
              {t(motionPhysicsEvidenceTierLabelKey(evidenceTier))}
            </StatusChip>
          </div>
          <div className="space-y-6">
            <SpecGroup title={t('master.cv.technicalSpecs.group.identity')}>
              <SpecItem label={t('master.cv.technicalSpecs.make')} value={specs.make} />
              <SpecItem label={t('master.cv.technicalSpecs.model')} value={specs.model} />
              <SpecItem
                label={t('master.cv.technicalSpecs.year')}
                value={specs.year != null ? String(specs.year) : '—'}
              />
              <SpecItem
                label={t('master.cv.technicalSpecs.vin')}
                value={specs.vin ?? '—'}
              />
              <SpecItem
                label={t('master.cv.technicalSpecs.licensePlate')}
                value={specs.licensePlate ?? '—'}
              />
            </SpecGroup>

            <SpecGroup title={t('master.cv.technicalSpecs.group.enginePowertrain')}>
              <SpecItem label={t('master.cv.technicalSpecs.fuelType')} value={specs.fuelType} />
              <SpecItem
                label={t('master.cv.technicalSpecs.driveType')}
                value={
                  specs.driveTypeNormalized
                    ? t(driveTypeLabelKey(specs.driveTypeRaw))
                    : t('master.cv.technicalSpecs.driveType.unknown')
                }
                provenance={specs.fieldProvenance.driveType}
              />
              {specs.applicability.showIceEngineFields ? (
                <>
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.engineDisplacement')}
                    value={specs.engineDisplacementCc}
                    unit={t('master.cv.technicalSpecs.unitCc')}
                    applicable
                    provenance={specs.fieldProvenance.engineDisplacementCc}
                  />
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.cylinderCount')}
                    value={specs.cylinderCount}
                    applicable
                    provenance={specs.fieldProvenance.cylinderCount}
                  />
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.idleRpm')}
                    value={specs.idleRpm}
                    applicable
                    provenance={specs.fieldProvenance.idleRpm}
                  />
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.maxRpm')}
                    value={specs.maxRpm}
                    applicable
                    provenance={specs.fieldProvenance.maxRpm}
                  />
                </>
              ) : null}
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.systemPower')}
                value={specs.systemMotorPowerKw}
                unit={t('master.cv.technicalSpecs.unitKw')}
                applicable
                provenance={specs.fieldProvenance.systemMotorPowerKw}
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.accel0To100')}
                value={specs.accel0To100S}
                unit={t('master.cv.technicalSpecs.unitSeconds')}
                applicable
              />
              {specs.variantAssumption ? (
                <SpecItem
                  className="sm:col-span-2"
                  label={t('master.motionPhysics.variantAssumption')}
                  value={specs.variantAssumption}
                />
              ) : null}
            </SpecGroup>

            <SpecGroup title={t('master.cv.technicalSpecs.group.dimensionsWeights')}>
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.curbWeight')}
                value={specs.curbWeightKg}
                unit={t('master.cv.technicalSpecs.unitKg')}
                applicable
              />
              <SpecItem
                label={t('master.cv.technicalSpecs.weightDistribution')}
                value={
                  specs.frontToRearWeightDistribution &&
                  specs.frontToRearWeightDistribution !== '—'
                    ? specs.frontToRearWeightDistribution
                    : '—'
                }
                provenance={specs.fieldProvenance.frontWeightDistributionPct}
              />
            </SpecGroup>

            <SpecGroup title={t('master.cv.technicalSpecs.group.tiresBrakes')}>
              <SpecItem
                label={t('master.cv.technicalSpecs.tireFrontDimension')}
                value={specs.tireFrontDimension ?? '—'}
              />
              <SpecItem
                label={t('master.cv.technicalSpecs.tireRearDimension')}
                value={specs.tireRearDimension ?? '—'}
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.brakeForceDistribution')}
                value={specs.brakeForceFrontPercent}
                unit={t('master.cv.technicalSpecs.unitPercentFront')}
                applicable
                provenance={specs.fieldProvenance.brakeForceFrontPercent}
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.brakeFrontRotorDiameter')}
                value={specs.brakeFrontRotorDiameterMm}
                unit={t('master.cv.technicalSpecs.unitMm')}
                applicable
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.brakeFrontRotorWidth')}
                value={specs.brakeFrontRotorWidthMm}
                unit={t('master.cv.technicalSpecs.unitMm')}
                applicable
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.brakeFrontPadThickness')}
                value={specs.brakeFrontPadThicknessMm}
                unit={t('master.cv.technicalSpecs.unitMm')}
                applicable
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.brakeRearRotorDiameter')}
                value={specs.brakeRearRotorDiameterMm}
                unit={t('master.cv.technicalSpecs.unitMm')}
                applicable
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.brakeRearRotorWidth')}
                value={specs.brakeRearRotorWidthMm}
                unit={t('master.cv.technicalSpecs.unitMm')}
                applicable
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.brakeRearPadThickness')}
                value={specs.brakeRearPadThicknessMm}
                unit={t('master.cv.technicalSpecs.unitMm')}
                applicable
              />
            </SpecGroup>

            <SpecGroup title={t('master.cv.technicalSpecs.group.battery')}>
              <SpecItem
                label={t('master.cv.technicalSpecs.batteryType')}
                value={specs.batteryType ?? '—'}
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.batteryAmpere')}
                value={specs.batteryAmpere}
                unit={t('master.cv.technicalSpecs.unitAmpere')}
                applicable
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.batteryVolt')}
                value={specs.batteryVolt}
                unit={t('master.cv.technicalSpecs.unitVolt')}
                applicable
              />
              {specs.applicability.showHvBatteryFields ? (
                <>
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.hvUsableCapacity')}
                    value={specs.hvBatteryUsableCapacityKwh}
                    unit={t('master.cv.technicalSpecs.unitKwh')}
                    applicable
                    provenance={specs.fieldProvenance.hvBatteryUsableCapacityKwh}
                  />
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.hvGrossCapacity')}
                    value={specs.hvBatteryGrossCapacityKwh}
                    unit={t('master.cv.technicalSpecs.unitKwh')}
                    applicable
                    provenance={specs.fieldProvenance.hvBatteryGrossCapacityKwh}
                  />
                  <SpecItem
                    label={t('master.cv.technicalSpecs.hvChemistry')}
                    value={specs.hvBatteryChemistry ?? '—'}
                  />
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.hvNominalVoltage')}
                    value={specs.hvBatteryNominalVoltage}
                    unit={t('master.cv.technicalSpecs.unitVolt')}
                    applicable
                  />
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.acOnboardCharger')}
                    value={specs.acOnboardChargerKw}
                    unit={t('master.cv.technicalSpecs.unitKw')}
                    applicable
                  />
                  <NumericSpecItem
                    label={t('master.cv.technicalSpecs.dcFastChargeMax')}
                    value={specs.dcFastChargeMaxKw}
                    unit={t('master.cv.technicalSpecs.unitKw')}
                    applicable
                  />
                </>
              ) : null}
            </SpecGroup>

            <SpecGroup title={t('master.cv.technicalSpecs.group.maintenance')}>
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.tankCapacity')}
                value={specs.tankCapacityLiters}
                unit={t('master.cv.technicalSpecs.unitLiters')}
                applicable={specs.applicability.showTankAndOilMaintenance}
                provenance={specs.fieldProvenance.tankCapacityLiters}
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.serviceIntervalKm')}
                value={specs.serviceIntervalManufacturerKm}
                unit={t('master.cv.technicalSpecs.unitKm')}
                applicable
                provenance={specs.fieldProvenance.serviceIntervalManufacturerKm}
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.serviceIntervalMonths')}
                value={specs.serviceIntervalManufacturerMonths}
                unit={t('master.cv.technicalSpecs.unitMonths')}
                applicable
                provenance={specs.fieldProvenance.serviceIntervalManufacturerMonths}
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.oilChangeIntervalKm')}
                value={specs.oilChangeIntervalKm}
                unit={t('master.cv.technicalSpecs.unitKm')}
                applicable={specs.applicability.showTankAndOilMaintenance}
                provenance={specs.fieldProvenance.oilChangeIntervalKm}
              />
              <NumericSpecItem
                label={t('master.cv.technicalSpecs.oilChangeIntervalMonths')}
                value={specs.oilChangeIntervalMonths}
                unit={t('master.cv.technicalSpecs.unitMonths')}
                applicable={specs.applicability.showTankAndOilMaintenance}
                provenance={specs.fieldProvenance.oilChangeIntervalMonths}
              />
            </SpecGroup>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SpecGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2" data-testid="cv-spec-group">
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">{children}</dl>
    </div>
  );
}

function SpecItem({
  label,
  value,
  className = '',
  provenance,
}: {
  label: string;
  value: string;
  className?: string;
  provenance?: SpecProvenanceUi;
}) {
  const { t } = useLanguage();
  const provKey = provenance ? provenanceLabelKey(provenance) : null;
  return (
    <div className={`rounded-xl border border-border p-3 ${className}`}>
      <dt className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
        <span>{label}</span>
        {provKey ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
            {t(provKey)}
          </span>
        ) : null}
      </dt>
      <dd className="mt-1 font-medium break-words">{value}</dd>
    </div>
  );
}

function NumericSpecItem({
  label,
  value,
  unit,
  applicable,
  provenance,
}: {
  label: string;
  value: number | null;
  unit?: string;
  applicable: boolean;
  provenance?: SpecProvenanceUi;
}) {
  const { t } = useLanguage();
  const state: SpecValueState = specValueState(applicable, value != null);
  const display =
    state === 'value'
      ? `${formatSpecsNumber(value)}${unit ? ` ${unit}` : ''}`
      : t(specValueStateLabelKey(state));
  return (
    <SpecItem label={label} value={display} provenance={state === 'value' ? provenance : undefined} />
  );
}
