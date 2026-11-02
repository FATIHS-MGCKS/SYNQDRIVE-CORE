import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  buildTechnicalSpecsView,
  type ConnectedVehicleTechnicalSpecsView,
  type MotionPhysicsEvidenceTierUi,
} from './connected-vehicle-technical-specs.util';

export function useConnectedVehicleTechnicalSpecs(
  vehicleId: string | null,
  organizationId: string | null,
  enabled: boolean,
) {
  const [specs, setSpecs] = useState<ConnectedVehicleTechnicalSpecsView | null>(null);
  const [evidenceTier, setEvidenceTier] = useState<MotionPhysicsEvidenceTierUi>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !vehicleId || !organizationId) {
      setSpecs(null);
      setEvidenceTier(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [vehicleDto, motionRef] = await Promise.all([
        api.vehicles.get(vehicleId),
        api.vehicles.motionPhysicsReference
          .getActive(organizationId, vehicleId)
          .catch(() => null),
      ]);

      const tier = (motionRef?.evidenceTier as MotionPhysicsEvidenceTierUi) ?? null;
      setEvidenceTier(tier);
      setSpecs(
        buildTechnicalSpecsView({
          vin: vehicleDto?.vin,
          licensePlate: vehicleDto?.licensePlate,
          make: vehicleDto?.make,
          model: vehicleDto?.model,
          year: vehicleDto?.year,
          fuelType: vehicleDto?.fuelType,
          drivetrain: vehicleDto?.drivetrain,
          driveType: vehicleDto?.drivetrain,
          curbWeight: vehicleDto?.curbWeight,
          engineDisplacementCc: vehicleDto?.engineDisplacementCc,
          cylinderCount: vehicleDto?.cylinderCount,
          frontToRearWeightDistribution: vehicleDto?.frontToRearWeightDistribution,
          frontWeightDistributionPct: vehicleDto?.frontWeightDistributionPct,
          idleRpm: vehicleDto?.idleRpm,
          maxRpm: vehicleDto?.maxRpm,
          brakeForceDistribution: vehicleDto?.brakeForceDistribution,
          brakeForceFrontPercent: vehicleDto?.brakeForceFrontPercent ?? null,
          systemMotorPowerKw: vehicleDto?.systemMotorPowerKw,
          accel0To100S: vehicleDto?.accel0To100S,
          variantAssumption: vehicleDto?.motionPhysicsVariantAssumption,
          tankCapacityLiters: vehicleDto?.tankCapacityLiters,
          serviceIntervalManufacturerKm: vehicleDto?.serviceIntervalManufacturerKm,
          serviceIntervalManufacturerMonths: vehicleDto?.serviceIntervalManufacturerMonths,
          oilChangeIntervalKm: vehicleDto?.oilChangeIntervalKm,
          oilChangeIntervalMonths: vehicleDto?.oilChangeIntervalMonths,
          tireFrontDimension: vehicleDto?.tireFrontDimension,
          tireRearDimension: vehicleDto?.tireBackDimension,
          brakeFrontRotorDiameter: vehicleDto?.brakeFrontRotorDiameter,
          brakeFrontRotorWidth: vehicleDto?.brakeFrontRotorWidth,
          brakeFrontPadThickness: vehicleDto?.brakeFrontPadThickness,
          brakeBackRotorDiameter: vehicleDto?.brakeBackRotorDiameter,
          brakeBackRotorWidth: vehicleDto?.brakeBackRotorWidth,
          brakeBackPadThickness: vehicleDto?.brakeBackPadThickness,
          batteryType: vehicleDto?.batteryType,
          batteryAmpere: vehicleDto?.batteryAmpere,
          batteryVolt: vehicleDto?.batteryVolt,
          hvBatteryUsableCapacityKwh: vehicleDto?.hvBatteryUsableCapacityKwh,
          hvBatteryGrossCapacityKwh: vehicleDto?.hvBatteryGrossCapacityKwh,
          hvBatteryChemistry: vehicleDto?.hvBatteryChemistry,
          hvBatteryNominalVoltage: vehicleDto?.hvBatteryNominalVoltage,
          acOnboardChargerKw: vehicleDto?.acOnboardChargerKw,
          dcFastChargeMaxKw: vehicleDto?.dcFastChargeMaxKw,
          registrationIdentityProvenance: vehicleDto?.registrationIdentityProvenance,
          hvMasterSpecificationProvenance:
            typeof vehicleDto?.hvMasterSpecificationProvenance === 'string'
              ? vehicleDto.hvMasterSpecificationProvenance
              : null,
          motionReference: motionRef,
          motionEvidenceTier: tier,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LOAD_FAILED');
      setSpecs(null);
      setEvidenceTier(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, organizationId, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { specs, evidenceTier, loading, error, refresh: load };
}
