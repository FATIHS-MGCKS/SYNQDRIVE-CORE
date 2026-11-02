import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Validation DTOs for the tire mutation endpoints. These replace the previous
 * inline `body: {...}` + `(body as any)` casts so the global ValidationPipe
 * (whitelist + forbidNonWhitelisted + transform) enforces realistic ranges and
 * valid enums before anything reaches the lifecycle service.
 *
 * Ranges follow the spec: tread 0–20 mm (covers MT/AT new tread up to ~16 mm),
 * pressure 0–8 bar, DOT a 4-digit WWYY stamp, positions/scopes/seasons/sources
 * constrained to the values the service actually understands.
 */

// Tread up to 20 mm so brand-new mud-/all-terrain tires (≈16 mm) still validate.
const TREAD_MIN = 0;
const TREAD_MAX = 20;
const ODO_MAX = 5_000_000;

export const TIRE_SEASONS = ['SUMMER', 'WINTER', 'ALL_SEASON', 'TRACK', 'OTHER'] as const;
export const TIRE_CONDITIONS = ['NEW_INSTALLED', 'ALREADY_MOUNTED', 'UNKNOWN'] as const;
export const TIRE_REPLACEMENT_SCOPES = ['single', 'axle', 'full_set'] as const;
// The lifecycle service normalises both short ("FL") and long ("FRONT_LEFT")
// position tokens — accept both so the DTO never rejects a valid payload.
export const TIRE_POSITIONS = [
  'FL', 'FR', 'RL', 'RR',
  'FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT', 'BACK_LEFT', 'BACK_RIGHT',
] as const;
export const TIRE_MEASUREMENT_SOURCES = [
  'manual', 'manual_edit', 'manual_registration',
  'workshop', 'ai_upload', 'ai_confirmed', 'calibration', 'api', 'dimo', 'oem',
] as const;

export const TIRE_PRESSURE_SPEC_SOURCES = [
  'VEHICLE_MANUFACTURER',
  'DOOR_PLACARD',
  'OWNER_MANUAL',
  'WORKSHOP',
  'USER_CONFIRMED',
  'AI_ESTIMATED',
  'UNKNOWN',
] as const;

const PRESSURE_BAR_MIN = 1.0;
const PRESSURE_BAR_MAX = 5.0;

/** A 4-digit DOT WWYY production stamp (e.g. "1219"). */
const DOT_REGEX = /^\d{4}$/;

// ── New tire set ──────────────────────────────────────────────────────────────

export class CreateTireSetupDto {
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(120)
  brandModelFront?: string;

  @IsOptional() @IsString() @MaxLength(120)
  brandModelRear?: string;

  @IsOptional() @IsString() @MaxLength(40)
  frontDimension?: string;

  @IsOptional() @IsString() @MaxLength(40)
  rearDimension?: string;

  @IsOptional() @IsIn(TIRE_SEASONS as unknown as string[])
  tireSeason?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  initialTreadDepthMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  initialTreadFrontMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  initialTreadRearMm?: number;

  @IsOptional() @IsIn(TIRE_CONDITIONS as unknown as string[])
  tireCondition?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  installedOdometerKm?: number;

  /** Required when supplying installedOdometerKm — prevents silent client override. */
  @IsOptional() @IsBoolean()
  confirmOdometerKm?: boolean;

  @IsOptional() @Matches(DOT_REGEX, { message: 'dotCodeFront must be a 4-digit DOT WWYY code' })
  dotCodeFront?: string;

  @IsOptional() @Matches(DOT_REGEX, { message: 'dotCodeRear must be a 4-digit DOT WWYY code' })
  dotCodeRear?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(PRESSURE_BAR_MIN) @Max(PRESSURE_BAR_MAX)
  recommendedPressureFrontBar?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(PRESSURE_BAR_MIN) @Max(PRESSURE_BAR_MAX)
  recommendedPressureRearBar?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(PRESSURE_BAR_MIN) @Max(PRESSURE_BAR_MAX)
  recommendedPressureLoadedFrontBar?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(PRESSURE_BAR_MIN) @Max(PRESSURE_BAR_MAX)
  recommendedPressureLoadedRearBar?: number;

  @IsOptional() @IsIn(TIRE_PRESSURE_SPEC_SOURCES as unknown as string[])
  pressureSpecSource?: string;

  @IsOptional() @IsBoolean()
  confirmPressureSpec?: boolean;
}

// ── Measurement (calibration + manual + workshop) ───────────────────────────────

export class AddTireMeasurementDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  frontLeftMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  frontRightMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  rearLeftMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  rearRightMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerAtMeasurement?: number;

  @IsOptional() @IsString()
  measuredAt?: string;

  @IsOptional() @IsIn(TIRE_MEASUREMENT_SOURCES as unknown as string[])
  source?: string;

  @IsOptional() @IsString() @MaxLength(160)
  workshopName?: string;

  @IsOptional() @IsBoolean()
  manualConfirmOdometer?: boolean;
}

/** Calibration variant — `source` defaults to 'calibration' in the controller. */
export class CalibrationMeasurementDto extends AddTireMeasurementDto {}

/** Tire Health quick-measurement (odometerKm naming used by the Health card). */
export class TireHealthMeasurementDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  frontLeftMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  frontRightMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  rearLeftMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  rearRightMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @IsIn(TIRE_MEASUREMENT_SOURCES as unknown as string[])
  source?: string;

  @IsOptional() @IsString() @MaxLength(160)
  workshopName?: string;

  @IsOptional() @IsString()
  measuredAt?: string;

  @IsOptional() @IsBoolean()
  manualConfirmOdometer?: boolean;
}

// ── Rotation ────────────────────────────────────────────────────────────────────

export class RotateTiresDto {
  @IsString()
  @IsIn([
    'front_to_rear', 'cross', 'side_swap', 'side_swap_only',
    'same_axle_swap', 'full_rotation',
  ])
  template!: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

// ── Replacement (single / axle / full set) ──────────────────────────────────────

export class ChangeTiresNewSetupDto {
  @IsOptional() @IsString() @MaxLength(120) brandModelFront?: string;
  @IsOptional() @IsString() @MaxLength(120) brandModelRear?: string;
  @IsOptional() @IsString() @MaxLength(40) frontDimension?: string;
  @IsOptional() @IsString() @MaxLength(40) rearDimension?: string;
  @IsOptional() @IsIn(TIRE_SEASONS as unknown as string[]) tireSeason?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  initialTreadDepthMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  initialTreadFrontMm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(TREAD_MIN) @Max(TREAD_MAX)
  initialTreadRearMm?: number;

  @IsOptional() @IsIn(TIRE_CONDITIONS as unknown as string[]) tireCondition?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

export class ChangeTiresDto {
  @IsIn(TIRE_REPLACEMENT_SCOPES as unknown as string[])
  scope!: 'single' | 'axle' | 'full_set';

  @IsOptional()
  @IsArray()
  @IsIn(TIRE_POSITIONS as unknown as string[], { each: true })
  positions?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ChangeTiresNewSetupDto)
  newSetup?: ChangeTiresNewSetupDto;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @IsBoolean()
  confirmOdometerKm?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;

  @IsOptional() @IsString() @MaxLength(160)
  workshopName?: string;
}

// ── Activate a stored set ────────────────────────────────────────────────────────

export class ActivateStoredSetDto {
  @IsOptional() @IsString() @MaxLength(64)
  storedSetupId?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @IsBoolean()
  confirmOdometerKm?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class StoreTireSetDto {
  @IsOptional() @IsString() @MaxLength(64)
  tireSetupId?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @IsBoolean()
  confirmOdometerKm?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class RemoveTireSetDto {
  @IsOptional() @IsString() @MaxLength(64)
  tireSetupId?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @IsBoolean()
  confirmOdometerKm?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class RetireTireDto {
  @IsString() @MaxLength(16)
  position!: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional() @IsBoolean()
  confirmOdometerKm?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

// ── AI tire spec apply ───────────────────────────────────────────────────────────

export class AiTireSpecApplyGenerationBindingDto {
  @IsString()
  tireSetupId!: string;

  @IsString() @MaxLength(64)
  setupUpdatedAt!: string;

  @IsString() @MaxLength(64)
  requestTireSize!: string;

  @IsString() @MaxLength(16)
  requestLoadIndex!: string;

  @IsString() @MaxLength(8)
  requestSpeedIndex!: string;
}

export class ApplyAiTireSpecDto {
  @IsOptional() @IsString()
  jobId?: string;

  @IsOptional() @IsObject()
  aiTireSpec?: Record<string, unknown>;

  /** Generation-time binding for legacy direct apply (required with aiTireSpec). */
  @IsOptional() @ValidateNested() @Type(() => AiTireSpecApplyGenerationBindingDto)
  generationBinding?: AiTireSpecApplyGenerationBindingDto;

  /** Deprecated — not used as proof of payload identity. */
  @IsOptional() @IsString() @MaxLength(64)
  tireSize?: string;

  @IsOptional() @IsString() @MaxLength(16)
  loadIndex?: string;

  @IsOptional() @IsString() @MaxLength(8)
  speedIndex?: string;

  @IsOptional() @IsString()
  tireSetupId?: string;

  @IsOptional() @IsBoolean()
  userConfirmedSpec?: boolean;
}

export class TireRecalculateDto {
  @IsOptional() @IsBoolean()
  force?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

// ── Recommended tire pressure (evidence-based) ────────────────────────────────

export class UpdateRecommendedPressureDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(PRESSURE_BAR_MIN) @Max(PRESSURE_BAR_MAX)
  recommendedPressureFrontBar?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(PRESSURE_BAR_MIN) @Max(PRESSURE_BAR_MAX)
  recommendedPressureRearBar?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(PRESSURE_BAR_MIN) @Max(PRESSURE_BAR_MAX)
  recommendedPressureLoadedFrontBar?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(PRESSURE_BAR_MIN) @Max(PRESSURE_BAR_MAX)
  recommendedPressureLoadedRearBar?: number;

  @IsIn(TIRE_PRESSURE_SPEC_SOURCES as unknown as string[])
  pressureSpecSource!: string;

  @IsOptional() @IsBoolean()
  confirmPressureSpec?: boolean;
}
