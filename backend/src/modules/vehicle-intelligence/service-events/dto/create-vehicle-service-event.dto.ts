import { ServiceEventOrigin, ServiceEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SERVICE_EVENT_TYPES = Object.values(ServiceEventType);
const SERVICE_EVENT_ORIGINS = Object.values(ServiceEventOrigin);

const NOTES_MAX = 4000;
const WORKSHOP_MAX = 200;
const PROVIDER_MAX = 120;
const ODO_MAX = 5_000_000;
const COST_MAX = 100_000_000;
const PERFORMED_WORK_MAX_ITEMS = 40;
const PERFORMED_WORK_ITEM_MAX = 300;
export const SERVICE_KINDS = ['INSPECTION_SMALL', 'INSPECTION_LARGE'] as const;
export type ServiceEventServiceKind = (typeof SERVICE_KINDS)[number];

export class CreateVehicleServiceEventDto {
  @IsEnum(ServiceEventType, {
    message: `eventType must be one of: ${SERVICE_EVENT_TYPES.join(', ')}`,
  })
  eventType!: ServiceEventType;

  @IsISO8601()
  eventDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ODO_MAX)
  odometerKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(WORKSHOP_MAX)
  workshopName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(COST_MAX)
  costCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(PROVIDER_MAX)
  provider?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  documentUrl?: string;

  @IsOptional()
  @IsEnum(ServiceEventOrigin, {
    message: `origin must be one of: ${SERVICE_EVENT_ORIGINS.join(', ')}`,
  })
  origin?: ServiceEventOrigin;

  /** Structured, proven work items (e.g. "Engine: oil and filter change."). Never free text notes. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PERFORMED_WORK_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(PERFORMED_WORK_ITEM_MAX, { each: true })
  performedWork?: string[];

  /** Confirmed inspection scope (only meaningful for FULL_SERVICE / GENERAL_INSPECTION). */
  @IsOptional()
  @IsIn(SERVICE_KINDS, { message: `serviceKind must be one of: ${SERVICE_KINDS.join(', ')}` })
  serviceKind?: ServiceEventServiceKind;

  /** Skip the same-day/same-odometer duplicate guard after the user confirmed intent. */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}
