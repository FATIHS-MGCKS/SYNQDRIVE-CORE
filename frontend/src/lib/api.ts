import { getToken, clearAuth } from './auth';
import { getStepUpToken } from './mfa';
import { buildVehiclesOperationalListQuery } from './vehicles-operational-list-query';
import { classifyOffboardHttpFailure } from './vehicle-offboard-api-error';
import { buildFinanceInsightsPath } from '../rental/lib/finance-insights.types';
import {
  buildFleetRentalHealthQueryString,
  fetchAllFleetRentalHealth as collectFleetRentalHealthPages,
} from './fleet-rental-health-pagination';
import type {
  AddDamageImageInput,
  CreateVehicleDamageInput,
  DamageResponse,
  DamageStatsResponse,
  FleetDamageStatsResponse,
  MarkDamageRepairedInput,
  PlaceDamageOnVehicleInput,
  UpdateVehicleDamageInput,
} from '../rental/lib/damage.types';
import type { StationsV2FeatureFlagsResponse } from './stations-v2-feature-flags';
import type {
  VehicleBookingContext,
  VehicleOperationalState,
  VehicleOperationalStatus,
  VehicleDataQualityState,
  VehicleBookingReference,
} from '../rental/lib/vehicle-operational-state';

export type {
  AddDamageImageInput,
  CreateVehicleDamageInput,
  DamageEvidenceStatus,
  DamageImageResponse,
  DamageLocationView,
  DamageRentalImpact,
  DamageResponse,
  DamageSeverity,
  DamageSource,
  DamageStatsResponse,
  DamageStatus,
  FleetDamageStatsResponse,
  MarkDamageRepairedInput,
  PlaceDamageOnVehicleInput,
  UpdateVehicleDamageInput,
} from '../rental/lib/damage.types';

export type {
  VehicleBookingContext,
  VehicleOperationalState,
  VehicleOperationalStatus,
  VehicleDataQualityState,
  VehicleBookingReference,
};

const BASE_URL = '/api/v1';

/** A single step from the AI spec extraction pipeline (SSE). */
export interface AgentStep {
  step: string;
  status: 'done' | 'error' | 'skipped' | 'working';
  detail?: string;
}

// ── Rental Health V1 — canonical types ──────────────────────────────────────
// These mirror backend/src/modules/rental-health/rental-health.types.ts
// The UI renders exactly this shape; no free-form rewriting allowed.
export type RentalHealthState =
  | 'good'
  | 'warning'
  | 'critical'
  | 'unknown'
  | 'n_a';

export interface RentalHealthModule {
  state: RentalHealthState;
  reason: string;
  last_updated_at: string | null;
  data_stale: boolean;
  source?: string;
  evidence_type?:
    | 'measured'
    | 'estimated'
    | 'provider'
    | 'manual'
    | 'document'
    | 'sensor'
    | 'complaint'
    | 'unknown';
  tire_read_model?: TireRentalHealthReadModel;
  brake_read_model?: BrakeRentalHealthReadModel;
}

export type TireRentalReviewRequirement =
  | 'NONE'
  | 'MEASUREMENT_REQUIRED'
  | 'REVIEW_REQUIRED';

export type TireRentalReasonCode =
  | 'TREAD_MEASURED_BELOW_LEGAL_MIN'
  | 'TREAD_MEASURED_CRITICAL'
  | 'TREAD_ESTIMATED_CRITICAL_HIGH_CONF'
  | 'TREAD_ESTIMATED_CRITICAL_LOW_CONF'
  | 'TREAD_DEFAULT_ASSUMPTION'
  | 'TREAD_UNKNOWN'
  | 'TREAD_STALE'
  | 'PRESSURE_TPMS_CRITICAL'
  | 'PRESSURE_PROVIDER_CRITICAL'
  | 'PRESSURE_WARNING'
  | 'PRESSURE_STALE'
  | 'PRESSURE_UNKNOWN'
  | 'NO_TIRE_DATA'
  | 'DATA_STALE'
  | 'REVIEW_OVERRIDE_ACTIVE';

export interface TireRentalBlockingEvidence {
  action: 'NONE' | 'HARD_BLOCK';
  reasonCode: TireRentalReasonCode;
  source: string;
  value: number | string | null;
  threshold: number | string | null;
  timestamp: string | null;
  setupId: string | null;
  message: string;
}

export interface TireRentalHealthReadModel {
  wearEvidence: {
    displayMode: string;
    lowestTreadMm: number | null;
    lowestTreadPosition: string | null;
    overallWearStatus: string;
    measuredAt: string | null;
    freshness: string;
    isDefaultAssumption: boolean;
    confidence: string;
  };
  pressureEvidence: {
    sourceType: string;
    sourceLabel: string;
    overallPressureStatus: string;
    tpmsWarning: boolean | null;
    freshness: string;
    lastUpdatedAt: string | null;
    perWheelIssue: boolean;
  };
  specEvidence: {
    pressureSpecSource: string;
    pressureSpecConfidence: number;
    wearFactorEligible: boolean;
    pressureSpecMissingLabel: string | null;
  };
  measurementFreshness: string;
  pressureFreshness: string;
  overallStatus: RentalHealthState;
  confidence: string;
  reviewRequirement: TireRentalReviewRequirement;
  rentalBlockingEvidence: TireRentalBlockingEvidence | null;
  structuredReasonCodes: TireRentalReasonCode[];
  activeReviewOverride: {
    id: string;
    reason: string;
    grantedByUserId: string;
    expiresAt: string;
    createdAt: string;
  } | null;
  primaryReason: string;
  lastUpdatedAt: string | null;
  dataStale: boolean;
  source: string;
  evidenceType: string;
}

export type BrakeRentalReviewRequirement =
  | 'NONE'
  | 'MEASUREMENT_REQUIRED'
  | 'REVIEW_REQUIRED';

export type BrakeRentalDecision =
  | 'ALLOW'
  | 'WARNING'
  | 'MEASUREMENT_REQUIRED'
  | 'DATA_QUALITY_WARNING'
  | 'REVIEW_REQUIRED'
  | 'HARD_BLOCK'
  | 'UNAVAILABLE';

export type BrakeRentalReasonCode =
  | 'WEAR_MEASURED_CRITICAL'
  | 'WEAR_MEASURED_BELOW_THRESHOLD'
  | 'WEAR_ESTIMATED_CRITICAL'
  | 'WEAR_ESTIMATED_WARNING'
  | 'SAFETY_DTC_CRITICAL'
  | 'SAFETY_DTC_REVIEW'
  | 'SAFETY_ABS_CRITICAL'
  | 'SAFETY_ABS_REVIEW'
  | 'SAFETY_FLUID_CRITICAL'
  | 'SAFETY_IMMEDIATE_REPLACEMENT'
  | 'SAFETY_WEAR_SENSOR'
  | 'DATA_NO_BASELINE'
  | 'DATA_SPEC_ONLY'
  | 'DATA_COVERAGE_GAP'
  | 'DATA_DISTANCE_CONFLICT'
  | 'DATA_MEASUREMENT_REQUIRED'
  | 'DATA_STALE_EVIDENCE'
  | 'UNKNOWN_STATE'
  | 'MODULE_UNAVAILABLE'
  | 'REVIEW_OVERRIDE_ACTIVE';

export interface BrakeRentalBlockingEvidence {
  action: 'NONE' | 'HARD_BLOCK';
  reasonCode: BrakeRentalReasonCode;
  source: string;
  value: number | string | null;
  threshold: number | string | null;
  timestamp: string | null;
  message: string;
  messageEn: string;
}

export interface BrakeRentalHealthReadModel {
  wearCondition: string;
  safetyCondition: string;
  dataQualityCondition: string;
  measurementFreshness: string;
  modelFreshness: string;
  activeSafetyEvidence: Array<{
    alertType: string;
    reasonCode: string;
    severity: string;
    message: string;
    messageEn: string;
    displayMode: string;
    axle?: string;
  }>;
  confidence: string;
  reviewRequirement: BrakeRentalReviewRequirement;
  rentalDecision: BrakeRentalDecision;
  blockingReasons: string[];
  rentalBlockingEvidence: BrakeRentalBlockingEvidence | null;
  structuredReasonCodes: BrakeRentalReasonCode[];
  activeReviewOverride: {
    id: string;
    reason: string;
    grantedByUserId: string;
    expiresAt: string;
    createdAt: string;
  } | null;
  hasWearOrSafetyAlert: boolean;
  primaryReason: string;
  primaryReasonEn: string;
  lastMeasurementAt: string | null;
  lastSafetyEvidenceAt: string | null;
  lastModelCalculatedAt: string | null;
  lastDataReceivedAt: string | null;
  lastUpdatedAt: string | null;
  dataStale: boolean;
  source: string;
  evidenceType: string;
}

export interface VehicleHealthResponse {
  vehicle_id: string;
  organization_id: string;
  overall_state: RentalHealthState;
  availability?: 'ready' | 'partial' | 'unavailable';
  /** `null` when pipeline coverage is incomplete — not a confirmed safe false. */
  rental_blocked: boolean | null;
  blocking_reasons: string[];
  modules: {
    battery: RentalHealthModule;
    tires: RentalHealthModule;
    brakes: RentalHealthModule;
    error_codes: RentalHealthModule;
    service_compliance: RentalHealthModule;
    complaints: RentalHealthModule;
    vehicle_alerts: RentalHealthModule;
  };
  generated_at: string;
  /** Alias for generated_at — cross-surface contract. */
  evaluated_at?: string;
  /** Ready for rental when pipeline is complete and no hard blockers apply. */
  rental_readiness?: 'ready' | 'not_ready' | 'unevaluable';
  /** Monotonic projection version for cache coherence. */
  projection_version?: string;
  /** Fleet read-model only — detail route omits these fields. */
  cache_stale?: boolean;
  data_partial?: boolean;
  cached_at?: string | null;
  degradation?: {
    code: 'PIPELINE_UNAVAILABLE';
    message: string;
  };
  /** Read-only passthrough from rental-health evaluation — no extra frontend fetch. */
  dashboard_warning_lights?: DashboardWarningLightsResponse;
}

export interface FleetRentalHealthQuery {
  stationId?: string;
  search?: string;
  vehicleStatus?: string;
  limit?: number;
  cursor?: string;
}

export interface FleetRentalHealthAvailabilitySummary {
  totalSelected: number;
  byVehicleStatus: Record<string, number>;
  semantics: 'vehicle_status_operational_vs_rental_health_per_row';
}

export interface FleetRentalHealthPageHealthSummary {
  rentalBlocked: number;
  byOverallState: Partial<Record<RentalHealthState, number>>;
  vehiclesWithDetail: number;
}

export interface FleetRentalHealthSummary {
  availability: FleetRentalHealthAvailabilitySummary;
  pageHealth: FleetRentalHealthPageHealthSummary;
}

export interface FleetRentalHealthPage {
  summary: FleetRentalHealthSummary;
  data: VehicleHealthResponse[];
  meta: {
    limit: number;
    nextCursor: string | null;
  };
}

// ── HM Compatibility Matrix V1 (V4.6.77) ────────────────────────────────────
// Master-Admin-internal compatibility intelligence — matches
// backend/src/modules/high-mobility/compatibility/hm-compatibility.types.ts.
// The shape is UI-ready so the same response can later be re-used by the
// landing-page compatibility checker and onboarding assistant.
export type HmCompatibilityEligibilityMode =
  | 'AVAILABLE'
  | 'NOT_AVAILABLE'
  | 'SUPPORT_REQUEST'
  | 'VIN_DEPENDENT';
export type HmCompatibilityOnboardingMode =
  | 'PRECHECK_CONNECT'
  | 'DIRECT_CONNECT'
  | 'MANUAL_REVIEW';
export type HmCompatibilityAppStatus = 'SUPPORTED' | 'PARTIAL' | 'NOT_RECOMMENDED';
export type HmCompatibilityOverall = 'GOOD' | 'LIMITED' | 'WEAK';
export type HmCompatibilityConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type HmCompatibilityApp = 'HEALTH' | 'TELEMETRY';
export type HmSignalCoverage = 'CONFIRMED' | 'EXPECTED' | 'UNVERIFIED' | 'MISSING';

export interface HmCompatibilityBrandOption {
  brand: string;
  displayName: string;
  modelCount: number;
}

export interface HmCompatibilityModelOption {
  model: string;
  displayName: string;
  yearRange: string | null;
}

export interface HmSignalCoverageItem {
  app: HmCompatibilityApp;
  signalKey: string;
  signalLabel: string;
  signalGroup: string;
  required: boolean;
  coverage: HmSignalCoverage;
  confidence: HmCompatibilityConfidence;
  notes: string | null;
  displayOrder: number;
}

export interface HmAppCoverageSummary {
  status: HmCompatibilityAppStatus;
  coveredRequired: number;
  totalRequired: number;
  totalSignals: number;
  reason: string;
  signals: HmSignalCoverageItem[];
}

export interface HmCompatibilitySummary {
  brand: string;
  brandDisplayName: string;
  model: string;
  modelDisplayName: string;
  modelYearFrom: number | null;
  modelYearTo: number | null;
  supportFromText: string | null;
  overallStatus: HmCompatibilityOverall;
  overallNotes: string | null;
}

export interface HmCompatibilityOnboardingInfo {
  eligibilityMode: HmCompatibilityEligibilityMode;
  onboardingMode: HmCompatibilityOnboardingMode;
  oemPath: 'ELIGIBILITY_FIRST' | 'DIRECT_FLEET_CLEARANCE' | 'UNKNOWN';
  routingNote: string | null;
  guidance: string;
}

export interface HmCompatibilitySourceInfo {
  supportSource: string | null;
  confidence: HmCompatibilityConfidence;
  lastReviewedAt: string | null;
  notes: string | null;
}

export interface HmCompatibilityLookupEcho {
  brand: string;
  model: string;
  year: number | null;
  resolvedBrandNormalized: string | null;
  resolvedModelNormalized: string | null;
}

export interface HmCompatibilityCheckResponse {
  lookup: HmCompatibilityLookupEcho;
  found: boolean;
  summary: HmCompatibilitySummary | null;
  healthApp: HmAppCoverageSummary | null;
  telemetryApp: HmAppCoverageSummary | null;
  onboarding: HmCompatibilityOnboardingInfo | null;
  source: HmCompatibilitySourceInfo | null;
  notFoundReason: string | null;
  generatedAt: string;
}

export interface AiSpecsResponse {
  success: boolean;
  degraded: boolean;
  configFailure?: boolean;
  upstreamStatus?: number | null;
  agentId?: string;
  specs: Record<string, string | number | null> | null;
  steps?: AgentStep[];
  message?: string;
}

export interface AiSpecsStreamResult {
  success: boolean;
  degraded?: boolean;
  knowledgeOnlyFallback?: boolean;
  agentId?: string;
  specs: Record<string, string | number | boolean | null>;
}

export type AiSpecsStreamEvent =
  | { event: 'step'; data: AgentStep }
  | { event: 'progress'; data: { type: string; content: string } }
  | { event: 'result'; data: AiSpecsStreamResult }
  | { event: 'error'; data: { message: string; configFailure?: boolean } };

/**
 * Connect to the SSE ai-specs-stream endpoint.
 * Returns an AbortController the caller can use to cancel.
 */
export interface VehicleMotionPhysicsReferenceDto {
  id: string;
  organizationId: string;
  vehicleId: string;
  curbMassKg: number | null;
  systemMotorPowerKw: number | null;
  systemPowerDefinition: string | null;
  accel0To100S: number | null;
  variantAssumption: string | null;
  evidenceTier: 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED';
  source: string;
  isActive: boolean;
}

export function streamAiSpecs(
  params: {
    vin?: string;
    tokenId?: string;
    dimoVehicleId?: string;
    make?: string;
    model?: string;
    year?: string;
    powertrainType?: string;
    fuelType?: string;
    organizationId?: string;
    vehicleId?: string;
  },
  onEvent: (evt: AiSpecsStreamEvent) => void,
  onDone: () => void,
): AbortController {
  const qs = buildQuery(params);
  const url = `${BASE_URL}/vehicles/register/ai-specs-stream${qs}`;
  const controller = new AbortController();
  const token = getToken();

  fetch(url, {
    signal: controller.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ event: 'error', data: { message: `HTTP ${res.status}` } });
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          let eventName = 'message';
          let eventData = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) eventData = line.slice(5).trim();
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            onEvent({ event: eventName, data: parsed } as AiSpecsStreamEvent);
          } catch { /* skip malformed events */ }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      onEvent({ event: 'error', data: { message: err.message || 'Network error' } });
      onDone();
    });

  return controller;
}

// ── AI Tire Spec stream (mirrors streamAiSpecs for tire data) ──────────────

export interface AiTireSpecsStreamResult {
  success: boolean;
  degraded?: boolean;
  agentId?: string;
  specs: Record<string, unknown>;
}

export type AiTireSpecsStreamEvent =
  | { event: 'step'; data: AgentStep }
  | { event: 'progress'; data: { type: string; content: string } }
  | { event: 'result'; data: AiTireSpecsStreamResult }
  | { event: 'error'; data: { message: string; configFailure?: boolean } };

export function streamAiTireSpecs(
  params: { brand?: string; model?: string; year?: string; tireSize?: string; loadIndex?: string; speedIndex?: string },
  onEvent: (evt: AiTireSpecsStreamEvent) => void,
  onDone: () => void,
): AbortController {
  const qs = buildQuery(params);
  const url = `${BASE_URL}/vehicles/register/ai-tire-specs-stream${qs}`;
  const controller = new AbortController();
  const token = getToken();

  fetch(url, {
    signal: controller.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ event: 'error', data: { message: `HTTP ${res.status}` } });
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          let eventName = 'message';
          let eventData = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) eventData = line.slice(5).trim();
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            onEvent({ event: eventName, data: parsed } as AiTireSpecsStreamEvent);
          } catch { /* skip malformed events */ }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      onEvent({ event: 'error', data: { message: err.message || 'Network error' } });
      onDone();
    });

  return controller;
}

// ── AI Assistant chat stream (mirrors streamAiSpecs, POST + SSE) ───────────

export type ChatStreamEvent =
  | { event: 'status'; data: { agentReady: boolean } }
  | { event: 'progress'; data: { type: string; content: string } }
  | { event: 'result'; data: ChatMessageResponse }
  | { event: 'error'; data: ChatStreamErrorPayload };

export type ChatStreamErrorPayload = {
  message: string;
  technicalDetails?: {
    correlationId?: string;
    code?: string;
  };
};

export type ChatStreamTechnicalDetails = NonNullable<ChatStreamErrorPayload['technicalDetails']>;

/**
 * Stream a chat message to the AI Assistant via SSE. The backend keeps the
 * connection alive while the Mistral gateway streams the response.
 * Returns an AbortController the caller can use to cancel.
 */
export function streamChatMessage(
  orgId: string,
  content: string,
  onEvent: (evt: ChatStreamEvent) => void,
  onDone: () => void,
): AbortController {
  const url = `${BASE_URL}/organizations/${orgId}/chat/message/stream`;
  const controller = new AbortController();
  const token = getToken();

  fetch(url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content }),
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ event: 'error', data: { message: `HTTP ${res.status}` } });
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          let eventName = 'message';
          let eventData = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) eventData = line.slice(5).trim();
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            onEvent({ event: eventName, data: parsed } as ChatStreamEvent);
          } catch { /* skip malformed events */ }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      onEvent({ event: 'error', data: { message: err.message || 'Network error' } });
      onDone();
    });

  return controller;
}

/** Normalize NestJS / validation error bodies into a user-visible string. */
export function formatHttpErrorMessage(
  body: { message?: unknown },
  status: number,
  path: string,
): string {
  const raw = body.message;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map(String).join(', ');
  if (raw && typeof raw === 'object') {
    const nested = raw as {
      message?: unknown;
      code?: unknown;
      missing?: unknown;
      error?: unknown;
    };
    const base =
      typeof nested.message === 'string'
        ? nested.message
        : typeof nested.error === 'string'
          ? nested.error
          : 'Request failed';
    const code = typeof nested.code === 'string' ? nested.code : undefined;
    const withCode = code ? `[${code}] ${base}` : base;
    if (Array.isArray(nested.missing) && nested.missing.length > 0) {
      return `${withCode}: ${nested.missing.map(String).join(', ')}`;
    }
    return withCode;
  }
  return `API error ${status} (${path})`;
}

export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const stepUpToken = getStepUpToken();
  if (stepUpToken) {
    headers['x-step-up-token'] = stepUpToken;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    cache: 'no-store',
    ...options,
    headers,
  });

  if (res.status === 401 && !path.includes('/auth/')) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (
      res.status === 403 &&
      body &&
      typeof body === 'object' &&
      (body as { code?: string }).code === 'STEP_UP_REQUIRED'
    ) {
      window.dispatchEvent(
        new CustomEvent('synqdrive:step-up-required', {
          detail: body as { code?: string; action?: string },
        }),
      );
    }
    throw new Error(formatHttpErrorMessage(body, res.status, path));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  // 304 Not Modified can surface with an empty body in Safari/fetch while
  // res.ok stays true — treat as a failed read so callers retry/fallback
  // instead of silently showing an empty trip list.
  if (!text) {
    if (res.status === 304) {
      throw new Error(`Stale cached response (${res.status}) for ${path}`);
    }
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

/**
 * Status-aware request that preserves HTTP status instead of collapsing non-2xx
 * responses into a generic thrown Error (the shared 401 redirect aside). Canonical
 * Evaluations callers use the preserved status to distinguish authorization,
 * not-found, server and transport failures. This transport does not infer the cause
 * of a 404; FEATURE_DISABLED requires a separate reliable discriminator. Never
 * returns fabricated data.
 */
export interface RequestResult<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly data?: T;
  readonly errorMessage?: string;
  readonly errorBody?: { code?: string; message?: string; details?: unknown };
}

export type RequestResultMeta = {
  /** Hub-owned MFA dialogs must not also trigger the global step-up listener. */
  suppressStepUpDispatch?: boolean;
};

export async function requestResult<T>(
  path: string,
  options?: RequestInit,
  meta?: RequestResultMeta,
): Promise<RequestResult<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const stepUpToken = getStepUpToken();
  if (stepUpToken) headers['x-step-up-token'] = stepUpToken;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { cache: 'no-store', ...options, headers });
  } catch (e) {
    // Network/transport failure — distinct from an HTTP error status.
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : 'Network error' };
  }

  if (res.status === 401 && !path.includes('/auth/')) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const normalized =
      body && typeof body === 'object'
        ? (body as { code?: string; message?: string; details?: unknown })
        : {};
    if (
      !meta?.suppressStepUpDispatch &&
      res.status === 403 &&
      normalized &&
      typeof normalized === 'object' &&
      (normalized as { code?: string }).code === 'STEP_UP_REQUIRED'
    ) {
      window.dispatchEvent(
        new CustomEvent('synqdrive:step-up-required', {
          detail: normalized as { code?: string; action?: string },
        }),
      );
    }
    return {
      ok: false,
      status: res.status,
      errorMessage: formatHttpErrorMessage(body, res.status, path),
      errorBody: normalized,
    };
  }

  if (res.status === 204) return { ok: true, status: 204 };
  const text = await res.text();
  if (!text) return { ok: true, status: res.status };
  return { ok: true, status: res.status, data: JSON.parse(text) as T };
}

/**
 * Build the canonical Evaluations analytics query string. `stationIds` is sent
 * comma-separated (backend contract); empty/omitted params are dropped so the
 * server applies its defaults (period → MTD; station → all authorized).
 */
function buildEvaluationsAnalyticsQuery(req?: {
  periodType?: string;
  stationIds?: readonly string[] | null;
}): string {
  const parts: string[] = [];
  if (req?.periodType) parts.push(`periodType=${encodeURIComponent(req.periodType)}`);
  if (req?.stationIds && req.stationIds.length > 0) {
    parts.push(`stationIds=${encodeURIComponent(req.stationIds.join(','))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v != null);
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

function get<T>(path: string, init?: RequestInit) {
  return request<T>(path, init);
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function patch<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

function put<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

function del<T>(path: string) {
  return request<T>(path, { method: 'DELETE' });
}

// ── Task Action Layer types (V4.8.3 + V2 detail/buckets) ───────────────────
import type {
  ApiTask,
  ApiTaskDetail,
  ApiTaskSummary,
  ApiTaskStatus,
  ApiTaskPriority,
  ApiTaskType,
  BulkTaskActionPayload,
  BulkTaskActionResponse,
  CompleteTaskPayload,
  CreateTaskPayload,
  TaskBucket,
  TaskListFilters,
  UpdateChecklistItemPayload,
} from './tasks/types';

export type {
  ApiTask,
  ApiTaskDetail,
  ApiTaskSummary,
  ApiTaskStatus,
  ApiTaskPriority,
  ApiTaskType,
  ApiTaskSource,
  ApiTaskChecklistItem,
  ApiTaskComment,
  ApiTaskAttachment,
  ApiTaskEvent,
  ApiTaskDetailNormalizedSections,
  TaskListFilters,
  CreateTaskPayload,
  CompleteTaskPayload,
  UpdateChecklistItemPayload,
  BulkTaskActionPayload,
  BulkTaskActionResponse,
  TaskCompletionMode,
  TaskBucket,
  TaskBucketSummaryCounts,
  TaskChecklistProgress,
  TaskLinkedObject,
  TaskLinkedObjectType,
  TaskLinkedObjectActionType,
  TaskLinkedObjectActionDescriptor,
  TaskAvailableActions,
  TaskActionAvailability,
  TaskUserRef,
  TaskDetailSummary,
  TaskDetailReason,
  TaskDetailNextAction,
  TaskDetailAssignment,
  TaskDetailTiming,
  TaskDetailCompletion,
  TaskDetailTechnicalMetadata,
  NormalizedTaskTimelineEvent,
  TaskNextActionType,
  TaskNextActionTargetType,
} from './tasks/types';

export { TASK_BUCKETS } from './tasks/types';

export type ApiServiceCaseCategory =
  | 'SERVICE'
  | 'REPAIR'
  | 'INSPECTION'
  | 'TUV_HU'
  | 'TIRES'
  | 'BRAKES'
  | 'BATTERY'
  | 'DAMAGE'
  | 'DIAGNOSTIC';

export type ApiServiceCaseStatus =
  | 'OPEN'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'WAITING_VENDOR'
  | 'WAITING_PARTS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ApiServiceCaseSource =
  | 'MANUAL'
  | 'HEALTH'
  | 'DTC'
  | 'DAMAGE'
  | 'BOOKING'
  | 'DOCUMENT'
  | 'SERVICE_COMPLIANCE';

export interface ApiServiceCaseTaskRef {
  id: string;
  title: string;
  status: ApiTaskStatus;
  type: ApiTaskType;
  dueDate: string | null;
}

export interface ApiServiceCaseComment {
  id: string;
  userId: string | null;
  body: string;
  createdAt: string;
}

export interface ApiServiceCaseAttachment {
  id: string;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  uploadedByUserId: string | null;
  createdAt: string;
}

export interface ApiServiceCase {
  id: string;
  organizationId: string;
  vehicleId: string;
  vendorId: string | null;
  title: string;
  description: string;
  category: ApiServiceCaseCategory;
  status: ApiServiceCaseStatus;
  priority: ApiTaskPriority;
  source: ApiServiceCaseSource;
  openedAt: string;
  scheduledAt: string | null;
  expectedReadyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  estimatedCostCents: number | null;
  actualCostCents: number | null;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  blocksRental: boolean;
  completionNotes: string | null;
  documentId: string | null;
  metadata: Record<string, unknown> | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  tasks: ApiServiceCaseTaskRef[];
  comments?: ApiServiceCaseComment[];
  attachments?: ApiServiceCaseAttachment[];
}

export interface ServiceCaseListFilters {
  status?: ApiServiceCaseStatus;
  category?: ApiServiceCaseCategory;
  priority?: ApiTaskPriority;
  source?: ApiServiceCaseSource;
  vehicleId?: string;
  vendorId?: string;
  search?: string;
}

export interface CreateServiceCasePayload {
  title: string;
  description?: string;
  category: ApiServiceCaseCategory;
  priority?: ApiTaskPriority;
  source?: ApiServiceCaseSource;
  vehicleId: string;
  vendorId?: string;
  scheduledAt?: string;
  expectedReadyAt?: string;
  downtimeStart?: string;
  estimatedCostCents?: number;
  blocksRental?: boolean;
  documentId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateServiceCasePayload {
  title?: string;
  description?: string;
  category?: ApiServiceCaseCategory;
  status?: ApiServiceCaseStatus;
  priority?: ApiTaskPriority;
  vendorId?: string | null;
  scheduledAt?: string | null;
  expectedReadyAt?: string | null;
  downtimeStart?: string | null;
  downtimeEnd?: string | null;
  estimatedCostCents?: number | null;
  actualCostCents?: number | null;
  blocksRental?: boolean;
  documentId?: string | null;
}

export interface CompleteServiceCasePayload {
  completionNotes?: string;
  actualCostCents?: number;
  downtimeEnd?: string;
}

export type SupportTicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_CUSTOMER'
  | 'RESOLVED'
  | 'CLOSED';

export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type SupportTicketCategory =
  | 'APP'
  | 'VEHICLE'
  | 'BOOKING'
  | 'BILLING'
  | 'DIMO_TELEMETRY'
  | 'ACCOUNT'
  | 'DOCUMENTS'
  | 'DATA_AUTHORIZATION'
  | 'HEALTH'
  | 'OTHER';

export type SupportTicketRelatedEntityType =
  | 'VEHICLE'
  | 'BOOKING'
  | 'INVOICE'
  | 'CUSTOMER'
  | 'USER'
  | 'AUTHORIZATION'
  | 'CONNECTIVITY'
  | 'HEALTH'
  | 'OTHER';

export interface SupportTicketAttachmentRef {
  url: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface SupportTicketMessage {
  id: string;
  senderId: string;
  senderUserId?: string;
  senderName: string;
  senderRole: 'user' | 'admin' | 'system';
  senderRoleKey?: 'USER' | 'MASTER_ADMIN' | 'SYSTEM';
  body: string;
  content: string;
  isInternal?: boolean;
  imageUrl: string | null;
  attachments?: SupportTicketAttachmentRef[] | null;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: number;
  ticketCode?: string;
  subject: string;
  description: string;
  category?: SupportTicketCategory;
  status: string;
  statusKey: SupportTicketStatus | string;
  priority: string;
  priorityKey: SupportTicketPriority | string;
  reporterName: string;
  reporterEmail: string;
  organizationId: string;
  createdByUserId?: string;
  assignedTo?: string;
  assignedToUserId?: string;
  relatedEntityType?: SupportTicketRelatedEntityType | null;
  relatedEntityId?: string | null;
  sourcePage?: string | null;
  lastMessageAt?: string;
  lastActivityAt: string;
  lastMessageByRole?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  reopenedAt?: string | null;
  unreadForUser?: boolean;
  unreadForAdmin?: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportTicketMessage[];
  messageCount?: number;
}

export interface SupportTicketStats {
  open: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  closed: number;
  total: number;
  totalOpen?: number;
  newTickets?: number;
  criticalOpen?: number;
  waitingForCustomer?: number;
  unreadForAdmin?: number;
  unresolved?: number;
  avgFirstResponseTimeMs?: number | null;
  avgResolutionTimeMs?: number | null;
  ticketsByCategory?: Record<string, number>;
  ticketsByPriority?: Record<string, number>;
}

export interface SupportTicketListParams {
  page?: string;
  limit?: string;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  organizationId?: string;
  assignedToUserId?: string;
  relatedEntityType?: SupportTicketRelatedEntityType;
  relatedEntityId?: string;
  search?: string;
  hasUnread?: string;
  openOnly?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface PaginatedSupportTickets {
  data: SupportTicket[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface CreateSupportTicketPayload {
  subject: string;
  description: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  relatedEntityType?: SupportTicketRelatedEntityType;
  relatedEntityId?: string;
  sourcePage?: string;
  metadata?: Record<string, unknown>;
  imageUrl?: string;
  attachments?: SupportTicketAttachmentRef[];
}

export interface CreateSupportTicketAdminPayload extends CreateSupportTicketPayload {
  organizationId?: string;
  reporterEmail: string;
  reporterName?: string;
}

export interface UpdateSupportTicketPayload {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  assignedToUserId?: string | null;
}

export interface CreateSupportMessagePayload {
  body?: string;
  content?: string;
  imageUrl?: string;
  attachments?: SupportTicketAttachmentRef[];
}

// ── Authenticated binary download (private documents) ───────────────────────
// Generated PDFs + uploaded legal documents are NOT public — they require the
// Bearer token. We fetch them as a Blob and open via an object URL so the
// browser can preview/download without ever exposing a public file URL.
async function fetchBlob(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatHttpErrorMessage(body, res.status, path));
  }
  return res.blob();
}

/** Opens an authenticated document in a new tab (preview/download). */
export async function openAuthedDocument(path: string): Promise<void> {
  const blob = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    // Popup blocked — fall back to a forced download.
    const a = window.document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Booking Document Lifecycle types (mirror backend DTOs) ──────────────────
export type DocumentBundleStatus = 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'FAILED';

export interface GeneratedDocumentDto {
  id: string;
  documentType: string;
  origin: string;
  status: string;
  title: string;
  documentNumber: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  bookingId: string | null;
  invoiceId: string | null;
  legalVersionLabel: string | null;
  generatedAt: string | null;
  createdAt: string;
}

export type OrgEmailMode = 'SYNQDRIVE_DEFAULT' | 'CUSTOM_DOMAIN';

export interface OrgEmailSettingsDto {
  mode: OrgEmailMode;
  defaultFromName: string | null;
  replyToEmail: string | null;
  signatureHtml: string | null;
  autoSendBookingDocumentsOnConfirm: boolean;
  platformSender: {
    fromEmail: string;
    fromName: string;
    replyToEmail: string | null;
  };
}

/** Writable fields for PUT /organizations/:orgId/email/settings (excludes read-only platformSender). */
export type UpdateOrgEmailSettingsPayload = Pick<
  OrgEmailSettingsDto,
  'mode' | 'defaultFromName' | 'replyToEmail' | 'signatureHtml' | 'autoSendBookingDocumentsOnConfirm'
>;

export interface PlatformEmailSettingsAdminDto {
  defaultFromEmail: string;
  defaultFromName: string;
  defaultReplyToEmail: string | null;
  configuredInDatabase: boolean;
  effectiveFromEmail: string;
  effectiveFromName: string;
  effectiveReplyToEmail: string | null;
  updatedAt: string | null;
}

export type OrgEmailDomainStatus =
  | 'NOT_CONFIGURED'
  | 'PENDING_DNS'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'FAILED';

export interface OrgEmailDomainDto {
  id: string;
  domain: string;
  status: OrgEmailDomainStatus;
  fromLocalPart: string;
  dnsRecords: unknown;
  failureReason: string | null;
  isActive: boolean;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export type OutboundEmailStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'SENT_SIMULATED';

export interface OutboundEmailDto {
  id: string;
  organizationId: string;
  bookingId: string | null;
  customerId: string | null;
  invoiceId: string | null;
  sourceType: string;
  status: OutboundEmailStatus;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  toEmail: string;
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sentByUserId: string | null;
  sentAt: string | null;
  createdAt: string;
  attachments: Array<{
    id: string;
    generatedDocumentId: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
    documentType: string | null;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
    payload: unknown;
  }>;
}

export interface BookingDocumentBundleView {
  bundle: {
    id: string;
    bookingId: string;
    status: DocumentBundleStatus;
    generatedAt: string | null;
    lastError: string | null;
  };
  documents: GeneratedDocumentDto[];
  legal: { termsAttached: boolean; withdrawalAttached: boolean; missing: string[] };
  missingLegalDocuments: string[];
  warnings: string[];
}

export interface BookingWizardDraftResult {
  booking: Record<string, unknown> & { id: string; bookingRef?: string | null; status?: string; paymentIntent?: string | null };
  bundle: BookingDocumentBundleView;
  autoSend?: {
    sent: boolean;
    reason?: string;
    error?: string;
  } | null;
  paymentIntent?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
  paymentFlow?: {
    intent: 'payment_link';
    bookingConfirmed: boolean;
    paymentRequestCreated: boolean;
    paymentRequestId?: string;
    checkoutCreated: boolean;
    checkoutUrl?: string;
    emailQueued: boolean;
    partialFailures: Array<{ step: string; message: string }>;
  } | null;
}

export interface WizardCheckoutContext {
  currency: string;
  rentalAmountCents: number;
  onlineAmountCents: number;
  depositAmountCents: number;
  frozenDeposit: FrozenDepositSnapshot | null;
  rentalPaidCents: number;
  depositPaidCents: number;
  depositPreauthorizedCents: number;
  depositDueAtPickupCents: number;
  totalGrossCents: number;
  recipientEmail: string | null;
  paymentLinkEligibility: {
    eligible: boolean;
    reasons: string[];
    paymentsEnabled: boolean;
    connectAccountReady: boolean;
    customerEmailPresent: boolean;
    paymentRequestPossible: boolean;
  };
  checkoutExpiresInSeconds: number;
}

export interface FrozenDepositSnapshot {
  amountCents: number;
  currency: string;
  source: string;
  ruleRevisionId: string | null;
  reason: string;
  manualOverride: boolean;
  calculatedAt: string;
  frozenAt: string | null;
}

export type BookingDetailDocumentSlot = {
  documentType: string;
  status: 'missing' | 'required' | 'generated' | 'signed' | 'void';
  required: boolean;
  available: boolean;
  generatedAt: string | null;
  signedAt: string | null;
  documentId: string | null;
  missingReason: string | null;
};

export type BookingDetailHandoverSide = {
  protocolId: string;
  status: 'completed';
  completedAt: string;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  damageCount: number;
  signatureComplete: boolean;
  performedByName: string | null;
};

export type BookingStationContext = {
  stationId: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  openingHours: unknown;
  handoverInstructions: string | null;
  returnInstructions: string | null;
  status: string;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
};

/** Lean create body for operator/rental booking forms → `api.bookings.create`. */
export type OperatorBookingCreatePayload = {
  customer: { connect: { id: string } };
  vehicle: { connect: { id: string } };
  pickupStation?: { connect: { id: string } };
  returnStation?: { connect: { id: string } };
  startDate: string;
  endDate: string;
  dailyRateCents?: number;
  totalPriceCents?: number;
  kmIncluded?: number;
  insuranceOptions?: string[];
  extrasJson?: unknown;
  pricingInput?: unknown;
  currency?: string;
  status?: string;
  notes?: string;
};

/** Lean patch body for operator/rental booking edits → `api.bookings.update`. */
export type OperatorBookingUpdatePayload = {
  startDate?: string;
  endDate?: string;
  notes?: string;
  kmIncluded?: number;
  status?: string;
  vehicleId?: string;
  vehicle?: { connect: { id: string } };
  customer?: { connect: { id: string } };
  pickupStationId?: string;
  returnStationId?: string;
  pickupStation?: { connect: { id: string } };
  returnStation?: { connect: { id: string } };
};

/** Query params for `GET /organizations/:orgId/bookings` (all optional, backward-compatible). */
export interface BookingsListParams {
  page?: number;
  limit?: number;
  status?: string;
  vehicleId?: string;
  customerId?: string;
  stationId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export type BookingDetailDto = {
  core: {
    bookingId: string;
    bookingNumber: string;
    organizationId: string;
    status: string;
    statusEnum: string;
    startDate: string;
    endDate: string;
    pickupStationId: string | null;
    returnStationId: string | null;
    pickupStationName: string | null;
    returnStationName: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    cancelledAt: string | null;
    completedAt: string | null;
    kmIncluded: number | null;
    kmDriven: number | null;
    insuranceOptions: string[];
    extras: unknown[];
    currency: string;
    isOneWayRental: boolean;
    pickupAddressOverride: string | null;
    returnAddressOverride: string | null;
  };
  stations: {
    pickup: BookingStationContext | null;
    return: BookingStationContext | null;
    actualPickup: BookingStationContext | null;
    actualReturn: BookingStationContext | null;
    isOneWayRental: boolean;
    hasPickupDeviation: boolean;
    hasReturnDeviation: boolean;
  };
  customer: {
    customerId: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    customerStatus: string | null;
    identityStatus: string | null;
    licenseStatus: string | null;
    riskLevel: string | null;
    openInvoiceCount: number;
    openFineCount: number;
    noShowCount: number;
  };
  vehicle: {
    vehicleId: string;
    displayName: string;
    licensePlate: string;
    vin: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    vehicleStatus: string | null;
    rentalBlocked: boolean;
    blockingReasons: string[];
    odometerKm: number | null;
    fuelPercent: number | null;
    evSoc: number | null;
  };
  finance: {
    basePriceCents: number | null;
    extrasPriceCents: number | null;
    discountAmountCents: number | null;
    depositAmountCents: number | null;
    depositStatus: string | null;
    taxRate: number | null;
    taxAmountCents: number | null;
    grossAmountCents: number | null;
    paidAmountCents: number | null;
    openAmountCents: number | null;
    paymentStatus: string | null;
    invoiceStatus: string | null;
    finalInvoiceStatus: string | null;
    additionalChargesCents: number | null;
    refundAmountCents: number | null;
    retainedDepositAmountCents: number | null;
    computed: boolean;
  };
  documents: {
    bundleStatus: string | null;
    legalTermsAttached: boolean;
    legalWithdrawalAttached: boolean;
    legalMissing: string[];
    warnings: string[];
    slots: BookingDetailDocumentSlot[];
  };
  handover: {
    pickup: BookingDetailHandoverSide | null;
    return: BookingDetailHandoverSide | null;
  };
  tasks: {
    openCount: number;
    overdueCount: number;
    completedCount: number;
    nextDueAt: string | null;
    items: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      dueAt: string | null;
      overdue: boolean;
    }>;
  };
  health: {
    rentalBlocked: boolean;
    blockingReasons: string[];
    overallState: string | null;
    criticalWarnings: string[];
    warningWarnings: string[];
  };
  usage: {
    drivingStressScore: number | null;
    stressLevel: 'low' | 'moderate' | 'high' | 'critical' | null;
    drivingEventsCount: number | null;
    abuseDetectionCount: number | null;
    misuseCaseCount: number;
    hasAnalysis: boolean;
  };
  eligibility: {
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
    blockingReasons: string[];
    warnings: string[];
    requiredActions: string[];
  } | null;
  rentalEligibility: {
    status: string;
    allowed: boolean;
    stage: string;
    blockingReasons: string[];
    warnings: string[];
    missingFields: string[];
    engineVersion: string;
    evaluatedAt: string;
    rentalRulesStatus: string | null;
  } | null;
  activity: Array<{
    id: string;
    action: string;
    description: string;
    createdAt: string;
  }>;
  payments: BookingPaymentCardDto | null;
};

export type BookingPaymentCardDto = {
  enabled: boolean;
  summary: {
    bookingPaymentStatus: string;
    paymentIntent: string | null;
  };
  primaryRequest: BookingPaymentCardRequestDto | null;
  requests: BookingPaymentCardRequestDto[];
  invoice: {
    id: string;
    invoiceNumber: string | null;
    status: string;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
  } | null;
};

export type BookingPaymentCardRequestDto = {
  id: string;
  status: string;
  purpose: string;
  amountCents: number;
  paidAmountCents: number;
  openAmountCents: number;
  refundedAmountCents: number;
  refundableAmountCents: number;
  currency: string;
  depositAmountCents: number;
  recipientEmail: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  lastSentAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  sendAttemptCount: number;
  lastEmailErrorMessage: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  paymentMethodLabel: string | null;
  refundStatus: 'NONE' | 'PARTIAL' | 'FULL';
  disputeStatus: 'NONE' | 'OPEN';
};

export type BookingPaymentRefundResponseDto = {
  paymentRequest: BookingPaymentRequestDto;
  refundAmountCents: number;
  applicationFeeRefundCents: number;
  refundableAmountCents: number;
  stripeRefundId: string;
  idempotentReplay: boolean;
};

export type BookingPaymentRequestDto = {
  id: string;
  status: string;
  purpose: string;
  amountCents: number;
  paidAmountCents: number;
  openAmountCents: number;
  refundedAmountCents: number;
  currency: string;
  depositInfoCents: number;
  recipientEmail: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  sendEmailOnLink: boolean;
  sendAttemptCount: number;
  lastSentAt: string | null;
  lastEmailErrorMessage: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
};

export interface LegalDocumentActorRef {
  id: string;
  displayName: string;
}

export interface LegalDocumentDto {
  id: string;
  documentType: string;
  documentVariant?: string | null;
  legalVariant?: string | null;
  /** @deprecated Use documentType + legalVariant */
  legacyDocumentType?: string | null;
  title: string;
  versionLabel: string;
  language: string;
  jurisdiction?: string;
  customerSegment?: string;
  channelScope?: string;
  stationScope?: LegalDocumentStationScopeDto;
  status: string;
  isMandatory?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  checksum?: string | null;
  fileName: string;
  fileSize?: number | null;
  sizeBytes: number | null;
  pageCount?: number | null;
  scanStatus?: string;
  integrityStatus?: string;
  uploadedAt?: string;
  uploadedBy?: LegalDocumentActorRef | null;
  submittedForReviewAt?: string | null;
  submittedForReviewBy?: LegalDocumentActorRef | null;
  approvedAt?: string | null;
  approvedBy?: LegalDocumentActorRef | null;
  activatedAt?: string | null;
  activatedBy?: LegalDocumentActorRef | null;
  changeSummary?: string | null;
  snapshotCount?: number;
  activeFrom: string | null;
  statusReason?: string | null;
  legalOwnerName?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface LegalDocumentEventDto {
  id: string;
  organizationId: string;
  legalDocumentId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  reason: string | null;
  changeSummary: string | null;
  versionLabel: string;
  documentType: string;
  legalVariant: string | null;
  language: string;
  jurisdiction: string | null;
  validFrom: string | null;
  validUntil: string | null;
  correlationId: string | null;
  createdAt: string;
}

export interface PaginatedLegalDocumentEvents {
  data: LegalDocumentEventDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface LegalDocumentStationScopeDto {
  mode: string;
  stationIds: string[];
}

export interface LegalDocumentUsageSummaryDto {
  snapshotCount: number;
  bookingCount: number;
  contractCount: number;
  deliveryEvidenceCount: number;
  deliveryByStatus: Record<string, number>;
}

export interface LegalDocumentUsageReferenceDto {
  generatedDocumentId: string;
  bookingId: string | null;
  bookingLabel: string | null;
  contractNumber: string | null;
  generatedAt: string | null;
  documentType: string;
}

export interface LegalDocumentUsageResponseDto {
  legalDocumentId: string;
  summary: LegalDocumentUsageSummaryDto;
  references: {
    data: LegalDocumentUsageReferenceDto[];
    meta: PaginatedLegalDocumentEvents['meta'];
  };
}

export interface PaginatedLegalDocuments {
  data: LegalDocumentDto[];
  meta: PaginatedLegalDocumentEvents['meta'];
}

// V4.6.95 — `ASSIGNED_USER` / `USER` removed alongside the unused user-score
// feature. Canonical assignment statuses match the Prisma enum 1:1.
export type TripAssignmentStatus =
  | 'ASSIGNED_DRIVER'
  | 'ASSIGNED_BOOKING_CUSTOMER'
  | 'PRIVATE_UNASSIGNED'
  | 'UNKNOWN_ASSIGNMENT';

export type TripAssignmentSubjectType = 'DRIVER' | 'BOOKING_CUSTOMER';

export type EnergyEventKind = 'REFUEL' | 'RECHARGE';
export type EnergyEventConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type FuelStationEnrichmentProcessingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type FuelStationEnrichmentResolutionStatus =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'NOT_FOUND'
  | 'NO_COORDINATES'
  | 'INVALID_COORDINATES'
  | 'ERROR';

export type FuelStationMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EnergyEventStation {
  osmType: string | null;
  osmId: string | null;
  name: string | null;
  brand: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
}

export interface EnergyEventStationEnrichment {
  processingStatus: FuelStationEnrichmentProcessingStatus;
  resolutionStatus: FuelStationEnrichmentResolutionStatus | null;
  trusted: boolean;
  matchConfidence: FuelStationMatchConfidence | null;
  score: number | null;
  station?: EnergyEventStation;
  resolverVersion: string | null;
  osmDatasetVersion: string | null;
  resolvedAt: string | null;
}

export interface EnergyEvent {
  id: string;
  vehicleId: string;
  dimoSegmentId: string;
  kind: EnergyEventKind;
  detectionMechanism: 'refuel' | 'recharge' | string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: EnergyEventConfidence;
  /** REFUEL only: observed fuel-level-rise start (ISO); not pump duration. */
  fuelLevelRiseStart: string | null;
  /** REFUEL only: observed fuel-level-rise end (ISO); not pump duration. */
  fuelLevelRiseEnd: string | null;
  /** REFUEL only: observed fuel-level-rise duration in seconds; nullable. */
  fuelLevelRiseDurationSeconds: number | null;
  /** REFUEL only: persisted fuel-station enrichment (Phase E API). */
  stationEnrichment?: EnergyEventStationEnrichment;
}

export type TripTimelineItem =
  | ({ itemType: 'trip' } & VehicleTripAnalytics)
  | ({ itemType: 'energy-event' } & EnergyEvent);

export type TripAttributionScope =
  | 'PRIVATE'
  | 'BOOKING_ASSIGNED'
  | 'BOOKING_TIME_WINDOW_MATCH'
  | 'UNASSIGNED';

export type TripAttributionConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TripAttribution {
  scope: TripAttributionScope;
  confidence: TripAttributionConfidence;
  customerRelevant: boolean;
  bookingRelevant: boolean;
  customerChargeable: boolean;
  bookingId?: string | null;
  customerId?: string | null;
  reason: string;
}

export type TripAssessmentStatus =
  | 'UNAUFFAELLIG'
  | 'BEOBACHTEN'
  | 'AUFFAELLIG'
  | 'KRITISCH'
  | 'PRUEFHINWEIS'
  | 'NICHT_BEWERTBAR';

export type TripEvidenceLevel =
  | 'NONE'
  | 'INFO'
  | 'CHECK_RECOMMENDED'
  | 'MISUSE_SUSPECTED'
  | 'DAMAGE_RISK'
  | 'CRITICAL_DAMAGE_RISK';

export type TripEvidenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type TripEvidenceCaseSource =
  | 'NATIVE_EVENT'
  | 'HF_RECONSTRUCTION'
  | 'CONTEXT_ENRICHMENT'
  | 'MIXED';

export interface TripEvidenceCase {
  id: string;
  type: string;
  evidenceLevel: TripEvidenceLevel;
  title: string;
  explanation: string;
  confidence: TripEvidenceConfidence;
  chargeable: boolean;
  requiresHumanReview: boolean;
  reasons: string[];
  measurements: {
    rpm?: number;
    throttle?: number;
    engineLoad?: number;
    coolant?: number;
    speedBeforeAfter?: string;
    durationMs?: number;
  };
  source: TripEvidenceCaseSource;
}

export type MisuseCaseStatus =
  | 'CANDIDATE'
  | 'ACTIVE'
  | 'REVIEW_REQUIRED'
  | 'CONFIRMED'
  | 'DISMISSED'
  | 'RESOLVED'
  | 'SUPERSEDED'
  | 'NOT_ASSESSABLE';

export type MisuseCaseDecisionEligibility =
  | 'INFORMATIONAL_ONLY'
  | 'REVIEW_ONLY'
  | 'MANUAL_CONFIRMATION_ONLY'
  | 'OPERATIONAL_ELIGIBLE'
  | 'NOT_ELIGIBLE';

export interface MisuseCaseLifecycle {
  status: MisuseCaseStatus;
  modelVersion: string;
  inputFingerprint: string;
  analysisRunId: string | null;
  evidenceCount: number;
  attributionConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  decisionEligibility: MisuseCaseDecisionEligibility;
  supersedesCaseId: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  informationalOnly: boolean;
}

export interface MisuseCaseRecord {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  categoryLabel?: string;
  type: string;
  typeLabel?: string;
  severity: string;
  confidence: string;
  eventCount: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  recommendedAction?: string | null;
  attributionLabel?: string;
  isPrivateTripSnapshot?: boolean;
  vehicleId?: string | null;
  bookingId?: string | null;
  tripId?: string | null;
  customerId?: string | null;
  evidenceSummary?: Record<string, unknown> | null;
  evidenceCase?: TripEvidenceCase | null;
  lifecycle?: MisuseCaseLifecycle;
  /** Legacy top-level status when lifecycle block is absent. */
  status?: string;
}

export type TripAssessmentConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type TripAssessmentSource =
  | 'NATIVE_EVENTS'
  | 'HF_RECONSTRUCTED'
  | 'STRESS_ONLY'
  | 'MISUSE_EVIDENCE'
  | 'MIXED'
  | 'NO_DATA';

export interface TripAssessment {
  status: TripAssessmentStatus;
  label: string;
  primaryReason: string;
  confidence: TripAssessmentConfidence;
  source: TripAssessmentSource;
  version: string;
  signals: {
    behaviorEvents: number;
    abuseRelevantEvents: number;
    misuseCases: number;
    maxEvidenceLevel: TripEvidenceLevel | null;
    drivingStressScore: number | null;
    drivingStressLevel: string | null;
    hasEnoughData: boolean;
  };
}

export interface VehicleTripAnalytics {
  id: string;
  vehicleId: string;
  tripStatus: 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  endTime?: string | null;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  avgSpeedKmh?: number | null;
  maxSpeedKmh?: number | null;
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  /** @deprecated Legacy mirror — use drivingStressScore */
  drivingScore?: number | null;
  scoreSource?:
    | 'trip_driving_impact'
    | 'vehicle_trip_compat'
    | 'derived'
    | 'r1_temporal_containment_unavailable';
  drivingImpactAnalysisStatus?:
    | 'PENDING'
    | 'COMPLETE'
    | 'PARTIAL'
    | 'UNSUPPORTED'
    | 'FAILED'
    | 'STALE'
    | null;
  drivingImpactScoreSource?: VehicleTripAnalytics['scoreSource'] | null;
  drivingImpactSourceCompleteness?: number | null;
  totalAccelerationEvents?: number;
  hardAccelerationEvents?: number;
  totalBrakingEvents?: number;
  hardBrakingEvents?: number;
  fullBrakingEvents?: number;
  corneringEvents?: number;
  abuseEvents?: number;
  behaviorReady?: boolean;
  behaviorEnrichmentStatus?: string | null;
  detailsLimited?: boolean;
  analysisAssessability?: 'FULL' | 'LIMITED' | 'NOT_ASSESSABLE' | null;
  analysisLimitReason?: string | null;
  deviceQualityWarning?: boolean;
  deviceQualityVehicleStatus?: 'NORMAL' | 'DEGRADED' | 'RECOVERING' | null;
  shortTermMisuseAssessable?: boolean;
  tripAnalysisStatus?: 'PENDING' | 'IN_PROGRESS' | 'PARTIAL' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | null;
  tripAnalysisLabel?: string | null;
  analysisInProgress?: boolean;
  analysisQueuedAt?: string | null;
  analysisStartedAt?: string | null;
  analysisPartialAt?: string | null;
  analysisCompletedAt?: string | null;
  analysisFailedAt?: string | null;
  analysisLatencyMs?: number | null;
  totalAnalysisLatencyMs?: number | null;
  assignmentStatus?: TripAssignmentStatus | null;
  assignmentSubjectType?: TripAssignmentSubjectType | null;
  assignmentSubjectId?: string | null;
  assignedBookingId?: string | null;
  bookingLinkSource?: 'EXPLICIT' | 'TIME_WINDOW' | null;
  isPrivateTrip?: boolean;
  scoreEligible?: boolean;
  tripAttribution?: TripAttribution | null;
  tripAssessment?: TripAssessment | null;
  tripDecisionSummary?: Record<string, unknown> | null;
  clickhouseEvidence?: TripClickHouseEvidence | null;
  drivingImpactModelProfile?: {
    version: string;
    profile:
      | 'LTE_R1_NATIVE'
      | 'ICE_SIGNAL_CONTEXT'
      | 'SMART5_LIMITED'
      | 'TESLA_LIMITED'
      | 'UNKNOWN_LIMITED';
    comparabilityGroup?: string;
    behavioralIngestionPath?: string;
    comparabilityHint?: string;
    gatingApplied?: boolean;
    reasonCodes?: string[];
  } | null;
  [key: string]: unknown;
}

/** Read-only ClickHouse trip evidence — analytics mirror, not canonical scores. */
export interface TripClickHouseEvidence {
  evidenceAvailable: boolean;
  clickhouseStatus: 'available' | 'degraded' | 'unavailable' | 'mirror_disabled';
  readOnly: true;
  signalQuality: 'good' | 'medium' | 'weak' | 'unavailable';
  hfAvailability: 'hf_available' | 'sparse' | 'missing' | 'unknown';
  snapshotSampleCount: number | null;
  hfPointCount: number;
  hfEventCount: number;
  hfWindowCount: number;
  gpsCoverage: 'available' | 'sparse' | 'missing';
  signalAvailability: {
    rpm: boolean;
    throttle: boolean;
    engineLoad: boolean;
    coolant: boolean;
    tractionPower: boolean;
  };
  missingSignals: string[];
  evidenceSummary: string[];
  detectorFeasibility: Array<{
    detector: string;
    status: string;
    requiredSignals: string[];
    speedOnly: boolean;
  }>;
  lastEvidenceAt: string | null;
  degraded: boolean;
  debugReason?: string | null;
}

export interface VehicleTripStats {
  totalTrips: number;
  totalDistanceKm: number;
  avgDrivingStressScore: number | null;
  stressLevel: 'low' | 'moderate' | 'high' | 'critical' | null;
  /** @deprecated Mirror of avgDrivingStressScore */
  avgDrivingScore: number | null;
  avgDrivingStyleScore: number | null;
  totalAccelerationEvents: number;
  totalHardAccelerationEvents: number;
  totalBrakingEvents: number;
  totalHardBrakingEvents: number;
  totalAbuseEvents: number;
  totalSpeedingEvents: number;
  privateTripCount: number;
  assignedTripCount: number;
}

export interface DrivingImpactRollingWindow {
  version: string;
  windowDays: number;
  windowStartedAt: string | null;
  windowEndedAt: string | null;
  tripCount: number;
  scoredTripCount: number;
  excludedTripCount: number;
  distanceKmWindow: number;
  excludedDistanceKm: number;
  modelVersion: string;
  modelProfileVersion: string | null;
  modelProfile: string | null;
  mixPolicy: string;
  sourceQuality: {
    measuredShare: number;
    providerClassifiedShare: number;
    reconstructedShare: number;
    estimatedProxyShare: number;
    contextOnlyShare: number;
    measurementCoverage: number | null;
  };
  proxyShare: {
    estimatedProxyShare: number;
    brakingProxyKinematicShare: number;
  };
  healthEligibility: string;
  notDriverEvaluation: true;
  comparabilityHint: string | null;
  recomputeDeterministic: true;
}

export interface DrivingImpactRollingResponse {
  rollingWindow: DrivingImpactRollingWindow | null;
  drivingStressScore: number | null;
  notDriverEvaluation: true;
}

export interface DriverScoreSummary {
  subjectType: TripAssignmentSubjectType;
  subjectId: string;
  tripCount: number;
  scoredTripCount: number;
  drivingStressScore: number | null;
  stressLevel: 'low' | 'moderate' | 'high' | 'critical' | null;
  assignmentCoveragePct: number;
}

export type RentalClearanceStatus =
  | 'CLEARED'
  | 'PENDING'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export interface RentalClearanceSummary {
  status: RentalClearanceStatus;
  label: string;
  reasons: string[];
}

export interface CustomerApiRecord {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  postalCode?: string | null;
  country?: string | null;
  company?: string | null;
  companyName?: string | null;
  customerType?: string | null;
  type?: string | null;
  bookingCount?: number;
  totalBookings?: number;
  bookings?: unknown[];
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  scoreEligibleTripCount?: number;
  hasEnoughData?: boolean;
  // V4.6.66 — booking-derived aggregates returned by /customers and /customers/:id.
  totalRevenueCents?: number;
  lastBookingDate?: string | null;
  lastTrip?: string | null;
  status?: string | null;
  archivedAt?: string | null;
  riskLevel?: string | null;
  idVerified?: boolean | null;
  licenseVerified?: boolean | null;
  idVerificationStatus?: string | null;
  licenseVerificationStatus?: string | null;
  rentalClearance?: RentalClearanceSummary | null;
  createdAt?: string | null;
  joinDate?: string | null;
  licenseExpiry?: string | null;
  licenseIssuedAt?: string | null;
  accidents?: number | null;
  violations?: number | null;
  currentVehicle?: string | null;
  notes?: string | null;
  dataConfidence?: 'none' | 'low' | 'medium' | 'high';
  scoredTripCount?: number;
  totalDistanceKm?: number;
  [key: string]: unknown;
}

export interface RentalDrivingAnalysisItem {
  id: string;
  bookingId: string;
  vehicleId: string;
  bookingCustomerId: string;
  assignedDriverId?: string | null;
  actualDriverId?: string | null;
  /** @deprecated Legacy — use bookingCustomerId for contract holder */
  driverId?: string | null;
  periodStart: string;
  periodEnd: string;
  overallLevel: string;
  riskLevel: string;
  /** Legacy column — mirrors vehicle stress score */
  drivingScore: number | null;
  drivingEventsCount?: number | null;
  abuseDetectionCount?: number | null;
  wearImpact?: string | null;
  driverStyleCategory?: string | null;
  payload: {
    overallAssessment?: { level?: string; title?: string; shortSummary?: string };
    vehicleStressSummary?: {
      drivingStressScore?: number | null;
      stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
      longitudinalStressScore?: number | null;
      brakingStressScore?: number | null;
      stopGoStressScore?: number | null;
      highSpeedStressScore?: number | null;
      thermalBrakeStressScore?: number | null;
      summary?: string;
    };
    eventSummary?: {
      drivingEventsCount?: number | null;
      abuseDetectionCount?: number | null;
      errorCodeOccurred?: boolean;
      eventHighlights?: string[];
    };
    wearImpactAssessment?: {
      overallWearImpact?: string;
      summary?: string;
      affectedAreas?: Array<{ area: string; impact: string; reason?: string }>;
    };
    usagePattern?: {
      tripType?: string;
      roadDistribution?: { cityPercent?: number; highwayPercent?: number; countryRoadPercent?: number };
      temperatureContext?: { avgTemperatureC?: number | null; climateNote?: string };
    };
    watchpoints?: string[];
    recommendations?: string[];
    analysisMeta?: {
      tripCount?: number;
      scoredTripCount?: number;
      totalDistanceKm?: number;
      assignmentCoveragePct?: number;
      hasEnoughData?: boolean;
      dataConfidence?: 'low' | 'medium' | 'high';
      analysisSource?: string;
    };
    [key: string]: unknown;
  } | null;
  vehicle?: { id?: string; make?: string; model?: string; licensePlate?: string } | null;
  driver?: { id?: string; firstName?: string; lastName?: string } | null;
  [key: string]: unknown;
}

// ── Workflow Automation types ───────────────────────────────────────────────
export interface WorkflowTriggerDto {
  type: string;
  config?: Record<string, unknown>;
}
export interface WorkflowConditionDto {
  field?: string;
  path?: string;
  operator: string;
  value?: unknown;
}
export interface WorkflowActionDto {
  type: string;
  config?: Record<string, unknown>;
  requiresApproval?: boolean;
}
export interface WorkflowScopeDto {
  type: string;
  stationIds?: string[];
  vehicleIds?: string[];
}
export interface WorkflowDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  category: string;
  trigger: WorkflowTriggerDto;
  conditions: WorkflowConditionDto[];
  actions: WorkflowActionDto[];
  scope: WorkflowScopeDto;
  status: string;
  statusLabel?: string;
  enabled?: boolean;
  version?: number;
  createdById: string | null;
  createdByName: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  lastTriggeredAt: string | null;
  triggerCount: number;
  isTemplate?: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface WorkflowListItemDto extends WorkflowDto {
  riskClass: 'LOW' | 'HIGH' | 'CRITICAL';
  sourceType: 'custom' | 'system' | 'migrated';
  approvalStatus: 'none' | 'pending' | 'approved';
  activeVersion: number;
  lastRunAt: string | null;
  lastRunOutcome:
    | 'none'
    | 'success'
    | 'failed'
    | 'partial'
    | 'waiting_approval'
    | 'skipped'
    | 'policy_blocked';
  lastRunLabel: string | null;
  hasLegacyMapping: boolean;
  unavailableActionCount: number;
}
export interface WorkflowStatsDto {
  total: number;
  active: number;
  draft: number;
  disabled: number;
  invalid: number;
  pendingActivation?: number;
  archived?: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  waitingApprovalRuns: number;
  runsLast24h: number;
  lastRunAt: string | null;
}
export interface WorkflowAuditEventDto {
  id: string;
  organizationId: string;
  workflowId?: string | null;
  workflowRunId?: string | null;
  actionRunId?: string | null;
  eventType: string;
  retentionClass: string;
  retentionDays?: number;
  actorUserId?: string | null;
  correlationId?: string | null;
  summary: string;
  payload: Record<string, unknown>;
  payloadHash?: string | null;
  aiTransparency?: Record<string, unknown> | null;
  legalHold?: boolean;
  createdAt: string;
}
export interface WorkflowChangeRequestDiffDto {
  field: string;
  before: unknown;
  after: unknown;
}
export interface WorkflowChangeRequestDto {
  id: string;
  organizationId: string;
  workflowId: string;
  operation: string;
  status: string;
  makerUserId: string;
  checkerUserId?: string | null;
  makerReason: string;
  checkerReason?: string | null;
  proposedDefinition: Record<string, unknown>;
  proposedDefinitionHash: string;
  proposedWorkflowVersion: number;
  proposedStatus: string;
  expiresAt: string;
  emergencyOverride?: boolean;
  emergencyReason?: string | null;
  decisionVersion: number;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  diff?: WorkflowChangeRequestDiffDto[] | null;
  expired?: boolean;
}
export interface WorkflowMutationResultDto extends WorkflowDto {
  pendingActivation?: boolean;
  changeRequest?: WorkflowChangeRequestDto | null;
}
export interface WorkflowActionRunDto {
  id: string;
  organizationId: string;
  workflowRunId: string;
  workflowId: string;
  actionType: string;
  actionIndex: number;
  status: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
  requiresApproval: boolean;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}
export interface WorkflowRunDto {
  id: string;
  organizationId: string;
  workflowId: string;
  workflowVersion: number;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  status: string;
  inputPayload: Record<string, unknown>;
  conditionResult?: Record<string, unknown> | null;
  errorMessage?: string | null;
  idempotencyKey: string;
  startedAt: string;
  finishedAt?: string | null;
  createdAt: string;
  actionRuns?: WorkflowActionRunDto[];
  workflow?: { id: string; name: string; version: number };
}
export interface WorkflowCreatePayload {
  name: string;
  description?: string;
  category: string;
  trigger: WorkflowTriggerDto;
  conditions?: WorkflowConditionDto[];
  actions: WorkflowActionDto[];
  scope?: WorkflowScopeDto;
  status?: string;
  activationReason?: string;
}
export type WorkflowUpdatePayload = Partial<WorkflowCreatePayload>;
export interface WorkflowTestPayload {
  payload?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  eventType?: string;
  proposedDefinition?: Record<string, unknown>;
  sourceRevisionType?: 'saved' | 'draft';
}
export interface WorkflowPlannedActionDto {
  index: number;
  actionType: string;
  riskClass: string;
  requiresApproval: boolean;
  status: 'PLANNED' | 'SKIPPED' | 'BLOCKED' | 'ERROR';
  policyBlockers: string[];
  resolvedRecipients?: Array<{ channel: string; masked: string }>;
  preview?: Record<string, unknown>;
  validationErrors: string[];
  expectedFallback?: string;
  skipReason?: string;
}
export interface WorkflowExecutionPlanDto {
  executionMode: 'DRY_RUN';
  executed: false;
  message: string;
  requestId: string;
  correlationId: string;
  assessedAt: string;
  riskClass: 'LOW' | 'HIGH' | 'CRITICAL';
  sourceRevision: {
    type: 'saved' | 'draft';
    version: number;
  };
  workflowId: string;
  workflowVersion: number;
  workflowName: string;
  event: {
    type: string;
    entityType?: string | null;
    entityId?: string | null;
    normalizedPayload: Record<string, unknown>;
  };
  scope: {
    passed: boolean;
    scopeType: string;
    reason?: string;
    details?: Record<string, unknown>;
  };
  conditions: {
    passed: boolean;
    results: Array<{ path: string; operator: string; passed: boolean }>;
  };
  plannedActions: WorkflowPlannedActionDto[];
  skippedActions: WorkflowPlannedActionDto[];
  validationErrors: string[];
  policyBlockers: string[];
  wouldCreateApprovals: boolean;
}
export interface WorkflowRevisionDiffChangeDto {
  kind: string;
  field: string;
  label: string;
  before?: unknown;
  after?: unknown;
  detail?: string;
}
export interface WorkflowRevisionDiffResultDto {
  hasChanges: boolean;
  changes: WorkflowRevisionDiffChangeDto[];
  baselineVersion: number;
  proposedVersion: number;
  baselineRiskClass: string;
  proposedRiskClass: string;
  actor?: string | null;
  changedAt?: string | null;
  reason?: string | null;
}
export interface WorkflowTestResultDto {
  executed?: false;
  plan?: WorkflowExecutionPlanDto;
  runIds: string[];
  runs: WorkflowRunDto[];
  message?: string;
}

// ── Account Self-Service (Settings → Account Information) ───────────────────
export type AccountNotificationCategory =
  | 'BOOKINGS'
  | 'PICKUPS_RETURNS'
  | 'TASKS'
  | 'INVOICES_PAYMENTS'
  | 'VEHICLE_HEALTH'
  | 'DAMAGE_MISUSE'
  | 'DOCUMENTS'
  | 'WEEKLY_REPORTS'
  | 'SECURITY';

export interface TenantOrganizationProfileDto {
  id: string;
  companyName: string;
  legalCompanyName: string | null;
  legalForm: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  /** @deprecated Legacy combined tax identifier — prefer taxNumber / vatId */
  taxId: string | null;
  taxNumber: string | null;
  vatId: string | null;
  isSmallBusiness: boolean;
  defaultVatRate: number | null;
  invoicePrefix: string | null;
  nextInvoiceNumber: number;
  paymentTermsDays: number;
  invoiceEmail: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  pdfFooterText: string | null;
  emailSignature: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string | null;
  language: string | null;
  managerName: string | null;
  managerEmail: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  pdfLogoUrl: string | null;
  accentColor: string | null;
  businessType: string;
}

export type TenantOrganizationProfileUpdate = Partial<
  Pick<
    TenantOrganizationProfileDto,
    | 'companyName'
    | 'legalCompanyName'
    | 'legalForm'
    | 'address'
    | 'city'
    | 'state'
    | 'zip'
    | 'country'
    | 'taxId'
    | 'taxNumber'
    | 'vatId'
    | 'isSmallBusiness'
    | 'defaultVatRate'
    | 'invoicePrefix'
    | 'nextInvoiceNumber'
    | 'paymentTermsDays'
    | 'invoiceEmail'
    | 'bankName'
    | 'iban'
    | 'bic'
    | 'pdfFooterText'
    | 'emailSignature'
    | 'phone'
    | 'email'
    | 'website'
    | 'timezone'
    | 'language'
    | 'managerName'
    | 'managerEmail'
    | 'logoUrl'
    | 'logoDarkUrl'
    | 'pdfLogoUrl'
    | 'accentColor'
  >
>;

/** Company Information form save — excludes legacy taxId (DB field preserved server-side). */
export type TenantOrganizationProfileUiUpdate = Omit<
  TenantOrganizationProfileUpdate,
  'taxId' | 'logoDarkUrl' | 'pdfLogoUrl'
>;

export interface AccountMeDto {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
    phone: string | null;
    mobile: string | null;
    avatarUrl: string | null;
    language: string | null;
    timezone: string | null;
    dateFormat: string | null;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    lastLoginDevice: string | null;
    createdAt: string;
    updatedAt: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
  };
  membership: {
    id: string;
    role: string;
    roleLabel: string | null;
    department: string | null;
    position: string | null;
    stationScope: string | null;
    permissions: Record<string, { read: boolean; write: boolean }> | null;
    status: string;
  };
  preferences: {
    language: string | null;
    timezone: string | null;
    dateFormat: string | null;
    defaultStationId: string | null;
    defaultLandingPage: string | null;
  };
  notifications: Array<{
    category: AccountNotificationCategory;
    label: string;
    description: string;
    inApp: boolean;
    email: boolean;
    push: boolean;
    sms: boolean;
    criticalOnly: boolean;
  }>;
  security: {
    hasPassword: boolean;
    twoFactorEnabled: boolean;
    twoFactorAvailable: boolean;
    passkeysAvailable: boolean;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    activeSessionCount: number;
    securityScore: number;
    recommendations: string[];
  };
  accountHealth: {
    score: number;
    completedItems: string[];
    missingItems: string[];
    recommendations: string[];
  };
}

export interface AccountSessionDto {
  id: string;
  current: boolean;
  userAgent: string | null;
  browser: string | null;
  device: string | null;
  os?: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: 'active' | 'revoked' | 'expired';
}

/** Users & Roles — access control (V4.8.34) */
export type MembershipPermissionLevel = {
  read: boolean;
  write: boolean;
  manage?: boolean;
};

export type MembershipPermissionsMap = Record<string, MembershipPermissionLevel>;

export type OrganizationInviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export type InviteDeliveryStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'DEAD_LETTER';

export interface OrganizationInviteDto {
  inviteId: string;
  status: OrganizationInviteStatus;
  expiresAt: string;
  deliveryStatus: InviteDeliveryStatus;
  recipientMasked: string;
  roleSummary: string;
}

export interface CreateOrganizationInvitePayload {
  email: string;
  membershipRole?: string;
  organizationRoleId?: string;
  permissions?: MembershipPermissionsMap;
  stationScope?: string;
  stationIds?: string[];
  fieldAgentAccess?: boolean;
  department?: string;
  position?: string;
  roleLabel?: string;
  firstName?: string;
  lastName?: string;
}

export interface OrganizationRoleDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  systemKey: string | null;
  isSystemTemplate: boolean;
  isDefault: boolean;
  isActive: boolean;
  membershipRole: string;
  permissions: MembershipPermissionsMap | null;
  stationScopeDefault: string | null;
  defaultStationIds: string[];
  fieldAgentAccessDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationRolePayload {
  name: string;
  description?: string;
  membershipRole: string;
  permissions?: MembershipPermissionsMap;
  stationScopeDefault?: string;
  defaultStationIds?: string[];
  fieldAgentAccessDefault?: boolean;
}

export interface UpdateOrganizationRolePayload extends Partial<CreateOrganizationRolePayload> {
  isActive?: boolean;
}

export interface OrganizationRolePermissionPreviewDto {
  roleId: string;
  name: string;
  membershipRole: string;
  permissions: MembershipPermissionsMap | null;
  fieldAgentAccessDefault: boolean;
  stationScopeDefault: string | null;
  defaultStationIds: string[];
}

export interface OrgUserDto {
  id: string;
  membershipId: string;
  name: string;
  displayName?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  roleKey: string;
  membershipRole?: string;
  roleLabel: string;
  organizationRoleId?: string | null;
  organizationRoleName?: string;
  organizationId: string;
  organizationName: string;
  department: string;
  position: string;
  stationScope: string;
  stationIds?: string[];
  fieldAgentAccess: boolean;
  permissions: MembershipPermissionsMap | null;
  status: string;
  membershipStatus: string;
  lastActive: string;
  lastLoginAt: string;
  createdAt: string;
  updatedAt?: string;
  avatar: string;
  phone: string;
  mobile: string;
  address?: string;
  language: string;
  timezone: string;
  dateFormat: string;
  mustChangePassword?: boolean;
  lastLoginIp?: string;
  lastLoginDevice?: string;
  pendingInviteId?: string | null;
}

export interface UserSecurityActivityDto {
  userId: string;
  email: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  membershipStatus: string;
  organizationRole: { id: string; name: string } | null;
  inviteStatus: OrganizationInviteStatus | null;
  invitedAt: string | null;
  twoFactorEnabled: boolean | null;
  activeSessionCount: number | null;
  auditTimeline: Array<{
    id: string;
    action: string;
    entity: string;
    description: string;
    auditAction: string | null;
    createdAt: string;
    level: string;
  }>;
}

export type IamMfaState =
  | 'ENABLED'
  | 'DISABLED'
  | 'REQUIRED'
  | 'UNKNOWN'
  | 'NOT_SUPPORTED'
  | 'ACTION_REQUIRED';

export type IamRiskClassification = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IamReviewState = 'NONE' | 'PENDING' | 'OVERDUE' | 'COMPLETED';

export interface IamTeamKpisDto {
  activeUsers: number;
  openInvites: number;
  privilegedAccounts: number;
  reviewRequired: number;
}

export interface IamTeamListItemDto {
  kind: 'MEMBER' | 'INVITE';
  membershipId: string | null;
  inviteId: string | null;
  userSummary: {
    userId: string | null;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
  };
  membershipStatus: string;
  effectiveRole: string;
  effectiveRoleLabel: string | null;
  riskClassification: IamRiskClassification;
  stationScopeSummary: string;
  mfaState: IamMfaState;
  activeSessionCount: number;
  lastActivityAt: string | null;
  reviewState: IamReviewState;
  requiresAction: boolean;
  reasonCodes: string[];
}

export interface IamAvailableActionDto {
  enabled: boolean;
  requiresStepUp?: boolean;
  blockedReason?: string | null;
  impactPreview?: string | null;
}

export interface IamTeamMemberDetailDto {
  membershipId: string;
  userId: string;
  userSummary: IamTeamListItemDto['userSummary'];
  membershipStatus: string;
  effectiveAccess: {
    membershipId: string;
    membershipVersion: number;
    effectiveRole: string;
    effectiveRoleId: string | null;
    effectiveRoleLabel: string | null;
    privilegedCapabilities: string[];
    permissions: MembershipPermissionsMap | null;
    stationScope: string | null;
    stationIds: string[] | null;
    stationNames: string[];
    fieldAgentAccess: boolean;
    riskClassification: IamRiskClassification;
    reasonCodes: string[];
    isLastOrgAdmin: boolean;
  };
  inheritedPermissions: MembershipPermissionsMap | null;
  overrides: {
    permissions: MembershipPermissionsMap | null;
    stationScope: string | null;
    stationIds: string[] | null;
    fieldAgentAccess: boolean;
  };
  roleVersion: string;
  scope: {
    stationScope: string | null;
    stationIds: string[] | null;
    stationNames: string[];
    fieldAgentAccess: boolean;
  };
  sessions: {
    activeSessionCount: number;
    items: Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      ipAddress: string | null;
      userAgent: string | null;
      isCurrent: boolean;
    }>;
  };
  securityEvents: Array<{
    id: string;
    action: string;
    description: string;
    auditAction: string | null;
    createdAt: string;
    level: string;
  }>;
  inviteHistory: Array<{
    id: string;
    status: string;
    createdAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
  }>;
  accessReviews: Array<{
    id: string;
    campaignId: string;
    status: string;
    effectiveRole: string | null;
    riskReasons: string[];
    createdAt: string;
  }>;
  auditTimeline: Array<{
    id: string;
    action: string;
    description: string;
    auditAction: string | null;
    createdAt: string;
    level: string;
  }>;
  mfaState: IamMfaState;
  reviewState: IamReviewState;
  requiresAction: boolean;
  reasonCodes: string[];
  availableActions: {
    sendResetLink: IamAvailableActionDto;
    revokeSessions: IamAvailableActionDto;
    suspendMembership: IamAvailableActionDto;
    changeRole: IamAvailableActionDto;
    changeScope: IamAvailableActionDto;
    openAccessReview: IamAvailableActionDto;
  };
}

export interface IamRoleListItemDto {
  id: string;
  name: string;
  description: string | null;
  membershipRole: string;
  assignmentCount: number;
  riskClassification: IamRiskClassification;
  roleVersion: string;
  lastChangedAt: string;
  isSystemTemplate: boolean;
  isDefault: boolean;
  followsLatest: boolean;
  pinned: boolean;
  isActive: boolean;
}

export interface IamRoleDetailDto extends IamRoleListItemDto {
  effectivePermissions: MembershipPermissionsMap | null;
  overrides: {
    stationScopeDefault: string | null;
    defaultStationIds: string[];
    fieldAgentAccessDefault: boolean;
  };
  impactPreview: {
    affectedMemberCount: number;
    privilegedCapabilities: string[];
    stationScopeImpact: string;
  };
  assignments: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    email: string;
    membershipStatus: string;
  }>;
}

export interface IamSecurityOverviewDto {
  mfaSummary: Record<IamMfaState, number>;
  activeSessions: number;
  privilegedAccounts: number;
  reviewRequired: number;
  loginSecurityEvents: Array<{
    id: string;
    userId: string | null;
    description: string;
    createdAt: string;
    level: string;
  }>;
  iamAudit: Array<{
    id: string;
    auditAction: string | null;
    description: string;
    createdAt: string;
    level: string;
  }>;
  accessReviews: Array<{
    id: string;
    status: string;
    scope: string;
    dueAt: string;
    pendingItems: number;
  }>;
  privilegedMembers: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    email: string;
    riskClassification: IamRiskClassification;
    mfaState: IamMfaState;
  }>;
}

export type CustomerVerificationCheckKindApi =
  | 'ID_DOCUMENT'
  | 'DRIVING_LICENSE'
  | 'PROOF_OF_ADDRESS';

export type DocumentEligibilityStatusApi =
  | 'verified'
  | 'missing'
  | 'pending'
  | 'pickup_required'
  | 'requires_review'
  | 'rejected'
  | 'expired';

export type ProofOfAddressEligibilityStatusApi =
  | 'not_required'
  | 'required'
  | 'verified'
  | 'pending'
  | 'requires_review'
  | 'rejected';

export type CustomerDocumentDomainStatusValueApi =
  | 'VERIFIED'
  | 'PENDING_REVIEW'
  | 'NOT_SUBMITTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'NOT_REQUIRED';

export interface CustomerDocumentDomainStatus {
  status: CustomerDocumentDomainStatusValueApi;
  provider?: 'DIDIT' | 'MANUAL' | 'SYNQDRIVE_AI_UPLOAD';
  checkedByName?: string;
  checkedByUserId?: string;
  submittedAt?: string;
  verifiedAt?: string;
  expiresAt?: string;
  documentNumber?: string;
  documentCountry?: string;
  displayName: string;
  source: 'verification_check' | 'customer_document' | 'legacy_read_model' | 'policy';
  rejectedReason?: string;
}

export interface CustomerDocumentVerificationStatusDto {
  customerId: string;
  idDocument: CustomerDocumentDomainStatus;
  drivingLicense: CustomerDocumentDomainStatus;
  proofOfAddress: CustomerDocumentDomainStatus;
  missingUploadSlots: Array<{
    slot: string;
    label: string;
    documentType: string;
  }>;
}

export interface CustomerVerificationEligibilityDto {
  customerId: string;
  bookingId?: string | null;
  idDocument: DocumentEligibilityStatusApi;
  drivingLicense: DocumentEligibilityStatusApi;
  proofOfAddress: ProofOfAddressEligibilityStatusApi;
  canConfirmBooking: boolean;
  canStartPickup: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export interface CustomerVerificationCheckDto {
  id: string;
  customerId: string;
  bookingId?: string | null;
  provider: string;
  kind: CustomerVerificationCheckKindApi;
  status: string;
  providerSessionId?: string | null;
  providerStatus?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiditVerificationSessionDto {
  url: string;
  sessionId: string;
  checkId: string;
  status: string;
}

export interface ManualPickupCheckDto {
  customerId: string;
  bookingId: string;
  idDocumentSeen: boolean;
  idNameMatchesBooking: boolean;
  idDateOfBirthChecked: boolean;
  minimumAgePassed: boolean;
  drivingLicenseSeen: boolean;
  licenseNameMatchesBooking: boolean;
  licenseClassValid: boolean;
  licenseNotExpired: boolean;
  minimumLicenseDurationPassed?: boolean;
  notes?: string;
}

function billingTenantQuery(
  orgId?: string,
  params?: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  if (orgId) search.set('orgId', orgId);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

function fetchFleetRentalHealthPage(orgId: string, filters?: FleetRentalHealthQuery) {
  const qs = buildFleetRentalHealthQueryString(filters);
  return get<FleetRentalHealthPage>(
    `/organizations/${orgId}/rental-health/fleet${qs ? `?${qs}` : ''}`,
  );
}

function fetchAllFleetRentalHealth(
  orgId: string,
  filters?: FleetRentalHealthQuery,
): Promise<{ vehicles: VehicleHealthResponse[]; summary: FleetRentalHealthSummary | null }> {
  return collectFleetRentalHealthPages(orgId, fetchFleetRentalHealthPage, filters);
}

export const api = {
  auth: {
    login: (email: string, password: string, organizationId?: string) =>
      post<{
        requiresOrganizationSelection?: boolean;
        requiresMfa?: boolean;
        mfaPendingToken?: string;
        organizations?: Array<{
          organizationId: string;
          organizationName: string | null;
          organizationLogoUrl: string | null;
          membershipId: string;
          role: string;
        }>;
        suggestedOrganizationId?: string | null;
        token?: string;
        accessToken?: string;
        refreshToken?: string;
        expiresIn?: string;
        user?: any;
      }>('/auth/login', { email, password, ...(organizationId ? { organizationId } : {}) }),
    loginMfa: (payload: { mfaPendingToken: string; code?: string; recoveryCode?: string }) =>
      post<{
        token: string;
        accessToken: string;
        refreshToken: string;
        expiresIn: string;
        user: any;
      }>('/auth/login/mfa', payload),
    me: () => get<any>('/auth/me'),
    memberships: () =>
      get<{
        organizations: Array<{
          organizationId: string;
          organizationName: string | null;
          organizationLogoUrl: string | null;
          membershipId: string;
          role: string;
        }>;
        activeOrganizationId: string | null;
        suggestedOrganizationId: string | null;
      }>('/auth/memberships'),
    switchOrganization: (organizationId: string, refreshToken: string) =>
      post<{
        token: string;
        accessToken: string;
        refreshToken: string;
        expiresIn: string;
        user: any;
        organizations: Array<{
          organizationId: string;
          organizationName: string | null;
          organizationLogoUrl: string | null;
          membershipId: string;
          role: string;
        }>;
      }>('/auth/switch-organization', { organizationId, refreshToken }),
    seedAdmin: () => post<any>('/auth/seed-admin', {}),
  },
  customerVerification: {
    getEligibility: (customerId: string, bookingId?: string) => {
      const q = new URLSearchParams({ customerId });
      if (bookingId) q.set('bookingId', bookingId);
      return get<CustomerVerificationEligibilityDto>(
        `/customer-verification/eligibility?${q.toString()}`,
      );
    },
    getChecks: (customerId: string, bookingId?: string) => {
      const q = new URLSearchParams({ customerId });
      if (bookingId) q.set('bookingId', bookingId);
      return get<CustomerVerificationCheckDto[]>(
        `/customer-verification/checks?${q.toString()}`,
      );
    },
    startDiditSession: (
      customerId: string,
      bookingId: string | undefined,
      kind: CustomerVerificationCheckKindApi,
    ) =>
      post<DiditVerificationSessionDto>('/customer-verification/didit/session', {
        customerId,
        ...(bookingId ? { bookingId } : {}),
        kind,
      }),
    submitManualPickupCheck: (payload: ManualPickupCheckDto) =>
      post<{ checks: CustomerVerificationCheckDto[] }>(
        '/customer-verification/manual-pickup-check',
        payload,
      ),
  },
  account: {
    me: () => get<AccountMeDto>('/account/me'),
    updateProfile: (payload: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      mobile?: string | null;
    }) => patch<AccountMeDto>('/account/me/profile', payload),
    updatePreferences: (payload: {
      language?: 'de' | 'en';
      timezone?: string;
      dateFormat?: 'DD.MM.YYYY' | 'YYYY-MM-DD';
      defaultStationId?: string | null;
      defaultLandingPage?: 'dashboard' | 'bookings' | 'fleet' | 'customers' | 'tasks' | null;
    }) => patch<AccountMeDto>('/account/me/preferences', payload),
    updateNotifications: (payload: {
      preferences: Array<{
        category: AccountNotificationCategory;
        inApp?: boolean;
        email?: boolean;
        push?: boolean;
        sms?: boolean;
        criticalOnly?: boolean;
      }>;
    }) => patch<AccountMeDto>('/account/me/notifications', payload),
    changePassword: (payload: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
      revokeOtherSessions?: boolean;
    }) => post<{ message: string }>('/account/me/change-password', payload),
    sessions: () => get<AccountSessionDto[]>('/account/me/sessions'),
    revokeOtherSessions: (payload?: { keepSessionId?: string }) =>
      post<{ revoked: number; keptSessionId: string | null }>(
        '/account/me/sessions/revoke-others',
        payload ?? {},
      ),
    revokeSession: (sessionId: string) =>
      post<{ revoked: boolean }>(`/account/me/sessions/${sessionId}/revoke`, {}),
    mfa: {
      status: () =>
        get<{
          enrolled: boolean;
          factorTypes: string[];
          recoveryCodesRemaining: number;
          privilegedAccount: boolean;
          enrollmentRequired: boolean;
          stepUpEnforced: boolean;
        }>('/account/mfa/status'),
      enrollStart: () =>
        post<{ factorId: string; otpauthUrl: string; secretPreview: string }>(
          '/account/mfa/totp/enroll/start',
          {},
        ),
      enrollConfirm: (code: string, idempotencyKey: string) =>
        post<{ enrolled: true; recoveryCodes: string[] }>('/account/mfa/totp/enroll/confirm', {
          code,
          idempotencyKey,
        }),
      challenge: (payload: { code?: string; recoveryCode?: string; idempotencyKey?: string }) =>
        post<{
          accessToken: string;
          expiresIn: string;
          stepUpToken: string;
          stepUpExpiresAt: string;
          assuranceLevel: number;
          authMethods: string[];
          mfaAuthenticatedAt: string;
        }>('/account/mfa/challenge', payload),
    },
  },
  admin: {
    dashboard: () => get<any>('/admin/dashboard'),
    dashboardOperational: () => get<import('../master/dashboard/types').MasterDashboardOperationalDto>('/admin/dashboard/operational'),
    resilienceStatus: () => get<import('../master/dashboard/types').ResilienceStatusDto>('/admin/ops/resilience-status'),
    connectivityPlatformSummary: () =>
      get<import('../master/dashboard/types').ConnectivityPlatformSummaryDto>('/admin/connectivity/platform-summary'),
    orgStats: () => get<any>('/admin/stats/organizations'),
    revenueStats: () => get<any>('/admin/stats/revenue'),
    prune: () => post<{ message: string }>('/admin/prune', {}),
    physicalDeviceInventory: {
      summary: () =>
        get<import('./physical-device-inventory.types').PhysicalDeviceStockSummaryDto>(
          '/admin/physical-device-inventory/summary',
        ),
      identityMonitoringLiveSnapshot: () =>
        get<import('./physical-device-inventory.types').PdiIdentityMonitoringSnapshotDto>(
          '/admin/physical-device-inventory/identity-monitoring/live-snapshot',
        ),
      listDevices: (params?: import('./physical-device-inventory.types').ListPhysicalDevicesQuery) => {
        const q = new URLSearchParams();
        if (params?.search) q.set('search', params.search);
        if (params?.status) q.set('status', params.status);
        if (params?.modelCode) q.set('modelCode', params.modelCode);
        if (params?.warehouseLocation) q.set('warehouseLocation', params.warehouseLocation);
        if (params?.ownerOrganizationId) q.set('ownerOrganizationId', params.ownerOrganizationId);
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.offset != null) q.set('offset', String(params.offset));
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<import('./physical-device-inventory.types').PhysicalDeviceListResponseDto>(
          `/admin/physical-device-inventory/devices${suffix}`,
        );
      },
      manualIntake: (body: import('./physical-device-inventory.types').ManualIntakePhysicalDeviceRequest) =>
        post<import('./physical-device-inventory.types').ManualIntakePhysicalDeviceResponse>(
          '/admin/physical-device-inventory/devices/manual-intake',
          body,
        ),
      getDevice: (deviceId: string) =>
        get<import('./physical-device-inventory.types').PhysicalDeviceDetailDto>(
          `/admin/physical-device-inventory/devices/${encodeURIComponent(deviceId)}`,
        ),
      verifyIdentity: (
        deviceId: string,
        body: import('./physical-device-inventory.types').VerifyPhysicalDeviceIdentityRequest,
      ) =>
        post<import('./physical-device-inventory.types').PhysicalDeviceListItemDto>(
          `/admin/physical-device-inventory/devices/${encodeURIComponent(deviceId)}/verify-identity`,
          body,
        ),
      installOnVehicle: (
        deviceId: string,
        body: import('./physical-device-inventory.types').InstallPhysicalDeviceRequest,
      ) =>
        post<import('./physical-device-inventory.types').PhysicalDeviceListItemDto>(
          `/admin/physical-device-inventory/devices/${encodeURIComponent(deviceId)}/install`,
          body,
        ),
      uninstallFromVehicle: (
        deviceId: string,
        body: import('./physical-device-inventory.types').UninstallPhysicalDeviceRequest,
      ) =>
        post<import('./physical-device-inventory.types').PhysicalDeviceListItemDto>(
          `/admin/physical-device-inventory/devices/${encodeURIComponent(deviceId)}/uninstall`,
          body,
        ),
      returnToStock: (
        deviceId: string,
        body: import('./physical-device-inventory.types').ReturnPhysicalDeviceToStockRequest,
      ) =>
        post<import('./physical-device-inventory.types').PhysicalDeviceListItemDto>(
          `/admin/physical-device-inventory/devices/${encodeURIComponent(deviceId)}/return-to-stock`,
          body,
        ),
      markDefective: (
        deviceId: string,
        body: import('./physical-device-inventory.types').MarkPhysicalDeviceDefectiveRequest,
      ) =>
        post<import('./physical-device-inventory.types').PhysicalDeviceListItemDto>(
          `/admin/physical-device-inventory/devices/${encodeURIComponent(deviceId)}/mark-defective`,
          body,
        ),
      markLost: (
        deviceId: string,
        body: import('./physical-device-inventory.types').MarkPhysicalDeviceLostRequest,
      ) =>
        post<import('./physical-device-inventory.types').PhysicalDeviceListItemDto>(
          `/admin/physical-device-inventory/devices/${encodeURIComponent(deviceId)}/mark-lost`,
          body,
        ),
      retire: (
        deviceId: string,
        body: import('./physical-device-inventory.types').RetirePhysicalDeviceRequest,
      ) =>
        post<import('./physical-device-inventory.types').PhysicalDeviceListItemDto>(
          `/admin/physical-device-inventory/devices/${encodeURIComponent(deviceId)}/retire`,
          body,
        ),
    },
    masterIntelligenceVsi: {
      overview: (organizationId: string, vehicleId: string) =>
        get<import('../master/intelligence/vsi-master-intelligence-api.types').MasterVsiFleetOverviewDto>(
          `/admin/master-intelligence/vsi/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/overview`,
        ),
      profile: (organizationId: string, vehicleId: string, providerSourceLinkId: string) =>
        get<import('../master/intelligence/vsi-master-intelligence-api.types').MasterVsiProfileDetailDto>(
          `/admin/master-intelligence/vsi/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/links/${encodeURIComponent(providerSourceLinkId)}/profile`,
        ),
      revisions: (
        organizationId: string,
        vehicleId: string,
        providerSourceLinkId: string,
        params?: { limit?: number; cursor?: string | null },
      ) => {
        const q = new URLSearchParams();
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.cursor) q.set('cursor', params.cursor);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<import('../master/intelligence/vsi-master-intelligence-api.types').MasterVsiRevisionHistoryPageDto>(
          `/admin/master-intelligence/vsi/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/links/${encodeURIComponent(providerSourceLinkId)}/revisions${suffix}`,
        );
      },
      revisionAsOf: (
        organizationId: string,
        vehicleId: string,
        providerSourceLinkId: string,
        decisionAt: string,
        params?: { historicalLinkAttributionProven?: boolean },
      ) => {
        const q = new URLSearchParams({ decisionAt });
        if (params?.historicalLinkAttributionProven) q.set('historicalLinkAttributionProven', 'true');
        return get<import('../master/intelligence/vsi-master-intelligence-api.types').MasterVsiRevisionAsOfDto>(
          `/admin/master-intelligence/vsi/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/links/${encodeURIComponent(providerSourceLinkId)}/revisions/as-of?${q.toString()}`,
        );
      },
      signals: (organizationId: string, vehicleId: string, providerSourceLinkId: string) =>
        get<unknown>(
          `/admin/master-intelligence/vsi/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/links/${encodeURIComponent(providerSourceLinkId)}/signals`,
        ),
      capabilityResolver: (
        organizationId: string,
        vehicleId: string,
        providerSourceLinkId: string,
        params: { consumerModule: string; featureId: string; evaluationTime?: string },
      ) => {
        const q = new URLSearchParams({
          consumerModule: params.consumerModule,
          featureId: params.featureId,
        });
        if (params.evaluationTime) q.set('evaluationTime', params.evaluationTime);
        return get<unknown>(
          `/admin/master-intelligence/vsi/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/links/${encodeURIComponent(providerSourceLinkId)}/capability-resolver?${q.toString()}`,
        );
      },
    },
    masterIntelligenceApds: {
      overview: (organizationId: string, vehicleId: string, providerSourceLinkId?: string | null) => {
        const q = providerSourceLinkId
          ? `?providerSourceLinkId=${encodeURIComponent(providerSourceLinkId)}`
          : '';
        return get<import('../master/intelligence/apds-master-intelligence-api.types').MasterApdsOverviewDto>(
          `/admin/master-intelligence/apds/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/overview${q}`,
        );
      },
      epochs: (organizationId: string, vehicleId: string, params?: { limit?: number; cursor?: string | null }) => {
        const q = new URLSearchParams();
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.cursor) q.set('cursor', params.cursor);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<import('../master/intelligence/apds-master-intelligence-api.types').MasterApdsEpochHistoryPageDto>(
          `/admin/master-intelligence/apds/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/epochs${suffix}`,
        );
      },
      decisions: (
        organizationId: string,
        vehicleId: string,
        params?: { limit?: number; cursor?: string | null; policyVersion?: string | null },
      ) => {
        const q = new URLSearchParams();
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.cursor) q.set('cursor', params.cursor);
        if (params?.policyVersion) q.set('policyVersion', params.policyVersion);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<import('../master/intelligence/apds-master-intelligence-api.types').MasterApdsDecisionHistoryPageDto>(
          `/admin/master-intelligence/apds/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/decisions${suffix}`,
        );
      },
      decisionDetail: (
        organizationId: string,
        vehicleId: string,
        opportunityId: string,
        policyVersion: string,
      ) =>
        get<import('../master/intelligence/apds-master-intelligence-api.types').MasterApdsDecisionDetailDto>(
          `/admin/master-intelligence/apds/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/decisions/${encodeURIComponent(opportunityId)}?policyVersion=${encodeURIComponent(policyVersion)}`,
        ),
      vsiCorrelation: (
        organizationId: string,
        vehicleId: string,
        opportunityId: string,
        params: {
          providerSourceLinkId: string;
          policyVersion: string;
          decisionAt: string;
          historicalLinkAttributionProven?: boolean;
        },
      ) => {
        const q = new URLSearchParams({
          providerSourceLinkId: params.providerSourceLinkId,
          policyVersion: params.policyVersion,
          decisionAt: params.decisionAt,
        });
        if (params.historicalLinkAttributionProven) q.set('historicalLinkAttributionProven', 'true');
        return get<import('../master/intelligence/apds-master-intelligence-api.types').MasterApdsVsiCorrelationDto>(
          `/admin/master-intelligence/apds/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/decisions/${encodeURIComponent(opportunityId)}/vsi-correlation?${q.toString()}`,
        );
      },
    },
    masterIntelligenceTireCalibration: {
      summary: () =>
        get<import('../master/tire-v3-calibration-center/tire-calibration-center-api.types').TireCalibrationGlobalSummaryDto>(
          '/admin/master-intelligence/tire-wear-v3-calibration-shadow/summary',
        ),
      writerHealth: () =>
        get<import('../master/tire-v3-calibration-center/tire-calibration-center-api.types').TireCalibrationWriterHealthDto>(
          '/admin/master-intelligence/tire-wear-v3-calibration-shadow/writer-health',
        ),
      listSetups: (organizationId: string, vehicleId: string) =>
        get<import('../master/tire-v3-calibration-center/tire-calibration-center-api.types').TireCalibrationSetupListDto>(
          `/admin/master-intelligence/tire-wear-v3-calibration-shadow/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/setups`,
        ),
      listSnapshots: (
        organizationId: string,
        vehicleId: string,
        tireSetupId: string,
        params?: { wheelPosition?: string; mountPeriodId?: string; limit?: number; cursor?: string | null },
      ) => {
        const q = new URLSearchParams();
        if (params?.wheelPosition) q.set('wheelPosition', params.wheelPosition);
        if (params?.mountPeriodId) q.set('mountPeriodId', params.mountPeriodId);
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.cursor) q.set('cursor', params.cursor);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<import('../master/tire-v3-calibration-center/tire-calibration-center-api.types').TireCalibrationSnapshotListPageDto>(
          `/admin/master-intelligence/tire-wear-v3-calibration-shadow/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/setups/${encodeURIComponent(tireSetupId)}/snapshots${suffix}`,
        );
      },
      snapshotDetail: (
        organizationId: string,
        vehicleId: string,
        tireSetupId: string,
        snapshotId: string,
      ) =>
        get<import('../master/tire-v3-calibration-center/tire-calibration-center-api.types').TireCalibrationSnapshotDetailDto>(
          `/admin/master-intelligence/tire-wear-v3-calibration-shadow/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/setups/${encodeURIComponent(tireSetupId)}/snapshots/${encodeURIComponent(snapshotId)}`,
        ),
      setupQuality: (organizationId: string, vehicleId: string, tireSetupId: string) =>
        get<import('../master/tire-v3-calibration-center/tire-calibration-center-api.types').TireCalibrationSetupInspectionDto>(
          `/admin/master-intelligence/tire-wear-v3-calibration-shadow/organizations/${encodeURIComponent(organizationId)}/vehicles/${encodeURIComponent(vehicleId)}/setups/${encodeURIComponent(tireSetupId)}/quality`,
        ),
    },
    masterIntelligencePdi: {
      intelligence: (physicalDeviceId: string, organizationId?: string | null) => {
        const q = organizationId
          ? `?organizationId=${encodeURIComponent(organizationId)}`
          : '';
        return get<import('../master/physical-device-inventory/pdi-master-intelligence-api.types').MasterPdiDeviceIntelligenceDto>(
          `/admin/master-intelligence/pdi/devices/${encodeURIComponent(physicalDeviceId)}/intelligence${q}`,
        );
      },
    },
    monitoring: {
      summary: (params?: { from?: string; to?: string }) =>
        get<any>('/admin/monitoring/summary' + buildQuery(params)),
      pollLogs: (params?: { page?: number; limit?: number; vehicleId?: string; jobType?: string; status?: string; from?: string; to?: string }) => {
        const q = new URLSearchParams();
        if (params?.page != null) q.set('page', String(params.page));
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.vehicleId) q.set('vehicleId', params.vehicleId);
        if (params?.jobType) q.set('jobType', params.jobType);
        if (params?.status) q.set('status', params.status);
        if (params?.from) q.set('from', params.from);
        if (params?.to) q.set('to', params.to);
        const suffix = q.toString() ? '?' + q.toString() : '';
        return get<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }>('/admin/monitoring/poll-logs' + suffix);
      },
      workers: (params?: { from?: string; to?: string }) =>
        get<any[]>('/admin/monitoring/workers' + buildQuery(params)),
      alerts: (params?: { from?: string; to?: string }) =>
        get<any[]>('/admin/monitoring/alerts' + buildQuery(params)),
      tokenHealth: () => get<any>('/admin/monitoring/token-health'),
      queues: () => get<any[]>('/admin/monitoring/queues'),
    },
    platformHealth: () => get<any>('/admin/platform-health'),
    platformOps: {
      overview: () => get<import('../master/platform-ops/types').PlatformOpsOverviewDto>('/admin/ops/overview'),
      incidents: (params?: { page?: number; limit?: number }) => {
        const q = new URLSearchParams();
        if (params?.page != null) q.set('page', String(params.page));
        if (params?.limit != null) q.set('limit', String(params.limit));
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<{ incidents: import('../master/platform-ops/types').PlatformOpsIncidentDto[]; meta: { total: number; page: number; limit: number; totalPages: number }; generatedAt: string; isStale: boolean }>(`/admin/ops/incidents${suffix}`);
      },
      incident: (id: string) => get<import('../master/platform-ops/types').PlatformOpsIncidentDto>(`/admin/ops/incidents/${id}`),
      services: () => get<{ groups: Record<string, import('../master/platform-ops/types').PlatformOpsServiceSummaryDto[]>; generatedAt: string; isStale: boolean; moduleErrors: Record<string, string> }>('/admin/ops/services'),
      service: (serviceId: string) => get<import('../master/platform-ops/types').PlatformOpsServiceDetailDto>(`/admin/ops/services/${serviceId}`),
      queues: () => get<any>('/admin/ops/queues'),
      workers: () => get<any>('/admin/ops/workers'),
      schedulers: () => get<any>('/admin/ops/schedulers'),
      infrastructure: () => get<any>('/admin/ops/infrastructure-summary'),
      alerts: () => get<any>('/admin/ops/alerts'),
      drivingIntelligenceS4: () =>
        get<import('../master/platform-ops/types').PlatformOpsDiS4StatusDto>(
          '/admin/ops/driving-intelligence-s4',
        ),
      resilience: () => get<import('../master/platform-ops/types').PlatformOpsResilienceDto>('/admin/ops/resilience'),
      tools: () => get<any>('/admin/ops/tools'),
      dimoWebhookHealth: (params?: { refresh?: boolean }) => {
        const q = params?.refresh ? '?refresh=1' : '';
        return get<import('../master/platform-ops/dimo-webhook-health.types').DimoR9WebhookHealthDto>(
          `/admin/ops/dimo-webhook-health${q}`,
        );
      },
    },
    communication: {
      operationalHealth: (organizationId?: string) => {
        const q = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
        return get<import('../master/platform-ops/types').CommunicationOperationalHealthDto>(
          `/admin/communication/operational-health${q}`,
        );
      },
    },
    email: {
      getSettings: () => get<PlatformEmailSettingsAdminDto>('/admin/email/settings'),
      updateSettings: (payload: {
        defaultFromEmail: string;
        defaultFromName: string;
        defaultReplyToEmail?: string | null;
        reason?: string;
      }) => put<PlatformEmailSettingsAdminDto>('/admin/email/settings', payload),
      sendTest: (payload: { toEmail: string; reason: string }) =>
        post<{
          success: boolean;
          status: string;
          provider: string;
          providerMessageId: string | null;
          correlationId: string | null;
          sentAt: string;
          errorMessage: string | null;
        }>('/admin/email/test', payload),
    },
    platformIntegrations: {
      directory: () =>
        get<import('../master/platform-integrations/types').PlatformIntegrationsDirectoryDto>(
          '/admin/platform-integrations/directory',
        ),
      attentionSummary: () =>
        get<import('../master/platform-integrations/types').PlatformIntegrationsAttentionSummaryDto>(
          '/admin/platform-integrations/attention-summary',
        ),
      webhooks: () =>
        get<import('../master/platform-integrations/types').PlatformIntegrationWebhooksDto>(
          '/admin/platform-integrations/webhooks',
        ),
      flags: () =>
        get<import('../master/platform-integrations/types').PlatformIntegrationsFlagsDto>(
          '/admin/platform-integrations/flags',
        ),
      detail: (integrationId: string) =>
        get<import('../master/platform-integrations/types').PlatformIntegrationDetailDto>(
          `/admin/platform-integrations/${integrationId}`,
        ),
    },
    changelogs: (module?: string) =>
      get<any[]>('/admin/changelogs' + (module ? `?module=${module}` : '')),
    createChangelog: (data: any) => post<any>('/admin/changelogs', data),
    activityLog: (params?: {
      page?: number;
      limit?: number;
      entity?: string;
      action?: string;
      organizationId?: string;
      auditDomain?: string;
      securityOnly?: boolean;
      from?: string;
      to?: string;
      actorUserId?: string;
      search?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.page != null) q.set('page', String(params.page));
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.entity) q.set('entity', params.entity);
      if (params?.action) q.set('action', params.action);
      if (params?.organizationId) q.set('organizationId', params.organizationId);
      if (params?.auditDomain) q.set('auditDomain', params.auditDomain);
      if (params?.securityOnly) q.set('securityOnly', 'true');
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      if (params?.actorUserId) q.set('actorUserId', params.actorUserId);
      if (params?.search) q.set('search', params.search);
      const suffix = q.toString() ? '?' + q.toString() : '';
      return get<{ data: any[]; meta: any }>('/admin/activity-log' + suffix);
    },
    activityLogDetail: (id: string) =>
      get<import('../master/security-access/types').AuditLogDetailDto>(`/admin/activity-log/${id}`),
    activityLogExport: (params: {
      format?: 'json' | 'csv';
      organizationId?: string;
      entity?: string;
      action?: string;
      level?: string;
      auditDomain?: string;
      from?: string;
      to?: string;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params.format) q.set('format', params.format);
      if (params.organizationId) q.set('organizationId', params.organizationId);
      if (params.entity) q.set('entity', params.entity);
      if (params.action) q.set('action', params.action);
      if (params.level) q.set('level', params.level);
      if (params.auditDomain) q.set('auditDomain', params.auditDomain);
      if (params.from) q.set('from', params.from);
      if (params.to) q.set('to', params.to);
      if (params.limit != null) q.set('limit', String(params.limit));
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return fetch(`/api/v1/admin/activity-log/export${suffix}`, {
        headers: {
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
      });
    },
    securityAccess: {
      attentionSummary: () =>
        get<import('../master/security-access/types').SecurityAttentionSummaryDto>(
          '/admin/security/attention-summary',
        ),
      listUsers: (params?: {
        page?: number;
        limit?: number;
        search?: string;
        platformRole?: string;
        mfaState?: string;
        attention?: string;
        organizationId?: string;
      }) => {
        const q = new URLSearchParams();
        if (params?.page != null) q.set('page', String(params.page));
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.search) q.set('search', params.search);
        if (params?.platformRole) q.set('platformRole', params.platformRole);
        if (params?.mfaState) q.set('mfaState', params.mfaState);
        if (params?.attention) q.set('attention', params.attention);
        if (params?.organizationId) q.set('organizationId', params.organizationId);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<import('../master/security-access/types').PaginatedResponse<
          import('../master/security-access/types').GovernanceUserListItemDto
        >>(`/admin/security/users${suffix}`);
      },
      getUser: (userId: string) =>
        get<import('../master/security-access/types').GovernanceUserDetailDto>(`/admin/security/users/${userId}`),
      listUserSessions: (userId: string) =>
        get<import('../master/security-access/types').GovernanceUserSessionDto[]>(
          `/admin/security/users/${userId}/sessions`,
        ),
      revokeSession: (userId: string, sessionId: string) =>
        post<{ revoked: boolean }>(`/admin/security/users/${userId}/sessions/${sessionId}/revoke`, {}),
      revokeAllSessions: (userId: string) =>
        post<{ revoked: boolean }>(`/admin/security/users/${userId}/sessions/revoke-all`, {}),
      resetUserMfa: (userId: string, body: { reason: string; idempotencyKey?: string }) =>
        post<{ ok: boolean }>(`/admin/security/users/${userId}/mfa/reset`, body),
      listPlatformRoles: () =>
        get<import('../master/security-access/types').PlatformRoleSummaryDto[]>(
          '/admin/security/platform-roles',
        ),
      listOrgRoles: (params?: { page?: number; limit?: number; organizationId?: string; search?: string }) => {
        const q = new URLSearchParams();
        if (params?.page != null) q.set('page', String(params.page));
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.organizationId) q.set('organizationId', params.organizationId);
        if (params?.search) q.set('search', params.search);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<import('../master/security-access/types').PaginatedResponse<
          import('../master/security-access/types').OrgRoleSummaryDto
        >>(`/admin/security/org-roles${suffix}`);
      },
      getRole: (roleId: string, scope: 'platform' | 'organization', organizationId?: string) => {
        const q = new URLSearchParams({ scope });
        if (organizationId) q.set('organizationId', organizationId);
        return get<import('../master/security-access/types').GovernanceRoleDetailDto>(
          `/admin/security/roles/${roleId}?${q.toString()}`,
        );
      },
    },
    batteryV2: {
      listRestSessions: (params: { organizationId: string; vehicleId: string; limit?: number }) => {
        const q = new URLSearchParams({
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
        });
        if (params.limit != null) q.set('limit', String(params.limit));
        return get<{ sessions: import('../master/battery-v2-shadow-inspection/types').BatteryV2RestSessionListItemV1[] }>(
          `/admin/battery-v2/rest-sessions?${q.toString()}`,
        );
      },
      inspectRestSessionFeature: (params: {
        organizationId: string;
        vehicleId: string;
        restSessionId: string;
      }) => {
        const q = new URLSearchParams(params);
        return get<import('../master/battery-v2-shadow-inspection/types').RestSessionFeatureShadowInspectionV1>(
          `/admin/battery-v2/rest-session-feature-inspection?${q.toString()}`,
        );
      },
      getLvMeasuredIntelligence: (params: {
        organizationId: string;
        vehicleId: string;
        sessionLimit?: number;
        observationLimit?: number;
        measuredFrom?: string;
        measuredTo?: string;
      }) => {
        const q = new URLSearchParams({
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
        });
        if (params.sessionLimit != null) q.set('sessionLimit', String(params.sessionLimit));
        if (params.observationLimit != null) q.set('observationLimit', String(params.observationLimit));
        if (params.measuredFrom) q.set('measuredFrom', params.measuredFrom);
        if (params.measuredTo) q.set('measuredTo', params.measuredTo);
        return get<import('../master/battery-v2-shadow-inspection/lv-measured-intelligence.types').LvMeasuredIntelligenceV1>(
          `/admin/battery-v2/lv-measured-intelligence?${q.toString()}`,
        );
      },
      getLvEstimatedHealthShadow: (params: {
        organizationId: string;
        vehicleId: string;
        measuredFrom?: string;
        measuredTo?: string;
      }) => {
        const q = new URLSearchParams({
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
        });
        if (params.measuredFrom) q.set('measuredFrom', params.measuredFrom);
        if (params.measuredTo) q.set('measuredTo', params.measuredTo);
        return get<
          import('../master/battery-v2-shadow-inspection/lv-estimated-health-shadow.types').LvEstimatedBatteryHealthShadowAdminV1
        >(`/admin/battery-v2/lv-estimated-health-shadow?${q.toString()}`);
      },
      getHvVehicleContext: (params: { organizationId: string; vehicleId: string }) => {
        const q = new URLSearchParams(params);
        return get<import('../master/battery-v2-hv-inspection/hv-battery-inspection.types').HvBatteryAdminVehicleContextV1>(
          `/admin/battery-v2/hv/vehicle-context?${q.toString()}`,
        );
      },
      getHvOverview: (params: { organizationId: string; vehicleId: string }) => {
        const q = new URLSearchParams(params);
        return get<import('../master/battery-v2-hv-inspection/hv-battery-inspection.types').HvBatteryAdminOverviewV1>(
          `/admin/battery-v2/hv/overview?${q.toString()}`,
        );
      },
      listHvChargeEpisodes: (params: {
        organizationId: string;
        vehicleId: string;
        page?: number;
        limit?: number;
      }) => {
        const q = new URLSearchParams({
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
        });
        if (params.page != null) q.set('page', String(params.page));
        if (params.limit != null) q.set('limit', String(params.limit));
        return get<import('../master/battery-v2-hv-inspection/hv-battery-inspection.types').HvBatteryAdminChargeEpisodeListV1>(
          `/admin/battery-v2/hv/charge-episodes?${q.toString()}`,
        );
      },
      getHvChargeEpisodeDetail: (params: {
        organizationId: string;
        vehicleId: string;
        episodeId: string;
      }) => {
        const q = new URLSearchParams({
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
        });
        return get<import('../master/battery-v2-hv-inspection/hv-battery-inspection.types').HvBatteryAdminChargeEpisodeDetailV1>(
          `/admin/battery-v2/hv/charge-episodes/${params.episodeId}?${q.toString()}`,
        );
      },
      getHvTechnicalDetails: (params: { organizationId: string; vehicleId: string }) => {
        const q = new URLSearchParams(params);
        return get<import('../master/battery-v2-hv-inspection/hv-battery-inspection.types').HvBatteryAdminTechnicalDetailsV1>(
          `/admin/battery-v2/hv/technical-details?${q.toString()}`,
        );
      },
    },
    vehicleLogbook: {
      list: () => get<any[]>('/admin/vehicle-logbook'),
      enable: (vehicleId: string, data: { durationHours?: number; enabledBy?: string; notes?: string }) =>
        post<any>(`/admin/vehicle-logbook/${vehicleId}/enable`, data),
      disable: (vehicleId: string) => post<any>(`/admin/vehicle-logbook/${vehicleId}/disable`, {}),
      detail: (vehicleId: string) => get<any>(`/admin/vehicle-logbook/${vehicleId}/detail`),
    },
  },
  organizations: {
    list: (params?: { page?: number; limit?: number }) =>
      get<{ data: any[]; meta: { total: number } }>('/admin/organizations' + (params ? `?page=${params.page ?? 1}&limit=${params.limit ?? 100}` : '?limit=100')),
    listOperational: (params?: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams();
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v));
        }
      }
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        `/admin/organizations/operational${suffix}`,
      );
    },
    getOperational: (id: string) => get<any>(`/admin/organizations/${id}/operational`),
    getConnectivitySummary: (id: string) => get<any>(`/admin/organizations/${id}/connectivity-summary`),
    get: (id: string) => get<any>(`/admin/organizations/${id}`),
    create: (data: any) => post<any>('/admin/organizations', data),
    createAdmin: (orgId: string, adminData: { name: string; email: string; password: string }) =>
      post<any>(`/admin/organizations/${orgId}/admin`, adminData),
    update: (id: string, data: any) => patch<any>(`/admin/organizations/${id}`, data),
    delete: (id: string, reason: string) =>
      request<void>(`/admin/organizations/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      }),
    setPaymentsEnabled: (id: string, enabled: boolean) =>
      patch<any>(`/admin/organizations/${id}/payments-enabled`, { enabled }),
    stats: (id: string) => get<any>(`/admin/organizations/${id}/stats`),

    // ─── Tenant-scoped own-organization profile (Settings → Company Profile) ───
    // Distinct from the MASTER_ADMIN routes above: these are guarded by
    // OrgScopingGuard and only allow editing the caller's own org.
    getProfile: (orgId: string) =>
      get<TenantOrganizationProfileDto>(`/organizations/${orgId}/profile`),
    updateProfile: (orgId: string, data: TenantOrganizationProfileUpdate) =>
      patch<TenantOrganizationProfileDto>(`/organizations/${orgId}/profile`, data),
    uploadLogo: async (orgId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const token = getToken();
      const res = await fetch(`${BASE_URL}/organizations/${orgId}/profile/logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        let message = `Logo-Upload fehlgeschlagen (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string | string[] };
          const raw = body?.message;
          const text = Array.isArray(raw) ? raw.join(', ') : raw;
          if (text) {
            message =
              text.includes('Only PNG') || text.includes('WebP')
                ? 'Nur PNG, JPG/JPEG und WebP sind erlaubt (max. 2 MB).'
                : text.includes('No file uploaded')
                  ? 'Keine Datei ausgewählt.'
                  : text;
          }
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      return res.json() as Promise<{ url: string }>;
    },
  },
  users: {
    listAll: (organizationId?: string) =>
      get<any[]>(`/admin/users${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''}`),
    get: (id: string) => get<any>(`/admin/users/${id}`),
    create: (data: any) => post<any>('/admin/users', data),
    update: (id: string, data: any) => patch<any>(`/admin/users/${id}`, data),
    delete: (id: string, reason?: string) =>
      request<void>(`/admin/users/${id}`, {
        method: 'DELETE',
        body: JSON.stringify(reason ? { reason } : {}),
      }),
    changePassword: (id: string, password: string) => post<{ message: string }>(`/admin/users/${id}/change-password`, { password }),
    listByOrg: (orgId: string) => get<OrgUserDto[]>(`/organizations/${orgId}/users`),
    getByOrg: (orgId: string, id: string) => get<OrgUserDto>(`/organizations/${orgId}/users/${id}`),
    createByOrg: (orgId: string, data: Partial<OrgUserDto> & Record<string, unknown>) =>
      post<OrgUserDto>(`/organizations/${orgId}/users`, data),
    updateByOrg: (orgId: string, id: string, data: Partial<OrgUserDto> & Record<string, unknown>) =>
      patch<OrgUserDto>(`/organizations/${orgId}/users/${id}`, data),
    deleteByOrg: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/users/${id}`),
    changePasswordByOrg: (orgId: string, userId: string, password: string) =>
      post<{ message: string }>(`/organizations/${orgId}/users/${userId}/change-password`, { password }),
    assignRole: (orgId: string, userId: string, roleId: string) =>
      post<unknown>(`/organizations/${orgId}/users/${userId}/assign-role`, { roleId }),
    securityActivity: (orgId: string, userId: string) =>
      get<UserSecurityActivityDto>(`/organizations/${orgId}/users/${userId}/security-activity`),
  },
  organizationInvites: {
    list: (orgId: string, status?: OrganizationInviteStatus) =>
      get<OrganizationInviteDto[]>(
        `/organizations/${orgId}/invites${status ? `?status=${status}` : ''}`,
      ),
    create: (orgId: string, data: CreateOrganizationInvitePayload) =>
      post<OrganizationInviteDto>(`/organizations/${orgId}/invites`, data),
    resend: (orgId: string, inviteId: string) =>
      post<OrganizationInviteDto>(
        `/organizations/${orgId}/invites/${inviteId}/resend`,
        {},
      ),
    revoke: (orgId: string, inviteId: string) =>
      del<OrganizationInviteDto>(`/organizations/${orgId}/invites/${inviteId}`),
  },
  organizationRoles: {
    list: (orgId: string) => get<OrganizationRoleDto[]>(`/organizations/${orgId}/roles`),
    get: (orgId: string, roleId: string) =>
      get<OrganizationRoleDto>(`/organizations/${orgId}/roles/${roleId}`),
    permissionPreview: (orgId: string, roleId: string) =>
      get<OrganizationRolePermissionPreviewDto>(
        `/organizations/${orgId}/roles/${roleId}/permission-preview`,
      ),
    create: (orgId: string, data: CreateOrganizationRolePayload) =>
      post<OrganizationRoleDto>(`/organizations/${orgId}/roles`, data),
    update: (orgId: string, roleId: string, data: UpdateOrganizationRolePayload) =>
      patch<OrganizationRoleDto>(`/organizations/${orgId}/roles/${roleId}`, data),
    duplicate: (orgId: string, roleId: string) =>
      post<OrganizationRoleDto>(`/organizations/${orgId}/roles/${roleId}/duplicate`, {}),
    delete: (orgId: string, roleId: string) =>
      del<{ deleted: boolean }>(`/organizations/${orgId}/roles/${roleId}`),
  },
  iam: {
    teamKpis: (orgId: string) => get<IamTeamKpisDto>(`/organizations/${orgId}/iam/team/kpis`),
    teamList: (orgId: string, search?: string) =>
      get<IamTeamListItemDto[]>(
        `/organizations/${orgId}/iam/team${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
    teamMember: (orgId: string, membershipId: string) =>
      get<IamTeamMemberDetailDto>(`/organizations/${orgId}/iam/team/members/${membershipId}`),
    sendResetLink: (orgId: string, membershipId: string) =>
      post<{ queued: boolean }>(`/organizations/${orgId}/iam/team/members/${membershipId}/send-reset-link`, {}),
    rolesList: (orgId: string) => get<IamRoleListItemDto[]>(`/organizations/${orgId}/iam/roles`),
    roleDetail: (orgId: string, roleId: string) =>
      get<IamRoleDetailDto>(`/organizations/${orgId}/iam/roles/${roleId}`),
    securityOverview: (orgId: string) =>
      get<IamSecurityOverviewDto>(`/organizations/${orgId}/iam/security`),
    revokeAllSessions: (orgId: string, userId: string, idempotencyKey: string) =>
      post<{ revoked: boolean }>(`/organizations/${orgId}/users/${userId}/sessions/revoke-all`, {
        idempotencyKey,
      }),
  },
  vehicles: {
    listAll: (params?: { page?: number; limit?: number }) =>
      get<{ data: any[] }>('/admin/vehicles' + (params ? `?page=${params.page ?? 1}&limit=${params.limit ?? 200}` : '?limit=200')),
    get: (id: string) => get<any>(`/admin/vehicles/${id}`),
    upsertHvMasterSpecification: (
      vehicleId: string,
      body: Record<string, unknown>,
    ) =>
      patch<Record<string, unknown>>(
        `/admin/vehicles/${vehicleId}/hv-master-specification`,
        body,
      ),
    operationalOverview: (organizationId?: string) => {
      const qs = organizationId?.trim()
        ? `?organizationId=${encodeURIComponent(organizationId.trim())}`
        : '';
      return get<any>(`/admin/vehicles/operational/overview${qs}`);
    },
    operationalAttentionQueue: (limit = 8) =>
      get<any[]>(`/admin/vehicles/operational/attention-queue?limit=${limit}`),
    operationalList: (params?: Record<string, string | number | undefined>) => {
      const qs = buildVehiclesOperationalListQuery(params);
      return get<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        `/admin/vehicles/operational${qs}`,
      );
    },
    operationalDetail: (vehicleId: string) => get<any>(`/admin/vehicles/${vehicleId}/operational`),
    operationalUnregisteredDetail: (dimoVehicleId: string) =>
      get<any>(`/admin/vehicles/unregistered/${dimoVehicleId}/operational`),
    operationalDiagnostics: (vehicleId: string, organizationId: string) =>
      get<ConnectivityAdminDiagnosticsResponse>(
        `/admin/vehicles/${vehicleId}/operational/diagnostics?organizationId=${encodeURIComponent(organizationId)}`,
      ),
    importPreflight: (organizationId: string, dimoVehicleId: string) =>
      get<any>(
        `/admin/vehicles/import-preflight?organizationId=${encodeURIComponent(organizationId)}&dimoVehicleId=${encodeURIComponent(dimoVehicleId)}`,
      ),
    listByOrg: (orgId: string, params?: { page?: number; limit?: number }) =>
      get<{ data: any[]; meta?: { total: number } }>(`/organizations/${orgId}/vehicles` + (params ? `?page=${params.page ?? 1}&limit=${params.limit ?? 200}` : '?limit=200')),
    getByOrg: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/vehicles/${id}`),
    fleetMap: (orgId: string) =>
      get<FleetMapVehicleResponse[]>(`/organizations/${orgId}/fleet-map`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/vehicles`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/vehicles/${id}`, data),
    delete: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/vehicles/${id}`),
    upsertTires: (orgId: string, vehicleId: string, data: {
      frontDimension?: string | null; rearDimension?: string | null;
      brandModelFront?: string | null; brandModelRear?: string | null;
      tireSeason?: string | null;
      loadIndexFront?: string | null; speedIndexFront?: string | null;
      loadIndexRear?: string | null; speedIndexRear?: string | null;
      dotCodeFront?: string | null; dotCodeRear?: string | null;
      tireCondition?: string | null;
      treadFL?: number | null; treadFR?: number | null;
      treadBL?: number | null; treadBR?: number | null;
    }) => put<any>(`/organizations/${orgId}/vehicles/${vehicleId}/tires`, data),
    motionPhysicsReference: {
      getActive: (orgId: string, vehicleId: string) =>
        get<VehicleMotionPhysicsReferenceDto | null>(
          `/organizations/${orgId}/vehicles/${vehicleId}/motion-physics-reference`,
        ),
      create: (
        orgId: string,
        vehicleId: string,
        body: {
          curbMassKg?: number | null;
          systemMotorPowerKw?: number | null;
          systemPowerDefinition?: string | null;
          accel0To100S?: number | null;
          variantAssumption?: string | null;
          source: string;
          manualOperatorConfirm?: boolean;
          notes?: string | null;
        },
      ) =>
        post<VehicleMotionPhysicsReferenceDto>(
          `/organizations/${orgId}/vehicles/${vehicleId}/motion-physics-reference`,
          body,
        ),
      confirm: (orgId: string, vehicleId: string, referenceId: string, body?: { notes?: string }) =>
        post<VehicleMotionPhysicsReferenceDto>(
          `/organizations/${orgId}/vehicles/${vehicleId}/motion-physics-reference/${referenceId}/confirm`,
          body ?? {},
        ),
    },
    registrationIdentityReview: {
      reconcile: (
        orgId: string,
        vehicleId: string,
        body: {
          documentExtractionId?: string;
          manual?: Record<string, unknown> | null;
          vinMismatchAcknowledged?: boolean;
        },
      ) =>
        post<Record<string, unknown>>(
          `/organizations/${orgId}/vehicles/${vehicleId}/registration-identity-review/reconcile`,
          body,
        ),
      validateConfirmations: (
        orgId: string,
        vehicleId: string,
        body: Record<string, unknown>,
      ) =>
        post<Record<string, unknown>>(
          `/organizations/${orgId}/vehicles/${vehicleId}/registration-identity-review/validate-confirmations`,
          body,
        ),
      aiV2Preview: (orgId: string, vehicleId: string, body: Record<string, unknown>) =>
        post<Record<string, unknown>>(
          `/organizations/${orgId}/vehicles/${vehicleId}/registration-identity-review/ai-v2-preview`,
          body,
        ),
      saveIdentity: (orgId: string, vehicleId: string, body: Record<string, unknown>) =>
        post<Record<string, unknown>>(
          `/organizations/${orgId}/vehicles/${vehicleId}/registration-identity-review/save`,
          body,
        ),
      getProvenance: (orgId: string, vehicleId: string) =>
        get<Record<string, unknown>>(
          `/organizations/${orgId}/vehicles/${vehicleId}/registration-identity-review/provenance`,
        ),
    },
    telemetry: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/vehicles/${id}/telemetry`),
    liveGps: (orgId: string, id: string) => get<{
      latitude: number | null;
      longitude: number | null;
      speedKmh: number | null;
      lastSeenAt: string | null;
      source: 'dimo' | 'cache';
    }>(`/organizations/${orgId}/vehicles/${id}/live-gps`),
    fleetConnectivity: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        status?: FleetConnectivityStatus;
        q?: string;
      },
    ) => {
      const search = new URLSearchParams();
      if (params?.page != null) search.set('page', String(params.page));
      if (params?.limit != null) search.set('limit', String(params.limit));
      if (params?.status) search.set('status', params.status);
      if (params?.q?.trim()) search.set('q', params.q.trim());
      const qs = search.toString();
      return get<FleetConnectivityResponse>(
        `/organizations/${orgId}/fleet-connectivity${qs ? `?${qs}` : ''}`,
      );
    },
    fleetConnectivityDetail: (orgId: string, vehicleId: string) =>
      get<FleetConnectivityDetail>(
        `/organizations/${orgId}/fleet-connectivity/${vehicleId}`,
      ),
    deviceConnection: (orgId: string, vehicleId: string) =>
      get<DeviceConnectionSummary>(
        `/organizations/${orgId}/vehicles/${vehicleId}/device-connection`,
      ),
    listComplaints: (orgId: string, vehicleId: string) =>
      get<VehicleComplaint[]>(`/organizations/${orgId}/vehicles/${vehicleId}/complaints`),
    createComplaint: (orgId: string, vehicleId: string, body: { description: string; urgency?: string; region?: string | null }) =>
      post<VehicleComplaint>(`/organizations/${orgId}/vehicles/${vehicleId}/complaints`, body),
    technicalObservations: {
      list: (
        orgId: string,
        vehicleId: string,
        params?: {
          status?: TechnicalObservationStatus;
          category?: TechnicalObservationCategory;
          severity?: TechnicalObservationSeverity;
          source?: TechnicalObservationSource;
          bookingId?: string;
          scope?: 'active' | 'history' | 'all';
        },
      ) => {
        const search = new URLSearchParams();
        if (params?.status) search.set('status', params.status);
        if (params?.category) search.set('category', params.category);
        if (params?.severity) search.set('severity', params.severity);
        if (params?.source) search.set('source', params.source);
        if (params?.bookingId) search.set('bookingId', params.bookingId);
        if (params?.scope) search.set('scope', params.scope);
        const qs = search.toString();
        return get<TechnicalObservationListResponse>(
          `/organizations/${orgId}/vehicles/${vehicleId}/technical-observations${qs ? `?${qs}` : ''}`,
        );
      },
      create: (orgId: string, vehicleId: string, body: CreateTechnicalObservationBody) =>
        post<TechnicalObservation>(
          `/organizations/${orgId}/vehicles/${vehicleId}/technical-observations`,
          body,
        ),
      update: (
        orgId: string,
        vehicleId: string,
        observationId: string,
        body: UpdateTechnicalObservationBody,
      ) =>
        patch<TechnicalObservation>(
          `/organizations/${orgId}/vehicles/${vehicleId}/technical-observations/${observationId}`,
          body,
        ),
      resolve: (orgId: string, vehicleId: string, observationId: string) =>
        post<TechnicalObservation>(
          `/organizations/${orgId}/vehicles/${vehicleId}/technical-observations/${observationId}/resolve`,
          {},
        ),
      dismiss: (orgId: string, vehicleId: string, observationId: string) =>
        post<TechnicalObservation>(
          `/organizations/${orgId}/vehicles/${vehicleId}/technical-observations/${observationId}/dismiss`,
          {},
        ),
      convertToTask: (
        orgId: string,
        vehicleId: string,
        observationId: string,
        body?: ConvertTechnicalObservationToTaskBody,
      ) =>
        post<{ observation: TechnicalObservation; taskId: string }>(
          `/organizations/${orgId}/vehicles/${vehicleId}/technical-observations/${observationId}/convert-to-task`,
          body ?? {},
        ),
      linkDamage: (
        orgId: string,
        vehicleId: string,
        observationId: string,
        body: LinkTechnicalObservationDamageBody,
      ) =>
        post<TechnicalObservation>(
          `/organizations/${orgId}/vehicles/${vehicleId}/technical-observations/${observationId}/link-damage`,
          body,
        ),
      linkService: (
        orgId: string,
        vehicleId: string,
        observationId: string,
        body: LinkTechnicalObservationServiceBody,
      ) =>
        post<TechnicalObservation>(
          `/organizations/${orgId}/vehicles/${vehicleId}/technical-observations/${observationId}/link-service`,
          body,
        ),
    },
    registerFromDimo: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/vehicles/register-from-dimo`, data),
    updateOperationalStatus: (
      orgId: string,
      vehicleId: string,
      data: { cleaningStatus?: 'CLEAN' | 'NEEDS_CLEANING'; status?: string; healthStatus?: string },
    ) =>
      patch<{
        vehicle: Record<string, unknown>;
        cleaningTask?: {
          action: 'created' | 'existing' | 'updated' | 'completed' | 'none';
          taskId?: string;
          completedCount?: number;
        };
      }>(`/organizations/${orgId}/vehicles/${vehicleId}/status`, data),
    getAiSpecs: (params?: { vin?: string; tokenId?: string; dimoVehicleId?: string; make?: string; model?: string; year?: string }) =>
      get<AiSpecsResponse>('/vehicles/register/ai-specs' + buildQuery(params ?? {})),

    // V4.7.50 — Exterior images (Damage Map): five canonical views per vehicle
    // (FRONT/LEFT/RIGHT/REAR/ROOF). Master-Admin uploads from
    // VehicleRegistrationModal or PlatformVehiclesView; Rental DamagesView
    // consumes the read-only list to render its damage-map carousel.
    exteriorImages: {
      list: (vehicleId: string) =>
        get<VehicleExteriorImageDto[]>(`/vehicles/${vehicleId}/exterior-images`),
      listEffective: (vehicleId: string) =>
        get<VehicleExteriorImageEffectiveResponse>(
          `/vehicles/${vehicleId}/exterior-images/effective`,
        ),
      listAdmin: (vehicleId: string) =>
        get<VehicleExteriorImageDto[]>(`/admin/vehicles/${vehicleId}/exterior-images`),
      listEffectiveAdmin: (vehicleId: string) =>
        get<VehicleExteriorImageEffectiveResponse>(
          `/admin/vehicles/${vehicleId}/exterior-images/effective`,
        ),
      listModelTemplates: (params?: { make?: string | null; model?: string | null }) =>
        get<VehicleExteriorModelImageDto[] | VehicleExteriorModelTemplateSummary[]>(
          '/admin/vehicle-exterior-model-images' +
            buildQuery({
              ...(params?.make ? { make: params.make } : {}),
              ...(params?.model ? { model: params.model } : {}),
            }),
        ),
      upsertModelTemplate: (
        view: VehicleExteriorViewKey,
        body: {
          make: string;
          model: string;
          imageData: string;
          caption?: string | null;
          sourceVehicleId?: string | null;
        },
      ) =>
        put<VehicleExteriorModelImageDto>(
          `/admin/vehicle-exterior-model-images/${view}`,
          body,
        ),
      saveAsModelTemplate: (vehicleId: string, view: VehicleExteriorViewKey) =>
        post<VehicleExteriorModelImageDto>(
          `/admin/vehicles/${vehicleId}/exterior-images/${view}/save-as-model`,
          {},
        ),
      applyModelTemplate: (
        vehicleId: string,
        view: VehicleExteriorViewKey,
        body: { modelKey: string },
      ) =>
        post<VehicleExteriorImageDto>(
          `/admin/vehicles/${vehicleId}/exterior-images/${view}/apply-model`,
          body,
        ),
      upsert: (
        vehicleId: string,
        view: VehicleExteriorViewKey,
        body: { imageData: string; caption?: string | null },
      ) =>
        put<VehicleExteriorImageDto>(
          `/admin/vehicles/${vehicleId}/exterior-images/${view}`,
          body,
        ),
      delete: (vehicleId: string, view: VehicleExteriorViewKey) =>
        del<{ success: boolean }>(
          `/admin/vehicles/${vehicleId}/exterior-images/${view}`,
        ),
    },
  },
  vehicleOnboarding: {
    offboardVehicle: async (
      organizationId: string,
      vehicleId: string,
      body: {
        reason: 'OFFBOARD_SOLD' | 'REMOVE_FROM_PRODUCT' | 'ADMINISTRATIVE_OFFBOARD';
        idempotencyKey: string;
        note?: string;
      },
    ) => {
      const path = `/admin/vehicle-onboarding/organizations/${organizationId}/vehicles/${vehicleId}/offboard`;
      const result = await requestResult<{
        vehicleId: string;
        organizationId: string;
        registryLifecycle: 'OFFBOARDED';
        offboardedAt: string;
        reason: 'OFFBOARD_SOLD' | 'REMOVE_FROM_PRODUCT' | 'ADMINISTRATIVE_OFFBOARD';
        idempotentReplay: boolean;
        warnings: string[];
      }>(path, { method: 'POST', body: JSON.stringify(body) }, { suppressStepUpDispatch: true });
      if (!result.ok) {
        throw classifyOffboardHttpFailure(
          result.status,
          result.errorBody?.code,
          result.errorMessage ?? 'Offboard request failed',
          result.errorBody?.details,
        );
      }
      return result.data!;
    },
  },
  dimo: {
    vehicles: () => get<any[]>('/admin/dimo/vehicles'),
    nonRegistered: () => get<any[]>('/admin/dimo/non-registered'),
    sync: (body?: { dimoVehicles?: any[] }) => post<any>('/admin/dimo/sync', body ?? {}),
    stats: () => get<any>('/admin/dimo/stats'),
    refreshSnapshot: (id: string) => post<any>(`/admin/dimo/vehicles/${id}/refresh-snapshot`, {}),
    fleetConnectivity: () => get<AdminFleetConnectivityResponse>('/admin/dimo/fleet-connectivity'),
    queryGraphQL: (tokenId: number, query: string) =>
      post<any>('/admin/dimo/query', { tokenId, query }),
  },
  chat: {
    getAgent: (orgId: string) =>
      get<ChatAgentInfo>(`/organizations/${orgId}/chat/agent`),
    ensureAgent: (orgId: string) =>
      post<{ agentName: string; dimoAgentId: string }>(`/organizations/${orgId}/chat/agent`, {}),
    sendMessage: (orgId: string, content: string) =>
      post<ChatMessageResponse>(`/organizations/${orgId}/chat/message`, { content }),
    getHistory: (orgId: string, limit?: number, before?: string) => {
      const params: Record<string, string> = {};
      if (limit) params.limit = String(limit);
      if (before) params.before = before;
      return get<ChatMessageResponse[]>(`/organizations/${orgId}/chat/history` + buildQuery(params));
    },
    clearHistory: (orgId: string) =>
      del<{ cleared: boolean }>(`/organizations/${orgId}/chat/history`),
  },
  whatsapp: {
    getConfig: (orgId: string) =>
      get<WhatsAppConfig>(`/organizations/${orgId}/whatsapp/config`),
    updateConfig: (orgId: string, data: Partial<WhatsAppConfig>) =>
      put<WhatsAppConfig>(`/organizations/${orgId}/whatsapp/config`, data),
    connect: (orgId: string, data: { phoneNumber: string; businessName?: string; connectedByName?: string; phoneNumberId?: string; wabaId?: string }) =>
      post<WhatsAppConfig>(`/organizations/${orgId}/whatsapp/connect`, data),
    disconnect: (orgId: string) =>
      post<WhatsAppConfig>(`/organizations/${orgId}/whatsapp/disconnect`, {}),
    simulateIncoming: (orgId: string, data: { contactPhone: string; contactName?: string; content: string }) =>
      post<WhatsAppSimulateResult>(`/organizations/${orgId}/whatsapp/simulate-incoming`, data),
    getStats: (orgId: string) =>
      get<WhatsAppStats>(`/organizations/${orgId}/whatsapp/stats`),
    listTemplates: (orgId: string) =>
      get<WhatsAppTemplate[]>(`/organizations/${orgId}/whatsapp/templates`),
    createTemplate: (orgId: string, data: WhatsAppTemplateCreatePayload) =>
      post<WhatsAppTemplate>(`/organizations/${orgId}/whatsapp/templates`, data),
  },
  sms: {
    getConfig: (orgId: string) => get<SmsConfig>(`/organizations/${orgId}/sms/config`),
  },
  communication: {
    listConversations: (
      orgId: string,
      query?: import('./communication/types').CommunicationConversationListQuery,
    ) => {
      const q = new URLSearchParams();
      if (query) {
        if (query.channel) {
          const channels = Array.isArray(query.channel) ? query.channel : [query.channel];
          if (channels.length > 0) q.set('channel', channels.join(','));
        }
        if (query.status) {
          const statuses = Array.isArray(query.status) ? query.status : [query.status];
          if (statuses.length > 0) q.set('status', statuses.join(','));
        }
        if (query.unreadOnly) q.set('unreadOnly', 'true');
        if (query.unassigned) q.set('unassigned', 'true');
        if (query.search) q.set('search', query.search);
        if (query.intent) q.set('intent', query.intent);
        if (query.callDirection) q.set('callDirection', query.callDirection);
        if (query.callOutcome) q.set('callOutcome', query.callOutcome);
        if (query.callHasTranscript) q.set('callHasTranscript', 'true');
        if (query.callEscalatedOnly) q.set('callEscalatedOnly', 'true');
        if (query.dateFrom) q.set('dateFrom', query.dateFrom);
        if (query.dateTo) q.set('dateTo', query.dateTo);
        if (query.cursor) q.set('cursor', query.cursor);
        if (query.limit != null) q.set('limit', String(query.limit));
      }
      const qs = q.toString();
      return get<import('./communication/types').CommunicationConversationListResponse>(
        `/organizations/${orgId}/communication/conversations${qs ? `?${qs}` : ''}`,
      );
    },
    getAttentionPreview: (
      orgId: string,
      query?: { limit?: number },
    ) => {
      const q = new URLSearchParams();
      if (query?.limit != null) q.set('limit', String(query.limit));
      const qs = q.toString();
      return get<import('./communication/types').CommunicationAttentionPreviewResponse>(
        `/organizations/${orgId}/communication/conversations/attention-preview${qs ? `?${qs}` : ''}`,
      );
    },
    getConversationSummary: (
      orgId: string,
      query?: import('./communication/types').CommunicationConversationListQuery,
    ) => {
      const q = new URLSearchParams();
      if (query) {
        if (query.channel) {
          const channels = Array.isArray(query.channel) ? query.channel : [query.channel];
          if (channels.length > 0) q.set('channel', channels.join(','));
        }
        if (query.status) {
          const statuses = Array.isArray(query.status) ? query.status : [query.status];
          if (statuses.length > 0) q.set('status', statuses.join(','));
        }
        if (query.unreadOnly) q.set('unreadOnly', 'true');
        if (query.unassigned) q.set('unassigned', 'true');
        if (query.search) q.set('search', query.search);
        if (query.intent) q.set('intent', query.intent);
        if (query.callDirection) q.set('callDirection', query.callDirection);
        if (query.callOutcome) q.set('callOutcome', query.callOutcome);
        if (query.callHasTranscript) q.set('callHasTranscript', 'true');
        if (query.callEscalatedOnly) q.set('callEscalatedOnly', 'true');
        if (query.dateFrom) q.set('dateFrom', query.dateFrom);
        if (query.dateTo) q.set('dateTo', query.dateTo);
      }
      const qs = q.toString();
      return get<import('./communication/types').CommunicationConversationSummary>(
        `/organizations/${orgId}/communication/conversations/summary${qs ? `?${qs}` : ''}`,
      );
    },
    getConversation: (orgId: string, conversationId: string) =>
      get<import('./communication/types').CommunicationConversationDetail>(
        `/organizations/${orgId}/communication/conversations/${conversationId}`,
      ),
    listConversationEvents: (
      orgId: string,
      conversationId: string,
      query?: import('./communication/types').CommunicationEventListQuery,
    ) => {
      const q = new URLSearchParams();
      if (query?.cursor) q.set('cursor', query.cursor);
      if (query?.limit != null) q.set('limit', String(query.limit));
      const qs = q.toString();
      return get<import('./communication/types').CommunicationEventListResponse>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/events${qs ? `?${qs}` : ''}`,
      );
    },
    listAiActivity: (
      orgId: string,
      query?: import('./communication/types').CommunicationAiActivityListQuery,
    ) => {
      const q = new URLSearchParams();
      if (query?.channel) q.set('channel', query.channel);
      if (query?.category && query.category !== 'all') q.set('category', query.category);
      if (query?.conversationId) q.set('conversationId', query.conversationId);
      if (query?.stationId) q.set('stationId', query.stationId);
      if (query?.dateFrom) q.set('dateFrom', query.dateFrom);
      if (query?.dateTo) q.set('dateTo', query.dateTo);
      if (query?.cursor) q.set('cursor', query.cursor);
      if (query?.limit != null) q.set('limit', String(query.limit));
      const qs = q.toString();
      return get<import('./communication/types').CommunicationAiActivityListResponse>(
        `/organizations/${orgId}/communication/ai-activity${qs ? `?${qs}` : ''}`,
      );
    },
    claimConversation: (orgId: string, conversationId: string) =>
      post<import('./communication/types').CommunicationMutationResponse>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/claim`,
        {},
      ),
    assignConversation: (orgId: string, conversationId: string, assignedUserId: string | null) =>
      patch<import('./communication/types').CommunicationMutationResponse>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/assignment`,
        { assignedUserId },
      ),
    resolveConversation: (orgId: string, conversationId: string) =>
      post<import('./communication/types').CommunicationMutationResponse>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/resolve`,
        {},
      ),
    reopenConversation: (orgId: string, conversationId: string) =>
      post<import('./communication/types').CommunicationMutationResponse>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/reopen`,
        {},
      ),
    markConversationRead: (orgId: string, conversationId: string) =>
      post<import('./communication/types').CommunicationMutationResponse>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/mark-read`,
        {},
      ),
    replyConversation: (
      orgId: string,
      conversationId: string,
      body: {
        text?: string;
        attachmentId?: string;
        contentType?: import('./communication/types').CommunicationReplyContentType;
        templateId?: string;
        templateVariables?: Record<string, string>;
        idempotencyKey: string;
      },
    ) =>
      post<import('./communication/types').CommunicationReplyResponse>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/reply`,
        body,
      ),
    getComposerCapability: (orgId: string, conversationId: string) =>
      get<{ replyMode: 'FREEFORM_TEXT_ALLOWED' | 'TEMPLATE_REQUIRED' | 'CHANNEL_NOT_REPLYABLE' }>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/composer-capability`,
      ),
    getAiSuggestion: (orgId: string, conversationId: string) =>
      post<{
        suggestedReply: string | null;
        intent: string;
        confidence: number;
        suggestionId: string | null;
        canSendAutomatically: boolean;
      }>(`/organizations/${orgId}/communication/conversations/${conversationId}/ai-suggestion`, {}),
    getQuickActions: (orgId: string, conversationId: string) =>
      get<import('./communication/types').CommunicationQuickActionListResponse>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/quick-actions`,
      ),
    executeQuickAction: (
      orgId: string,
      conversationId: string,
      actionId: WhatsAppQuickActionId,
      body: Record<string, unknown> = {},
    ) =>
      post<import('./communication/types').CommunicationQuickActionResult>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/quick-actions/${actionId}`,
        body,
      ),
    listSendableTemplates: (orgId: string, conversationId: string) =>
      get<{
        items: Array<{
          id: string;
          name: string;
          language: string;
          category: string;
          bodyTemplate: string;
          variableSchema?: Record<string, unknown> | null;
          providerStatus: string;
        }>;
      }>(`/organizations/${orgId}/communication/conversations/${conversationId}/sendable-templates`),
    getVoiceCallDetail: (orgId: string, conversationId: string) =>
      get<import('./communication/types').CommunicationVoiceCallDetail>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/voice-call`,
      ),
    getVoiceCallTranscript: (orgId: string, conversationId: string) =>
      get<import('./communication/types').CommunicationVoiceCallTranscript>(
        `/organizations/${orgId}/communication/conversations/${conversationId}/voice-call/transcript`,
      ),
    uploadAttachment: async (orgId: string, conversationId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const token = getToken();
      const res = await fetch(
        `${BASE_URL}/organizations/${orgId}/communication/conversations/${conversationId}/attachments`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        },
      );
      if (!res.ok) {
        let message = `API error ${res.status}`;
        try {
          const body = (await res.json()) as { message?: string; code?: string };
          if (body.message) message = body.message;
          if (body.code) message = `${body.code}: ${message}`;
        } catch {
          // ignore
        }
        const error = new Error(message) as Error & { status?: number };
        error.status = res.status;
        throw error;
      }
      return res.json() as Promise<import('./communication/types').CommunicationAttachmentDto>;
    },
  },
  bookings: {
    list: (
      orgId: string,
      params?: BookingsListParams,
    ) => {
      const q = new URLSearchParams();
      if (params?.page != null) q.set('page', String(params.page));
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.status) q.set('status', params.status);
      if (params?.vehicleId) q.set('vehicleId', params.vehicleId);
      if (params?.customerId) q.set('customerId', params.customerId);
      if (params?.stationId) q.set('stationId', params.stationId);
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      if (params?.search) q.set('search', params.search);
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<{ data: unknown[]; meta?: unknown } | unknown[]>(
        `/organizations/${orgId}/bookings${suffix}`,
      );
    },
    get: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/bookings/${id}`),
    detail: (orgId: string, id: string) => get<BookingDetailDto>(`/organizations/${orgId}/bookings/${id}/detail`),
    create: (orgId: string, data: OperatorBookingCreatePayload) =>
      post<unknown>(`/organizations/${orgId}/bookings`, data),
    update: (orgId: string, id: string, data: OperatorBookingUpdatePayload) =>
      patch<unknown>(`/organizations/${orgId}/bookings/${id}`, data),
    cancel: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/bookings/${id}`),
    // V4.6.81 — Mark a CONFIRMED booking whose scheduled pickup has
    // passed without a handover as NO_SHOW. Distinct from cancel so
    // downstream reporting can tell "called off" from "customer never
    // showed". Server-side guardrails enforce status + time window.
    markNoShow: (orgId: string, id: string, reason?: string | null) =>
      post<any>(`/organizations/${orgId}/bookings/${id}/no-show`, { reason: reason ?? null }),
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/bookings/stats`),
    todayPickups: (orgId: string) => get<any[]>(`/organizations/${orgId}/bookings/today/pickups`),
    todayReturns: (orgId: string) => get<any[]>(`/organizations/${orgId}/bookings/today/returns`),
    checkRentalEligibility: (
      orgId: string,
      data: {
        vehicleId: string;
        customerId: string;
        startDate: string;
        endDate?: string;
        paymentIntent?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
        paymentMethod?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
        foreignTravelRequested?: boolean;
        additionalDriverCount?: number;
        depositReceived?: boolean;
      },
    ) =>
      post<import('../rental/lib/booking-rental-eligibility.types').BookingRentalEligibilityResult>(
        `/organizations/${orgId}/bookings/eligibility-check`,
        data,
      ),
    getRentalEligibility: (
      orgId: string,
      bookingId: string,
      params?: {
        paymentIntent?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
        paymentMethod?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
        foreignTravelRequested?: boolean;
        additionalDriverCount?: number;
        depositReceived?: boolean;
      },
    ) => {
      const q = new URLSearchParams();
      if (params?.paymentIntent) q.set('paymentIntent', params.paymentIntent);
      else if (params?.paymentMethod) q.set('paymentMethod', params.paymentMethod);
      if (params?.foreignTravelRequested) q.set('foreignTravelRequested', 'true');
      if (params?.additionalDriverCount != null) {
        q.set('additionalDriverCount', String(params.additionalDriverCount));
      }
      if (params?.depositReceived) q.set('depositReceived', 'true');
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<import('../rental/lib/booking-rental-eligibility.types').BookingRentalEligibilityResult>(
        `/organizations/${orgId}/bookings/${bookingId}/rental-eligibility${suffix}`,
      );
    },
    createWizardDraft: (
      orgId: string,
      data: {
        vehicleId: string;
        customerId: string;
        startDate: string;
        endDate: string;
        quoteId: string;
        existingBookingId?: string;
        pickupStationId?: string;
        returnStationId?: string;
        pricingInput?: {
          selectedMileagePackageId?: string;
          selectedInsuranceOptionIds?: string[];
          selectedExtraOptionIds?: string[];
          manualDiscountCents?: number;
        };
        notes?: string;
      },
    ) =>
      post<BookingWizardDraftResult>(
        `/organizations/${orgId}/bookings/wizard-draft`,
        data,
      ),
    updateWizardDraft: (
      orgId: string,
      bookingId: string,
      data: {
        quoteId: string;
        pricingInput?: {
          selectedMileagePackageId?: string;
          selectedInsuranceOptionIds?: string[];
          selectedExtraOptionIds?: string[];
          manualDiscountCents?: number;
        };
      },
    ) =>
      patch<BookingWizardDraftResult>(
        `/organizations/${orgId}/bookings/wizard-draft/${bookingId}`,
        data,
      ),
    getWizardCheckoutContext: (orgId: string, bookingId: string) =>
      get<WizardCheckoutContext>(
        `/organizations/${orgId}/bookings/wizard-draft/${bookingId}/checkout-context`,
      ),
    getWizardEligibilityPreview: (
      orgId: string,
      bookingId: string,
      params?: {
        paymentIntent?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
        paymentMethod?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
        targetStatus?: 'PENDING' | 'CONFIRMED';
        eligibilityApprovalId?: string;
        eligibilityOverrideReason?: string;
      },
    ) => {
      const q = new URLSearchParams();
      if (params?.paymentIntent) q.set('paymentIntent', params.paymentIntent);
      else if (params?.paymentMethod) q.set('paymentMethod', params.paymentMethod);
      if (params?.targetStatus) q.set('targetStatus', params.targetStatus);
      if (params?.eligibilityApprovalId) {
        q.set('eligibilityApprovalId', params.eligibilityApprovalId);
      }
      if (params?.eligibilityOverrideReason) {
        q.set('eligibilityOverrideReason', params.eligibilityOverrideReason);
      }
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<import('../rental/lib/booking-wizard-eligibility.types').BookingWizardEligibilityPreview>(
        `/organizations/${orgId}/bookings/wizard-draft/${bookingId}/eligibility-preview${suffix}`,
      );
    },
    confirmWizardDraft: (
      orgId: string,
      bookingId: string,
      data?: {
        agbAccepted?: boolean;
        privacyAccepted?: boolean;
        status?: 'PENDING' | 'CONFIRMED';
        paymentIntent?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
        paymentMethod?: 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
        eligibilityApprovalId?: string;
        eligibilityPreviewFingerprint?: string;
        eligibilityOverrideReason?: string;
      },
    ) =>
      post<BookingWizardDraftResult>(
        `/organizations/${orgId}/bookings/wizard-draft/${bookingId}/confirm`,
        data ?? {},
      ),
    listEligibilityApprovals: (orgId: string, bookingId: string) =>
      get<Array<{
        id: string;
        status: string;
        exceptionReason: string;
        decisionReason: string | null;
      }>>(`/organizations/${orgId}/bookings/${bookingId}/eligibility-approvals`),
    createEligibilityApproval: (
      orgId: string,
      bookingId: string,
      data: { exceptionReason: string; targetBookingStatus?: 'CONFIRMED' | 'ACTIVE' },
    ) =>
      post(`/organizations/${orgId}/bookings/${bookingId}/eligibility-approvals`, data),
    decideEligibilityApproval: (
      orgId: string,
      bookingId: string,
      approvalId: string,
      data: { decision: 'APPROVE' | 'REJECT'; decisionReason: string },
    ) =>
      post(
        `/organizations/${orgId}/bookings/${bookingId}/eligibility-approvals/${approvalId}/decide`,
        data,
      ),
    abortWizardDraft: (orgId: string, bookingId: string) =>
      post<{ booking: unknown; aborted: boolean }>(
        `/organizations/${orgId}/bookings/wizard-draft/${bookingId}/abort`,
        {},
      ),
    // V4.6.75 — Handover-Protokoll (Übergabe beim Pickup, Rückgabe beim Return).
    // V4.6.81 — Pickup handover now accepts an optional `performedAt`
    // ISO-8601 string so operators can record a handover that physically
    // happened earlier (customer arrived late, dispatcher logs after
    // the fact). Omitted → server uses `now()`.
    listHandovers: (orgId: string, bookingId: string) =>
      get<any[]>(`/organizations/${orgId}/bookings/${bookingId}/handover`),
    createPickupHandover: (orgId: string, bookingId: string, data: any) =>
      post<any>(`/organizations/${orgId}/bookings/${bookingId}/handover/pickup`, data),
    createReturnHandover: (orgId: string, bookingId: string, data: any) =>
      post<any>(`/organizations/${orgId}/bookings/${bookingId}/handover/return`, data),
    getHandoverDraft: (orgId: string, bookingId: string, kind: 'PICKUP' | 'RETURN') =>
      get<{
        id: string;
        bookingId: string;
        kind: string;
        payload: Record<string, unknown>;
        updatedAt: string;
      } | null>(`/organizations/${orgId}/bookings/${bookingId}/handover/draft?kind=${kind}`),
    saveHandoverDraft: (
      orgId: string,
      bookingId: string,
      data: { kind: 'PICKUP' | 'RETURN'; payload: Record<string, unknown>; expectedUpdatedAt?: string },
    ) =>
      put<{
        id: string;
        bookingId: string;
        kind: string;
        payload: Record<string, unknown>;
        updatedAt: string;
      }>(`/organizations/${orgId}/bookings/${bookingId}/handover/draft`, data),
    deleteHandoverDraft: (orgId: string, bookingId: string, kind: 'PICKUP' | 'RETURN') =>
      del<{ ok: boolean }>(`/organizations/${orgId}/bookings/${bookingId}/handover/draft?kind=${kind}`),
  },
  // Booking Document Lifecycle — generated PDFs (invoice, deposit receipt,
  // rental contract, handover protocols, final invoice) + downloads.
  documents: {
    listForBooking: (orgId: string, bookingId: string) =>
      get<BookingDocumentBundleView>(`/organizations/${orgId}/bookings/${bookingId}/documents`),
    generateInitialBundle: (orgId: string, bookingId: string) =>
      post<BookingDocumentBundleView>(
        `/organizations/${orgId}/bookings/${bookingId}/documents/generate-initial-bundle`,
        {},
      ),
    regenerate: (orgId: string, bookingId: string, documentType: string) =>
      post<BookingDocumentBundleView>(
        `/organizations/${orgId}/bookings/${bookingId}/documents/regenerate/${documentType}`,
        {},
      ),
    metadata: (orgId: string, documentId: string) =>
      get<GeneratedDocumentDto>(`/organizations/${orgId}/documents/${documentId}/metadata`),
    void: (orgId: string, documentId: string) =>
      post<GeneratedDocumentDto>(`/organizations/${orgId}/documents/${documentId}/void`, {}),
    /** Opens the stored PDF (authenticated) in a new tab. */
    open: (orgId: string, documentId: string) =>
      openAuthedDocument(`/organizations/${orgId}/documents/${documentId}/download`),
    openInvoiceAttachment: (orgId: string, invoiceId: string) =>
      openAuthedDocument(`/organizations/${orgId}/invoices/${invoiceId}/attachment`),
    sendBookingEmail: (
      orgId: string,
      bookingId: string,
      payload: {
        toEmail: string;
        subject: string;
        bodyHtml?: string;
        bodyText?: string;
        ccEmails?: string[];
        bccEmails?: string[];
        documentIds: string[];
      },
    ) =>
      post<OutboundEmailDto>(
        `/organizations/${orgId}/bookings/${bookingId}/documents/send-email`,
        payload,
      ),
  },
  orgEmail: {
    getSettings: (orgId: string) =>
      get<OrgEmailSettingsDto>(`/organizations/${orgId}/email/settings`),
    updateSettings: (orgId: string, payload: UpdateOrgEmailSettingsPayload) =>
      put<OrgEmailSettingsDto>(`/organizations/${orgId}/email/settings`, payload),
    listDomains: (orgId: string) =>
      get<OrgEmailDomainDto[]>(`/organizations/${orgId}/email/domains`),
    addDomain: (orgId: string, payload: { domain: string; fromLocalPart?: string }) =>
      post<OrgEmailDomainDto>(`/organizations/${orgId}/email/domains`, payload),
    verifyDomain: (orgId: string, domainId: string) =>
      post<OrgEmailDomainDto>(`/organizations/${orgId}/email/domains/${domainId}/verify`, {}),
    activateDomain: (orgId: string, domainId: string) =>
      post<OrgEmailDomainDto>(`/organizations/${orgId}/email/domains/${domainId}/activate`, {}),
    deleteDomain: (orgId: string, domainId: string) =>
      del<{ ok: boolean }>(`/organizations/${orgId}/email/domains/${domainId}`),
    sendTest: (orgId: string, payload: { toEmail: string }) =>
      post<OutboundEmailDto>(`/organizations/${orgId}/email/test`, payload),
    listHistory: (orgId: string, params?: { page?: number; limit?: number; bookingId?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.bookingId) q.set('bookingId', params.bookingId);
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<{ data: OutboundEmailDto[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        `/organizations/${orgId}/email/history${suffix}`,
      );
    },
    getHistoryItem: (orgId: string, emailId: string) =>
      get<OutboundEmailDto>(`/organizations/${orgId}/email/history/${emailId}`),
  },
  // Administration → Legal Documents (AGB / Widerrufsbelehrung): upload +
  // versioning. Mutations are ORG_ADMIN-gated server-side.
  legalDocuments: {
    list: (orgId: string) => get<LegalDocumentDto[]>(`/organizations/${orgId}/legal-documents`),
    listPaginated: (
      orgId: string,
      params: {
        page?: number;
        limit?: number;
        documentType?: string;
        status?: string;
        language?: string;
        jurisdiction?: string;
        from?: string;
        to?: string;
        sort?: string;
        order?: 'asc' | 'desc';
      },
    ) => {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value != null && value !== '') qs.set(key, String(value));
      }
      const query = qs.toString();
      return get<PaginatedLegalDocuments>(
        `/organizations/${orgId}/legal-documents${query ? `?${query}` : ''}`,
      );
    },
    getSettings: (orgId: string) =>
      get<{ fourEyesEnabled: boolean }>(`/organizations/${orgId}/legal-documents/settings`),
    get: (orgId: string, id: string) =>
      get<LegalDocumentDto>(`/organizations/${orgId}/legal-documents/${id}`),
    listEvents: (orgId: string, params?: {
      page?: number;
      limit?: number;
      legalDocumentId?: string;
      eventType?: string;
      from?: string;
      to?: string;
      sort?: string;
      order?: 'asc' | 'desc';
    }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.legalDocumentId) qs.set('legalDocumentId', params.legalDocumentId);
      if (params?.eventType) qs.set('eventType', params.eventType);
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      if (params?.sort) qs.set('sort', params.sort);
      if (params?.order) qs.set('order', params.order);
      const query = qs.toString();
      return get<PaginatedLegalDocumentEvents>(
        `/organizations/${orgId}/legal-documents/events${query ? `?${query}` : ''}`,
      );
    },
    listDocumentEvents: (orgId: string, id: string, params?: { page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString();
      return get<PaginatedLegalDocumentEvents>(
        `/organizations/${orgId}/legal-documents/${id}/events${query ? `?${query}` : ''}`,
      );
    },
    getUsage: (orgId: string, id: string, params?: { page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString();
      return get<LegalDocumentUsageResponseDto>(
        `/organizations/${orgId}/legal-documents/${id}/usage${query ? `?${query}` : ''}`,
      );
    },
    fetchPreviewBlob: (orgId: string, id: string) =>
      fetchBlob(`/organizations/${orgId}/legal-documents/${id}/download`),
    activate: (orgId: string, id: string, body: { statusReason: string; changeSummary?: string }) =>
      post<LegalDocumentDto>(`/organizations/${orgId}/legal-documents/${id}/activate`, body),
    approve: (orgId: string, id: string, body?: { changeSummary?: string }) =>
      post<LegalDocumentDto>(`/organizations/${orgId}/legal-documents/${id}/approve`, body ?? {}),
    schedule: (
      orgId: string,
      id: string,
      body: { validFrom: string; changeSummary?: string; statusReason?: string },
    ) => post<LegalDocumentDto>(`/organizations/${orgId}/legal-documents/${id}/schedule`, body),
    requestChanges: (
      orgId: string,
      id: string,
      body: { statusReason: string; changeSummary?: string },
    ) => post<LegalDocumentDto>(`/organizations/${orgId}/legal-documents/${id}/request-changes`, body),
    revoke: (orgId: string, id: string, body: { statusReason: string; changeSummary?: string }) =>
      post<LegalDocumentDto>(`/organizations/${orgId}/legal-documents/${id}/revoke`, body),
    archive: (orgId: string, id: string, body?: { statusReason?: string; changeSummary?: string }) =>
      post<LegalDocumentDto>(`/organizations/${orgId}/legal-documents/${id}/archive`, body ?? {}),
    open: (orgId: string, id: string) =>
      openAuthedDocument(`/organizations/${orgId}/legal-documents/${id}/download`),
    submitForReview: (orgId: string, id: string, body?: { changeSummary?: string }) =>
      post<LegalDocumentDto>(`/organizations/${orgId}/legal-documents/${id}/submit-for-review`, body ?? {}),
    uploadWithProgress: (
      orgId: string,
      params: {
        documentType: string;
        versionLabel: string;
        title?: string;
        language?: string;
        legalVariant?: string;
        changeSummary?: string;
        legalOwnerName?: string;
        jurisdictionCountry?: string;
        customerSegment?: string;
        bookingChannel?: string;
        productScope?: string;
        stationScopeMode?: string;
        stationIds?: string[];
        priority?: number;
        isMandatory?: boolean;
        noticePurpose?: string;
        validFrom?: string;
        validUntil?: string;
        file: File;
      },
      options?: {
        onProgress?: (percent: number) => void;
        signal?: AbortSignal;
      },
    ) =>
      new Promise<LegalDocumentDto>((resolve, reject) => {
        const form = new FormData();
        form.append('file', params.file);
        form.append('documentType', params.documentType);
        form.append('versionLabel', params.versionLabel);
        if (params.title) form.append('title', params.title);
        if (params.language) form.append('language', params.language);
        if (params.legalVariant) form.append('legalVariant', params.legalVariant);
        if (params.changeSummary) form.append('changeSummary', params.changeSummary);
        if (params.legalOwnerName) form.append('legalOwnerName', params.legalOwnerName);
        if (params.jurisdictionCountry) form.append('jurisdictionCountry', params.jurisdictionCountry);
        if (params.customerSegment) form.append('customerSegment', params.customerSegment);
        if (params.bookingChannel) form.append('bookingChannel', params.bookingChannel);
        if (params.productScope) form.append('productScope', params.productScope);
        if (params.stationScopeMode) form.append('stationScopeMode', params.stationScopeMode);
        if (params.stationIds?.length) form.append('stationIds', params.stationIds.join(','));
        if (params.priority != null) form.append('priority', String(params.priority));
        if (params.isMandatory != null) form.append('isMandatory', String(params.isMandatory));
        if (params.validFrom) form.append('validFrom', params.validFrom);
        if (params.validUntil) form.append('validUntil', params.validUntil);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE_URL}/organizations/${orgId}/legal-documents/upload`);
        const token = getToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable || !options?.onProgress) return;
          options.onProgress(Math.round((event.loaded / event.total) * 100));
        };

        xhr.onload = () => {
          let body: { message?: string | string[]; field?: string; code?: string } = {};
          try {
            body = JSON.parse(xhr.responseText) as typeof body;
          } catch {
            /* ignore */
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as LegalDocumentDto);
            } catch {
              reject(new Error('Ungültige Serverantwort'));
            }
            return;
          }
          const msg = body.message;
          const message = Array.isArray(msg) ? msg.join(', ') : msg || `API-Fehler ${xhr.status}`;
          const error = new Error(message) as Error & { field?: string; code?: string };
          error.field = body.field;
          error.code = body.code;
          reject(error);
        };

        xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
        xhr.onabort = () => reject(new Error('Upload abgebrochen'));

        if (options?.signal) {
          if (options.signal.aborted) {
            xhr.abort();
            return;
          }
          options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
        }

        xhr.send(form);
      }),
    upload: async (
      orgId: string,
      params: {
        documentType: string;
        versionLabel: string;
        title?: string;
        language?: string;
        legalVariant?: string;
        file: File;
      },
    ) => {
      const form = new FormData();
      form.append('file', params.file);
      form.append('documentType', params.documentType);
      form.append('versionLabel', params.versionLabel);
      if (params.title) form.append('title', params.title);
      if (params.language) form.append('language', params.language);
      if (params.legalVariant) form.append('legalVariant', params.legalVariant);
      const token = getToken();
      const res = await fetch(`${BASE_URL}/organizations/${orgId}/legal-documents/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string | string[] };
        const msg = body.message;
        throw new Error(
          Array.isArray(msg) ? msg.join(', ') : msg || `API error ${res.status}`,
        );
      }
      return res.json() as Promise<LegalDocumentDto>;
    },
  },
  // V4.6.76 Rental Health V1 — canonical 5-state vehicle health with
  // rental_blocked gate. The backend aggregates Battery/Tires/Brakes/
  // DTC/Service-Info/Complaints/OEM-Alerts into one deterministic shape.
  rentalHealth: {
    getVehicle: (orgId: string, vehicleId: string) =>
      get<VehicleHealthResponse>(
        `/organizations/${orgId}/vehicles/${vehicleId}/rental-health`,
      ),
    getFleetPage: (orgId: string, filters?: FleetRentalHealthQuery) =>
      fetchFleetRentalHealthPage(orgId, filters),
    getFleetScoped: (orgId: string, filters?: FleetRentalHealthQuery) =>
      fetchAllFleetRentalHealth(orgId, filters),
    getFleetSummary: (
      orgId: string,
      params?: import('../rental/lib/notifications/notification-api.types').ApiFleetReadinessSummaryParams,
    ) => {
      const q = new URLSearchParams();
      if (params?.stationId) q.set('stationId', params.stationId);
      if (params?.search) q.set('search', params.search);
      if (params?.vehicleStatus) q.set('vehicleStatus', params.vehicleStatus);
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<import('../rental/lib/notifications/notification-api.types').ApiFleetReadinessSummaryResponse>(
        `/organizations/${orgId}/rental-health/fleet/summary${suffix}`,
      );
    },
    /** @deprecated Prefer `getFleetScoped` — avoids huge `vehicleIds` query strings. */
    getFleet: (orgId: string, vehicleIds?: string[]) => {
      const suffix =
        vehicleIds && vehicleIds.length > 0
          ? `?vehicleIds=${encodeURIComponent(vehicleIds.join(','))}`
          : '';
      return get<{ vehicles: VehicleHealthResponse[] }>(
        `/organizations/${orgId}/rental-health${suffix}`,
      );
    },
  },
  dashboardInsights: {
    get: (orgId: string) => get<{
      generatedAt: string | null;
      hasRun: boolean;
      lastRunAt: string | null;
      stale: boolean;
      activeInsightCount: number;
      error: string | null;
      summary: { total: number; critical: number; warning: number; opportunity: number; info: number };
      insights: Array<{
        id: string;
        type: string;
        severity: string;
        priority: number;
        title: string;
        message: string;
        actionLabel?: string | null;
        actionType?: string | null;
        entityScope: string;
        entityIds?: string[] | null;
        timeContext?: Record<string, string> | null;
        metrics?: Record<string, unknown> | null;
        reasons?: string[] | null;
        isGrouped: boolean;
        groupCount: number;
        createdAt: string;
      }>;
    }>(`/organizations/${orgId}/dashboard-insights`),
  },
  dashboardUtilization: {
    getOverview: (
      orgId: string,
      params?: { year?: number; month?: number; stationId?: string | null },
    ) => {
      const search = new URLSearchParams();
      if (params?.year != null) search.set('year', String(params.year));
      if (params?.month != null) search.set('month', String(params.month));
      if (params?.stationId) search.set('stationId', params.stationId);
      const suffix = search.toString() ? `?${search.toString()}` : '';
      return get<{
        status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE' | 'ERROR';
        reason: string | null;
        year: number;
        month: number;
        isPartialMonth: boolean;
        stationScoped: boolean;
        generatedAt: string;
        monthMetrics: {
          utilizationPercent: number | null;
          bookingCount: number;
          utilizationDeltaPp: number | null;
          bookingDeltaPercent: number | null;
        };
        previousMonthMetrics: {
          utilizationPercent: number | null;
          bookingCount: number;
          utilizationDeltaPp: number | null;
          bookingDeltaPercent: number | null;
        };
        days: Array<{ date: string; utilizationPercent: number | null }>;
      }>(`/organizations/${orgId}/dashboard/utilization${suffix}`);
    },
  },
  notifications: {
    list: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        activeOnly?: boolean;
        unreadOnly?: boolean;
        resolvedOnly?: boolean;
        from?: string;
        to?: string;
        sortBy?: 'lastSeenAt' | 'createdAt' | 'severity';
        sortOrder?: 'asc' | 'desc';
        attentionScope?: import('../rental/lib/notifications/notification-api.types').ApiNotificationAttentionScope;
        stationId?: string;
      },
    ) => {
      const q = new URLSearchParams();
      if (params?.page != null) q.set('page', String(params.page));
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.activeOnly != null) q.set('activeOnly', String(params.activeOnly));
      if (params?.unreadOnly != null) q.set('unreadOnly', String(params.unreadOnly));
      if (params?.resolvedOnly != null) q.set('resolvedOnly', String(params.resolvedOnly));
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      if (params?.sortBy) q.set('sortBy', params.sortBy);
      if (params?.sortOrder) q.set('sortOrder', params.sortOrder);
      if (params?.attentionScope) q.set('attentionScope', params.attentionScope);
      if (params?.stationId) q.set('stationId', params.stationId);
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<import('../rental/lib/notifications/notification-api.types').ApiNotificationListResponse>(
        `/organizations/${orgId}/notifications${suffix}`,
      );
    },
    counts: (orgId: string) =>
      get<import('../rental/lib/notifications/notification-api.types').ApiNotificationCountsResponse>(
        `/organizations/${orgId}/notifications/counts`,
      ),
    get: (orgId: string, id: string) =>
      get<import('../rental/lib/notifications/notification-api.types').ApiNotificationResponse>(
        `/organizations/${orgId}/notifications/${id}`,
      ),
    markRead: (orgId: string, id: string) =>
      post<import('../rental/lib/notifications/notification-api.types').ApiNotificationResponse>(
        `/organizations/${orgId}/notifications/${id}/read`,
        {},
      ),
    markUnread: (orgId: string, id: string) =>
      post<import('../rental/lib/notifications/notification-api.types').ApiNotificationResponse>(
        `/organizations/${orgId}/notifications/${id}/unread`,
        {},
      ),
    acknowledge: (orgId: string, id: string) =>
      post<import('../rental/lib/notifications/notification-api.types').ApiNotificationResponse>(
        `/organizations/${orgId}/notifications/${id}/acknowledge`,
        {},
      ),
    snooze: (orgId: string, id: string, until: string) =>
      post<import('../rental/lib/notifications/notification-api.types').ApiNotificationResponse>(
        `/organizations/${orgId}/notifications/${id}/snooze`,
        { until },
      ),
    unsnooze: (orgId: string, id: string) =>
      post<import('../rental/lib/notifications/notification-api.types').ApiNotificationResponse>(
        `/organizations/${orgId}/notifications/${id}/unsnooze`,
        {},
      ),
    resolve: (orgId: string, id: string) =>
      post<import('../rental/lib/notifications/notification-api.types').ApiNotificationResponse>(
        `/organizations/${orgId}/notifications/${id}/resolve`,
        {},
      ),
    archive: (orgId: string, id: string) =>
      post<import('../rental/lib/notifications/notification-api.types').ApiNotificationResponse>(
        `/organizations/${orgId}/notifications/${id}/archive`,
        {},
      ),
  },
  rentalDrivingAnalyses: {
    // V4.6.95 — `bookingId` filter added so the booking detail card in
    // BookingsView can fetch the single canonical analysis row for a booking.
    list: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        vehicleId?: string;
        driverId?: string;
        bookingCustomerId?: string;
        bookingId?: string;
        from?: string;
        to?: string;
      },
    ) => {
      const q = new URLSearchParams();
      if (params?.page != null) q.set('page', String(params.page));
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.vehicleId) q.set('vehicleId', params.vehicleId);
      if (params?.driverId) q.set('driverId', params.driverId);
      if (params?.bookingCustomerId) q.set('bookingCustomerId', params.bookingCustomerId);
      if (params?.bookingId) q.set('bookingId', params.bookingId);
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      const suffix = q.toString() ? '?' + q.toString() : '';
      return get<{ data: RentalDrivingAnalysisItem[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        `/organizations/${orgId}/rental-driving-analyses${suffix}`,
      );
    },
    get: (orgId: string, id: string) => get<RentalDrivingAnalysisItem>(`/organizations/${orgId}/rental-driving-analyses/${id}`),
  },
  misuseCases: {
    list: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        vehicleId?: string;
        tripId?: string;
        bookingId?: string;
        customerId?: string;
        category?: string;
        type?: string;
        severity?: string;
        status?: MisuseCaseStatus;
      },
    ) => {
      const q = new URLSearchParams();
      if (params?.page != null) q.set('page', String(params.page));
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.vehicleId) q.set('vehicleId', params.vehicleId);
      if (params?.tripId) q.set('tripId', params.tripId);
      if (params?.bookingId) q.set('bookingId', params.bookingId);
      if (params?.customerId) q.set('customerId', params.customerId);
      if (params?.category) q.set('category', params.category);
      if (params?.type) q.set('type', params.type);
      if (params?.severity) q.set('severity', params.severity);
      if (params?.status) q.set('status', params.status);
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<{
        data: MisuseCaseRecord[];
        meta: { total: number; page: number; limit: number; totalPages: number };
      }>(`/organizations/${orgId}/misuse-cases${suffix}`);
    },
    get: (orgId: string, id: string) =>
      get<MisuseCaseRecord>(`/organizations/${orgId}/misuse-cases/${id}`),
    transition: (
      orgId: string,
      id: string,
      body: {
        action: 'CONFIRM' | 'DISMISS' | 'RESOLVE' | 'DOWNGRADE' | 'SUPERSEDE';
        resolutionReason?: string;
        operatorNote?: string;
      },
    ) =>
      post<MisuseCaseRecord>(`/organizations/${orgId}/misuse-cases/${id}/lifecycle`, body),
  },
  customers: {
    list: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        search?: string;
        status?: string;
        riskLevel?: string;
        customerType?: string;
        verificationStatus?: string;
        verificationTarget?: 'id' | 'license';
        licenseExpiringBefore?: string;
        includeArchived?: boolean;
      },
    ) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.search) q.set('search', params.search);
      if (params?.status) q.set('status', params.status);
      if (params?.riskLevel) q.set('riskLevel', params.riskLevel);
      if (params?.customerType) q.set('customerType', params.customerType);
      if (params?.verificationStatus) q.set('verificationStatus', params.verificationStatus);
      if (params?.verificationTarget) q.set('verificationTarget', params.verificationTarget);
      if (params?.licenseExpiringBefore) q.set('licenseExpiringBefore', params.licenseExpiringBefore);
      if (params?.includeArchived) q.set('includeArchived', 'true');
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<{ data: CustomerApiRecord[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        `/organizations/${orgId}/customers${suffix}`,
      );
    },
    get: (orgId: string, id: string) => get<CustomerApiRecord>(`/organizations/${orgId}/customers/${id}`),
    create: (orgId: string, data: Record<string, unknown>) => post<CustomerApiRecord>(`/organizations/${orgId}/customers`, data),
    update: (orgId: string, id: string, data: Record<string, unknown>) => patch<CustomerApiRecord>(`/organizations/${orgId}/customers/${id}`, data),
    archive: (orgId: string, id: string, reason?: string) =>
      request<CustomerApiRecord>(`/organizations/${orgId}/customers/${id}`, {
        method: 'DELETE',
        body: JSON.stringify(reason ? { reason } : {}),
      }),
    delete: (orgId: string, id: string) => del<CustomerApiRecord>(`/organizations/${orgId}/customers/${id}`),
    stats: (orgId: string) => get<Record<string, number>>(`/organizations/${orgId}/customers/stats`),
    checkDuplicates: (
      orgId: string,
      params: {
        email?: string;
        phone?: string;
        licenseNumber?: string;
        idNumber?: string;
        firstName?: string;
        lastName?: string;
        dateOfBirth?: string;
      },
    ) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v) q.set(k, v);
      });
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<{ duplicates: Array<{ customerId: string; firstName: string; lastName: string; email: string | null; matchType: 'hard' | 'soft'; matchReason: string }>; hasHardMatch: boolean }>(
        `/organizations/${orgId}/customers/duplicates${suffix}`,
      );
    },
    eligibility: (orgId: string, id: string, startDate?: string) => {
      const q = startDate ? `?startDate=${encodeURIComponent(startDate)}` : '';
      return get<{
        customerId: string;
        canCreatePendingBooking: boolean;
        canConfirmBooking: boolean;
        canStartRental: boolean;
        globalBlockingReasons?: string[];
        blockingReasons: string[];
        warnings: string[];
        requiredActions: string[];
        stages?: {
          createBooking: {
            key: string;
            label: string;
            canProceed: boolean;
            status: string;
            blockingReasons: string[];
            warnings: string[];
            requiredActions: string[];
          };
          confirmBooking: {
            key: string;
            label: string;
            canProceed: boolean;
            status: string;
            blockingReasons: string[];
            warnings: string[];
            requiredActions: string[];
          };
          startPickup: {
            key: string;
            label: string;
            canProceed: boolean;
            status: string;
            blockingReasons: string[];
            warnings: string[];
            requiredActions: string[];
          };
        };
      }>(`/organizations/${orgId}/customers/${id}/eligibility${q}`);
    },
    updateStatus: (orgId: string, id: string, data: { status: string; reason?: string }) =>
      patch<CustomerApiRecord>(`/organizations/${orgId}/customers/${id}/status`, data),
    updateRisk: (orgId: string, id: string, data: { riskLevel: string; riskReason?: string }) =>
      patch<CustomerApiRecord>(`/organizations/${orgId}/customers/${id}/risk`, data),
    // Legacy pre-registration upload (backward compat).
    uploadDocument: async (
      orgId: string,
      documentType: 'id-front' | 'id-back' | 'license-front' | 'license-back',
      file: File,
    ) => {
      const form = new FormData();
      form.append('file', file);
      form.append('documentType', documentType);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(
        `/api/v1/organizations/${orgId}/customers/documents`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        },
      );
      if (!res.ok) {
        let message = `Upload failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) message = body.message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      return res.json() as Promise<{ url: string; documentType: string | null }>;
    },
    customerDocuments: {
      list: (orgId: string, customerId: string) =>
        get<Array<Record<string, unknown>>>(`/organizations/${orgId}/customers/${customerId}/documents`),
      status: (orgId: string, customerId: string) =>
        get<{
          customerId: string;
          idDocument: CustomerDocumentDomainStatus;
          drivingLicense: CustomerDocumentDomainStatus;
          proofOfAddress: CustomerDocumentDomainStatus;
          missingUploadSlots: Array<{
            slot: string;
            label: string;
            documentType: string;
          }>;
        }>(`/organizations/${orgId}/customers/${customerId}/documents/status`),
      upload: async (
        orgId: string,
        customerId: string,
        type: string,
        file: File,
      ) => {
        const form = new FormData();
        form.append('file', file);
        form.append('type', type);
        const token = localStorage.getItem('synqdrive_token');
        const res = await fetch(
          `/api/v1/organizations/${orgId}/customers/${customerId}/documents`,
          {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: form,
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message || `Upload failed (${res.status})`);
        }
        return res.json() as Promise<Record<string, unknown>>;
      },
      review: (
        orgId: string,
        customerId: string,
        documentId: string,
        payload: { status: string; rejectedReason?: string },
      ) =>
        patch<Record<string, unknown>>(
          `/organizations/${orgId}/customers/${customerId}/documents/${documentId}/review`,
          payload,
        ),
    },
    customerTimeline: {
      list: (
        orgId: string,
        customerId: string,
        params?: { page?: number; limit?: number },
      ) => {
        const q = new URLSearchParams();
        if (params?.page) q.set('page', String(params.page));
        if (params?.limit) q.set('limit', String(params.limit));
        const suffix = q.toString() ? `?${q.toString()}` : '';
        return get<{ data: Array<Record<string, unknown>>; meta: { total: number; page: number; limit: number; totalPages: number } }>(
          `/organizations/${orgId}/customers/${customerId}/timeline${suffix}`,
        );
      },
      addNote: (orgId: string, customerId: string, payload: { note: string; title?: string }) =>
        post<Record<string, unknown>>(
          `/organizations/${orgId}/customers/${customerId}/timeline/notes`,
          payload,
        ),
    },
  },
  stations: {
    list: (orgId: string, params?: { status?: string; type?: string; selectableOnly?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.type) q.set('type', params.type);
      if (params?.selectableOnly) q.set('selectableOnly', 'true');
      const qs = q.toString();
      return get<Station[]>(`/organizations/${orgId}/stations${qs ? `?${qs}` : ''}`);
    },
    get: (orgId: string, id: string) => get<Station>(`/organizations/${orgId}/stations/${id}`),
    create: (orgId: string, data: StationUpsertPayload) =>
      post<Station>(`/organizations/${orgId}/stations`, data),
    update: (orgId: string, id: string, data: Partial<StationUpsertPayload>) =>
      patch<Station>(`/organizations/${orgId}/stations/${id}`, data),
    delete: (orgId: string, id: string) =>
      del<{ id: string; unassignedVehicles: number; archived?: boolean }>(
        `/organizations/${orgId}/stations/${id}`,
      ),
    archive: (orgId: string, id: string) =>
      post<Station>(`/organizations/${orgId}/stations/${id}/archive`, {}),
    restore: (orgId: string, id: string) =>
      post<Station>(`/organizations/${orgId}/stations/${id}/restore`, {}),
    setPrimary: (orgId: string, id: string) =>
      post<Station>(`/organizations/${orgId}/stations/${id}/set-primary`, {}),
    overviewStats: (orgId: string, stationId: string) =>
      get<StationOverviewStats>(`/organizations/${orgId}/stations/${stationId}/overview-stats`),
    summaries: (orgId: string, stationIds: string[]) => {
      const q = new URLSearchParams({ stationIds: stationIds.join(',') });
      return get<Record<string, StationOverviewStats>>(
        `/organizations/${orgId}/stations/summaries?${q.toString()}`,
      );
    },
    fleet: (orgId: string, stationId: string) =>
      get<StationFleetVehicle[]>(`/organizations/${orgId}/stations/${stationId}/fleet`),
    bookings: (orgId: string, stationId: string) =>
      get<StationBookingRow[]>(`/organizations/${orgId}/stations/${stationId}/bookings`),
    stats: (orgId: string) => get<StationsStats>(`/organizations/${orgId}/stations/stats`),
    featureFlags: (orgId: string) =>
      get<StationsV2FeatureFlagsResponse>(`/organizations/${orgId}/stations/feature-flags`),
    featureFlagsContract: (orgId: string) =>
      get<Record<string, unknown>>(`/organizations/${orgId}/stations/feature-flags/contract`),
    searchMapbox: (orgId: string, query: string, opts?: { country?: string; limit?: number }) => {
      const q = new URLSearchParams({ query });
      if (opts?.country) q.set('country', opts.country);
      if (opts?.limit != null) q.set('limit', String(opts.limit));
      return get<StationMapboxSearchResult>(`/organizations/${orgId}/stations/search/mapbox?${q.toString()}`);
    },
    mapboxRetrieve: (orgId: string, mapboxId: string, sessionToken: string) =>
      get<StationMapboxPrefill | null>(
        `/organizations/${orgId}/stations/search/mapbox/${encodeURIComponent(mapboxId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
      ),
    /**
     * Replace this station's vehicle list with `vehicleIds` (SET semantics).
     * Vehicles previously assigned to this station that are not in the list
     * will be detached; vehicles in the list that are currently elsewhere
     * (including at another station) are moved here.
     */
    setVehicles: (orgId: string, stationId: string, vehicleIds: string[]) =>
      put<StationVehicleAssignmentResult>(
        `/organizations/${orgId}/stations/${stationId}/vehicles`,
        { vehicleIds },
      ),
    assignVehicle: (
      orgId: string,
      stationId: string,
      vehicleId: string,
      target: 'home' | 'current' | 'expected' = 'home',
    ) =>
      post<{ id: string; homeStationId: string | null; currentStationId: string | null; expectedStationId: string | null }>(
        `/organizations/${orgId}/stations/${stationId}/assign-vehicle`,
        { vehicleId, target },
      ),
    /**
     * V4.7.07 — Geocode all stations in this org that are missing
     * latitude / longitude. Idempotent. Returns a per-station summary
     * (geocoded / failed / skipped) so the UI can show progress.
     */
    backfillCoordinates: (orgId: string) =>
      post<StationGeocodingBackfillResult>(
        `/organizations/${orgId}/stations/backfill-coordinates`,
        {},
      ),
  },
  vendors: {
    list: (orgId: string) => get<Vendor[]>(`/organizations/${orgId}/vendors`),
    get: (orgId: string, id: string) => get<Vendor>(`/organizations/${orgId}/vendors/${id}`),
    create: (orgId: string, data: VendorInput) => post<Vendor>(`/organizations/${orgId}/vendors`, data),
    update: (orgId: string, id: string, data: Partial<VendorInput>) =>
      patch<Vendor>(`/organizations/${orgId}/vendors/${id}`, data),
    delete: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/vendors/${id}`),
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/vendors/stats`),
    // Mapbox POI search (server-side token proxy): suggest + retrieve.
    searchMapbox: (orgId: string, query: string, opts?: { country?: string; limit?: number }) => {
      const q = new URLSearchParams({ query });
      if (opts?.country) q.set('country', opts.country);
      if (opts?.limit != null) q.set('limit', String(opts.limit));
      return get<VendorMapboxSearchResult>(`/organizations/${orgId}/vendors/search/mapbox?${q.toString()}`);
    },
    mapboxRetrieve: (orgId: string, mapboxId: string, sessionToken: string) =>
      get<VendorMapboxPrefill | null>(
        `/organizations/${orgId}/vendors/search/mapbox/${encodeURIComponent(mapboxId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
      ),
    // Vehicle links — managed independently of vendor master data.
    linkVehicle: (orgId: string, vendorId: string, data: VendorVehicleLinkInput) =>
      post<VendorLinkedVehicle>(`/organizations/${orgId}/vendors/${vendorId}/vehicles`, data),
    updateLink: (orgId: string, vendorId: string, linkId: string, data: VendorVehicleLinkUpdate) =>
      patch<VendorLinkedVehicle>(`/organizations/${orgId}/vendors/${vendorId}/vehicles/${linkId}`, data),
    unlinkVehicle: (orgId: string, vendorId: string, linkId: string) =>
      del<void>(`/organizations/${orgId}/vendors/${vendorId}/vehicles/${linkId}`),
    // Detail-page data.
    invoices: (orgId: string, vendorId: string) =>
      get<VendorInvoiceRow[]>(`/organizations/${orgId}/vendors/${vendorId}/invoices`),
    audit: (orgId: string, vendorId: string) =>
      get<VendorAuditEntry[]>(`/organizations/${orgId}/vendors/${vendorId}/audit`),
    documents: (orgId: string, vendorId: string) =>
      get<any[]>(`/organizations/${orgId}/vendors/${vendorId}/documents`),
    /** Completed canonical ServiceCases for this vendor (empty when none exist). */
    serviceHistory: (orgId: string, vendorId: string) =>
      get<ApiServiceCase[]>(`/organizations/${orgId}/vendors/${vendorId}/service-history`),
  },
  dataAnalyse: {
    clickhouseDiagnostics: (orgId: string) =>
      get<DataAnalyseClickHouseDiagnostics>(
        `/organizations/${orgId}/data-analyse/clickhouse-diagnostics`,
      ),
    vehicles: (orgId: string) =>
      get<DataAnalyseVehicle[]>(`/organizations/${orgId}/data-analyse/vehicles`),
    telemetryOverview: (orgId: string, vehicleId: string) =>
      get<DataAnalyseTelemetryOverview>(`/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/telemetry-overview`),
    signals: (orgId: string, vehicleId: string) =>
      get<DataAnalyseSignalRow[]>(`/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/signals`),
    highFrequency: (orgId: string, vehicleId: string) =>
      get<DataAnalyseHighFrequency>(`/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/high-frequency`),
    latestTripSignalQuality: (orgId: string, vehicleId: string) =>
      get<DataAnalyseSignalQuality>(
        `/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/signal-quality/latest`,
      ),
    tripSignalQuality: (orgId: string, vehicleId: string, tripId: string) =>
      get<DataAnalyseSignalQuality>(
        `/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/trips/${tripId}/signal-quality`,
      ),
    launchFeasibility: (orgId: string, vehicleId: string) =>
      get<DataAnalyseLaunchFeasibilityResult>(`/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/launch-feasibility`),
    healthTrace: (orgId: string, vehicleId: string) =>
      get<DataAnalyseHealthTrace>(`/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/health-trace`),
    pipeline: (orgId: string, vehicleId: string) =>
      get<DataAnalysePipeline>(`/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/pipeline`),
    eventArchitecture: (orgId: string, vehicleId: string) =>
      get<DataAnalyseEventArchitecture>(
        `/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/event-architecture`,
      ),
    deviceConnectionEvents: (orgId: string, vehicleId: string, debugRaw?: boolean) => {
      const qs = debugRaw ? '?debugRaw=1' : '';
      return get<DeviceConnectionSummary>(
        `/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/device-connection-events${qs}`,
      );
    },
    rpmWebhookCandidates: (orgId: string, vehicleId: string) =>
      get<VehicleRpmWebhookSummary>(
        `/organizations/${orgId}/data-analyse/vehicles/${vehicleId}/rpm-webhook-candidates`,
      ),
    signalGroups: (orgId: string, vehicleId?: string) => {
      const qs = vehicleId ? `?vehicleId=${encodeURIComponent(vehicleId)}` : '';
      return get<DataAnalyseSignalGroup[]>(`/organizations/${orgId}/data-analyse/signal-groups${qs}`);
    },
  },
  dataAuthorizations: {
    list: (orgId: string, params?: { status?: string; moduleOrigin?: string; scope?: string; sourceType?: string; q?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.moduleOrigin) q.set('moduleOrigin', params.moduleOrigin);
      if (params?.scope) q.set('scope', params.scope);
      if (params?.sourceType) q.set('sourceType', params.sourceType);
      if (params?.q) q.set('q', params.q);
      const qs = q.toString();
      return get<DataAuthorizationDto[]>(`/organizations/${orgId}/data-authorizations${qs ? `?${qs}` : ''}`);
    },
    stats: (orgId: string) => get<DataAuthorizationStatsDto>(`/organizations/${orgId}/data-authorizations/stats`),
    get: (orgId: string, id: string) => get<DataAuthorizationDto>(`/organizations/${orgId}/data-authorizations/${id}`),
    create: (orgId: string, data: CreateDataAuthorizationPayload) =>
      post<DataAuthorizationDto>(`/organizations/${orgId}/data-authorizations`, data),
    grant: (orgId: string, id: string, body?: { notes?: string }) =>
      post<DataAuthorizationDto>(`/organizations/${orgId}/data-authorizations/${id}/grant`, body ?? {}),
    revoke: (orgId: string, id: string, body?: { reason?: string }) =>
      post<DataAuthorizationDto>(`/organizations/${orgId}/data-authorizations/${id}/revoke`, body ?? {}),
    syncSystem: (orgId: string) =>
      post<DataAuthorizationDto[]>(`/organizations/${orgId}/data-authorizations/sync-system-authorizations`, {}),
    /** Alias for syncSystem */
    syncSystemAuthorizations: (orgId: string) =>
      post<DataAuthorizationDto[]>(`/organizations/${orgId}/data-authorizations/sync-system-authorizations`, {}),
    auditLog: (orgId: string, limit?: number) => {
      const q = limit ? `?limit=${limit}` : '';
      return get<DataAuthorizationAuditEntry[]>(`/organizations/${orgId}/data-authorizations/audit-log${q}`);
    },
  },
  taskAutomation: {
    listRules: (orgId: string) =>
      get<import('../rental/components/workflow-automation/task-automation.types').TaskAutomationRulesOverviewDto>(
        `/organizations/${orgId}/task-automation/rules`,
      ),
    getRule: (orgId: string, ruleId: string) =>
      get<import('../rental/components/workflow-automation/task-automation.types').TaskAutomationRuleDto>(
        `/organizations/${orgId}/task-automation/rules/${encodeURIComponent(ruleId)}`,
      ),
    upsertOverride: (
      orgId: string,
      ruleId: string,
      data: import('../rental/components/workflow-automation/task-automation.types').TaskAutomationOverridePayload,
    ) =>
      patch<import('../rental/components/workflow-automation/task-automation.types').TaskAutomationRuleDto>(
        `/organizations/${orgId}/task-automation/rules/${encodeURIComponent(ruleId)}/override`,
        data,
      ),
    resetOverride: (
      orgId: string,
      ruleId: string,
      expectedVersion?: number,
      reason?: string | null,
    ) =>
      request<import('../rental/components/workflow-automation/task-automation.types').TaskAutomationRuleDto>(
        `/organizations/${orgId}/task-automation/rules/${encodeURIComponent(ruleId)}/override`,
        {
          method: 'DELETE',
          body: JSON.stringify({
            ...(expectedVersion != null ? { expectedVersion } : {}),
            ...(reason ? { reason } : {}),
          }),
        },
      ),
    simulateRule: (
      orgId: string,
      ruleId: string,
      data?: {
        proposedConfig?: import('../rental/components/workflow-automation/task-automation.types').TaskAutomationOverridePayload | null;
        periodDays?: number;
      },
    ) =>
      post<import('../rental/components/workflow-automation/task-automation.types').TaskAutomationSimulationResult>(
        `/organizations/${orgId}/task-automation/rules/${encodeURIComponent(ruleId)}/simulate`,
        data ?? {},
      ),
    listRuleRevisions: (orgId: string, ruleId: string) =>
      get<
        import('../rental/components/workflow-automation/task-automation.types').TaskAutomationRuleRevisionDto[]
      >(`/organizations/${orgId}/task-automation/rules/${encodeURIComponent(ruleId)}/revisions`),
    replayDeadLetterOutbox: (orgId: string, outboxId: string, data: { makerReason: string }) =>
      post<{ pendingApproval: boolean; outboxId: string; changeRequest?: WorkflowChangeRequestDto; status?: 'PENDING' }>(
        `/organizations/${orgId}/task-automation/outbox/${encodeURIComponent(outboxId)}/replay`,
        data,
      ),
  },
  workflows: {
    list: (
      orgId: string,
      params?: {
        status?: string;
        category?: string;
        search?: string;
        includeSystem?: boolean;
        includeArchived?: boolean;
      },
    ) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.category) q.set('category', params.category);
      if (params?.search) q.set('search', params.search);
      if (params?.includeSystem) q.set('includeSystem', 'true');
      if (params?.includeArchived) q.set('includeArchived', 'true');
      const qs = q.toString();
      return get<WorkflowListItemDto[]>(`/organizations/${orgId}/workflows${qs ? `?${qs}` : ''}`);
    },
    stats: (orgId: string) => get<WorkflowStatsDto>(`/organizations/${orgId}/workflows/stats`),
    catalog: (orgId: string) =>
      get<import('../rental/components/workflow-automation/workflow-config.types').WorkflowCatalogDto>(
        `/organizations/${orgId}/workflows/catalog`,
      ),
    get: (orgId: string, id: string) => get<WorkflowDto>(`/organizations/${orgId}/workflows/${id}`),
    create: (orgId: string, data: WorkflowCreatePayload) =>
      post<WorkflowMutationResultDto>(`/organizations/${orgId}/workflows`, data),
    update: (orgId: string, id: string, data: WorkflowUpdatePayload) =>
      patch<WorkflowMutationResultDto>(`/organizations/${orgId}/workflows/${id}`, data),
    toggle: (orgId: string, id: string, data?: { activationReason?: string }) =>
      patch<WorkflowMutationResultDto>(`/organizations/${orgId}/workflows/${id}/toggle`, data ?? {}),
    duplicate: (orgId: string, id: string) => post<WorkflowDto>(`/organizations/${orgId}/workflows/${id}/duplicate`, {}),
    remove: (orgId: string, id: string) => del<{ deleted: boolean }>(`/organizations/${orgId}/workflows/${id}`),
    listRuns: (orgId: string, workflowId: string, limit = 25) =>
      get<WorkflowRunDto[]>(`/organizations/${orgId}/workflows/${workflowId}/runs?limit=${limit}`),
    getRun: (orgId: string, runId: string) => get<WorkflowRunDto>(`/organizations/${orgId}/workflows/runs/${runId}`),
    dryRun: (orgId: string, workflowId: string, data?: WorkflowTestPayload, init?: RequestInit) =>
      request<WorkflowExecutionPlanDto>(
        `/organizations/${orgId}/workflows/${workflowId}/dry-run`,
        { method: 'POST', body: JSON.stringify(data ?? {}), ...init },
      ),
    revisionDiff: (
      orgId: string,
      workflowId: string,
      data: { proposedDefinition: Record<string, unknown>; reason?: string },
      init?: RequestInit,
    ) =>
      request<WorkflowRevisionDiffResultDto>(
        `/organizations/${orgId}/workflows/${workflowId}/revision-diff`,
        { method: 'POST', body: JSON.stringify(data), ...init },
      ),
    test: (orgId: string, workflowId: string, data?: WorkflowTestPayload) =>
      post<WorkflowTestResultDto>(`/organizations/${orgId}/workflows/${workflowId}/test`, data ?? {}),
    approveActionRun: (
      orgId: string,
      actionRunId: string,
      data: { reason: string; decisionVersion?: number; emergencyOverride?: boolean; emergencyReason?: string },
    ) =>
      post<WorkflowActionRunDto>(
        `/organizations/${orgId}/workflows/action-runs/${actionRunId}/approve`,
        data,
      ),
    rejectActionRun: (orgId: string, actionRunId: string, reason?: string) =>
      post<WorkflowActionRunDto>(`/organizations/${orgId}/workflows/action-runs/${actionRunId}/reject`, { reason }),
    listChangeRequests: (orgId: string, workflowId: string) =>
      get<WorkflowChangeRequestDto[]>(`/organizations/${orgId}/workflows/${workflowId}/change-requests`),
    listAuditEvents: (
      orgId: string,
      params?: { workflowId?: string; eventType?: string; limit?: number; cursor?: string },
    ) => {
      const q = new URLSearchParams();
      if (params?.workflowId) q.set('workflowId', params.workflowId);
      if (params?.eventType) q.set('eventType', params.eventType);
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.cursor) q.set('cursor', params.cursor);
      const qs = q.toString();
      return get<{ items: WorkflowAuditEventDto[]; nextCursor: string | null }>(
        `/organizations/${orgId}/workflows/audit-events${qs ? `?${qs}` : ''}`,
      );
    },
    getAuditEvent: (orgId: string, eventId: string) =>
      get<WorkflowAuditEventDto>(`/organizations/${orgId}/workflows/audit-events/${eventId}`),
    getAuditRetention: (orgId: string) =>
      get<{ classes: Array<Record<string, unknown>> }>(
        `/organizations/${orgId}/workflows/audit-events/retention`,
      ),
    getChangeRequest: (orgId: string, requestId: string) =>
      get<WorkflowChangeRequestDto>(`/organizations/${orgId}/workflows/change-requests/${requestId}`),
    approveChangeRequest: (
      orgId: string,
      requestId: string,
      data: { reason: string; decisionVersion?: number; emergencyOverride?: boolean; emergencyReason?: string },
    ) =>
      post<{ changeRequest: WorkflowChangeRequestDto; workflow?: WorkflowDto }>(
        `/organizations/${orgId}/workflows/change-requests/${requestId}/approve`,
        data,
      ),
    rejectChangeRequest: (
      orgId: string,
      requestId: string,
      data: { reason: string; decisionVersion?: number },
    ) =>
      post<WorkflowChangeRequestDto>(
        `/organizations/${orgId}/workflows/change-requests/${requestId}/reject`,
        data,
      ),
  },
  billing: {
    subscriptions: () => get<any[]>('/admin/billing/subscriptions'),
    revenueStats: () => get<any>('/admin/billing/revenue-stats'),
    overview: () => get<any>('/admin/billing/overview'),
    overviewOperational: () => get<any>('/admin/billing/overview/operational'),
    subscriptionsOperational: (params?: Record<string, string | number | undefined>) => {
      const q = params
        ? '?' +
          new URLSearchParams(
            Object.fromEntries(
              Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== '')
                .map(([k, v]) => [k, String(v)]),
            ),
          ).toString()
        : '';
      return get<any>(`/admin/billing/subscriptions/operational${q}`);
    },
    subscriptionOperationalDetail: (organizationId: string) =>
      get<any>(`/admin/billing/subscriptions/operational/${encodeURIComponent(organizationId)}`),
    attentionQueue: (params?: Record<string, string | number | undefined>) => {
      const q = params
        ? '?' +
          new URLSearchParams(
            Object.fromEntries(
              Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== '')
                .map(([k, v]) => [k, String(v)]),
            ),
          ).toString()
        : '';
      return get<any>(`/admin/billing/attention-queue${q}`);
    },
    adminReconciliationDriftsOperational: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/reconciliation/drifts/operational${q}`);
    },
    organizations: () => get<any[]>('/admin/billing/organizations'),
    adminInvoices: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/invoices${q}`);
    },
    adminInvoice: (invoiceId: string) =>
      get<any>(`/admin/billing/invoices/${encodeURIComponent(invoiceId)}`),
    adminInvoicePayments: (invoiceId: string) =>
      get<any>(`/admin/billing/invoices/${encodeURIComponent(invoiceId)}/payments`),
    adminRecordManualPayment: (
      invoiceId: string,
      body: {
        orgId: string;
        amountCents: number;
        currency?: string;
        paymentType: 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'OTHER';
        reference?: string;
        receiptNote?: string;
      },
      idempotencyKey: string,
    ) =>
      request<any>(`/admin/billing/invoices/${encodeURIComponent(invoiceId)}/manual-payments`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    adminPayments: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/payments${q}`);
    },
    adminPaymentAttempts: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/payment-attempts${q}`);
    },
    adminRefunds: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/refunds${q}`);
    },
    adminCreditNotes: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/credit-notes${q}`);
    },
    adminEmailDeliveries: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/email-deliveries${q}`);
    },
    adminEmailDelivery: (deliveryId: string) =>
      get<any>(`/admin/billing/email-deliveries/${encodeURIComponent(deliveryId)}`),
    adminEmailDeliveryResend: (deliveryId: string, body?: { idempotencySuffix?: string }) =>
      post<any>(`/admin/billing/email-deliveries/${encodeURIComponent(deliveryId)}/resend`, body ?? {}),
    adminEmailDeliveryReplay: (deliveryId: string) =>
      post<any>(`/admin/billing/email-deliveries/${encodeURIComponent(deliveryId)}/replay`, {}),
    adminOutboxDeliveries: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/outbox-deliveries${q}`);
    },
    adminReconciliationRun: (body?: {
      organizationId?: string;
      runId?: string;
      cursor?: string | null;
      batchSize?: number;
    }) => post<any>('/admin/billing/reconciliation/run', body ?? {}),
    adminReconciliationDrifts: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/reconciliation/drifts${q}`);
    },
    adminResolveReconciliationDrift: (driftId: string) =>
      post<any>(`/admin/billing/reconciliation/drifts/${encodeURIComponent(driftId)}/resolve`, {}),
    adminAutoFixReconciliationDrift: (driftId: string) =>
      post<any>(`/admin/billing/reconciliation/drifts/${encodeURIComponent(driftId)}/auto-fix`, {}),
    auditLog: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/audit-log${q}`);
    },
    adminPaymentMethods: () => get<any[]>('/admin/billing/payment-methods'),
    adminStripeStatus: () => get<any>('/admin/billing/stripe-status'),
    adminWebhookEvents: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/billing/webhook-events${q}`);
    },
    pricebooks: () => get<any[]>('/admin/billing/pricebooks'),
    pricebookConfig: () => get<any>('/admin/billing/pricebooks/config'),
    pricebook: (id: string) => get<any>(`/admin/billing/pricebooks/${id}`),
    pricebookVersions: (id: string) => get<any[]>(`/admin/billing/pricebooks/${id}/versions`),
    createPricebook: (body: {
      name: string;
      productKey: string;
      currency?: string;
      isDefault?: boolean;
    }) => post<any>('/admin/billing/pricebooks', body),
    createPriceVersion: (priceBookId: string, body?: { versionLabel?: string }) =>
      post<any>(`/admin/billing/pricebooks/${priceBookId}/versions`, body ?? {}),
    updatePriceVersion: (
      versionId: string,
      body: { versionLabel?: string; effectiveFrom?: string; tierMode?: 'VOLUME' | 'GRADUATED' },
    ) => patch<any>(`/admin/billing/price-versions/${versionId}`, body),
    replacePriceTiers: (
      versionId: string,
      tiers: Array<{
        minVehicles: number;
        maxVehicles?: number | null;
        unitPriceCents?: number | null;
        sortOrder?: number;
      }>,
    ) => put<any>(`/admin/billing/price-versions/${versionId}/tiers`, { tiers }),
    publishPriceVersion: (
      versionId: string,
      body?: { effectiveFrom?: string; allowUnpriced?: boolean },
    ) => post<any>(`/admin/billing/price-versions/${versionId}/publish`, body ?? {}),
    archivePriceVersion: (versionId: string) =>
      post<any>(`/admin/billing/price-versions/${versionId}/archive`, {}),
    catalogProducts: () => get<any[]>('/admin/billing/catalog-products'),
    priceVersionUsage: (versionId: string) =>
      get<any>(`/admin/billing/price-versions/${versionId}/usage`),
    simulatePriceVersion: (
      versionId: string,
      body: {
        vehicleCount: number;
        discountPercentBps?: number;
        discountCents?: number;
        taxRateBps?: number;
      },
    ) => post<any>(`/admin/billing/price-versions/${versionId}/simulate`, body),
    stripeCatalogMappings: (params?: {
      priceVersionId?: string;
      priceBookId?: string;
      stripeMode?: 'TEST' | 'LIVE';
      includeDisabled?: boolean;
    }) => {
      const query = new URLSearchParams();
      if (params?.priceVersionId) query.set('priceVersionId', params.priceVersionId);
      if (params?.priceBookId) query.set('priceBookId', params.priceBookId);
      if (params?.stripeMode) query.set('stripeMode', params.stripeMode);
      if (params?.includeDisabled) query.set('includeDisabled', 'true');
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return get<any[]>(`/admin/billing/stripe-catalog-mappings${suffix}`);
    },
    stripeCatalogMappingStatus: (versionId: string, stripeMode: 'TEST' | 'LIVE') =>
      get<any>(`/admin/billing/price-versions/${versionId}/stripe-mappings/${stripeMode}/status`),
    connectStripeCatalogMapping: (
      versionId: string,
      body: {
        stripeMode: 'TEST' | 'LIVE';
        stripeProductId: string;
        stripePriceId: string;
        billingProductId?: string;
        currency?: string;
        billingInterval?: string;
      },
    ) => post<any>(`/admin/billing/price-versions/${versionId}/stripe-mappings/connect`, body),
    validateStripeCatalogMapping: (mappingId: string) =>
      post<any>(`/admin/billing/stripe-catalog-mappings/${mappingId}/validate`, {}),
    syncStripeCatalogMapping: (mappingId: string) =>
      post<any>(`/admin/billing/stripe-catalog-mappings/${mappingId}/sync`, {}),
    syncStripePriceVersion: (versionId: string, body: { stripeMode: 'TEST' | 'LIVE' }) =>
      post<any>(`/admin/billing/price-versions/${versionId}/stripe-sync`, body),
    orgSummary: (orgId?: string, init?: RequestInit) =>
      get<any>(`/billing/summary${billingTenantQuery(orgId)}`, init),
    orgSubscriptionOverview: (orgId?: string, init?: RequestInit) =>
      get<any>(`/billing/subscription/overview${billingTenantQuery(orgId)}`, init),
    orgSubscriptionTariff: (orgId?: string, init?: RequestInit) =>
      get<any>(`/billing/subscription/tariff${billingTenantQuery(orgId)}`, init),
    orgBillableVehicles: (orgId?: string, init?: RequestInit) =>
      get<any>(`/billing/billable-vehicles${billingTenantQuery(orgId)}`, init),
    orgBillableVehiclesList: (
      orgId?: string,
      params?: Record<string, string | number | undefined>,
      init?: RequestInit,
    ) => get<any>(`/billing/billable-vehicles/list${billingTenantQuery(orgId, params)}`, init),
    orgNextInvoicePreview: (orgId?: string, init?: RequestInit) =>
      get<any>(`/billing/next-invoice-preview${billingTenantQuery(orgId)}`, init),
    orgSubscriptions: (orgId?: string, init?: RequestInit) =>
      get<any[]>(`/billing/subscriptions${billingTenantQuery(orgId)}`, init),
    orgInvoices: (
      orgId?: string,
      params?: Record<string, string | number | undefined>,
      init?: RequestInit,
    ) => get<any>(`/billing/invoices${billingTenantQuery(orgId, params)}`, init),
    orgInvoiceDetail: (orgId: string | undefined, invoiceId: string, init?: RequestInit) =>
      get<any>(`/billing/invoices/${encodeURIComponent(invoiceId)}${billingTenantQuery(orgId)}`, init),
    orgInvoicePayments: (orgId: string | undefined, invoiceId: string, init?: RequestInit) =>
      get<any>(
        `/billing/invoices/${encodeURIComponent(invoiceId)}/payments${billingTenantQuery(orgId)}`,
        init,
      ),
    orgInvoiceHosted: (orgId: string | undefined, invoiceId: string, init?: RequestInit) =>
      get<{ url: string }>(
        `/billing/invoices/${encodeURIComponent(invoiceId)}/hosted${billingTenantQuery(orgId)}`,
        init,
      ),
    orgInvoicePdf: (orgId: string | undefined, invoiceId: string, init?: RequestInit) =>
      get<{ url: string }>(
        `/billing/invoices/${encodeURIComponent(invoiceId)}/pdf${billingTenantQuery(orgId)}`,
        init,
      ),
    orgPayments: (
      orgId?: string,
      params?: Record<string, string | number | undefined>,
      init?: RequestInit,
    ) => get<any>(`/billing/payments${billingTenantQuery(orgId, params)}`, init),
    orgVehicleLicenses: (
      orgId?: string,
      params?: Record<string, string | number | undefined>,
      init?: RequestInit,
    ) => get<any>(`/billing/vehicle-licenses${billingTenantQuery(orgId, params)}`, init),
    orgVehicleBillingChanges: (
      orgId?: string,
      params?: Record<string, string | number | undefined>,
      init?: RequestInit,
    ) => get<any>(`/billing/vehicle-billing/changes${billingTenantQuery(orgId, params)}`, init),
    orgContractHistory: (
      orgId?: string,
      params?: Record<string, string | number | undefined>,
      init?: RequestInit,
    ) => get<any>(`/billing/contract/history${billingTenantQuery(orgId, params)}`, init),
    orgBillingEmailDeliveries: (
      orgId?: string,
      params?: Record<string, string | number | undefined>,
      init?: RequestInit,
    ) => get<any>(`/billing/email-deliveries${billingTenantQuery(orgId, params)}`, init),
    orgUsagePreview: (orgId?: string, init?: RequestInit) =>
      get<any>(`/billing/usage/preview${billingTenantQuery(orgId)}`, init),
    orgPaymentMethods: (orgId?: string, init?: RequestInit) =>
      get<any>(`/billing/payment-methods${billingTenantQuery(orgId)}`, init),
    orgPaymentMethod: (orgId?: string, init?: RequestInit) =>
      get<any>(`/billing/payment-method${billingTenantQuery(orgId)}`, init),
    orgStripeCustomerPortal: (orgId?: string, returnUrl?: string) =>
      post<any>(`/billing/stripe/customer-portal${billingTenantQuery(orgId)}`, {
        returnUrl,
      }),
    orgStripeSetupIntent: (
      orgId?: string,
      body?: { paymentMethodType?: 'card' | 'sepa_debit' },
    ) => post<any>(`/billing/stripe/setup-intent${billingTenantQuery(orgId)}`, body ?? {}),
    orgPaymentMethodSetDefault: (orgId: string | undefined, paymentMethodId: string) =>
      post<any>(
        `/billing/payment-methods/${encodeURIComponent(paymentMethodId)}/set-default${billingTenantQuery(orgId)}`,
        {},
      ),
    orgPaymentMethodDetach: (orgId: string | undefined, paymentMethodId: string) =>
      request<{ paymentMethods: unknown[] }>(
        `/billing/payment-methods/${encodeURIComponent(paymentMethodId)}${billingTenantQuery(orgId)}`,
        { method: 'DELETE' },
      ),
    adminSyncStripe: (orgId: string) =>
      post<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/sync-stripe`, {}),
    masterSubscriptionPath: (orgId: string, suffix = '') =>
      `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription${suffix}`,
    masterSubscriptionGet: (orgId: string, suffix = '') =>
      get<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription${suffix}`),
    masterSubscriptionMutate: (
      orgId: string,
      suffix: string,
      method: 'POST' | 'PATCH',
      body: Record<string, unknown>,
      idempotencyKey?: string,
    ) =>
      request<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription${suffix}`, {
        method,
        body: JSON.stringify(body),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }),
    masterSubscriptionContract: (orgId: string) =>
      get<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription`),
    masterSubscriptionOverview: (orgId: string) =>
      get<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/overview`),
    masterSubscriptionHistory: (orgId: string) =>
      get<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/history`),
    masterSubscriptionPreview: (orgId: string, body: Record<string, unknown>) =>
      post<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/preview`,
        body,
      ),
    masterSubscriptionCreateDraft: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/draft`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    masterSubscriptionAssignRental: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/assign-rental`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionAssignFleet: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/assign-fleet`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionSelectPriceVersion: (
      orgId: string,
      body: Record<string, unknown>,
      idempotencyKey: string,
    ) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/price-version`,
        { method: 'PATCH', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionConfigureTrial: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/trial`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    masterSubscriptionActivate: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/activate`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    masterSubscriptionPause: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/pause`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    masterSubscriptionReactivate: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/reactivate`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionScheduleCancel: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/schedule-cancel`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionRevokeCancel: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/revoke-cancel`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionScheduleTariffChange: (
      orgId: string,
      body: Record<string, unknown>,
      idempotencyKey: string,
    ) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/schedule-tariff-change`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionSchedulePriceVersionChange: (
      orgId: string,
      body: Record<string, unknown>,
      idempotencyKey: string,
    ) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/schedule-price-version-change`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionAddDiscount: (orgId: string, body: Record<string, unknown>, idempotencyKey: string) =>
      request<any>(`/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/discounts`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    masterSubscriptionEndDiscount: (
      orgId: string,
      discountId: string,
      body: Record<string, unknown>,
      idempotencyKey: string,
    ) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/discounts/${encodeURIComponent(discountId)}/end`,
        { method: 'POST', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    masterSubscriptionConfigureBillingAnchor: (
      orgId: string,
      body: Record<string, unknown>,
      idempotencyKey: string,
    ) =>
      request<any>(
        `/admin/billing/organizations/${encodeURIComponent(orgId)}/subscription/billing-anchor`,
        { method: 'PATCH', body: JSON.stringify(body), headers: { 'Idempotency-Key': idempotencyKey } },
      ),
  },
  bookingPaymentRequests: {
    list: (orgId: string, bookingId: string) =>
      get<BookingPaymentRequestDto[]>(
        `/organizations/${orgId}/bookings/${bookingId}/payment-requests`,
      ),
    get: (orgId: string, bookingId: string, requestId: string) =>
      get<BookingPaymentRequestDto>(
        `/organizations/${orgId}/bookings/${bookingId}/payment-requests/${requestId}`,
      ),
    create: (
      orgId: string,
      bookingId: string,
      data?: { recipientEmail?: string; expiresIn?: number; sendEmail?: boolean },
      idempotencyKey?: string,
    ) =>
      request<BookingPaymentRequestDto>(
        `/organizations/${orgId}/bookings/${bookingId}/payment-requests`,
        {
          method: 'POST',
          body: JSON.stringify(data ?? {}),
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        },
      ),
    resend: (orgId: string, bookingId: string, requestId: string, idempotencyKey?: string) =>
      request<{
        paymentRequestId: string;
        status: string;
        checkoutUrl: string;
        checkoutExpiresAt: string | null;
        lastSentAt: string | null;
        lastEmailErrorMessage: string | null;
      }>(
        `/organizations/${orgId}/bookings/${bookingId}/payment-requests/${requestId}/resend`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        },
      ),
    cancel: (orgId: string, bookingId: string, requestId: string) =>
      post<BookingPaymentRequestDto>(
        `/organizations/${orgId}/bookings/${bookingId}/payment-requests/${requestId}/cancel`,
        {},
      ),
  },
  organizationPaymentRequests: {
    refund: (
      orgId: string,
      requestId: string,
      data: { amountCents?: number; reason: string },
      idempotencyKey: string,
    ) =>
      request<BookingPaymentRefundResponseDto>(
        `/organizations/${orgId}/payment-requests/${requestId}/refund`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      ),
  },
  paymentsConnect: {
    getStatus: (orgId: string) =>
      get<import('../rental/types/payments-connect.types').ConnectStatusDto>(
        `/organizations/${encodeURIComponent(orgId)}/payments/connect/status`,
      ),
    createAccount: (orgId: string) =>
      post<import('../rental/types/payments-connect.types').ConnectStatusDto>(
        `/organizations/${encodeURIComponent(orgId)}/payments/connect/account`,
        {},
      ),
    createOnboardingLink: (
      orgId: string,
      body?: { returnUrl?: string; refreshUrl?: string },
    ) =>
      post<import('../rental/types/payments-connect.types').ConnectOnboardingLinkDto>(
        `/organizations/${encodeURIComponent(orgId)}/payments/connect/onboarding-link`,
        body ?? {},
      ),
    refresh: (orgId: string) =>
      post<import('../rental/types/payments-connect.types').ConnectStatusDto>(
        `/organizations/${encodeURIComponent(orgId)}/payments/connect/refresh`,
        {},
      ),
  },
  support: {
    stats: () => get<SupportTicketStats>('/admin/support/stats'),
    newest: (limit?: number) => get<SupportTicket[]>(`/admin/support/newest${limit ? `?limit=${limit}` : ''}`),
    open: (limit?: number) => get<SupportTicket[]>(`/admin/support/open${limit ? `?limit=${limit}` : ''}`),
    tickets: (params?: SupportTicketListParams) => {
      const q = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return get<PaginatedSupportTickets>(`/admin/support/tickets${q}`);
    },
    getTicket: (id: string) => get<SupportTicket>(`/admin/support/tickets/${id}`),
    createTicket: (data: CreateSupportTicketAdminPayload) => post<SupportTicket>('/admin/support/tickets', data),
    updateTicket: (id: string, data: UpdateSupportTicketPayload) =>
      patch<SupportTicket>(`/admin/support/tickets/${id}`, data),
    updateStatus: (id: string, status: SupportTicketStatus) =>
      patch<SupportTicket>(`/admin/support/tickets/${id}/status`, { status }),
    addMessage: (id: string, data: CreateSupportMessagePayload) =>
      post<SupportTicketMessage>(`/admin/support/tickets/${id}/messages`, {
        body: data.body ?? data.content,
        imageUrl: data.imageUrl,
        attachments: data.attachments,
      }),
    addInternalNote: (id: string, body: string) =>
      post<SupportTicketMessage>(`/admin/support/tickets/${id}/internal-notes`, { body }),
    byOrg: (orgId: string, params?: SupportTicketListParams) => {
      const q = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return get<SupportTicket[]>(`/organizations/${orgId}/support/tickets${q}`);
    },
    getByOrg: (orgId: string, id: string) => get<SupportTicket>(`/organizations/${orgId}/support/tickets/${id}`),
    createByOrg: (orgId: string, data: CreateSupportTicketPayload) =>
      post<SupportTicket>(`/organizations/${orgId}/support/tickets`, data),
    addMessageByOrg: (orgId: string, id: string, data: CreateSupportMessagePayload) =>
      post<SupportTicketMessage>(`/organizations/${orgId}/support/tickets/${id}/messages`, {
        body: data.body ?? data.content,
        imageUrl: data.imageUrl,
        attachments: data.attachments,
      }),
    reopenByOrg: (orgId: string, id: string) =>
      post<SupportTicket>(`/organizations/${orgId}/support/tickets/${id}/reopen`, {}),
    unreadCountByOrg: (orgId: string) =>
      get<{ count: number }>(`/organizations/${orgId}/support/unread-count`),
    uploadImage: async (file: File, orgId: string) => {
      if (!orgId) throw new Error('orgId is required for support uploads');
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('synqdrive_token');
      const path = `/api/v1/organizations/${orgId}/support/upload`;
      const res = await fetch(path, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<{ url: string }>;
    },
  },
  fines: {
    list: (orgId: string) => get<any[]>(`/organizations/${orgId}/fines`),
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/fines/stats`),
    get: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/fines/${id}`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/fines`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/fines/${id}`, data),
    byCustomer: (orgId: string, customerId: string) => get<any[]>(`/organizations/${orgId}/customers/${customerId}/fines`),
    uploadImage: async (orgId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(`/api/v1/organizations/${orgId}/fines/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<{ url: string }>;
    },
  },
  damages: {
    /** Org-scoped fleet damage analytics (for Fleet/Reports surfaces). */
    fleetStats: (orgId: string) =>
      get<FleetDamageStatsResponse>(`/organizations/${orgId}/damages/stats`),
  },
  tasks: {
    list: (orgId: string, filters?: TaskListFilters) => {
      const q = new URLSearchParams();
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v === undefined || v === null || v === '') continue;
          q.set(k, String(v));
        }
      }
      const qs = q.toString();
      return get<import('./tasks/types').TaskListPage>(`/organizations/${orgId}/tasks${qs ? `?${qs}` : ''}`);
    },
    listByBucket: (
      orgId: string,
      bucket: TaskBucket,
      filters?: Omit<TaskListFilters, 'bucket'>,
    ) => {
      const q = new URLSearchParams();
      const merged: TaskListFilters = { ...filters, bucket };
      for (const [k, v] of Object.entries(merged)) {
        if (v === undefined || v === null || v === '') continue;
        q.set(k, String(v));
      }
      const qs = q.toString();
      return get<import('./tasks/types').TaskListPage>(`/organizations/${orgId}/tasks${qs ? `?${qs}` : ''}`);
    },
    summary: (orgId: string) => get<ApiTaskSummary>(`/organizations/${orgId}/tasks/summary`),
    get: (orgId: string, id: string) => get<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}`),
    create: (orgId: string, data: CreateTaskPayload) =>
      post<ApiTaskDetail>(`/organizations/${orgId}/tasks`, data),
    update: (
      orgId: string,
      id: string,
      data: Partial<
        Pick<
          CreateTaskPayload,
          | 'title'
          | 'description'
          | 'category'
          | 'priority'
          | 'dueDate'
          | 'assignedUserId'
          | 'estimatedCostCents'
          | 'blocksVehicleAvailability'
        >
      > & { actualCostCents?: number },
    ) => patch<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}`, data),
    assign: (orgId: string, id: string, assignedUserId: string | null) =>
      patch<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/assign`, { assignedUserId }),
    start: (orgId: string, id: string) =>
      patch<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/start`, {}),
    waiting: (orgId: string, id: string) =>
      patch<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/waiting`, {}),
    complete: (orgId: string, id: string, data?: CompleteTaskPayload) =>
      patch<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/complete`, data ?? {}),
    cancel: (orgId: string, id: string) =>
      patch<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/cancel`, {}),
    bulk: (orgId: string, data: BulkTaskActionPayload) =>
      post<BulkTaskActionResponse>(`/organizations/${orgId}/tasks/bulk`, data),
    addComment: (orgId: string, id: string, body: string) =>
      post<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/comments`, { body }),
    addChecklistItem: (
      orgId: string,
      id: string,
      item: { title: string; description?: string; sortOrder?: number; isRequired?: boolean },
    ) => post<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/checklist`, item),
    updateChecklistItem: (
      orgId: string,
      id: string,
      itemId: string,
      patchData: UpdateChecklistItemPayload,
    ) => patch<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/checklist/${itemId}`, patchData),
    addAttachment: (
      orgId: string,
      id: string,
      data: { fileUrl: string; fileName?: string; mimeType?: string; size?: number },
    ) => post<ApiTaskDetail>(`/organizations/${orgId}/tasks/${id}/attachments`, data),
    forVehicle: async (orgId: string, vehicleId: string) => {
      const { fetchAllTasks } = await import('./tasks-pagination');
      return fetchAllTasks(orgId, { vehicleId });
    },
    forBooking: async (orgId: string, bookingId: string) => {
      const { fetchAllTasks } = await import('./tasks-pagination');
      return fetchAllTasks(orgId, { bookingId });
    },
    forVendor: async (orgId: string, vendorId: string) => {
      const { fetchAllTasks } = await import('./tasks-pagination');
      return fetchAllTasks(orgId, { vendorId });
    },
    forCustomer: async (orgId: string, customerId: string) => {
      const { fetchAllTasks } = await import('./tasks-pagination');
      return fetchAllTasks(orgId, { customerId });
    },
  },
  serviceCases: {
    list: (orgId: string, filters?: ServiceCaseListFilters) => {
      const q = new URLSearchParams();
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v === undefined || v === null || v === '') continue;
          q.set(k, String(v));
        }
      }
      const qs = q.toString();
      return get<ApiServiceCase[]>(`/organizations/${orgId}/service-cases${qs ? `?${qs}` : ''}`);
    },
    get: (orgId: string, id: string) => get<ApiServiceCase>(`/organizations/${orgId}/service-cases/${id}`),
    create: (orgId: string, data: CreateServiceCasePayload) =>
      post<ApiServiceCase>(`/organizations/${orgId}/service-cases`, data),
    update: (orgId: string, id: string, data: UpdateServiceCasePayload) =>
      patch<ApiServiceCase>(`/organizations/${orgId}/service-cases/${id}`, data),
    complete: (orgId: string, id: string, data?: CompleteServiceCasePayload) =>
      patch<ApiServiceCase>(`/organizations/${orgId}/service-cases/${id}/complete`, data ?? {}),
    cancel: (orgId: string, id: string) =>
      patch<ApiServiceCase>(`/organizations/${orgId}/service-cases/${id}/cancel`, {}),
    addComment: (orgId: string, id: string, body: string) =>
      post<ApiServiceCase>(`/organizations/${orgId}/service-cases/${id}/comments`, { body }),
    addAttachment: (
      orgId: string,
      id: string,
      data: { fileUrl: string; fileName?: string; mimeType?: string; size?: number },
    ) => post<ApiServiceCase>(`/organizations/${orgId}/service-cases/${id}/attachments`, data),
    forVehicle: (orgId: string, vehicleId: string, filters?: ServiceCaseListFilters) => {
      const q = new URLSearchParams();
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v === undefined || v === null || v === '') continue;
          q.set(k, String(v));
        }
      }
      const qs = q.toString();
      return get<ApiServiceCase[]>(
        `/organizations/${orgId}/vehicles/${vehicleId}/service-cases${qs ? `?${qs}` : ''}`,
      );
    },
    forVendor: (orgId: string, vendorId: string, filters?: ServiceCaseListFilters) => {
      const q = new URLSearchParams();
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          if (v === undefined || v === null || v === '') continue;
          q.set(k, String(v));
        }
      }
      const qs = q.toString();
      return get<ApiServiceCase[]>(
        `/organizations/${orgId}/vendors/${vendorId}/service-cases${qs ? `?${qs}` : ''}`,
      );
    },
  },
  evaluations: {
    /**
     * Canonical E3 finance insights — the single authority for the Financial
     * Insights core KPIs. The client formats/displays these values only.
     */
    financeInsights: (orgId: string, stationIds?: string[]) =>
      get<import('../rental/lib/finance-insights.types').FinancialInsightsBundleDto>(
        buildFinanceInsightsPath(orgId, stationIds),
      ),

    /**
     * Status-aware variant of {@link financeInsights} (E6B.1). Preserves the HTTP
     * status so callers can distinguish 403 (UNAUTHORIZED) and 404 (NOT_FOUND) from
     * 5xx/network (ERROR) instead of collapsing every non-2xx into a throw. Finance
     * is NOT feature-gated, so a 404 is a neutral not-found — never FEATURE_DISABLED.
     */
    financeInsightsResult: (orgId: string, stationIds?: string[]) =>
      requestResult<import('../rental/lib/finance-insights.types').FinancialInsightsBundleDto>(
        buildFinanceInsightsPath(orgId, stationIds),
      ),

    /**
     * Canonical E4 analytics insights summary (composite). Status-aware transport
     * preserves HTTP status without fabricating data. A generic 404 remains
     * NOT_FOUND; FEATURE_DISABLED may only be asserted when a reliable
     * machine-readable discriminator exists. `periodType`/`stationIds` map to
     * canonical E1 period / E2 station scope.
     */
    analyticsInsightsSummary: (
      orgId: string,
      req?: { periodType?: string; stationIds?: readonly string[] | null },
    ) =>
      requestResult<import('../rental/lib/evaluations/evaluations-canonical.types').EvaluationsAnalyticsInsightsSummary>(
        `/organizations/${orgId}/evaluations/analytics/insights/summary${buildEvaluationsAnalyticsQuery(req)}`,
      ),

    /** Canonical E5 quality report (status-aware transport). */
    analyticsQuality: (
      orgId: string,
      req?: { periodType?: string; stationIds?: readonly string[] | null },
    ) =>
      requestResult<import('../rental/lib/evaluations/evaluations-canonical.types').EvaluationsQualityReport>(
        `/organizations/${orgId}/evaluations/analytics/insights/quality${buildEvaluationsAnalyticsQuery(req)}`,
      ),

    /**
     * Canonical E4/E5 driver influence (person-level). The server resolves the PII
     * tier; the client transports the returned `piiTier`/`driverRef` verbatim and
     * never derives identity or authorization.
     */
    driverAnalysis: (
      orgId: string,
      req?: { periodType?: string; stationIds?: readonly string[] | null },
    ) =>
      requestResult<import('../rental/lib/evaluations/evaluations-canonical.types').EvaluationsDriverInfluenceSection>(
        `/organizations/${orgId}/evaluations/analytics/insights/driver-analysis${buildEvaluationsAnalyticsQuery(req)}`,
      ),

    /** Canonical E7 recommendations / actions (status-aware transport). */
    analyticsRecommendations: (
      orgId: string,
      req?: { periodType?: string; stationIds?: readonly string[] | null },
    ) =>
      requestResult<
        import('@synq/evaluations-recommendations/evaluations-recommendations.contract').EvaluationsRecommendationsResponse
      >(
        `/organizations/${orgId}/evaluations/analytics/insights/recommendations${buildEvaluationsAnalyticsQuery(req)}`,
      ),
  },
  invoices: {
    list: (orgId: string, params?: { type?: string; status?: string; direction?: string }) => {
      const q = new URLSearchParams();
      if (params?.type) q.set('type', params.type);
      if (params?.status) q.set('status', params.status);
      if (params?.direction) q.set('direction', params.direction);
      const qs = q.toString();
      return get<import('../rental/components/invoices/invoiceTypes').Invoice[]>(
        `/organizations/${orgId}/invoices${qs ? `?${qs}` : ''}`,
      );
    },
    listItems: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        search?: string;
        type?: string;
        status?: string;
        direction?: string;
        dueFrom?: string;
        dueTo?: string;
        dateFrom?: string;
        dateTo?: string;
        overdue?: boolean;
        documentStatus?: string;
        sendStatus?: string;
        stationId?: string;
        includeVoid?: boolean;
        sortBy?: string;
        sortOrder?: string;
      },
    ) => {
      const q = new URLSearchParams();
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null && value !== '') {
            q.set(key, String(value));
          }
        }
      }
      const qs = q.toString();
      return get<import('../rental/components/invoices/invoiceTypes').PaginatedInvoiceList>(
        `/organizations/${orgId}/invoices/list${qs ? `?${qs}` : ''}`,
      );
    },
    stats: (orgId: string) =>
      get<import('../rental/components/invoices/invoiceTypes').InvoiceStats>(
        `/organizations/${orgId}/invoices/stats`,
      ),
    get: (orgId: string, id: string) =>
      get<import('../rental/components/invoices/invoiceTypes').Invoice>(
        `/organizations/${orgId}/invoices/${id}`,
      ),
    create: (orgId: string, data: Record<string, unknown>) =>
      post<import('../rental/components/invoices/invoiceTypes').Invoice>(
        `/organizations/${orgId}/invoices`,
        data,
      ),
    update: (orgId: string, id: string, data: Record<string, unknown>) =>
      patch<import('../rental/components/invoices/invoiceTypes').Invoice>(
        `/organizations/${orgId}/invoices/${id}`,
        data,
      ),
    issue: (orgId: string, id: string) =>
      post<import('../rental/components/invoices/invoiceTypes').Invoice>(
        `/organizations/${orgId}/invoices/${id}/issue`,
        {},
      ),
    cancel: (orgId: string, id: string) =>
      post<import('../rental/components/invoices/invoiceTypes').Invoice>(
        `/organizations/${orgId}/invoices/${id}/cancel`,
        {},
      ),
    markSent: (orgId: string, id: string) =>
      post<import('../rental/components/invoices/invoiceTypes').Invoice>(
        `/organizations/${orgId}/invoices/${id}/mark-sent`,
        {},
      ),
    recordPayment: (
      orgId: string,
      id: string,
      data: { amountCents: number; method: string; paidAt?: string; reference?: string; note?: string },
    ) =>
      post<import('../rental/components/invoices/invoiceTypes').Invoice>(
        `/organizations/${orgId}/invoices/${id}/payments`,
        data,
      ),
    markPaid: (orgId: string, id: string) =>
      patch<import('../rental/components/invoices/invoiceTypes').Invoice>(
        `/organizations/${orgId}/invoices/${id}/pay`,
        {},
      ),
    byCustomer: (orgId: string, customerId: string) =>
      get<import('../rental/components/invoices/invoiceTypes').Invoice[]>(
        `/organizations/${orgId}/customers/${customerId}/invoices`,
      ),
    /** Attachment upload only — NOT for AI extraction. */
    uploadFile: async (orgId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(`/api/v1/organizations/${orgId}/invoices/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<{ url: string }>;
    },
    getDocumentsPanel: (orgId: string, invoiceId: string) =>
      get<import('../rental/components/invoices/invoiceDocumentTypes').InvoiceDocumentsPanel>(
        `/organizations/${orgId}/invoices/${invoiceId}/documents`,
      ),
    generateDocument: (orgId: string, invoiceId: string, regenerate = false) =>
      post<import('../rental/components/invoices/invoiceDocumentTypes').InvoiceDocumentsPanel>(
        `/organizations/${orgId}/invoices/${invoiceId}/documents/generate${regenerate ? '?regenerate=true' : ''}`,
        {},
      ),
    sendDocumentEmail: (
      orgId: string,
      invoiceId: string,
      payload: import('../rental/components/invoices/invoiceDocumentTypes').SendInvoiceEmailPayload,
    ) =>
      post<OutboundEmailDto>(
        `/organizations/${orgId}/invoices/${invoiceId}/documents/send-email`,
        payload,
      ),
    retryDocumentEmail: (orgId: string, invoiceId: string, emailId: string) =>
      post<OutboundEmailDto>(
        `/organizations/${orgId}/invoices/${invoiceId}/documents/delivery/${emailId}/retry`,
        {},
      ),
    getTimeline: (orgId: string, invoiceId: string) =>
      get<import('../rental/components/invoices/invoiceTimelineTypes').InvoiceTimelinePanel>(
        `/organizations/${orgId}/invoices/${invoiceId}/timeline`,
      ),
  },
  pricing: {
    catalog: (orgId: string) => get<any>(`/organizations/${orgId}/price-tariffs`),
    simulate: (orgId: string, data: Record<string, unknown>) =>
      post<import('../rental/pricing/pricingTypes').PricingSimulationResult>(
        `/organizations/${orgId}/pricing/simulate`,
        data,
      ),
    createGroup: (orgId: string, data: Record<string, unknown>) =>
      post<any>(`/organizations/${orgId}/price-tariffs/groups`, data),
    updateGroup: (orgId: string, groupId: string, data: Record<string, unknown>) =>
      patch<any>(`/organizations/${orgId}/price-tariffs/groups/${groupId}`, data),
    deleteGroup: (orgId: string, groupId: string) =>
      del<{ deleted: boolean; groupId: string }>(
        `/organizations/${orgId}/price-tariffs/groups/${groupId}`,
      ),
    discardDraft: (orgId: string, groupId: string, versionId: string) =>
      del<{ discarded: boolean; versionId: string }>(
        `/organizations/${orgId}/price-tariffs/groups/${groupId}/drafts/${versionId}`,
      ),
    upsertVersion: (orgId: string, groupId: string, data: Record<string, unknown>) =>
      post<any>(`/organizations/${orgId}/price-tariffs/groups/${groupId}/version`, data),
    updateVersion: (orgId: string, versionId: string, data: Record<string, unknown>) =>
      patch<any>(`/organizations/${orgId}/price-tariffs/versions/${versionId}`, data),
    publishDraft: (
      orgId: string,
      groupId: string,
      data: {
        draftVersionId: string;
        effectiveFrom?: string;
        expectedVersionNumber?: number;
      },
    ) => post<any>(`/organizations/${orgId}/price-tariffs/groups/${groupId}/publish`, data),
    /** @deprecated Prefer publishDraft — only publishes DRAFT versions. */
    activateVersion: (orgId: string, versionId: string) =>
      post<any>(`/organizations/${orgId}/price-tariffs/versions/${versionId}/activate`, {}),
    assignVehicle: (orgId: string, data: Record<string, unknown>) =>
      post<any>(`/organizations/${orgId}/price-tariffs/assignments`, data),
    deactivateAssignment: (orgId: string, assignmentId: string) =>
      patch<any>(`/organizations/${orgId}/price-tariffs/assignments/${assignmentId}/deactivate`, {}),
    unassignedVehicles: (orgId: string) =>
      get<any[]>(`/organizations/${orgId}/price-tariffs/unassigned-vehicles`),
  },
  rentalRules: {
    overview: (orgId: string) =>
      get<import('../rental/components/settings/rental-rules/rental-rules.types').RentalRulesOverviewDto>(
        `/organizations/${orgId}/rental-rules/overview`,
      ),
    fleetVehicles: (orgId: string) =>
      get<import('../rental/components/settings/rental-rules/rental-rules.types').RentalFleetVehicleDto[]>(
        `/organizations/${orgId}/rental-rules/fleet-vehicles`,
      ),
    getDefaults: (orgId: string) =>
      get<import('../rental/components/settings/rental-rules/rental-rules.types').OrganizationRentalRulesDto>(
        `/organizations/${orgId}/rental-rules/defaults`,
      ),
    patchDefaults: (orgId: string, data: Record<string, unknown>) =>
      patch<import('../rental/components/settings/rental-rules/rental-rules.types').OrganizationRentalRulesDto>(
        `/organizations/${orgId}/rental-rules/defaults`,
        data,
      ),
    analyzePublishImpact: (
      orgId: string,
      scope: 'defaults' | 'category' | 'vehicle',
      payload: { revisionId: string; scopeEntityId?: string },
    ) => {
      const path =
        scope === 'defaults'
          ? `/organizations/${orgId}/rental-rules/defaults/publish-analysis`
          : scope === 'category'
            ? `/organizations/${orgId}/rental-rules/categories/${payload.scopeEntityId}/publish-analysis`
            : `/organizations/${orgId}/vehicles/${payload.scopeEntityId}/rental-requirements/overrides/publish-analysis`;
      return post<import('../rental/components/settings/rental-rules/rental-rules.types').RentalRulePublishImpactAnalysis>(
        path,
        { revisionId: payload.revisionId },
      );
    },
    publishPath: (
      orgId: string,
      scope: 'defaults' | 'category' | 'vehicle',
      scopeEntityId?: string,
    ) => {
      if (scope === 'defaults') return `/organizations/${orgId}/rental-rules/defaults/publish`;
      if (scope === 'category') {
        return `/organizations/${orgId}/rental-rules/categories/${scopeEntityId}/publish`;
      }
      return `/organizations/${orgId}/vehicles/${scopeEntityId}/rental-requirements/overrides/publish`;
    },
    publishDefaults: (
      orgId: string,
      payload: {
        revisionId: string;
        expectedVersion: number;
        expectedLockVersion: number;
        changeReason: string;
        acknowledgeCriticalImpact?: boolean;
      },
    ) =>
      post<import('../rental/components/settings/rental-rules/rental-rules.types').OrganizationRentalRulesDto>(
        `/organizations/${orgId}/rental-rules/defaults/publish`,
        payload,
      ),
    publishCategory: (
      orgId: string,
      categoryId: string,
      payload: {
        revisionId: string;
        expectedVersion: number;
        expectedLockVersion: number;
        changeReason: string;
        acknowledgeCriticalImpact?: boolean;
      },
    ) =>
      post<import('../rental/components/settings/rental-rules/rental-rules.types').RentalVehicleCategoryDto>(
        `/organizations/${orgId}/rental-rules/categories/${categoryId}/publish`,
        payload,
      ),
    publishVehicleOverrides: (
      orgId: string,
      vehicleId: string,
      payload: {
        revisionId: string;
        expectedVersion: number;
        expectedLockVersion: number;
        changeReason: string;
        acknowledgeCriticalImpact?: boolean;
      },
    ) =>
      post<import('../rental/components/settings/rental-rules/rental-rules.types').VehicleRentalRequirementsDto>(
        `/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements/overrides/publish`,
        payload,
      ),
    listCategories: (orgId: string, includeInactive = false) =>
      get<import('../rental/components/settings/rental-rules/rental-rules.types').RentalVehicleCategoryDto[]>(
        `/organizations/${orgId}/rental-rules/categories${includeInactive ? '?includeInactive=true' : ''}`,
      ),
    createCategory: (orgId: string, data: Record<string, unknown>) =>
      post<import('../rental/components/settings/rental-rules/rental-rules.types').RentalVehicleCategoryDto>(
        `/organizations/${orgId}/rental-rules/categories`,
        data,
      ),
    getCategory: (orgId: string, categoryId: string) =>
      get<import('../rental/components/settings/rental-rules/rental-rules.types').RentalVehicleCategoryDto>(
        `/organizations/${orgId}/rental-rules/categories/${categoryId}`,
      ),
    updateCategory: (orgId: string, categoryId: string, data: Record<string, unknown>) =>
      patch<import('../rental/components/settings/rental-rules/rental-rules.types').RentalVehicleCategoryDto>(
        `/organizations/${orgId}/rental-rules/categories/${categoryId}`,
        data,
      ),
    disableCategory: (orgId: string, categoryId: string, expectedVersion: number) =>
      del<import('../rental/components/settings/rental-rules/rental-rules.types').RentalVehicleCategoryDto>(
        `/organizations/${orgId}/rental-rules/categories/${categoryId}?expectedVersion=${encodeURIComponent(String(expectedVersion))}`,
      ),
    transitionCategoryLifecycle: (
      orgId: string,
      categoryId: string,
      payload: {
        expectedVersion: number;
        targetStatus: import('../rental/components/settings/rental-rules/rental-rules.types').RentalVehicleCategoryStatus;
      },
    ) =>
      post<import('../rental/components/settings/rental-rules/rental-rules.types').RentalVehicleCategoryDto>(
        `/organizations/${orgId}/rental-rules/categories/${categoryId}/lifecycle`,
        payload,
      ),
    listCategoryVehicles: (orgId: string, categoryId: string) =>
      get<import('../rental/components/settings/rental-rules/rental-rules.types').RentalCategoryVehicleDto[]>(
        `/organizations/${orgId}/rental-rules/categories/${categoryId}/vehicles`,
      ),
    assignCategoryVehicles: (
      orgId: string,
      categoryId: string,
      payload: import('../rental/components/settings/rental-rules/rental-rules.types').CategoryAssignmentDeltaPayload,
    ) =>
      patch<import('../rental/components/settings/rental-rules/rental-rules.types').CategoryAssignmentResultDto>(
        `/organizations/${orgId}/rental-rules/categories/${categoryId}/vehicles`,
        payload,
      ),
    previewCategoryVehicleAssignment: (
      orgId: string,
      categoryId: string,
      payload: Omit<
        import('../rental/components/settings/rental-rules/rental-rules.types').CategoryAssignmentDeltaPayload,
        'expectedVersion'
      >,
    ) =>
      post<{
        categoryId: string;
        categoryName: string;
        version: number;
        hasMutations: boolean;
        diff: import('../rental/components/settings/rental-rules/rental-rules.types').CategoryAssignmentDiff;
      }>(`/organizations/${orgId}/rental-rules/categories/${categoryId}/vehicles/preview`, payload),
    getVehicleEffective: (orgId: string, vehicleId: string) =>
      get<import('../rental/components/settings/rental-rules/rental-rules.types').EffectiveRentalRulesDto>(
        `/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements/effective`,
      ),
    getVehicleRequirements: (orgId: string, vehicleId: string) =>
      get<import('../rental/components/settings/rental-rules/rental-rules.types').VehicleRentalRequirementsDto>(
        `/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements`,
      ),
    patchVehicleOverrides: (orgId: string, vehicleId: string, data: Record<string, unknown>) =>
      patch<import('../rental/components/settings/rental-rules/rental-rules.types').RentalRuleFields & { id: string; vehicleId: string }>(
        `/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements/overrides`,
        data,
      ),
    previewVehicleOverrideReset: (
      orgId: string,
      vehicleId: string,
      data?: { fields?: string[] },
    ) =>
      post<{
        vehicleId: string;
        resetFields: string[];
        fields: Array<{
          field: string;
          current: { value: unknown; source: string | null; sourceName: string | null };
          afterReset: { value: unknown; source: string | null; sourceName: string | null };
        }>;
      }>(`/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements/overrides/reset-preview`, data ?? {}),
    resetVehicleOverrides: (
      orgId: string,
      vehicleId: string,
      data?: { fields?: string[] },
    ) =>
      post<{
        vehicleId: string;
        removedFields: string[];
        result: 'deleted' | 'updated' | 'no_op';
        overrides: Record<string, unknown> | null;
      }>(`/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements/overrides/reset`, data ?? {}),
    deleteVehicleOverrides: (orgId: string, vehicleId: string) =>
      del<{
        vehicleId: string;
        removedFields: string[];
        result: 'deleted' | 'no_op';
        overrides: null;
      }>(`/organizations/${orgId}/vehicles/${vehicleId}/rental-requirements/overrides`),
    previewRevision: (
      orgId: string,
      scope: 'defaults' | 'category' | 'vehicle',
      payload: { mode: 'active' | 'draft' | 'diff'; scopeEntityId?: string },
    ) => {
      const path =
        scope === 'defaults'
          ? `/organizations/${orgId}/rental-rules/defaults/preview`
          : scope === 'category'
            ? `/organizations/${orgId}/rental-rules/categories/${payload.scopeEntityId}/preview`
            : `/organizations/${orgId}/vehicles/${payload.scopeEntityId}/rental-requirements/overrides/preview`;
      return post<import('../rental/components/settings/rental-rules/rental-rules.types').RentalRuleRevisionPreviewResponse>(
        path,
        { mode: payload.mode },
      );
    },
    listRevisions: (
      orgId: string,
      query?: {
        scopeType?: 'ORGANIZATION' | 'CATEGORY' | 'VEHICLE';
        scopeId?: string;
        status?: 'DRAFT' | 'ACTIVE' | 'RETIRED';
        limit?: number;
      },
    ) => {
      const params = new URLSearchParams();
      if (query?.scopeType) params.set('scopeType', query.scopeType);
      if (query?.scopeId) params.set('scopeId', query.scopeId);
      if (query?.status) params.set('status', query.status);
      if (query?.limit) params.set('limit', String(query.limit));
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return get<{
        items: import('../rental/components/settings/rental-rules/rental-rules.types').RentalRuleRevisionListItemDto[];
        total: number;
      }>(`/organizations/${orgId}/rental-rules/revisions${suffix}`);
    },
    getRevision: (orgId: string, revisionId: string) =>
      get<{
        revision: import('../rental/components/settings/rental-rules/rental-rules.types').RentalRuleRevisionListItemDto;
        supersedesRevision: import('../rental/components/settings/rental-rules/rental-rules.types').RentalRuleRevisionListItemDto | null;
        diff: {
          ruleDiffs: Array<{
            field: string;
            active: unknown;
            draft: unknown;
            changed: boolean;
          }>;
        };
      }>(`/organizations/${orgId}/rental-rules/revisions/${revisionId}`),
  },
  activityLog: {
    listAll: () => get<any[]>('/admin/activity-log'),
    listByOrg: (
      orgId: string,
      params?: { entity?: string; action?: string; limit?: number; page?: number },
    ) => {
      const q = new URLSearchParams();
      if (params?.entity) q.set('entity', params.entity);
      if (params?.action) q.set('action', params.action);
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.page) q.set('page', String(params.page));
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return get<{ data: Array<{
        id: string;
        action: string;
        entity: string;
        description: string;
        userName: string;
        createdAt: string;
      }>; meta?: { total: number } }>(`/organizations/${orgId}/activity-log${suffix}`);
    },
  },
  products: {
    list: () => get<any[]>('/admin/products'),
    stats: () => get<any>('/admin/products/stats'),
    listByOrg: (orgId: string) => get<any[]>(`/admin/products/org/${orgId}`),
    assign: (data: any) => post<any>('/admin/products/assign', data),
  },
  integrations: {
    listAll: () => get<any[]>('/admin/integrations'),
    stats: () => get<any>('/admin/integrations/stats'),
    listByOrg: (orgId: string) => get<any[]>(`/organizations/${orgId}/integrations`),
  },
  prospects: {
    list: () => get<any[]>('/admin/prospects'),
    get: (id: string) => get<any>(`/admin/prospects/${id}`),
    create: (data: any) => post<any>('/admin/prospects', data),
    update: (id: string, data: any) => patch<any>(`/admin/prospects/${id}`, data),
    delete: (id: string) => del<void>(`/admin/prospects/${id}`),
    convert: (id: string) => post<any>(`/admin/prospects/${id}/convert`, {}),
  },
  vehicleIntelligence: {
    all: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/intelligence`),
    drivingAssessmentQuality: (vehicleId: string) =>
      get<DrivingAssessmentQualityResponse>(`/vehicles/${vehicleId}/driving-assessment-quality`),
    battery: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/battery`),
    createBatterySpec: (
      vehicleId: string,
      data: {
        batteryType?: string | null;
        batteryAmpere?: number | null;
        batteryVolt?: number | null;
        sourceType?: string;
        sourceConfidence?: number;
      },
    ) => post<any>(`/vehicles/${vehicleId}/battery`, data),
    updateBatterySpec: (
      vehicleId: string,
      id: string,
      data: {
        batteryType?: string | null;
        batteryAmpere?: number | null;
        batteryVolt?: number | null;
        sourceType?: string;
        sourceConfidence?: number;
      },
    ) => patch<any>(`/vehicles/${vehicleId}/battery/${id}`, data),
    tires: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/tires`),
    tireWearAnalysis: (vehicleId: string) => get<TireWearAnalysis | null>(`/vehicles/${vehicleId}/tires/wear-analysis`),
    tireHealthSummary: (vehicleId: string) => get<TireHealthSummaryResponse | null>(`/vehicles/${vehicleId}/tires/summary`),
    tireHealthDetail: (vehicleId: string) => get<TireHealthDetailResponse | null>(`/vehicles/${vehicleId}/tires/detail`),
    tireRotationHistory: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/tires/rotation-history`),
    rotateTires: (vehicleId: string, data: { template: string; odometerKm?: number; notes?: string }) =>
      post<any>(`/vehicles/${vehicleId}/tires/rotate`, data),
    changeTires: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/tires/change`, data),
    activateStoredTireSet: (vehicleId: string, data: { storedSetupId?: string; odometerKm?: number; notes?: string }) =>
      post<any>(`/vehicles/${vehicleId}/tires/activate-stored-set`, data),
    addTireHealthMeasurement: (vehicleId: string, data: any) =>
      post<any>(`/vehicles/${vehicleId}/tires/measurement`, data),
    recalculateTireHealth: (vehicleId: string) => post<any>(`/vehicles/${vehicleId}/tires/recalculate`, {}),
    applyAiTireSpec: (
      vehicleId: string,
      payload: {
        jobId?: string;
        aiTireSpec?: Record<string, unknown>;
        generationBinding?: {
          tireSetupId: string;
          setupUpdatedAt: string;
          requestTireSize: string;
          requestLoadIndex: string;
          requestSpeedIndex: string;
        };
        tireSize?: string;
        loadIndex?: string;
        speedIndex?: string;
        tireSetupId?: string;
        userConfirmedSpec?: boolean;
      },
    ) =>
      post<{
        success: boolean;
        setupId?: string;
        appliedFields?: string[];
        message?: string;
        code?: string;
        setupSpecWarnings?: Array<{
          code: string;
          message: string;
          setupValue: string | null;
          specValue: string | null;
          precedence: 'setup_manual' | 'spec_user_confirmed';
        }>;
      }>(`/vehicles/${vehicleId}/tires/ai-spec/apply`, payload),
    startAiTireSpecJob: (params: {
      brand: string;
      model: string;
      year: number;
      tireSize: string;
      loadIndex: string;
      speedIndex: string;
      vehicleId?: string;
      tireSetupId?: string;
    }) =>
      post<{ jobId: string; status: string }>('/vehicles/register/ai-tire-specs', params),
    getAiTireSpecJobStatus: (jobId: string) =>
      get<{ jobId: string; status: string; createdAt: string; startedAt: string | null; completedAt: string | null; errorMessage: string | null; confidenceScore: number | null; result: Record<string, unknown> | null; resultReady: boolean; input: Record<string, string | number> }>(`/vehicles/register/ai-tire-specs/${jobId}/status`),
    tireCalibrationMeasurement: (vehicleId: string, tireSetupId: string, data: any) =>
      post<any>(`/vehicles/${vehicleId}/tires/${tireSetupId}/calibration-measurement`, data),
    brakes: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/brakes`),
    /** @deprecated Legacy heuristic endpoint only. */
    brakeStatus: (vehicleId: string) => get<BrakeStatus>(`/vehicles/${vehicleId}/brake-status`),
    brakeHealthSummary: (vehicleId: string) => get<BrakeHealthSummary>(`/vehicles/${vehicleId}/brake-health/summary`),
    brakeHealthDetail: (vehicleId: string) => get<BrakeHealthDetail>(`/vehicles/${vehicleId}/brake-health/detail`),
    brakeHealthInitialize: (
      vehicleId: string,
      data: {
        serviceDate: string;
        odometerKm?: number;
        frontPadMm?: number;
        rearPadMm?: number;
        frontRotorWidthMm?: number;
        rearRotorWidthMm?: number;
        measurementConfirmed?: boolean;
        kind?: BrakeServiceKindInput;
        scope?: BrakeServiceScopeInput[];
        workshopName?: string;
        notes?: string;
      },
    ) => post<BrakeServiceLifecycleResult>(`/vehicles/${vehicleId}/brake-health/initialize`, data),
    recordBrakeService: (
      vehicleId: string,
      data: {
        serviceDate: string;
        odometerKm?: number;
        workshopName?: string;
        notes?: string;
        source?: 'manual' | 'ai_document' | 'api';
        kind?: BrakeServiceKindInput;
        scope?: BrakeServiceScopeInput[];
        measured?: {
          frontPadMm?: number;
          rearPadMm?: number;
          frontDiscMm?: number;
          rearDiscMm?: number;
        };
        initializeIfPossible?: boolean;
      },
    ) => post<BrakeServiceLifecycleResult>(`/vehicles/${vehicleId}/brake-health/service`, data),
    brakeHealthRecalculate: (vehicleId: string) => post<any>(`/vehicles/${vehicleId}/brake-health/recalculate`, {}),
    createBrakeSpec: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/brakes`, data),
    updateBrakeSpec: (vehicleId: string, id: string, data: any) =>
      patch<any>(`/vehicles/${vehicleId}/brakes/${id}`, data),
    tripProfile: (vehicleId: string) => get<TripProfile>(`/vehicles/${vehicleId}/trip-profile`),
    // ── Trips tab (Vehicle Detail) ─────────────────────────────────────────
    // List/timeline: tripsTimeline (canonical merge) → fallback trips + energyEvents
    // On select: tripRoute, tripDetail, tripBehaviorEvents; enrich via enrichTrip / enrichTripBehavior
    // Reconcile missing segments: reconcileTrips
    serviceEvents: (vehicleId: string) =>
      get<{ data: VehicleServiceEventRecord[] }>(`/vehicles/${vehicleId}/service-events`),
    dtc: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/dtc`),
    dtcActive: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/dtc/active`),
    dtcStats: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/dtc/stats`),
    dtcSummary: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/dtc/summary`),
    dtcDetail: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/dtc/detail`),
    // Internal/admin retry of AI knowledge enrichment for a single DTC code.
    dtcKnowledgeRetry: (vehicleId: string, code: string) =>
      post<{ code: string; knowledge: DtcKnowledgeDto }>(
        `/vehicles/${vehicleId}/dtc/${encodeURIComponent(code)}/knowledge/retry`,
        {},
      ),
    trips: (vehicleId: string, params?: { from?: string; to?: string; driver?: string }) =>
      get<VehicleTripAnalytics[]>(`/vehicles/${vehicleId}/trips` + buildQuery(params)),
    tripStats: (vehicleId: string) => get<VehicleTripStats>(`/vehicles/${vehicleId}/trips/stats`),
    drivingImpactRolling: (vehicleId: string) =>
      get<DrivingImpactRollingResponse>(`/vehicles/${vehicleId}/driving-impact/rolling`),
    tripDetail: (vehicleId: string, tripId: string) => get<VehicleTripAnalytics>(`/vehicles/${vehicleId}/trips/${tripId}`),
    energyEvents: (
      vehicleId: string,
      params?: { from?: string; to?: string },
    ) =>
      get<EnergyEvent[]>(
        `/vehicles/${vehicleId}/energy-events` + buildQuery(params),
      ),
    detectEnergyEvents: (
      vehicleId: string,
      payload?: { from?: string; to?: string },
    ) =>
      post<{
        fetched: number;
        created: number;
        updated: number;
        skipped: number;
        events: EnergyEvent[];
      }>(`/vehicles/${vehicleId}/energy-events/detect`, payload ?? {}),
    tripsTimeline: (
      vehicleId: string,
      params?: { from?: string; to?: string; driver?: string },
    ) =>
      get<TripTimelineItem[]>(
        `/vehicles/${vehicleId}/trips-timeline` + buildQuery(params),
      ),
    driverScore: (
      vehicleId: string,
      params: { subjectType: TripAssignmentSubjectType; subjectId: string; from?: string; to?: string },
    ) => get<DriverScoreSummary>(`/vehicles/${vehicleId}/trips/driver-score` + buildQuery({
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      from: params.from,
      to: params.to,
    })),
    tripRoute: (vehicleId: string, tripId: string) =>
      get<CanonicalTripRouteResponse>(`/vehicles/${vehicleId}/trips/${tripId}/route`),
    /** @deprecated Use reconcileTrips instead */
    syncTrips: (vehicleId: string, _params?: { from?: string; to?: string }) =>
      post<any>(`/vehicles/${vehicleId}/trips/reconcile`, {}),
    reconcileTrips: (vehicleId: string) =>
      post<{ found: number; applied: number; message: string }>(`/vehicles/${vehicleId}/trips/reconcile`, {}),
    enrichTrip: (vehicleId: string, tripId: string) =>
      post<TripEnrichment>(`/vehicles/${vehicleId}/trips/${tripId}/enrich`, {}),
    tripBehaviorEvents: (vehicleId: string, tripId: string, category?: string) =>
      get<{
        status: 'ready' | 'pending';
        behaviorReady: boolean;
        visibleEventCount?: number;
        events: TripBehaviorEvent[];
      }>(
        `/vehicles/${vehicleId}/trips/${tripId}/behavior-events` + (category ? `?category=${category}` : ''),
      ),
    tripDeviceConnectionEvidence: (vehicleId: string, tripId: string) =>
      get<TripDeviceConnectionEvidenceResponse>(
        `/vehicles/${vehicleId}/trips/${tripId}/device-connection-evidence`,
      ),
    tripRpmCandidates: (vehicleId: string, tripId: string) =>
      get<TripRpmCandidatesResponse>(
        `/vehicles/${vehicleId}/trips/${tripId}/rpm-candidates`,
      ),
    tripGpsSpeedEvaluationV2: (vehicleId: string, tripId: string) =>
      get<TripGpsSpeedEvaluationProductV1>(
        `/vehicles/${vehicleId}/trips/${tripId}/gps-speed-evaluation-v2`,
      ),
    tripMotionShadowMap: (vehicleId: string, tripId: string) =>
      get<TripMotionShadowMapReadResponse>(
        `/vehicles/${vehicleId}/trips/${tripId}/motion-shadow-map`,
      ),
    tripM7aRoadAssignmentShadow: (vehicleId: string, tripId: string) =>
      get<Record<string, unknown>>(
        `/vehicles/${vehicleId}/trips/${tripId}/m7a-road-assignment-shadow`,
      ),
    enrichTripBehavior: (vehicleId: string, tripId: string) =>
      post<any>(`/vehicles/${vehicleId}/trips/${tripId}/behavior-enrich`, {}),
    getVehicleDamages: (vehicleId: string) =>
      get<DamageResponse[]>(`/vehicles/${vehicleId}/damages`),
    getVehicleDamagesActive: (vehicleId: string) =>
      get<DamageResponse[]>(`/vehicles/${vehicleId}/damages/active`),
    getDamageStats: (vehicleId: string) =>
      get<DamageStatsResponse>(`/vehicles/${vehicleId}/damages/stats`),
    createVehicleDamage: (vehicleId: string, data: CreateVehicleDamageInput) =>
      post<DamageResponse>(`/vehicles/${vehicleId}/damages`, data),
    analyzeExteriorPhotosForDamage: (
      vehicleId: string,
      images: Array<{ view: string; imageData: string; fileName?: string }>,
    ) =>
      post<{ suggestions: unknown[]; warning: string }>(
        `/vehicles/${vehicleId}/damages/ai-analyze-exterior`,
        { images },
      ),
    updateVehicleDamage: (vehicleId: string, damageId: string, data: UpdateVehicleDamageInput) =>
      patch<DamageResponse>(`/vehicles/${vehicleId}/damages/${damageId}`, data),
    placeVehicleDamage: (vehicleId: string, damageId: string, data: PlaceDamageOnVehicleInput) =>
      patch<DamageResponse>(`/vehicles/${vehicleId}/damages/${damageId}/place`, data),
    markDamageRepaired: (vehicleId: string, damageId: string, data: MarkDamageRepairedInput = {}) =>
      patch<DamageResponse>(`/vehicles/${vehicleId}/damages/${damageId}/repair`, data),
    createDamageRepairTask: (
      vehicleId: string,
      damageId: string,
      data: { dueDate?: string; vendorId?: string; note?: string } = {},
    ) =>
      post<{ damage: DamageResponse; taskId: string }>(
        `/vehicles/${vehicleId}/damages/${damageId}/repair-task`,
        data,
      ),
    addDamageImage: (vehicleId: string, damageId: string, data: AddDamageImageInput) =>
      post<DamageResponse>(`/vehicles/${vehicleId}/damages/${damageId}/images`, data),
    /** @deprecated Use getVehicleDamages */
    damages: (vehicleId: string) => get<DamageResponse[]>(`/vehicles/${vehicleId}/damages`),
    /** @deprecated Use getVehicleDamagesActive */
    damagesActive: (vehicleId: string) => get<DamageResponse[]>(`/vehicles/${vehicleId}/damages/active`),
    /** @deprecated Use getDamageStats */
    damageStats: (vehicleId: string) => get<DamageStatsResponse>(`/vehicles/${vehicleId}/damages/stats`),
    /** @deprecated Use createVehicleDamage */
    createDamage: (vehicleId: string, data: CreateVehicleDamageInput) =>
      post<DamageResponse>(`/vehicles/${vehicleId}/damages`, data),
    /** @deprecated Use markDamageRepaired */
    repairDamage: (vehicleId: string, damageId: string, data: MarkDamageRepairedInput = {}) =>
      patch<DamageResponse>(`/vehicles/${vehicleId}/damages/${damageId}/repair`, data),
    batteryHealth: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/battery-health`),
    batteryHealthLatest: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/battery-health/latest`),
    batteryHealthTrend: (vehicleId: string, days?: number) =>
      get<any[]>(`/vehicles/${vehicleId}/battery-health/trend` + (days ? `?days=${days}` : '')),
    batteryHealthSummary: (vehicleId: string, init?: RequestInit) =>
      get<BatteryHealthSummary>(`/vehicles/${vehicleId}/battery-health-summary`, init),
    batteryHealthDetail: (vehicleId: string, init?: RequestInit) =>
      get<BatteryHealthDetail>(`/vehicles/${vehicleId}/battery-health-detail`, init),
    createServiceEvent: (vehicleId: string, data: CreateVehicleServiceEventInput) =>
      post<VehicleServiceEventRecord>(`/vehicles/${vehicleId}/service-events`, data),
    updateServiceEvent: (vehicleId: string, eventId: string, data: UpdateVehicleServiceEventInput) =>
      patch<VehicleServiceEventRecord>(`/vehicles/${vehicleId}/service-events/${eventId}`, data),
    deleteServiceEvent: (vehicleId: string, eventId: string) =>
      del<{ ok: boolean }>(`/vehicles/${vehicleId}/service-events/${eventId}`),
    createTireSetup: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/tires`, data),
    addTireMeasurement: (vehicleId: string, tireSetupId: string, data: any) =>
      post<any>(`/vehicles/${vehicleId}/tires/${tireSetupId}/measurements`, data),
    healthTabSummary: (vehicleId: string) =>
      get<VehicleHealthTabSummaryDto>(`/vehicles/${vehicleId}/health/summary`),
    oilChangeStatus: (vehicleId: string) => get<OilChangeStatus>(`/vehicles/${vehicleId}/oil-change-status`),
    createOilChangeEvent: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/service-events`, { ...data, eventType: 'OIL_CHANGE' }),
    hvBatteryStatus: (vehicleId: string) => get<HvBatteryStatus>(`/vehicles/${vehicleId}/hv-battery-status`),
    serviceInfoStatus: (vehicleId: string) => get<ServiceInfoStatus>(`/vehicles/${vehicleId}/service-info-status`),
    vehicleFileSummary: (vehicleId: string) =>
      get<import('../rental/lib/vehicle-file-summary.types').VehicleFileSummary>(
        `/vehicles/${vehicleId}/file-summary`,
      ),
    materializeComplianceTask: (vehicleId: string, signalKey: string) =>
      post<ApiTask>(`/vehicles/${vehicleId}/compliance-task-signals/${encodeURIComponent(signalKey)}/materialize`, {}),
    // Phase 3: AI Health Care with HM indicators
    aiHealthCare: (vehicleId: string) => get<AiHealthCareResponse>(`/vehicles/${vehicleId}/health/ai-health-care`),
    dashboardWarningLights: (vehicleId: string) =>
      get<DashboardWarningLightsResponse>(`/vehicles/${vehicleId}/health/dashboard-warning-lights`),
    // Phase 3: HM vehicle activation
    hmStatus: (vehicleId: string) => get<HmVehicleStatusDto>(`/vehicles/${vehicleId}/high-mobility-status`),
    hmCheckEligibility: (vehicleId: string) => post<any>(`/vehicles/${vehicleId}/high-mobility/check-eligibility`, {}),
    hmActivateHealth: (vehicleId: string) => post<{ success: boolean; message: string }>(`/vehicles/${vehicleId}/high-mobility/activate-health`, {}),
    hmRefreshStatus: (vehicleId: string) => post<HmVehicleStatusDto>(`/vehicles/${vehicleId}/high-mobility/refresh-status`, {}),
    hmDeactivate: (vehicleId: string) => post<{ success: boolean; message: string }>(`/vehicles/${vehicleId}/high-mobility/deactivate`, {}),
    /** VW Group + Porsche only: skips eligibility, submits direct fleet clearance. */
    hmRequestDirectClearance: (vehicleId: string) =>
      post<{ success: boolean; message: string; status?: HmVehicleStatusDto }>(
        `/vehicles/${vehicleId}/hm-health-app/request-direct-clearance`,
        {},
      ),
    // Phase 3: HM Vehicle Health signals
    hmVehicleHealth: (vehicleId: string) => get<HmVehicleHealthPayload>(`/vehicles/${vehicleId}/hm-vehicle-health`),
    hmRefreshService: (vehicleId: string) => post<{ ok: boolean }>(`/vehicles/${vehicleId}/hm-vehicle-health/refresh-service`, {}),
    hmRefreshTirePressure: (vehicleId: string) => post<{ ok: boolean }>(`/vehicles/${vehicleId}/hm-vehicle-health/refresh-tire-pressure`, {}),
    hmRefreshAiHealthCare: (vehicleId: string) => post<{ ok: boolean }>(`/vehicles/${vehicleId}/hm-vehicle-health/refresh-ai-health-care`, {}),
    documentExtractions: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/document-extractions`),
    getDocumentExtraction: (vehicleId: string, extractionId: string) =>
      get<any>(`/vehicles/${vehicleId}/document-extractions/${extractionId}`),
    createDocumentExtraction: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/document-extractions`, data),
    confirmDocumentExtraction: (vehicleId: string, extractionId: string, data: any) => post<any>(`/vehicles/${vehicleId}/document-extractions/${extractionId}/confirm`, data),
    saveDocumentReview: (
      vehicleId: string,
      extractionId: string,
      data: { confirmedData: Record<string, unknown> },
    ) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/save-review`,
        data,
      ),
    getActionPlanPreview: (vehicleId: string, extractionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentActionPlanPreview>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/action-plan-preview`,
      ),
    getApplyResult: (vehicleId: string, extractionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentApplyResult>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/apply-result`,
      ),
    retryFailedDocumentActions: (vehicleId: string, extractionId: string) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/retry-failed-actions`,
        {},
      ),
    listFollowUpSuggestions: (vehicleId: string, extractionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentFollowUpSuggestion[]>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/follow-up-suggestions`,
      ),
    getFollowUpContactPrepare: (vehicleId: string, extractionId: string, suggestionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentFollowUpContactPrepare>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/contact-prepare`,
      ),
    recordFollowUpContactPrepareOpened: (
      vehicleId: string,
      extractionId: string,
      suggestionId: string,
    ) =>
      post<{ recorded: boolean }>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/contact-prepare/opened`,
        {},
      ),
    sendFollowUpContact: (
      vehicleId: string,
      extractionId: string,
      suggestionId: string,
      data: {
        toEmail: string;
        ccEmails?: string[];
        bccEmails?: string[];
        subject: string;
        bodyHtml: string;
        bodyText?: string;
        attachDocument?: boolean;
      },
    ) =>
      post<unknown>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/contact-prepare/send`,
        data,
      ),
    acceptFollowUpSuggestion: (vehicleId: string, extractionId: string, suggestionId: string) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentFollowUpSuggestion>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/accept`,
        {},
      ),
    dismissFollowUpSuggestion: (vehicleId: string, extractionId: string, suggestionId: string) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentFollowUpSuggestion>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/dismiss`,
        {},
      ),
    updateActionPlanPreferences: (
      vehicleId: string,
      extractionId: string,
      data: { disabledOptionalActions: string[] },
    ) =>
      patch<import('../rental/lib/document-extraction.types').PublicDocumentActionPlanPreview>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/action-plan-preferences`,
        data,
      ),
    retryDocumentExtraction: (vehicleId: string, extractionId: string) =>
      post<any>(`/vehicles/${vehicleId}/document-extractions/${extractionId}/retry`, {}),
    // Real multipart upload → stores file, creates QUEUED record, enqueues the
    // AI extraction job. Returns { id, status, documentType }.
    uploadDocumentExtraction: async (
      vehicleId: string,
      file: File,
      documentType: string,
      source?: string,
      options?: {
        reuploadReason?: string;
        relatedExtractionId?: string;
        invoiceNumberHint?: string;
        referenceNumberHint?: string;
      },
    ) => {
      const form = new FormData();
      form.append('file', file);
      form.append('documentType', documentType);
      if (source) form.append('source', source);
      if (options?.reuploadReason) form.append('reuploadReason', options.reuploadReason);
      if (options?.relatedExtractionId) form.append('relatedExtractionId', options.relatedExtractionId);
      if (options?.invoiceNumberHint) form.append('invoiceNumberHint', options.invoiceNumberHint);
      if (options?.referenceNumberHint) form.append('referenceNumberHint', options.referenceNumberHint);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(`${BASE_URL}/vehicles/${vehicleId}/document-extractions/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* keep null body */
        }
        const { parseUploadDuplicateError } = await import('./document-upload-duplicate');
        const duplicateError = parseUploadDuplicateError(body);
        if (duplicateError) throw duplicateError;
        const { parseUploadRateLimitError } = await import('./document-upload-rate-limit');
        const rateLimitError = parseUploadRateLimitError(body);
        if (rateLimitError) throw rateLimitError;
        const { parseUploadIdentificationError, parseNestedUploadErrorMessage } = await import(
          './document-upload-identification'
        );
        const identificationError = parseUploadIdentificationError(body);
        if (identificationError) throw identificationError;
        const message =
          parseNestedUploadErrorMessage(body) ?? `Upload failed (${res.status})`;
        throw new Error(message);
      }
      return (await res.json()) as {
        id: string;
        status: string;
        documentType: string;
        uploadDuplicateStatus?: string;
        uploadDuplicate?: unknown;
      };
    },
    setDocumentType: (
      vehicleId: string,
      extractionId: string,
      data: { documentType: string; reextract?: boolean },
    ) => post<any>(`/vehicles/${vehicleId}/document-extractions/${extractionId}/document-type`, data),
    updateEntityLinks: (
      vehicleId: string,
      extractionId: string,
      data: { operations: import('../rental/lib/document-entity-links').DocumentEntityLinkOperation[] },
    ) =>
      patch<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/vehicles/${vehicleId}/document-extractions/${extractionId}/entity-links`,
        data,
      ),
    cancelDocumentExtraction: (vehicleId: string, extractionId: string) =>
      post<any>(`/vehicles/${vehicleId}/document-extractions/${extractionId}/cancel`, {}),
    downloadDocumentExtraction: async (vehicleId: string, extractionId: string) => {
      const token = getToken();
      const res = await fetch(
        `${BASE_URL}/vehicles/${vehicleId}/document-extractions/${extractionId}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        let message = `Download failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) message = body.message;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }
      return res.blob();
    },
  },
  documentExtraction: {
    metadata: () => get<import('../rental/lib/document-extraction.types').DocumentExtractionMetadata>(
      '/document-extractions/metadata',
    ),
    listSchemas: () =>
      get<import('../rental/lib/document-extraction.types').DocumentSchemaRegistryResponse>(
        '/document-extractions/schemas',
      ),
    resolveSchema: (params: { legacyDocumentType: string; subtype?: string | null }) => {
      const q = buildQuery({
        legacyDocumentType: params.legacyDocumentType,
        subtype: params.subtype ?? undefined,
      });
      return get<import('../rental/lib/document-extraction.types').PublicDocumentSubtypeSchema>(
        `/document-extractions/schemas/resolve${q}`,
      );
    },
    listByOrg: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        vehicleId?: string;
        status?: string;
        documentType?: string;
      },
    ) => {
      const q = buildQuery({
        page: params?.page,
        limit: params?.limit,
        vehicleId: params?.vehicleId,
        status: params?.status,
        documentType: params?.documentType,
      });
      return get<import('../rental/lib/document-extraction.types').DocumentExtractionListResponse>(
        `/organizations/${orgId}/document-extractions${q}`,
      );
    },
    listArchiveByOrg: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        status?: string;
        documentCategory?: string;
        documentSubtype?: string;
        vehicleId?: string;
        bookingId?: string;
        customerId?: string;
        driverId?: string;
        vendorId?: string;
        uploadedBy?: string;
        uploadedFrom?: string;
        uploadedTo?: string;
        fileName?: string;
        invoiceNumber?: string;
        caseReference?: string;
        actionStatus?: string;
        followUpStatus?: string;
        q?: string;
      },
    ) => {
      const q = buildQuery({
        page: params?.page,
        limit: params?.limit,
        status: params?.status,
        documentCategory: params?.documentCategory,
        documentSubtype: params?.documentSubtype,
        vehicleId: params?.vehicleId,
        bookingId: params?.bookingId,
        customerId: params?.customerId,
        driverId: params?.driverId,
        vendorId: params?.vendorId,
        uploadedBy: params?.uploadedBy,
        uploadedFrom: params?.uploadedFrom,
        uploadedTo: params?.uploadedTo,
        fileName: params?.fileName,
        invoiceNumber: params?.invoiceNumber,
        caseReference: params?.caseReference,
        actionStatus: params?.actionStatus,
        followUpStatus: params?.followUpStatus,
        q: params?.q,
      });
      return get<import('../rental/lib/document-extraction.types').DocumentExtractionArchiveListResponse>(
        `/organizations/${orgId}/document-extractions/archive${q}`,
      );
    },
    getByOrg: (orgId: string, extractionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/organizations/${orgId}/document-extractions/${extractionId}`,
      ),
    downloadByOrg: async (orgId: string, extractionId: string) => {
      const token = getToken();
      const res = await fetch(
        `${BASE_URL}/organizations/${orgId}/document-extractions/${extractionId}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        let message = `Download failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) message = body.message;
        } catch {
          /* keep default */
        }
        throw new Error(message);
      }
      return res.blob();
    },
    reassignVehicle: (orgId: string, extractionId: string, vehicleId: string) =>
      patch<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/organizations/${orgId}/document-extractions/${extractionId}/vehicle`,
        { vehicleId },
      ),
    setDocumentTypeByOrg: (
      orgId: string,
      extractionId: string,
      data: { documentType: string; reextract?: boolean },
    ) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/organizations/${orgId}/document-extractions/${extractionId}/document-type`,
        data,
      ),
    updateEntityLinksByOrg: (
      orgId: string,
      extractionId: string,
      data: { operations: import('../rental/lib/document-entity-links').DocumentEntityLinkOperation[] },
    ) =>
      patch<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/organizations/${orgId}/document-extractions/${extractionId}/entity-links`,
        data,
      ),
    saveReviewByOrg: (
      orgId: string,
      extractionId: string,
      data: { confirmedData: Record<string, unknown> },
    ) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/organizations/${orgId}/document-extractions/${extractionId}/save-review`,
        data,
      ),
    confirmByOrg: (
      orgId: string,
      extractionId: string,
      data: { confirmedData: Record<string, unknown>; actionPlanFingerprint?: string },
    ) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/organizations/${orgId}/document-extractions/${extractionId}/confirm`,
        data,
      ),
    getActionPlanPreviewByOrg: (orgId: string, extractionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentActionPlanPreview>(
        `/organizations/${orgId}/document-extractions/${extractionId}/action-plan-preview`,
      ),
    getApplyResultByOrg: (orgId: string, extractionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentApplyResult>(
        `/organizations/${orgId}/document-extractions/${extractionId}/apply-result`,
      ),
    retryFailedActionsByOrg: (orgId: string, extractionId: string) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentExtraction>(
        `/organizations/${orgId}/document-extractions/${extractionId}/retry-failed-actions`,
        {},
      ),
    listFollowUpSuggestions: (orgId: string, extractionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentFollowUpSuggestion[]>(
        `/organizations/${orgId}/document-extractions/${extractionId}/follow-up-suggestions`,
      ),
    getFollowUpContactPrepare: (orgId: string, extractionId: string, suggestionId: string) =>
      get<import('../rental/lib/document-extraction.types').PublicDocumentFollowUpContactPrepare>(
        `/organizations/${orgId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/contact-prepare`,
      ),
    recordFollowUpContactPrepareOpened: (
      orgId: string,
      extractionId: string,
      suggestionId: string,
    ) =>
      post<{ recorded: boolean }>(
        `/organizations/${orgId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/contact-prepare/opened`,
        {},
      ),
    sendFollowUpContact: (
      orgId: string,
      extractionId: string,
      suggestionId: string,
      data: {
        toEmail: string;
        ccEmails?: string[];
        bccEmails?: string[];
        subject: string;
        bodyHtml: string;
        bodyText?: string;
        attachDocument?: boolean;
      },
    ) =>
      post<unknown>(
        `/organizations/${orgId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/contact-prepare/send`,
        data,
      ),
    acceptFollowUpSuggestion: (orgId: string, extractionId: string, suggestionId: string) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentFollowUpSuggestion>(
        `/organizations/${orgId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/accept`,
        {},
      ),
    dismissFollowUpSuggestion: (orgId: string, extractionId: string, suggestionId: string) =>
      post<import('../rental/lib/document-extraction.types').PublicDocumentFollowUpSuggestion>(
        `/organizations/${orgId}/document-extractions/${extractionId}/follow-up-suggestions/${suggestionId}/dismiss`,
        {},
      ),
    updateActionPlanPreferencesByOrg: (
      orgId: string,
      extractionId: string,
      data: { disabledOptionalActions: string[] },
    ) =>
      patch<import('../rental/lib/document-extraction.types').PublicDocumentActionPlanPreview>(
        `/organizations/${orgId}/document-extractions/${extractionId}/action-plan-preferences`,
        data,
      ),
    upload: async (
      orgId: string,
      file: File,
      options?: {
        requestedDocumentType?: string;
        optionalContextType?: string;
        optionalContextId?: string;
        sourceSurface?: string;
        source?: string;
        reuploadReason?: string;
        relatedExtractionId?: string;
        invoiceNumberHint?: string;
        referenceNumberHint?: string;
      },
    ) => {
      const form = new FormData();
      form.append('file', file);
      form.append('requestedDocumentType', options?.requestedDocumentType ?? 'AUTO');
      if (options?.optionalContextType) form.append('optionalContextType', options.optionalContextType);
      if (options?.optionalContextId) form.append('optionalContextId', options.optionalContextId);
      if (options?.sourceSurface) form.append('sourceSurface', options.sourceSurface);
      if (options?.source) form.append('source', options.source);
      if (options?.reuploadReason) form.append('reuploadReason', options.reuploadReason);
      if (options?.relatedExtractionId) form.append('relatedExtractionId', options.relatedExtractionId);
      if (options?.invoiceNumberHint) form.append('invoiceNumberHint', options.invoiceNumberHint);
      if (options?.referenceNumberHint) form.append('referenceNumberHint', options.referenceNumberHint);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(`${BASE_URL}/organizations/${orgId}/document-extractions/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* keep null body */
        }
        const { parseUploadDuplicateError } = await import('./document-upload-duplicate');
        const duplicateError = parseUploadDuplicateError(body);
        if (duplicateError) throw duplicateError;
        const { parseUploadRateLimitError } = await import('./document-upload-rate-limit');
        const rateLimitError = parseUploadRateLimitError(body);
        if (rateLimitError) throw rateLimitError;
        const { parseUploadIdentificationError, parseNestedUploadErrorMessage } = await import(
          './document-upload-identification'
        );
        const identificationError = parseUploadIdentificationError(body);
        if (identificationError) throw identificationError;
        const message =
          parseNestedUploadErrorMessage(body) ?? `Upload failed (${res.status})`;
        throw new Error(message);
      }
      return (await res.json()) as import('../rental/lib/document-extraction.types').PublicDocumentExtraction;
    },
  },
  partsAccessories: {
    providers: () => get<PartsProviderSummary[]>('/parts-accessories/providers'),
    disclosure: (providerKey: string, category?: string) =>
      get<{ disclosure: PartsDisclosureTemplate | null; disclosedFields: PartsDisclosedFieldSet | null }>(
        `/parts-accessories/providers/${providerKey}/disclosure` + (category ? `?category=${category}` : ''),
      ),
    confirmDisclosure: (data: { vehicleId: string; providerKey: string; category: string }) =>
      post<{ correlationId: string; authorizationLogId: string }>('/parts-accessories/disclosures/confirm', data),
    search: (data: PartsSearchParams) =>
      post<PartsSearchResponse>('/parts-accessories/search', data),
    productDetail: (providerKey: string, externalId: string, vehicleId?: string) =>
      get<PartsProductDetail | null>(`/parts-accessories/products/${providerKey}/${externalId}` + (vehicleId ? `?vehicleId=${vehicleId}` : '')),
    vehicleFitment: (vehicleId: string) =>
      get<PartsVehicleFitment>(`/parts-accessories/vehicles/fitment/${vehicleId}`),
    authorizationLogs: (params?: { providerKey?: string; from?: string; to?: string; page?: number; pageSize?: number }) => {
      const q: Record<string, string | undefined> = params
        ? { providerKey: params.providerKey, from: params.from, to: params.to, page: params.page?.toString(), pageSize: params.pageSize?.toString() }
        : undefined as any;
      return get<{ rows: PartsAuthorizationLogEntry[]; total: number; page: number; pageSize: number }>(
        '/parts-accessories/authorization-logs' + buildQuery(q),
      );
    },
    admin: {
      providers: () => get<any[]>('/admin/parts-accessories/providers'),
      createProvider: (data: any) => post<any>('/admin/parts-accessories/providers', data),
      updateProvider: (id: string, data: any) => patch<any>(`/admin/parts-accessories/providers/${id}`, data),
      testProvider: (id: string) => post<PartsConnectionTestResult>(`/admin/parts-accessories/providers/${id}/test`, {}),
      disclosures: (params?: { providerKey?: string; isActive?: string }) =>
        get<PartsDisclosureTemplate[]>('/admin/parts-accessories/disclosures' + buildQuery(params)),
      createDisclosure: (data: any) => post<PartsDisclosureTemplate>('/admin/parts-accessories/disclosures', data),
      updateDisclosure: (id: string, data: any) => patch<PartsDisclosureTemplate>(`/admin/parts-accessories/disclosures/${id}`, data),
      authorizationLogs: (params?: Record<string, string>) =>
        get<{ rows: PartsAuthorizationLogEntry[]; total: number; page: number; pageSize: number }>(
          '/admin/parts-accessories/authorization-logs' + buildQuery(params),
        ),
      health: () => get<PartsHealthOverview>('/admin/parts-accessories/health'),
    },
  },

  insurances: {
    overview: () => get<InsuranceFleetOverview>('/insurances/overview'),
    vehicleInsurance: (vehicleId: string) => get<InsuranceVehicleDetail>(`/insurances/vehicles/${vehicleId}`),
    partners: () => get<InsurancePartnerSummary[]>('/insurances/partners'),
    submitInquiry: (data: InsuranceInquirySubmission) =>
      post<InsuranceInquiryResult>('/insurances/inquiries', data),
    inquiries: (params?: Record<string, string>) =>
      get<{ rows: InsuranceInquiryRow[]; total: number; page: number; pageSize: number }>(
        '/insurances/inquiries' + buildQuery(params),
      ),
    inquiry: (id: string) => get<InsuranceInquiryRow>(`/insurances/inquiries/${id}`),
    liveSharing: (params?: Record<string, string>) =>
      get<InsuranceLiveSharingEntry[]>('/insurances/live-sharing' + buildQuery(params)),
    updateLiveSharing: (id: string, data: any) => patch<any>(`/insurances/live-sharing/${id}`, data),
    missingDocs: () => get<InsuranceMissingDocVehicle[]>('/insurances/documents-missing'),
    disclosure: (insurerKey?: string, inquiryType?: string) => {
      const q: Record<string, string | undefined> = { insurerKey, inquiryType };
      return get<InsuranceDisclosureTemplate | null>('/insurances/disclosure' + buildQuery(q));
    },
    admin: {
      partners: () => get<any[]>('/admin/insurances/partners'),
      createPartner: (data: any) => post<any>('/admin/insurances/partners', data),
      updatePartner: (id: string, data: any) => patch<any>(`/admin/insurances/partners/${id}`, data),
      testPartner: (id: string) => post<InsuranceConnectionTestResult>(`/admin/insurances/partners/${id}/test`, {}),
      contacts: (partnerId?: string) =>
        get<InsurancePartnerContactEntry[]>('/admin/insurances/partner-contacts' + buildQuery({ partnerId })),
      createContact: (data: any) => post<InsurancePartnerContactEntry>('/admin/insurances/partner-contacts', data),
      updateContact: (id: string, data: any) => patch<any>(`/admin/insurances/partner-contacts/${id}`, data),
      disclosureTemplates: (params?: Record<string, string>) =>
        get<InsuranceDisclosureTemplate[]>('/admin/insurances/disclosure-templates' + buildQuery(params)),
      createDisclosureTemplate: (data: any) =>
        post<InsuranceDisclosureTemplate>('/admin/insurances/disclosure-templates', data),
      updateDisclosureTemplate: (id: string, data: any) =>
        patch<InsuranceDisclosureTemplate>(`/admin/insurances/disclosure-templates/${id}`, data),
      inquiryTemplates: (params?: Record<string, string>) =>
        get<InsuranceInquiryTemplateEntry[]>('/admin/insurances/inquiry-templates' + buildQuery(params)),
      createInquiryTemplate: (data: any) =>
        post<InsuranceInquiryTemplateEntry>('/admin/insurances/inquiry-templates', data),
      updateInquiryTemplate: (id: string, data: any) =>
        patch<InsuranceInquiryTemplateEntry>(`/admin/insurances/inquiry-templates/${id}`, data),
      inquiries: (params?: Record<string, string>) =>
        get<{ rows: InsuranceInquiryRow[]; total: number; page: number; pageSize: number }>(
          '/admin/insurances/inquiries' + buildQuery(params),
        ),
      authorizationLogs: (params?: Record<string, string>) =>
        get<{ rows: InsuranceAuthorizationLogEntry[]; total: number; page: number; pageSize: number }>(
          '/admin/insurances/authorization-logs' + buildQuery(params),
        ),
      health: () => get<InsuranceHealthOverview>('/admin/insurances/health'),
    },
  },

  voiceAssistant: {
    get: (orgId: string) => get<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant`),
    update: (orgId: string, data: VoiceAssistantUpdatePayload) =>
      patch<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant`, data),
    activate: (orgId: string) =>
      post<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant/activate`, {}),
    deactivate: (orgId: string) =>
      post<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant/deactivate`, {}),
    readiness: (orgId: string) =>
      get<VoiceAssistantReadiness>(`/organizations/${orgId}/voice-assistant/readiness`),
    voices: (_orgId: string) =>
      get<VoiceOption[]>(`/organizations/${_orgId}/voice-assistant/voices`),
    testSession: (orgId: string) =>
      post<VoiceAssistantTestSession>(`/organizations/${orgId}/voice-assistant/test-session`, {}),
    analytics: (orgId: string) =>
      get<VoiceAssistantAnalytics>(`/organizations/${orgId}/voice-assistant/analytics`),
    syncConversations: (orgId: string) =>
      post<VoiceSyncConversationsResult>(
        `/organizations/${orgId}/voice-assistant/conversations/sync`,
        {},
      ),
    phoneNumbers: (orgId: string) =>
      get<VoiceProviderPhoneNumber[]>(`/organizations/${orgId}/voice-assistant/phone-numbers`),
    assignPhoneNumber: (orgId: string, phoneNumberId: string) =>
      post<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant/phone-number/assign`, {
        phoneNumberId,
      }),
    unassignPhoneNumber: (orgId: string) =>
      post<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant/phone-number/unassign`, {}),
    refreshTelephony: (orgId: string) =>
      post<VoiceTelephonyRefreshResult>(
        `/organizations/${orgId}/voice-assistant/telephony/refresh`,
        {},
      ),
    updateTelephonySettings: (orgId: string, payload: VoiceTelephonySettingsPayload) =>
      patch<VoiceAssistantData>(
        `/organizations/${orgId}/voice-assistant/telephony-settings`,
        payload,
      ),

    billing: {
      plans: (orgId: string) =>
        get<VoicePlanCatalogEntry[]>(`/organizations/${orgId}/voice-assistant/billing/plans`),
      subscription: (orgId: string) =>
        get<VoiceSubscriptionResponse>(`/organizations/${orgId}/voice-assistant/billing/subscription`),
      selectPlan: (orgId: string, planCode: VoicePlanCode) =>
        put<VoiceSubscriptionResponse>(`/organizations/${orgId}/voice-assistant/billing/subscription`, {
          planCode,
        }),
      usage: (orgId: string) =>
        get<VoiceUsageSummary>(`/organizations/${orgId}/voice-assistant/billing/usage`),
      remainingMinutes: (orgId: string) =>
        get<VoiceRemainingMinutes>(`/organizations/${orgId}/voice-assistant/billing/remaining-minutes`),
      forecast: (orgId: string) =>
        get<VoiceUsageForecast>(`/organizations/${orgId}/voice-assistant/billing/forecast`),
    },

    protection: {
      status: (orgId: string) =>
        get<VoiceProtectionStatus>(`/organizations/${orgId}/voice-assistant/protection/status`),
      updateBudgetPolicy: (orgId: string, payload: VoiceBudgetPolicyUpdate) =>
        patch<VoiceBudgetPolicy>(`/organizations/${orgId}/voice-assistant/protection/budget-policy`, payload),
    },

    admin: {
      overview: () => get<VoiceAssistantAdminOverview>('/admin/voice-assistant/overview'),
      orgDetail: (orgId: string) =>
        get<VoiceAssistantAdminOrgDetail>(`/admin/voice-assistant/organizations/${orgId}`),
      syncOrganization: (orgId: string) =>
        post<VoiceSyncConversationsResult>(`/admin/voice-assistant/organizations/${orgId}/sync`, {}),
      billing: {
        plans: () => get<VoicePlanCatalogEntry[]>('/admin/voice-assistant/billing/plans'),
        orgBilling: (orgId: string) =>
          get<VoiceMasterAdminOrgBilling>(`/admin/voice-assistant/billing/organizations/${orgId}`),
      },
      controlPlane: {
        platformStatus: () =>
          get<VoiceControlPlanePlatformStatus>('/admin/voice-assistant/control-plane/platform-status'),
        organizations: () =>
          get<VoiceControlPlaneOrganizationsResponse>('/admin/voice-assistant/control-plane/organizations'),
        organizationWorkspace: (orgId: string) =>
          get<VoiceControlPlaneOrgWorkspace>(
            `/admin/voice-assistant/control-plane/organizations/${orgId}/workspace`,
          ),
        phoneNumbers: () =>
          get<VoiceControlPlanePhoneNumberRow[]>('/admin/voice-assistant/control-plane/phone-numbers'),
        webhookEvents: (params?: { organizationId?: string; status?: string; limit?: number; offset?: number }) =>
          get<VoiceControlPlaneWebhookEventsResponse>(
            `/admin/voice-assistant/control-plane/webhook-events${buildQuery(params)}`,
          ),
        auditEvents: (params?: { organizationId?: string; limit?: number }) =>
          get<VoiceControlPlaneAuditEventsResponse>(
            `/admin/voice-assistant/control-plane/audit-events${buildQuery(params)}`,
          ),
        suspendOrganization: (
          orgId: string,
          body: { reason: string; confirm: boolean },
          idempotencyKey?: string,
        ) =>
          request<{ suspended: boolean; subscriptionId: string }>(
            `/admin/voice-assistant/control-plane/organizations/${orgId}/suspend`,
            {
              method: 'POST',
              body: JSON.stringify(body),
              headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
            },
          ),
        replayWebhookEvent: (
          eventId: string,
          body: { reason: string; confirm: boolean },
          idempotencyKey?: string,
        ) =>
          request<Record<string, unknown>>(
            `/admin/voice-assistant/control-plane/webhook-events/${eventId}/replay`,
            {
              method: 'POST',
              body: JSON.stringify(body),
              headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
            },
          ),
        deployAgent: (
          orgId: string,
          body: { confirm?: boolean },
          idempotencyKey?: string,
        ) =>
          request<Record<string, unknown>>(
            `/admin/voice-assistant/control-plane/organizations/${orgId}/agent-deployment/deploy`,
            {
              method: 'POST',
              body: JSON.stringify(body),
              headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
            },
          ),
        rollbackAgent: (orgId: string, body: { confirm?: boolean }) =>
          request<Record<string, unknown>>(
            `/admin/voice-assistant/control-plane/organizations/${orgId}/agent-deployment/rollback`,
            { method: 'POST', body: JSON.stringify(body) },
          ),
      },
      provisioning: {
        twilioPreview: (orgId: string, body: { numberType?: string }) =>
          post<Record<string, unknown>>(
            `/admin/voice-assistant/organizations/${orgId}/twilio/provisioning/preview`,
            body,
          ),
        twilioProvisionSubaccount: (
          orgId: string,
          body: { friendlyName?: string; confirm?: boolean; dryRun?: boolean },
          idempotencyKey: string,
        ) =>
          request<Record<string, unknown>>(
            `/admin/voice-assistant/organizations/${orgId}/twilio/subaccount/provision`,
            {
              method: 'POST',
              body: JSON.stringify(body),
              headers: { 'Idempotency-Key': idempotencyKey },
            },
          ),
        elevenLabsImport: (
          orgId: string,
          phoneNumberId: string,
          body: { confirm?: boolean },
          idempotencyKey: string,
        ) =>
          request<Record<string, unknown>>(
            `/admin/voice-assistant/organizations/${orgId}/elevenlabs/phone-numbers/${phoneNumberId}/import-and-assign`,
            {
              method: 'POST',
              body: JSON.stringify(body),
              headers: { 'Idempotency-Key': idempotencyKey },
            },
          ),
      },
    },
  },

  highMobility: {
    // Eligibility
    checkEligibility: (vin: string, brand: string) =>
      post<HmEligibilityResultDto>('/admin/high-mobility/eligibility/check', { vin, brand }),
    getEligibility: (vin: string) =>
      get<HmEligibilityResultDto | null>(`/admin/high-mobility/eligibility/${vin}`),

    // Vehicle management
    listVehicles: (params?: {
      packageType?: HmPackageType;
      clearanceStatus?: HmClearanceStatus;
      sourceMode?: HmSourceMode;
      brand?: string;
      eligibilityStatus?: HmEligibilityStatus;
    }) => get<HmVehicleListDto>('/admin/high-mobility/vehicles' + buildQuery(params)),
    getVehicle: (id: string) => get<HmVehicleDto>(`/admin/high-mobility/vehicles/${id}`),
    createVehicle: (data: {
      vin: string;
      brand: string;
      packageType: HmPackageType;
      sourceMode?: HmSourceMode;
      organizationId?: string;
    }) => post<HmVehicleDto>('/admin/high-mobility/vehicles', data),
    refreshStatus: (id: string) =>
      post<HmVehicleDto>(`/admin/high-mobility/vehicles/${id}/refresh-status`, {}),
    removeVehicle: (id: string) =>
      del<void>(`/admin/high-mobility/vehicles/${id}`),
    fetchHealth: (id: string) =>
      post<any>(`/admin/high-mobility/vehicles/${id}/fetch-health`, {}),
    linkToVehicle: (hmVehicleId: string, synqdriveVehicleId: string) =>
      post<{ success: boolean; message: string }>(
        `/admin/high-mobility/vehicles/${hmVehicleId}/link-to-vehicle`,
        { synqdriveVehicleId },
      ),

    // Status history
    statusHistory: (vehicleId: string) =>
      get<HmStatusHistoryDto[]>(`/admin/high-mobility/status-history/${vehicleId}`),

    // Register flow (Phase 1)
    checkAvailability: (vin: string) =>
      get<HmAvailabilityDto>(`/vehicles/register/high-mobility-availability?vin=${encodeURIComponent(vin)}`),
    activateHealth: (vehicleId: string, hmVehicleId: string) =>
      post<{ success: boolean; message: string }>(
        `/vehicles/${vehicleId}/activate-high-mobility-health`,
        { hmVehicleId },
      ),

    // Phase 2: HM_ONLY registration
    createHmOnlyVehicle: (hmVehicleId: string, data: {
      organizationId: string;
      vehicleName?: string;
      licensePlate?: string;
      notes?: string;
      mileageKm?: number;
      fuelType?: string;
    }) => post<{ success: boolean; synqdriveVehicleId: string; vin: string; message: string }>(
      `/admin/high-mobility/vehicles/${hmVehicleId}/create-hm-only-vehicle`,
      data,
    ),
    getHmOnlyCandidates: (vin?: string) =>
      get<any[]>(`/admin/high-mobility/candidates/hm-only${vin ? `?vin=${encodeURIComponent(vin)}` : ''}`),

    // Phase 2: Full Telemetry link
    linkFullTelemetry: (hmVehicleId: string, synqdriveVehicleId: string) =>
      post<{ success: boolean; message: string }>(
        `/admin/high-mobility/vehicles/${hmVehicleId}/link-full-telemetry`,
        { synqdriveVehicleId },
      ),

    // Phase 2: Streaming readiness
    getStreamingReadiness: (hmVehicleId: string) =>
      get<HmStreamingReadinessDto>(`/admin/high-mobility/vehicles/${hmVehicleId}/streaming-readiness`),

    // Phase 2: MQTT consumer status + test
    getConsumerStatus: () =>
      get<HmMqttConsumerStatusDto>('/admin/high-mobility/stream/consumer-status'),
    testMqttConnection: () =>
      post<{ success: boolean; message: string }>('/admin/high-mobility/stream/test-connection', {}),

    // Phase 2: Stream logs
    getStreamLogs: (params?: {
      limit?: number;
      offset?: number;
      hmVehicleId?: string;
      vin?: string;
      ingestStatus?: string;
    }) => get<{ data: HmStreamSyncLogDto[]; total: number }>(
      '/admin/high-mobility/stream/logs' + buildQuery(params),
    ),
    getStreamLogById: (id: string) =>
      get<any>(`/admin/high-mobility/stream/logs/${id}`),

    // Phase 2: HM_ONLY via register endpoint
    registerHmOnly: (data: {
      hmVehicleId: string;
      organizationId: string;
      vehicleName?: string;
      licensePlate?: string;
      notes?: string;
    }) => post<{ success: boolean; synqdriveVehicleId: string; vin: string; message: string }>(
      '/vehicles/register/hm-only',
      data,
    ),

    // HM Telemetry-APP candidates (APPROVED FULL_TELEMETRY vehicles awaiting registration)
    listTelemetryAppCandidates: () =>
      get<HmVehicleDto[]>('/admin/high-mobility/telemetry-app/candidates'),

    // HM Telemetry-APP vehicle management
    listTelemetryAppVehicles: (params?: { clearanceStatus?: HmClearanceStatus }) =>
      get<HmVehicleListDto>('/admin/high-mobility/telemetry-app/vehicles' + buildQuery(params)),
    createTelemetryAppVehicle: (data: { vin: string; brand: string; organizationId?: string }) =>
      post<HmVehicleDto>('/admin/high-mobility/telemetry-app/vehicles', data),
    refreshTelemetryAppVehicleStatus: (id: string) =>
      post<HmVehicleDto>(`/admin/high-mobility/telemetry-app/vehicles/${id}/refresh-status`, {}),
    getTelemetryAppStreamingReadiness: (id: string) =>
      get<HmStreamingReadinessDto>(`/admin/high-mobility/telemetry-app/vehicles/${id}/streaming-readiness`),

    // HM app-container consumer status
    getHealthAppConsumerStatus: () =>
      get<HmMqttConsumerStatusDto>('/admin/high-mobility/health-app/stream/consumer-status'),
    getTelemetryAppConsumerStatus: () =>
      get<HmMqttConsumerStatusDto>('/admin/high-mobility/telemetry-app/stream/consumer-status'),
    testHealthAppMqttConnection: () =>
      post<{ success: boolean; message: string }>('/admin/high-mobility/health-app/stream/test-connection', {}),
    testTelemetryAppMqttConnection: () =>
      post<{ success: boolean; message: string }>('/admin/high-mobility/telemetry-app/stream/test-connection', {}),

    // System readiness
    getReadiness: () =>
      get<{
        healthApp: { oauthReady: boolean; mqttReady: boolean; mqttConnectionState: string };
        telemetryApp: { oauthReady: boolean; mqttReady: boolean; mqttConnectionState: string };
      }>('/admin/high-mobility/readiness'),

    // Per-app MQTT diagnostic endpoints (via /integrations/ prefix)
    getHealthAppMqttStatus: () =>
      get<{
        appContainer: string; mqttEnabled: boolean; oauthEnabled: boolean;
        connectionState: HmMqttConnectionState; consumerDbState: any;
        config: { host: string | null; port: number | null; topic: string | null; clientId: string | null; consumerGroup: string | null };
      }>('/integrations/hm-health-app/mqtt/status'),
    getTelemetryAppMqttStatus: () =>
      get<{
        appContainer: string; mqttEnabled: boolean; oauthEnabled: boolean;
        connectionState: HmMqttConnectionState; consumerDbState: any;
        config: { host: string | null; port: number | null; topic: string | null; clientId: string | null; consumerGroup: string | null };
      }>('/integrations/hm-telemetry-app/mqtt/status'),
    getHealthAppStreamLogs: (params?: { limit?: number; offset?: number; vin?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.vin) q.set('vin', params.vin);
      if (params?.status) q.set('status', params.status);
      return get<{ data: HmStreamSyncLogDto[]; total: number }>(`/integrations/hm-health-app/stream/logs?${q}`);
    },
    getTelemetryAppStreamLogs: (params?: { limit?: number; offset?: number; vin?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.vin) q.set('vin', params.vin);
      if (params?.status) q.set('status', params.status);
      return get<{ data: HmStreamSyncLogDto[]; total: number }>(`/integrations/hm-telemetry-app/stream/logs?${q}`);
    },
    getHmDualReadiness: () =>
      get<{
        healthApp: { appContainer: string; oauthReady: boolean; mqttReady: boolean; certConfigured: boolean };
        telemetryApp: { appContainer: string; oauthReady: boolean; mqttReady: boolean; certConfigured: boolean };
      }>('/integrations/hm/readiness'),
  },
  // V4.6.77 High Mobility Compatibility Matrix — Master-Admin internal
  // compatibility intelligence (brand/model/model-year → app suitability +
  // signal coverage + onboarding mode). Powers HighMobilityCompatibilityView
  // and is designed to be reusable later by the landing-page compatibility
  // checker and onboarding assistant.
  hmCompatibility: {
    listBrands: () =>
      get<{ brands: HmCompatibilityBrandOption[] }>(
        '/admin/high-mobility/compatibility/brands',
      ),
    listModels: (brand: string) =>
      get<{ models: HmCompatibilityModelOption[] }>(
        `/admin/high-mobility/compatibility/models?brand=${encodeURIComponent(brand)}`,
      ),
    check: (brand: string, model: string, year?: number | null) => {
      const params = new URLSearchParams();
      params.set('brand', brand);
      params.set('model', model);
      if (year != null && Number.isFinite(year)) {
        params.set('year', String(year));
      }
      return get<HmCompatibilityCheckResponse>(
        `/admin/high-mobility/compatibility/check?${params.toString()}`,
      );
    },
  },
};

/** Tire wear analysis response (V2 — includes explainability). */
export interface TireWearAnalysis {
  frontLeftMm: number;
  frontRightMm: number;
  rearLeftMm: number;
  rearRightMm: number;
  frontPercent: number;
  rearPercent: number;
  overallPercent: number;
  estimatedRemainingKm: number;
  referenceNewTreadFront?: number;
  referenceNewTreadRear?: number;
  operationalReplacementMm?: number;
  factors: {
    axleFactorFront: number;
    axleFactorRear: number;
    usageFactor: number;
    behaviorFactor: number;
    temperatureFactor: number;
    pressureFactorFront?: number;
    pressureFactorRear?: number;
    loadFactor?: number;
    seasonMismatchFactor?: number;
    interactionPenaltyFront?: number;
    interactionPenaltyRear?: number;
    regenBrakingFactorFront: number;
    regenBrakingFactorRear: number;
    kFactorFront: number;
    kFactorRear: number;
    isStaggered: boolean;
    drivingImpactAvailable: boolean;
    tireArchetype?: string;
    tireSpecMatched?: boolean;
  };
  explainability?: {
    currentTreadSource: string;
    referenceNewTreadSource: string;
    replacementThresholdSource: string;
    tireSpecConfidence: number;
    tireArchetype: string;
    topWearDrivers: string[];
    pressureImpact: string;
    behaviorImpact: string;
    temperatureImpact: string;
    loadImpact: string;
    seasonMismatchImpact: string;
    possibleCauseHints: string[];
  };
  effectiveWearRateKmPerMm: { front: number; rear: number };
  wearReadModel?: 'v2' | 'v3';
  wearV3?: TireHealthV3CustomerReadModel | null;
}

export interface TireAlert {
  type: string;
  /** Canonical, stable alert code consumers can switch on (see backend tire-status.ts). */
  code?: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  position?: string;
  value?: number;
  reasonCode?: string;
  displayMode?: TireDisplayMode;
  dedupeKey?: string;
}

export type TireActionState =
  | 'OBSERVE'
  | 'CHECK_SOON'
  | 'PLAN_SERVICE'
  | 'REPLACE';

export type TirePressureFreshness =
  | 'fresh'
  | 'aging'
  | 'stale'
  | 'no_data';

export interface TirePressureWheelReading {
  value: number | null;
  normalizedUnit: 'BAR';
  sourceProvider: 'DIMO' | 'HIGH_MOBILITY' | null;
  sourceTimestamp: string | null;
  freshness: TirePressureFreshness;
  statusToken: string | null;
  statusIssue: boolean;
}

export interface TirePressureCoverage {
  wheelsAvailable: number;
  wheelsFresh: number;
  wheelsUsableForWear: number;
  coveragePercent: number;
  periodStart: string | null;
  periodEnd: string | null;
  signalSpanMinutes: number | null;
  continuousExposureEligible: boolean;
  minWheelsRequired: number;
  meetsWearThreshold: boolean;
}

export interface TirePressureWearEligibility {
  eligible: boolean;
  reasons: string[];
  confidencePenalty: number;
  measurementHint: string | null;
}

export type TirePressureSpecSource =
  | 'VEHICLE_MANUFACTURER'
  | 'DOOR_PLACARD'
  | 'OWNER_MANUAL'
  | 'WORKSHOP'
  | 'USER_CONFIRMED'
  | 'AI_ESTIMATED'
  | 'UNKNOWN';

export interface RecommendedTirePressureSpec {
  recommendedPressureFrontBar: number | null;
  recommendedPressureRearBar: number | null;
  recommendedPressureLoadedFrontBar: number | null;
  recommendedPressureLoadedRearBar: number | null;
  pressureSpecSource: TirePressureSpecSource;
  pressureSpecConfirmedAt: string | null;
  pressureSpecConfidence: number;
  wearFactorEligible: boolean;
  pressureSpecMissingLabel: string | null;
}

export interface TirePressureContext {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
  wheels: {
    frontLeft: TirePressureWheelReading;
    frontRight: TirePressureWheelReading;
    rearLeft: TirePressureWheelReading;
    rearRight: TirePressureWheelReading;
  };
  normalizedUnit: 'BAR';
  sourceType: 'DIMO' | 'HIGH_MOBILITY' | 'MIXED' | 'NONE';
  overallFreshness: TirePressureFreshness;
  coverage: TirePressureCoverage;
  tpmsWarning: boolean | null;
  tpmsWarningSource: 'DIMO' | 'HIGH_MOBILITY' | 'MIXED' | null;
  recommendedPressure: RecommendedTirePressureSpec;
  pressureSpecMissingLabel: string | null;
  qualityWarnings: string[];
  wearEligibility: TirePressureWearEligibility;
  overallStatus: 'OK' | 'ISSUE' | 'STALE' | 'UNKNOWN';
  /** @deprecated use sourceType */
  source: 'DIMO' | 'HIGH_MOBILITY' | 'MIXED' | 'NONE';
  dimoFreshness: TirePressureFreshness;
  hmFreshness: TirePressureFreshness;
  /** @deprecated use qualityWarnings */
  warningHints: string[];
}

export type TireCanonicalStatus = 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type TireDisplayMode = 'MEASURED' | 'ESTIMATED' | 'UNKNOWN';
export type TireConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type TireUiStatus =
  | 'GOOD'
  | 'WATCH'
  | 'WARNING'
  | 'CRITICAL'
  | 'UNKNOWN'
  | 'MEASUREMENT_REQUIRED'
  | 'REVIEW_REQUIRED'
  | 'LIMITED_DATA';

export type TireTreadProvenance =
  | 'MEASURED'
  | 'ESTIMATED'
  | 'DEFAULT_ASSUMPTION'
  | 'MODEL'
  | 'DOCUMENTED'
  | 'UNKNOWN';

export type TireStructuredActionCode =
  | 'MEASURE_TREAD'
  | 'CAPTURE_ODOMETER_ANCHOR'
  | 'CONFIRM_TIRE_SPEC'
  | 'SET_RECOMMENDED_PRESSURE'
  | 'CHECK_PRESSURE'
  | 'REPLACE_TIRES'
  | 'REVIEW_ROTATION';

export interface TireTreadEvidenceLine {
  position: string;
  axle: 'front' | 'rear';
  valueMm: number | null;
  provenance: TireTreadProvenance;
  sourceCode: string | null;
  sourceLabelDe: string;
  sourceLabelEn: string;
  measuredAt: string | null;
  confidence: TireConfidenceLevel;
  isDefaultAssumption: boolean;
  displayLabelDe: string;
  displayLabelEn: string;
}

export interface TireRemainingKmPresentation {
  reliable: boolean;
  displayDe: string;
  displayEn: string;
  exactKm: number | null;
  bandMinKm: number | null;
  bandMaxKm: number | null;
  reasonDe: string | null;
  reasonEn: string | null;
}

export interface TireStructuredAction {
  code: TireStructuredActionCode;
  labelDe: string;
  labelEn: string;
  priority: number;
}

export interface TireEvidencePresentation {
  uiStatus: TireUiStatus;
  uiStatusLabelDe: string;
  uiStatusLabelEn: string;
  treadLines: TireTreadEvidenceLine[];
  lowestTread: TireTreadEvidenceLine | null;
  remainingKm: TireRemainingKmPresentation;
  lastTreadMeasurementAt: string | null;
  lastPressureValueBar: number | null;
  lastPressureSource: string | null;
  pressureFreshness: string;
  modelVersion: string;
  modelCalculatedAt: string | null;
  tireSpecSource: string | null;
  tireSpecSourceLabelDe: string;
  tireSpecSourceLabelEn: string;
  structuredActions: TireStructuredAction[];
  defaultAssumptionWarningDe: string | null;
  defaultAssumptionWarningEn: string | null;
}

export interface TireDimoContextResponse {
  asOf: string;
  ambient: {
    usable: boolean;
    weightedAvgTempC: number | null;
    seasonBand: 'COLD' | 'MILD' | 'WARM' | null;
    stale: boolean;
    pressureContextHintEn: string | null;
  };
  odometer: {
    usable: boolean;
    valueKm: number | null;
    source: 'DIMO' | 'HIGH_MOBILITY' | 'VEHICLE_LATEST_STATE' | null;
    plausibilityOnly: boolean;
  };
  tpms: {
    architecturePrepared: boolean;
    usable: boolean;
    signalPresent: boolean;
    warningActive: boolean | null;
  };
  blockedWearDerivations: string[];
}

export interface TireHealthV3WheelReadModel {
  position: string;
  treadDepthMm: { lo: number; hi: number } | null;
  pointEstimateTreadMm: number | null;
  treadEvidenceClass: string;
  remainingKm: { lo: number; hi: number } | null;
  replacementThresholdMm: number;
  evidenceLevel: string;
  uncertaintyFlags: string[];
  verificationStatus: string;
  lastAcceptedMeasurementAt: string | null;
  kmSinceAcceptedMeasurement: number | null;
  nextDueOdometerKm: number | null;
  mountPeriodQualityFlags: string[];
}

export interface TireHealthV3CustomerReadModel {
  modelVersion: string;
  computedAt: string;
  inputFingerprint: string;
  rated: boolean;
  setupFlags: string[];
  verificationStatus: string;
  verificationQualityFlags: string[];
  wheels: TireHealthV3WheelReadModel[];
  lowestTreadPosition: string | null;
  lowestTreadMm: { lo: number; hi: number } | null;
  insufficientEvidence: boolean;
}

export interface TireHealthSummaryResponse {
  overallPercent: number;
  overallRemainingKm: number;
  healthStatus: string;
  confidenceScore: number;
  confidenceLabel: string;
  worstTirePosition: string | null;
  worstTirePercent: number | null;
  activeSetupName: string | null;
  activeSetupId: string | null;
  tireSeason: string | null;
  installedAt: string | null;
  totalKmOnSet: number;
  wearRateMmPer1000km: number | null;
  alerts: TireAlert[];
  tireCondition?: string;
  tireArchetype?: string | null;
  tireSpecMatched?: boolean;
  tireSpecConfidence?: number | null;
  dataCompletenessConfidence?: number | null;
  modelConfidence?: number | null;
  referenceNewTreadSource?: string | null;
  replacementThresholdSource?: string | null;
  currentTreadSource?: string | null;
  currentTreadValue?: number | null;
  currentTreadEvidenceSource?: string | null;
  isMeasured?: boolean;
  isEstimated?: boolean;
  isDefaultAssumption?: boolean;
  lastActualMeasurementAt?: string | null;
  baselineSource?: string | null;
  predictionCapable?: boolean;
  odometerAnchorStatus?: string | null;
  odometerAnchorConfidence?: number | null;
  installedOdometerSource?: string | null;
  hasActiveSet?: boolean;
  hasSetups?: boolean;
  hasMeasurements?: boolean;
  evidencePresentation?: TireEvidencePresentation;
  dimoContext?: TireDimoContextResponse;
  operationalReplacementMm?: number | null;
  topWearDrivers?: string[];
  actionState?: TireActionState;
  actionReasons?: string[];
  measurementState?: 'measured' | 'estimated' | 'mixed';
  dataQualityWarnings?: string[];
  pressureContext?: TirePressureContext;
  recommendedPressure?: RecommendedTirePressureSpec;
  pressureSpecMissingLabel?: string | null;
  latestMeasurementAt?: string | null;
  // ── Canonical read model (single source of truth, mm-based) ────────────────
  overallStatus?: TireCanonicalStatus;
  displayMode?: TireDisplayMode;
  confidence?: TireConfidenceLevel;
  lowestTreadMm?: number | null;
  lowestTreadPosition?: string | null;
  measuredTreadMm?: number | null;
  estimatedTreadMm?: number | null;
  displayTreadMm?: number | null;
  lastMeasurementAt?: string | null;
  measurementAgeDays?: number | null;
  estimatedRemainingKm?: number | null;
  pressureStatus?: TireCanonicalStatus;
  seasonStatus?: TireCanonicalStatus;
  unevenWearStatus?: TireCanonicalStatus;
  recommendations?: string[];
  /** Which wear read model backs customer fields when authoritative cutover is on. */
  wearReadModel?: 'v2' | 'v3';
  /** Versioned V3 customer read (mm intervals, verification, evidence classes). */
  wearV3?: TireHealthV3CustomerReadModel;
}

export interface TireWheelEstimate {
  position: string;
  treadMm: number;
  wearPercent: number;
  remainingKm: number;
  healthStatus: string;
  initialTreadMm: number;
  lastMeasuredMm: number | null;
  lastMeasuredAt: string | null;
  confidenceScore: number;
  confidenceLabel: string;
  brand: string | null;
  tireModel: string | null;
  size: string | null;
  totalKm: number;
  cityKm: number;
  highwayKm: number;
  ruralKm: number;
}

export interface TireHealthDetailResponse {
  summary: TireHealthSummaryResponse;
  wearV3?: TireHealthV3CustomerReadModel;
  wheels: TireWheelEstimate[];
  usageSplit: { city: number; highway: number; rural: number };
  factors: {
    axleFactorFront: number;
    axleFactorRear: number;
    usageFactor: number;
    behaviorFactor: number;
    temperatureFactor: number;
    pressureFactorFront?: number;
    pressureFactorRear?: number;
    loadFactor?: number;
    seasonMismatchFactor?: number;
    interactionPenaltyFront?: number;
    interactionPenaltyRear?: number;
    regenBrakingFactorFront: number;
    regenBrakingFactorRear: number;
    kFactorFront: number;
    kFactorRear: number;
    isStaggered: boolean;
    staggeredLifeAdjustmentFront: number;
    staggeredLifeAdjustmentRear: number;
    regressionActive: boolean;
    regressionConfidence: number;
    calibrationCount: number;
    driveType: string | null;
    drivingImpactAvailable: boolean;
    tireArchetype?: string;
    tireSpecMatched?: boolean;
  };
  explainability?: {
    currentTreadSource: string;
    referenceNewTreadSource: string;
    replacementThresholdSource: string;
    tireSpecConfidence: number;
    tireArchetype: string;
    topWearDrivers: string[];
    pressureImpact: string;
    behaviorImpact: string;
    temperatureImpact: string;
    loadImpact: string;
    seasonMismatchImpact: string;
    possibleCauseHints: string[];
  };
  effectiveWearRate: { front: number; rear: number };
  rotationHistory: any[];
  measurements: any[];
  alerts: TireAlert[];
  setupSpecConflicts?: Array<{
    code: 'SEASON_MISMATCH' | 'AXLE_IDENTITY_MISMATCH';
    message: string;
    setupValue: string | null;
    specValue: string | null;
    precedence: 'setup_manual' | 'spec_user_confirmed';
  }>;
}

export type SohPublicationState = 'INITIAL_CALIBRATION' | 'STABILIZING' | 'STABLE';

export interface BatteryCalibrationProgress {
  measurementPath: 'rest_and_crank' | 'rest_only';
  daysSinceFirstMeasurement: number;
  minimumDaysForStabilizing: number;
  daysRemainingForStabilizing: number;
  qualifiedEventCount: number;
  minimumQualifiedEventsForStabilizing: number;
  restObservationCount: number;
  minimumRestObservationsForStabilizing: number;
  crankObservationCount: number;
  minimumCrankObservationsForStabilizing: number;
  blockers: Array<'days' | 'qualified_events' | 'rest_observations' | 'crank_observations'>;
  lastMeasurementAgeMs: number | null;
}

export type BatteryRuntimeStatus =
  | 'ready'
  | 'calibrating'
  | 'stabilizing'
  | 'no_recent_data'
  | 'estimate_unavailable'
  | 'unsupported';

export type BatteryRuntimeCondition =
  | 'good'
  | 'watch'
  | 'attention'
  | 'calibrating'
  | 'unknown';

// GOOD/WATCH/WARNING/CRITICAL classification scale used by the canonical
// battery service (see backend battery-status.ts). LV uses it for the
// "Estimated Battery Health" 3-bar indicator and the resting-voltage status;
// HV uses it for the real SOH bands.
export type BatteryHealthStatus = 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type BatteryRestingVoltageStatus = BatteryHealthStatus | 'UNSUPPORTED';
export type BatteryAggregateStatus = BatteryHealthStatus | 'UNSUPPORTED';
export type HvSohSource = 'PROVIDER' | 'CAPACITY_ESTIMATE' | 'DOCUMENT' | 'MANUAL';

export type BatteryDataQualityStatus =
  | 'VERIFIED'
  | 'ESTIMATED'
  | 'PROXY'
  | 'EXPERIMENTAL'
  | 'STALE'
  | 'MISSED'
  | 'UNAVAILABLE'
  | 'UNSUPPORTED'
  | 'LEGACY_UNVERIFIED';

export interface BatteryDataQualityPresentation {
  status: BatteryDataQualityStatus;
  labelKey: string;
  decisionCapable: boolean;
  observedAt: string | null;
}

export interface BatteryDataQualitySection {
  status: BatteryDataQualityStatus;
  labelKey: string;
  decisionCapable: boolean;
  observedAt: string | null;
  slices: {
    lvEstimatedHealth: BatteryDataQualityPresentation;
    lvRestingVoltage: BatteryDataQualityPresentation;
    lvCrank: BatteryDataQualityPresentation;
    hvSoh: BatteryDataQualityPresentation;
    hvLegacyCapacity: BatteryDataQualityPresentation;
  };
}

export interface BatteryFreshness {
  observedAt: string | null;
  ageMs: number | null;
  isFresh: boolean;
}

// LV behavioural score — never workshop SOH.
export type LvHealthScoreSemantic =
  | 'ESTIMATED_LV_HEALTH_SCORE'
  | 'LEGACY_ESTIMATED_LV_HEALTH';

export interface LvEstimatedHealthScoreRef {
  value: number | null;
  semanticType: 'ESTIMATED_LV_HEALTH_SCORE';
  label: string;
}

// LV "Estimated Battery Health" — behaviour-derived, rendered as 3 bars, never
// presented as a workshop-verified SOH percentage.
export interface LvEstimatedHealth {
  status: BatteryHealthStatus;
  diagnosticStatus?: BatteryHealthStatus;
  scorePct: number | null;
  displayMode: 'BARS';
  bars: 0 | 1 | 2 | 3;
  semanticType: 'ESTIMATED_LV_HEALTH_SCORE';
  label: string;
  confidence: string | null;
  calibrationStatus: SohPublicationState | string | null;
  decisionCapable?: boolean;
  dataQualityStatus?: BatteryDataQualityStatus;
  dataQuality?: BatteryDataQualityPresentation;
  legacyPublicationSafety?: {
    decisionCapable: boolean;
    displayMode: 'DECISION_CAPABLE' | 'LEGACY_UNVERIFIED';
    diagnosticLabelDe: string;
    reasons: string[];
  };
}

// LV resting-voltage state from battery-spec-aware thresholds.
export interface LvRestingVoltage {
  valueV: number | null;
  status: BatteryRestingVoltageStatus;
  thresholdSource: 'BATTERY_SPEC' | 'DEFAULT' | 'UNSUPPORTED';
  batteryType: string | null;
  measurementContext: string | null;
  dataQualityStatus?: BatteryDataQualityStatus;
  dataQuality?: BatteryDataQualityPresentation;
}

export interface LvStartProxyMeasurementDiagnostic {
  messart: string;
  measurementType: string;
  classification: 'PROXY' | 'EXPERIMENTAL';
  displayLabelDe: string;
  quality: string;
  dataQualityStatus: BatteryDataQualityStatus;
  numericValue: number | null;
  unit: string | null;
  observedAt: string;
  measurementAgeMs: number | null;
  offsetFromTargetMs: number | null;
  targetOffsetFromStartMs: number | null;
  medianIntervalMs: number | null;
  coverageRatio: number | null;
  dataQuality: BatteryDataQualityPresentation;
}

export interface LvStartProxyDiagnosticView {
  vehicleId: string;
  diagnosticOnly: true;
  featureEnabled: boolean;
  uiLabelDe: string;
  scoreWeightPercent: 0;
  availability: 'SUPPORTED' | 'UNSUPPORTED' | 'NOT_EVALUABLE';
  availabilityLabelDe: string;
  operationalEffect: false;
  readinessEffect: false;
  alertEligible: false;
  taskEligible: false;
  operationalStatus: 'UNKNOWN';
  latestSession: {
    id: string;
    tripId: string | null;
    startedAt: string;
    status: string;
    pointCount: number | null;
  } | null;
  measurements: LvStartProxyMeasurementDiagnostic[];
}

export interface CanonicalLvBatterySection {
  status: BatteryRuntimeStatus;
  // Aggregated LV health on the GOOD/WATCH/WARNING/CRITICAL scale.
  healthStatus?: BatteryAggregateStatus;
  condition: BatteryRuntimeCondition;
  healthPercent: number | null;
  healthPercentSemantic?: LvHealthScoreSemantic | null;
  estimatedHealthPercent: number | null;
  estimatedHealthPercentSemantic?: LvHealthScoreSemantic | null;
  estimatedHealth?: LvEstimatedHealth;
  estimatedLvHealthScore?: LvEstimatedHealthScoreRef;
  restingVoltage?: LvRestingVoltage;
  method: string | null;
  confidence: string | null;
  freshness: BatteryFreshness;
  evidenceType: string | null;
  publicationState: SohPublicationState;
  telemetry: {
    voltageV: number | null;
    voltageSource?: string | null;
    voltageObservedAt?: string | null;
    restingVoltage: number | null;
    crankingVoltage: number | null;
    chargingVoltage: number | null;
    temperatureC: number | null;
    crank?: {
      dataQualityStatus?: BatteryDataQualityStatus;
      dataQuality?: BatteryDataQualityPresentation;
      displayMode?: 'LEGACY_UNVERIFIED' | 'DECISION_CAPABLE';
      diagnosticCrankDrop?: number | null;
      measurementKind?: string;
    };
    startProxy?: LvStartProxyDiagnosticView;
  };
  calibrationProgress: BatteryCalibrationProgress;
}

export interface CanonicalHvBatterySection {
  status: BatteryRuntimeStatus;
  // Real SOH band on the GOOD/WATCH/WARNING/CRITICAL scale.
  healthStatus?: BatteryHealthStatus;
  condition: BatteryRuntimeCondition;
  healthPercent: number | null;
  // Real SOH only — provider/capacity/document/manual. No age/km fallback.
  sohPct?: number | null;
  sohSource?: HvSohSource | null;
  noFallbackSoh?: boolean;
  method: string | null;
  confidence: string | null;
  freshness: BatteryFreshness;
  evidenceType: string | null;
  publicationState: SohPublicationState;
  dataQualityStatus?: BatteryDataQualityStatus;
  dataQuality?: BatteryDataQualityPresentation;
  legacyCapacity?: {
    displayMode: 'LEGACY_UNVERIFIED' | 'DECISION_CAPABLE';
    decisionCapable: boolean;
    diagnosticEstimatedCapacityKwh: number | null;
    diagnosticSohPercent: number | null;
    dataQualityStatus?: BatteryDataQualityStatus;
    dataQuality?: BatteryDataQualityPresentation;
  };
  telemetry: {
    socPercent: number | null;
    rangeKm: number | null;
    chargingPowerKw: number | null;
    isCharging: boolean | null;
    chargingCableConnected: boolean | null;
    temperatureC: number | null;
    currentVoltageV: number | null;
    grossCapacityKwh: number | null;
    currentEnergyKwh: number | null;
    addedEnergyKwh: number | null;
    providerSohPercent: number | null;
  };
  snapshotCount: number;
  interpretation: { label: string; color: string; description: string } | null;
}

export interface BatteryCurrentTelemetrySection {
  observedAt: string | null;
  socPercent: number | null;
  rangeKm: number | null;
  chargingState: 'charging' | 'not_charging' | null;
  chargingPowerKw: number | null;
  lvVoltageV: number | null;
  genericEnergyPercent: number | null;
}

export interface CanonicalBatteryLiveValues {
  voltageV: number | null;
  restingVoltageV: number | null;
  socPercent?: number | null;
  providerSohPercent?: number | null;
}

export interface CanonicalBatteryHvReferenceCapacity {
  id: string;
  capacityKwh: number;
  capacityType: string;
  source: string;
  verificationStatus: string;
  verifiedAt: string | null;
}

export interface CanonicalBatteryHvSohAssessment {
  estimatedSohPercent: number | null;
  estimatedUsableCapacityKwh: number | null;
  sohGatePassed: boolean;
  confidence: string | null;
  maturity: string | null;
}

export interface CanonicalBatteryHvProviderSoh {
  percent: number | null;
  source: HvSohSource | null;
  decisionFresh: boolean;
  observedAt?: string | null;
}

export interface CanonicalBatteryHvChargeSession {
  sessionId: string;
  source: string;
  startAt: string;
  endAt: string | null;
  isOngoing: boolean;
}

export interface CanonicalBatteryDto {
  resolverVersion: string;
  organizationId?: string;
  vehicleId: string;
  resolvedAt: string;
  isEv: boolean;
  liveState: {
    lv: { observedAt: string | null; values: CanonicalBatteryLiveValues };
    hv?: { observedAt: string | null; values: CanonicalBatteryLiveValues };
  };
  lv: {
    assessment?: { estimatedHealthScore: number | null } | null;
    publication?: { maturity: string | null } | null;
  };
  hv?: {
    supported: boolean;
    providerSoh: CanonicalBatteryHvProviderSoh;
    referenceCapacity?: CanonicalBatteryHvReferenceCapacity | null;
    currentChargeSession?: CanonicalBatteryHvChargeSession | null;
    lastChargeSession?: CanonicalBatteryHvChargeSession | null;
    sohAssessment?: CanonicalBatteryHvSohAssessment | null;
  } | null;
  dataQuality?: {
    aggregate: BatteryDataQualityPresentation;
    errors?: Array<{ code: string; messageDe?: string }>;
  };
}

export interface BatteryHealthSummary {
  vehicleId: string;
  generatedAt: string;
  dataQuality?: BatteryDataQualitySection;
  support: {
    lv: boolean;
    hv: boolean;
  };
  lv: CanonicalLvBatterySection;
  hv: CanonicalHvBatterySection;
  currentTelemetry: BatteryCurrentTelemetrySection;
  watchpoints: string[];
  recommendations: string[];

  // Compatibility fields for existing runtime consumers.
  currentState: {
    sohPercent: number | null;
    sohPercentSemantic?: LvHealthScoreSemantic | null;
    publishedSohPct: number | null;
    publishedSohPctSemantic?: LvHealthScoreSemantic | null;
    estimatedSohPct: number | null;
    estimatedSohPctSemantic?: LvHealthScoreSemantic | null;
    estimatedLvHealthScore?: number | null;
    estimatedLvHealthScoreSemantic?: LvHealthScoreSemantic | null;
    estimatedLvHealthScoreLabel?: string | null;
    publicationState: SohPublicationState;
    maturityConfidence: string;
    voltageV: number | null;
    temperatureC: number | null;
    lastChecked: string | null;
    restingVoltage: number | null;
    crankingVoltage: number | null;
    chargingVoltage: number | null;
    calibrationProgress: BatteryCalibrationProgress;
  };
  condition: 'good' | 'watch' | 'attention' | 'calibrating';
  trendDirection: 'stable' | 'declining' | 'improving' | 'unknown';
  specs: { batteryType: string | null; batteryAmpere: number | null; batteryVolt: number | null; sourceType: string } | null;
  trend7: Array<{ date: string; soh: number | null; sohSemantic?: LvHealthScoreSemantic | null; estimatedLvHealthScore?: number | null; voltage: number | null }>;
  trend30: Array<{ date: string; soh: number | null; sohSemantic?: LvHealthScoreSemantic | null; estimatedLvHealthScore?: number | null; voltage: number | null }>;
  history: Array<{
    id: string;
    type: 'measurement' | 'service';
    date: string;
    soh?: number | null;
    sohSemantic?: LvHealthScoreSemantic | null;
    estimatedLvHealthScore?: number | null;
    voltage?: number | null;
    temperature?: number | null;
    notes?: string | null;
    workshopName?: string | null;
    odometerKm?: number | null;
  }>;
  /** Canonical resolver output — preferred read model for new consumers. */
  canonical?: CanonicalBatteryDto | null;
}

export interface BatteryEvidenceItem {
  id: string;
  observedAt: string;
  sourceType: string | null;
  valueType: string;
  semanticValueType?: LvHealthScoreSemantic | string | null;
  displayLabel?: string | null;
  value: number | null;
  unit: string | null;
  provider: string | null;
  confidence: string | null;
  quality: string | null;
  documentExtractionId: string | null;
  serviceEventId: string | null;
}

export interface BatteryHealthDetail extends BatteryHealthSummary {
  detail: {
    lv: {
      evidence: BatteryEvidenceItem[];
    };
    hv: {
      evidence: BatteryEvidenceItem[];
      chargingSessions: Array<any>;
      recentTrend: Array<any>;
    };
  };
}

export interface HvBatteryStatus {
  isEv: boolean;
  nominalCapacityKwh: number | null;
  providerNominalCapacityKwh?: number | null;
  currentSocPercent: number | null;
  estimatedRangeKm: number | null;
  sohPercent: number | null;
  rawSohPercent: number | null;
  providerReportedSohPercent?: number | null;
  publishedSohPercent: number | null;
  sohMethod: string;
  sohSourceType?: string | null;
  publicationState: SohPublicationState;
  publicationMethod: string;
  maturityConfidence: string;
  validEstimateCount: number;
  sohInterpretation: { label: string; color: string; description: string };
  estimatedCurrentCapacityKwh: number | null;
  snapshotCount: number;
  chargingSessions: Array<any>;
  recentTrend: Array<any>;
  lastRecordedAt: string | null;
  telemetry?: {
    temperatureC: number | null;
    chargingPowerKw: number | null;
    isCharging: boolean | null;
    chargingCableConnected: boolean | null;
    currentVoltageV: number | null;
    currentEnergyKwh: number | null;
    addedEnergyKwh: number | null;
  };
  providerSohObservedAt?: string | null;
  canonical?: CanonicalHvBatterySection | null;
  currentTelemetry?: BatteryCurrentTelemetrySection | null;
}

export type ServiceEventOrigin =
  | 'MANUAL'
  | 'AI_UPLOAD'
  | 'WORKSHOP_DOCUMENT'
  | 'IMPORT'
  | 'OEM';

export type ServiceEventType =
  | 'OIL_CHANGE'
  | 'TIRE_ROTATION'
  | 'BRAKE_SERVICE'
  | 'BATTERY_REPLACEMENT'
  | 'GENERAL_INSPECTION'
  | 'TUV_INSPECTION'
  | 'BOKRAFT_INSPECTION'
  | 'FULL_SERVICE'
  | 'REPAIR'
  | 'OTHER';

export interface VehicleServiceEventRecord {
  id: string;
  vehicleId: string;
  eventType: ServiceEventType;
  eventDate: string;
  odometerKm: number | null;
  notes: string | null;
  workshopName: string | null;
  costCents: number | null;
  provider: string | null;
  documentUrl: string | null;
  origin: ServiceEventOrigin;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleServiceEventInput {
  eventType: ServiceEventType;
  eventDate: string;
  odometerKm?: number;
  notes?: string;
  workshopName?: string;
  costCents?: number;
  provider?: string;
  documentUrl?: string;
  origin?: ServiceEventOrigin;
}

export interface UpdateVehicleServiceEventInput {
  eventType?: ServiceEventType;
  eventDate?: string;
  odometerKm?: number | null;
  notes?: string | null;
  workshopName?: string | null;
  costCents?: number | null;
  provider?: string | null;
  documentUrl?: string | null;
  origin?: ServiceEventOrigin;
}

export type ServiceTrackingStatus = 'TRACKED' | 'NO_TRACKING' | 'STALE';
export type ServiceComplianceSeverity = 'GOOD' | 'WARNING' | 'CRITICAL' | 'INFO';

export interface NextServiceCompliance {
  trackingStatus: ServiceTrackingStatus;
  source: 'HM_OEM' | null;
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
  lastUpdatedAt: string | null;
  serviceSourceLabel: string | null;
  severity: ServiceComplianceSeverity;
  blocksRental: boolean;
  title: string;
  description: string;
  message: string;
  hmDistanceFromOem: boolean;
  hmTimeFromOem: boolean;
  hmDerivedDueDate: string | null;
}

export interface ServiceInfoStatus {
  nextService?: NextServiceCompliance;
  hasServiceHistory?: boolean;
  hasServiceBaseline: boolean;
  serviceRemainingPercent: number | null;
  serviceRemainingKm: number | null;
  serviceRemainingMonths: number | null;
  /** Day-level precision from HM OEM signal (or derived from months). Signed — negative means overdue. */
  serviceRemainingDays: number | null;
  /** True when remainingDays < 0 OR remainingKm < 0 (either channel signals overdue). */
  serviceOverdue: boolean;
  /** Absolute days overdue. null when not overdue by time. */
  serviceOverdueDays: number | null;
  /** Absolute km overdue. null when not overdue by distance. */
  serviceOverdueKm: number | null;
  /** True when 0..7 remaining days OR 0..500 remaining km (imminent but not yet overdue). */
  serviceDueImminently: boolean;
  intervalKm: number | null;
  intervalMonths: number | null;
  lastServiceDate: string | null;
  lastServiceOdometer: number | null;
  lastServiceWorkshop: string | null;
  tuvValidTill: string | null;
  tuvRemainingMonths: number | null;
  /** Signed days until TÜV expires. Negative = lapsed. */
  tuvRemainingDays: number | null;
  tuvOverdue: boolean;
  tuvLastDate: string | null;
  bokraftValidTill: string | null;
  bokraftRemainingMonths: number | null;
  /** Signed days until BOKraft expires. Negative = lapsed. */
  bokraftRemainingDays: number | null;
  bokraftOverdue: boolean;
  bokraftLastDate: string | null;
  serviceHistory: Array<{ id: string; eventType: string; date: string; odometerKm: number | null; workshopName: string | null; notes: string | null }>;
  tuvHistory: Array<{ id: string; eventType: string; date: string; odometerKm: number | null; workshopName: string | null; notes: string | null }>;
  bokraftHistory: Array<{ id: string; eventType: string; date: string; odometerKm: number | null; workshopName: string | null; notes: string | null }>;
  /** Phase 3: set to true when HM Health is active and overrides km/months values */
  hmServiceSource?: boolean;
  /** Phase 3: ISO timestamp of last successful HM service signal fetch */
  hmLastUpdatedAt?: string | null;
  /** True when OEM streams `maintenance.distance_to_next_service` for this vehicle. */
  hmDistanceFromOem?: boolean;
  /** True when OEM streams `maintenance.time_to_next_service` for this vehicle. */
  hmTimeFromOem?: boolean;
  /** Actionable compliance task signals from ServiceComplianceService. */
  taskSignals?: ComplianceTaskSignal[];
}

export interface ComplianceTaskSignal {
  signalKey: string;
  dedupeKey: string;
  kind: string;
  title: string;
  message: string;
  actionLabel: string;
  severity: 'WARNING' | 'CRITICAL';
  suggestionOnly: boolean;
  blocksRental: boolean;
  dueDate: string | null;
  category: string;
  taskType: string;
}

export interface OilChangeStatus {
  hasBaseline: boolean;
  remainingPercent: number | null;
  intervalKm: number | null;
  intervalMonths: number | null;
  lastChangeDate: string | null;
  lastChangeOdometerKm: number | null;
  lastChangeWorkshop: string | null;
  kmSinceChange: number | null;
  monthsSinceChange: number | null;
  currentOdometerKm: number | null;
  history: Array<{
    id: string;
    date: string;
    odometerKm: number | null;
    workshopName: string | null;
    notes: string | null;
  }>;
}

/** @deprecated Legacy heuristic payload. Prefer BrakeHealthSummary/Detail. */
export interface BrakeStatus {
  hasSpecs: boolean;
  isEv: boolean;
  regenBrakingNote: string | null;
  condition: 'good' | 'watch' | 'attention';
  padWearPercent: number | null;
  brakeForceFrontPercent: number | null;
  kmSinceService: number | null;
  daysSinceService: number | null;
  lastServiceDate: string | null;
  lastServiceWorkshop: string | null;
  lastTelemetryAt: string | null;
  drivingImpact: {
    totalHarshBrakes90d: number;
    harshBrakesPer100km: number | null;
    totalKm90d: number;
    brakingBehavior: string;
  };
  specs: {
    id: string;
    frontRotorDiameter: number | null;
    frontRotorWidth: number | null;
    frontPadThickness: number | null;
    rearRotorDiameter: number | null;
    rearRotorWidth: number | null;
    rearPadThickness: number | null;
    sourceType: string | null;
  } | null;
  history: Array<{ id: string; date: string; odometerKm: number | null; workshopName: string | null; notes: string | null; costCents: number | null }>;
  watchpoints: string[];
  recommendations: string[];
  dataConfidence: 'low' | 'medium' | 'high';
}

// ── Brake Health V2 DTOs ─────────────────────────────────────────────────────

export interface BrakeAxleEstimate {
  anchorMm: number | null;
  estimatedMm: number | null;
  healthPct: number | null;
  remainingKm: number | null;
  wearRateMmPerKm: number | null;
  kFactor: number;
}

export interface BrakeAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value?: number;
}

export type BrakeStateClass = 'MEASURED' | 'ESTIMATED' | 'WARNING_ONLY' | 'NO_BASELINE';
export type BrakeServiceKindInput =
  | 'inspection_only'
  | 'pads_service'
  | 'discs_service'
  | 'brake_fluid_service'
  | 'full_brake_service';
export type BrakeServiceScopeInput =
  | 'front_pads'
  | 'rear_pads'
  | 'front_discs'
  | 'rear_discs';

export interface BrakeModeledComponents {
  frontPads: boolean;
  rearPads: boolean;
  frontDiscs: boolean;
  rearDiscs: boolean;
  hasAnyPads: boolean;
  hasAnyDiscs: boolean;
  hasAnyModeled: boolean;
}

export interface BrakeModelCoverage {
  distanceSinceAnchorKm: number | null;
  modeledDistanceKm: number | null;
  modeledTripCount: number;
  coverageRatio: number | null;
  coverageRatioRaw: number | null;
  underCoverageKm: number | null;
  overCoverageKm: number | null;
  coverageStatus: 'FULL' | 'PARTIAL' | 'ZERO' | 'OVER' | 'UNKNOWN' | null;
  hasGap: boolean;
  reconciliationRequired: boolean;
  source:
    | 'OBSERVED'
    | 'MIXED_OBSERVED_NEUTRAL_GAP'
    | 'NEUTRAL_GAP_ONLY'
    | 'INCONSISTENT'
    | 'NOT_ENOUGH_DATA';
}

export interface BrakeServiceLifecycleResult {
  serviceEventId: string;
  lifecycleApplied: boolean;
  initialized: boolean;
  status: 'initialized' | 'history_only';
  message: string;
}

// ── Canonical evidence-based brake read model (single source of truth) ───────
export type BrakeCondition = 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type BrakeDataBasis = 'MEASURED' | 'DOCUMENTED' | 'SENSOR' | 'ESTIMATED' | 'UNKNOWN';
export type BrakeConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type BrakeAlertCode =
  | 'BRAKE_PAD_WARNING'
  | 'BRAKE_PAD_CRITICAL'
  | 'BRAKE_DISC_WARNING'
  | 'BRAKE_DISC_CRITICAL'
  | 'BRAKE_SYSTEM_DTC'
  | 'BRAKE_FLUID_WARNING'
  | 'BRAKE_INSPECTION_OVERDUE'
  | 'BRAKE_HEALTH_LOW_CONFIDENCE'
  | 'BRAKE_GENERIC';

export interface BrakeCanonicalAlert {
  code: BrakeAlertCode;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  axle?: 'FRONT' | 'REAR' | 'UNKNOWN';
}

export interface BrakeAxleSummary {
  condition: BrakeCondition;
  dataBasis: BrakeDataBasis;
  confidence: BrakeConfidenceLevel;
  estimatedRemainingKmMin: number | null;
  estimatedRemainingKmMax: number | null;
}

/** @deprecated Wear-model compat only — removal planned P28. */
export interface BrakeHealthLegacy {
  padsHealthPct: number | null;
  discsHealthPct: number | null;
  padsRemainingKm: number | null;
  discsRemainingKm: number | null;
  status: string;
  remainingKm: number | null;
}

export interface BrakeHealthSummary {
  isInitialized: boolean;
  stateClass: BrakeStateClass;
  message?: string;
  actions?: { canAddBrakeService: boolean; canUseAiUpload: boolean };
  limitingComponent?:
    | 'FRONT_PADS'
    | 'REAR_PADS'
    | 'FRONT_DISCS'
    | 'REAR_DISCS'
    | 'PADS_SET'
    | 'DISCS_SET'
    | null;
  modeledComponents: BrakeModeledComponents;
  modelCoverage: BrakeModelCoverage;
  lastChangeAt?: string | null;
  lastRecalculatedAt?: string | null;
  confidence?: { score: number; label: string };
  baselineWarnings: string[];
  provenanceWarnings: string[];
  hasAlert?: boolean;
  /**
   * @deprecated Wear-model compat only — do not use for UI or decisions.
   * Prefer `overallCondition`, axle summaries, and `openAlerts`.
   */
  legacyHeuristic?: { available: boolean; note: string };

  // ── Canonical read model ─────────────────────────────────────────────────
  overallCondition: BrakeCondition;
  dataBasis: BrakeDataBasis;
  confidenceLevel: BrakeConfidenceLevel;
  frontAxle: BrakeAxleSummary;
  rearAxle: BrakeAxleSummary;
  frontAxleCondition: BrakeCondition;
  rearAxleCondition: BrakeCondition;
  frontDataBasis: BrakeDataBasis;
  rearDataBasis: BrakeDataBasis;
  frontConfidence: BrakeConfidenceLevel;
  rearConfidence: BrakeConfidenceLevel;
  estimatedFrontRemainingKmMin: number | null;
  estimatedFrontRemainingKmMax: number | null;
  estimatedRearRemainingKmMin: number | null;
  estimatedRearRemainingKmMax: number | null;
  nextInspectionRecommendedInKm: number | null;
  estimatedReplacementDueInKm: number | null;
  reasons: string[];
  recommendations: string[];
  alerts: BrakeCanonicalAlert[];
  openAlerts: BrakeCanonicalAlert[];
  lastMeasurementAt: string | null;
  lastMeasurementMileageKm: number | null;
  lastServiceAt: string | null;
  lastServiceMileageKm: number | null;
  updatedAt: string | null;
  legacy: BrakeHealthLegacy;
  componentThresholds?: BrakeComponentThreshold[];
  evidencePresentation?: BrakeEvidencePresentation;
}

export type BrakeComponentEvidenceClass =
  | 'MEASURED'
  | 'DOCUMENTED_REPLACEMENT'
  | 'SPEC_ESTIMATE'
  | 'MODEL_ESTIMATED'
  | 'UNKNOWN';

export type BrakeComponentKey = 'FRONT_PADS' | 'REAR_PADS' | 'FRONT_DISCS' | 'REAR_DISCS';

export interface BrakeComponentThreshold {
  component: BrakeComponentKey;
  warningThresholdMm: number | null;
  criticalThresholdMm: number | null;
  source: string | null;
  confirmed: boolean;
  thresholdMissing: boolean;
}

export interface BrakeRemainingKmPresentation {
  reliable: boolean;
  displayDe: string;
  displayEn: string;
  exactKm: number | null;
  bandMinKm: number | null;
  bandMaxKm: number | null;
  reasonDe: string | null;
  reasonEn: string | null;
}

export interface BrakeComponentEvidenceLine {
  component: BrakeComponentKey;
  labelDe: string;
  labelEn: string;
  condition: BrakeCondition;
  valueMm: number | null;
  valueLabelDe: string;
  valueLabelEn: string;
  evidenceClass: BrakeComponentEvidenceClass;
  evidenceClassLabelDe: string;
  evidenceClassLabelEn: string;
  sourceCode: string | null;
  sourceLabelDe: string;
  sourceLabelEn: string;
  evidenceAt: string | null;
  odometerKm: number | null;
  confidence: BrakeConfidenceLevel;
  minimumThicknessMm: number | null;
  minimumThicknessSource: string | null;
  minimumThicknessSourceLabelDe: string;
  minimumThicknessSourceLabelEn: string;
  lastMeasurementAt: string | null;
  lastMeasurementMm: number | null;
  lastInstallationAt: string | null;
  modelVersion: string | null;
  isLimiting: boolean;
  isModeled: boolean;
  remainingKm: BrakeRemainingKmPresentation;
}

export type BrakeDataQualityCode =
  | 'MISSING_BASELINE'
  | 'SPEC_UNCONFIRMED'
  | 'COVERAGE_GAP'
  | 'DISTANCE_CONFLICT'
  | 'STALE_EVIDENCE';

export interface BrakeDataQualityItem {
  code: BrakeDataQualityCode;
  labelDe: string;
  labelEn: string;
  detailDe: string | null;
  detailEn: string | null;
  active: boolean;
}

export type BrakeSafetyCode = 'ABS' | 'DTC' | 'WEAR_SENSOR' | 'IMMEDIATE_REPLACEMENT';

export interface BrakeSafetyItem {
  code: BrakeSafetyCode;
  labelDe: string;
  labelEn: string;
  active: boolean;
  detailDe: string | null;
  detailEn: string | null;
  severity: 'info' | 'warning' | 'critical' | null;
}

export type BrakeStructuredActionCode =
  | 'MEASURE_THICKNESS'
  | 'RECORD_SERVICE'
  | 'CONFIRM_REFERENCE_SPEC'
  | 'ADD_ODOMETER'
  | 'REVIEW_SAFETY_EVIDENCE'
  | 'PERFORM_REVIEW';

export interface BrakeStructuredAction {
  code: BrakeStructuredActionCode;
  labelDe: string;
  labelEn: string;
  priority: number;
}

export interface BrakeEvidencePresentation {
  overviewLabelDe: string;
  overviewLabelEn: string;
  uiStatusLabelDe: string;
  uiStatusLabelEn: string;
  components: BrakeComponentEvidenceLine[];
  overallRemainingKm: BrakeRemainingKmPresentation;
  dataQuality: BrakeDataQualityItem[];
  safety: BrakeSafetyItem[];
  structuredActions: BrakeStructuredAction[];
  modelVersion: string;
  modelCalculatedAt: string | null;
}

/** Legacy wear-model detail estimates — not for UI display. */
export interface BrakeHealthDetailLegacy {
  frontPads: BrakeAxleEstimate | null;
  rearPads: BrakeAxleEstimate | null;
  frontDiscs: BrakeAxleEstimate | null;
  rearDiscs: BrakeAxleEstimate | null;
}

export interface BrakeHealthDetail {
  summary: BrakeHealthSummary;
  legacy: BrakeHealthDetailLegacy;
  specs: any;
  history: Array<{
    id: string;
    date: string;
    odometerKm: number | null;
    workshopName: string | null;
    notes: string | null;
    costCents: number | null;
    serviceKind?: string | null;
    source?: string | null;
    scope?: string[] | null;
    lifecycleApplied?: boolean | null;
    lifecycleNote?: string | null;
  }>;
  alerts: BrakeAlert[];
  factors: Record<string, number>;
  drivingImpactAvailable: boolean;
  distanceSinceAnchorKm: number | null;
  brakeBiasInfo: { front: number; rear: number; source: string } | null;
}

export type SpeedingSeverity = 'low' | 'moderate' | 'high' | 'severe';

export interface SpeedingSection {
  sectionIndex: number;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  approxDistanceMeters: number;
  representativeSpeedLimitKmh: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxOverSpeedKmh: number;
  avgOverSpeedKmh: number;
  pointCount: number;
  mapboxLimitPointCount: number;
  fallbackLimitPointCount: number;
  primaryLimitSource: 'mapbox' | 'fallback' | 'mixed';
  severity: SpeedingSeverity;
  coordinates: [number, number][];
}

export type RouteProcessingState =
  | 'READY'
  | 'PROCESSING'
  | 'RETRYING'
  | 'FAILED'
  | 'UNAVAILABLE';

export type RouteContinuityStatus = 'COMPLETE' | 'GAPS_PRESENT' | 'INSUFFICIENT_DATA';

export type CanonicalRouteQuality = 'MATCHED' | 'FILTERED' | 'RAW';

export interface CanonicalTripRouteSpeedPoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  timestamp: string;
}

export interface CanonicalTripRouteResponse {
  tripId: string;
  vehicleId: string;
  routeQuality: CanonicalRouteQuality | null;
  geometry: {
    type: 'MultiLineString';
    coordinates: [number, number][][];
  } | null;
  source: {
    provider: string | null;
    algorithmVersion: string | null;
    processedAt: string | null;
  };
  quality: {
    matchConfidence: number | null;
    matchCoverage: number | null;
  };
  counts: {
    sourcePointCount: number;
    filteredPointCount: number;
    matchedPointCount: number | null;
  };
  continuity: {
    status: RouteContinuityStatus;
    hasUnknownGaps: boolean;
    gapCount: number;
  };
  status: {
    processingState: RouteProcessingState;
    ready: boolean;
    retryableFailure: boolean;
    failureReason: string | null;
  };
  speedPoints: CanonicalTripRouteSpeedPoint[];
  /** @deprecated Not serialized — use speedPoints (measured telemetry, not route geometry). */
  points?: CanonicalTripRouteSpeedPoint[];
}

export interface TripEnrichment {
  citySharePercent: number;
  highwaySharePercent: number;
  countrySharePercent: number;
  cityKm: number;
  highwayKm: number;
  countryKm: number;
  outsideTemperatureStartC: number | null;
  fuelUsedLiters: number | null;
  avgConsumptionLPer100Km: number | null;
  fuelConfidence: string | null;
  energyUsedKwh: number | null;
  avgConsumptionKwhPer100Km: number | null;
  energyConfidence: string | null;
  engineTempStartC: number | null;
  engineTempEndC: number | null;
  avgRpm: number | null;
  avgThrottlePosition: number | null;
  avgEngineLoad: number | null;
  /** @deprecated Legacy point-based percentage */
  speedingPercent: number | null;
  maxOverSpeedKmh: number | null;
  /** @deprecated Now equals speedingSectionCount */
  speedingSegments: number | null;
  speedingSectionCount: number | null;
  speedingDistanceMeters: number | null;
  speedingDurationSeconds: number | null;
  speedingExposurePercent: number | null;
  avgOverSpeedKmh: number | null;
  speedingSections: SpeedingSection[] | null;
  mapMatchConfidence: number;
  matchedGeometry: [number, number][];
  enrichedAt: string;
}

export interface TripBehaviorEvent {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId: string;
  eventCategory: 'ACCELERATION' | 'BRAKING' | 'ABUSE';
  eventType: string;
  classification: 'LIGHT' | 'MODERATE' | 'HARD' | 'EXTREME' | 'WARNING' | 'SEVERE' | 'CRITICAL';
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakValue: number | null;
  peakValueUnit: string | null;
  peakG: number | null;
  maxThrottlePos: number | null;
  maxEngineRpm: number | null;
  maxCoolantTemp: number | null;
  latitude: number | null;
  longitude: number | null;
  source?: 'BEHAVIOR_EVENT' | 'DRIVING_EVENT';
  /** Phase 4 unified provenance: native DIMO event vs HF reconstruction. */
  provenance?: 'NATIVE' | 'RECONSTRUCTED';
  detectionMethod?: string;
  confidence?: 'low' | 'medium' | 'high' | string;
  requiredSignals?: string[];
  /** Original DIMO event name/source — only present for native events. */
  originalEventName?: string | null;
  originalEventSource?: string | null;
  /**
   * Abuse-relevance — true when the event contributes to the trip abuse KPI.
   * Makes "why is this trip abuse-relevant?" explainable in the detail list.
   */
  abuseRelevant?: boolean;
  abuseCategory?: string | null;
  abuseReason?: string | null;
  /**
   * Phase 3 per-event Context Assessment (T±30s engine-signal window) for native
   * LTE_R1/ICE events. Present only when the event was context-enriched; the UI
   * must treat it as optional. Shape mirrors backend EventContextAssessment.
   */
  contextAssessment?: TripEventContextAssessment | null;
  /** Point-in-time legacy ingest snapshot — not T±30s context analysis. */
  legacyIngestEvidence?: TripEventLegacyIngestEvidence | null;
  metadataJson: any;
}

export interface TripEventLegacyIngestEvidence {
  rpm: number | null;
  throttlePct: number | null;
  coolantC: number | null;
}

/** Per-event context assessment payload (mirrors backend API DTO). */
export interface TripEventContextAssessment {
  version: number;
  contextModelVersion?: string;
  status:
    | 'SUCCESS'
    | 'LIMITED'
    | 'INSUFFICIENT_CADENCE'
    | 'PROVIDER_ERROR'
    | 'UNSUPPORTED'
    | 'COMPLETED'
    | 'INSUFFICIENT_CONTEXT'
    | 'FAILED'
    | 'SKIPPED_NOT_APPLICABLE';
  anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT';
  originalEventName?: string | null;
  dimoEventName?: string | null;
  anchorEvent?: {
    category: 'ACCELERATION' | 'BRAKING' | 'CORNERING' | 'OTHER';
    extreme: boolean;
    eventType?: string;
  } | null;
  anchorTimestamp: string;
  windowStart: string;
  windowEnd: string;
  engineSignalsApplicable: boolean;
  engineOnHint: boolean | null;
  reasonCodes: string[];
  preliminaryClassifications: string[];
  classifications: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
  evidenceGrade: 'A' | 'B' | 'C' | 'D';
  usedSignals: string[];
  missingSignals: string[];
  signalCoverage: unknown[];
  generatedAt: string;
  error?: string | null;
  /** Per-signal context stats. Present on COMPLETED assessments. */
  speedContext?: TripEventContextSignalStats;
  rpmContext?: TripEventContextSignalStats;
  throttleContext?: TripEventContextSignalStats;
  engineLoadContext?: TripEventContextSignalStats;
  coolantContext?: TripEventContextSignalStats;
  /** Convenience flattening of the most-used signal stats. */
  keyValues?: TripEventContextKeyValues;
  /** Quantitative data-quality of the anchored window. */
  dataQuality?: {
    usedSignals?: string[];
    missingSignals?: string[];
    [key: string]: unknown;
  };
  /** Traceable quality metadata (P27) — requested vs effective cadence, coverage, capability. */
  contextQuality?: {
    requestedInterval: '1s';
    effectiveMedianCadenceMs: number | null;
    effectiveP95CadenceMs: number | null;
    sampleCount: number;
    coverageBeforeAnchor: number;
    coverageAfterAnchor: number;
    providerDelayMs: number | null;
    availableSignals: string[];
    missingSignals: string[];
    contextConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
    capabilityVersion: string | null;
    qualityReasons: string[];
  };
  [key: string]: unknown;
}

export interface TripEventContextKeyValues {
  preSpeed: number | null;
  postSpeed: number | null;
  maxSpeed: number | null;
  maxRpm: number | null;
  maxThrottle: number | null;
  maxEngineLoad: number | null;
  coolantAtEvent: number | null;
  coolantMin: number | null;
  coolantMax: number | null;
}

export interface TripEventContextSignalStats {
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  valueBeforeAnchor?: number | null;
  valueAfterAnchor?: number | null;
  nonNullCount?: number;
  coverageQuality?: string;
  [key: string]: unknown;
}


export interface TripProfile {
  totalTrips: number;
  totalDistanceKm?: number;
  avgCity: number | null;
  avgHighway: number | null;
  avgCountry: number | null;
  avgTemp: number | null;
}

// ── DTC Knowledge Base ────────────────────────────────────────────────────────
export type DtcKnowledgeStatus = 'MISSING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
export type DtcKnowledgeSource =
  | 'VEHICLE_SPECIFIC'
  | 'GENERIC'
  | 'PENDING'
  | 'FAILED'
  | 'MISSING';
export type DtcUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type DtcRentalRecommendation =
  | 'RENTABLE'
  | 'CHECK_BEFORE_NEXT_RENTAL'
  | 'BLOCK_UNTIL_INSPECTED'
  | 'DO_NOT_RENT'
  | 'UNKNOWN';

export interface DtcKnowledgeDto {
  status: DtcKnowledgeStatus;
  source: DtcKnowledgeSource;
  title?: string | null;
  shortDescription?: string | null;
  possibleCauses?: string[];
  possibleEffects?: string[];
  technicalUrgency?: DtcUrgency;
  rentalUrgency?: DtcUrgency;
  rentalRecommendation?: DtcRentalRecommendation;
  recommendedAction?: string | null;
  sources?: Array<{ type?: string; title?: string; url?: string }>;
  lastVerifiedAt?: string | null;
  needsReview?: boolean;
  message?: string | null;
}

export interface JammingIncidentDto {
  detectedAt: string | null;
  where: string | null;
  lastKnownAddress: string | null;
  /** Snapshot-only indication — not a persisted incident history row. */
  isSnapshotIndication?: true;
}

export interface FleetMapVehicleResponse {
  id: string;
  licensePlate: string | null;
  displayName: string;
  make: string | null;
  model: string;
  year: number | null;
  /** Legacy display status from backend — never use as operational status without normalization. */
  status: string;
  /** Raw vehicle.status column / source token before operational derivation. */
  rawVehicleStatus?: string | null;
  fuelType: string;
  healthStatus: string;
  cleaningStatus: string;
  stationId: string | null;
  stationName: string | null;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string | null;
  signalAgeMs: number;
  isFresh: boolean;
  onlineStatus: string;
  telemetryFreshness?: string;
  displayState: string;
  displayIgnition: string;
  isLiveTracking: boolean;
  heading: number | null;
  imageUrl: string | null;
  // V4.6.84 — canonical fleet-status context. All fields nullable so
  // legacy consumers that do not read them keep working unchanged.
  odometerKm: number | null;
  fuelPercent: number | null;
  evSoc: number | null;
  isElectric: boolean;
  reservedBookingId: string | null;
  reservedCustomerName: string | null;
  reservedPickupAt: string | null;
  // V4.6.94 — Booking endDate exposed so the Reserved fleet-status card
  // can render the planned rental duration without an extra round-trip.
  reservedReturnAt: string | null;
  reservedPickupStationName: string | null;
  reservedIsOverdue: boolean;
  activeBookingId: string | null;
  activeCustomerName: string | null;
  // V4.6.94 — Booking startDate (NOT pickup-protocol timestamp). Lets
  // the Active Rented card render a "time-progress" bar.
  activeStartAt: string | null;
  activeReturnAt: string | null;
  activeReturnStationName: string | null;
  activeKmIncluded: number | null;
  activeKmDriven: number | null;
  activeIsOverdue: boolean;
  maintenanceReason: string | null;
  maintenanceReasonCode: FleetMaintenanceReasonCode | null;
  maintenanceUrgency: 'planned' | 'urgent' | null;
  dataQualityState?: VehicleDataQualityState | null;
  isReliable?: boolean | null;
  /** Canonical operational read-model (Prompt 26). Legacy `status` string remains for compatibility. */
  operationalState?: VehicleOperationalState | null;
  /** Booking context derived from fleet read-model (Prompt 26). */
  bookingContext?: VehicleBookingContext | null;
  /** Canonical connectivity runtime from backend builder. */
  connectivityRuntime?: VehicleConnectivityRuntimeState;
  /** P0.3 — operator-facing operational availability from P0.2 projection. */
  operationalAvailability?: FleetOperationalAvailabilityResponse;
  /** P0.4 — Health condition + P0.2 evaluability from projection. */
  healthEvaluation?: FleetHealthEvaluationResponse;
}

export interface FleetHealthEvaluationResponse {
  condition: 'good' | 'warning' | 'critical' | 'unknown';
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN';
  pipelineAvailability: 'ready' | 'partial' | 'unavailable' | null;
  generatedAt: string;
  healthEvidenceAt: string | null;
  anyModuleDataStale: boolean | null;
  source: string;
}

export interface FleetOperationalAvailabilityResponse {
  state: 'AVAILABLE' | 'NEEDS_VERIFICATION' | 'UNKNOWN' | 'UNAVAILABLE';
  primaryReason: string | null;
  reasonCodes: string[];
  recommendedAction: string;
  attention: string;
  generatedAt: string;
}

export type FleetMaintenanceReasonCode = 'SCHEDULED_SERVICE' | 'OPERATIONAL_BLOCK';

export type FleetConnectivityStatus =
  | 'online'
  | 'standby'
  | 'signal_delayed'
  | 'offline'
  | 'not_connected';

export type FleetTelemetryFreshness =
  | 'live'
  | 'standby'
  | 'signal_delayed'
  | 'offline'
  | 'no_signal';

export type FleetConnectivitySignalState = 'available' | 'missing' | 'unknown';

export type DeviceConnectionStatus = 'plugged' | 'unplugged' | 'unknown';
export type DeviceConnectionSeverity = 'info' | 'warning' | 'critical';
export type DeviceConnectionWebhookStatus = 'active' | 'not_configured' | 'unknown';

export type WebhookConfigurationState =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'ERROR'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export interface DeviceConnectionTriggerStateView {
  state: WebhookConfigurationState;
  reasonCode: string | null;
  triggerId: string | null;
  eventType: 'OBD_DEVICE_UNPLUGGED' | 'OBD_DEVICE_PLUGGED_IN' | null;
  active: boolean | null;
  callbackUrl: string | null;
  failureCount: number | null;
}

export interface DeviceConnectionWebhookConfigurationView {
  unplugTriggerState: DeviceConnectionTriggerStateView;
  plugTriggerState: DeviceConnectionTriggerStateView;
  recoveryPolicy: 'UNPLUG_WEBHOOK_PLUG_SNAPSHOT' | 'UNPLUG_WEBHOOK_ONLY' | 'NONE';
  lastSuccessfulDeliveryAt: string | null;
  lastDeliveryErrorAt: string | null;
  configSyncedAt: string | null;
  configSource: 'DIMO_TRIGGER_API' | 'REGISTRY_CACHE' | 'DEPLOYMENT_POLICY';
}

/** Explicit DIMO Vehicle Trigger OBD plug/unplug — distinct from snapshot obdIsPluggedIn / offline. */
export interface FleetDeviceConnectionDto {
  lastDeviceUnpluggedAt: string | null;
  lastDevicePluggedInAt: string | null;
  currentDeviceConnectionStatus: DeviceConnectionStatus;
  openUnpluggedEpisode: boolean;
  openUnpluggedSince: string | null;
  openUnpluggedDurationMs: number | null;
  interruptionKnowledge?: 'known_none' | 'active' | 'unknown' | 'not_applicable';
  interruptionKnowledgeReason?: string;
  severity: DeviceConnectionSeverity | null;
  rentalRelevant: boolean;
  duringActiveBooking: boolean;
  eventSource: 'dimo_webhook' | 'none';
}

export interface DeviceConnectionEventView {
  id: string;
  eventType: 'OBD_DEVICE_UNPLUGGED' | 'OBD_DEVICE_PLUGGED_IN';
  observedAt: string;
  severity: DeviceConnectionSeverity;
  rentalRelevant: boolean;
  bookingId: string | null;
  tripId: string | null;
}

export type DrivingAssessmentQualityStatus = 'NORMAL' | 'DEGRADED' | 'RECOVERING';

export interface OrgLteR1BaselineView {
  sampleTrips: number;
  medianEventsPerKm: number | null;
  p95EventsPerKm: number | null;
  medianRawEventsPerTrip: number | null;
  p95RawEventsPerTrip: number | null;
  sufficient: boolean;
  computedAt: string;
}

export interface DrivingAssessmentQualityResponse {
  applicable: boolean;
  status?: DrivingAssessmentQualityStatus;
  degradedSince?: string | null;
  recoveredAt?: string | null;
  lastEvaluatedAt?: string | null;
  activeObservationId?: string | null;
  orgBaseline?: OrgLteR1BaselineView | null;
}

export interface DeviceConnectionSummary {
  lteR1Capable: boolean;
  dimoLinked: boolean;
  lastDeviceUnpluggedAt: string | null;
  lastDevicePluggedInAt: string | null;
  currentDeviceConnectionStatus: DeviceConnectionStatus;
  openUnpluggedEpisode: boolean;
  openUnpluggedSince: string | null;
  openUnpluggedDurationMs: number | null;
  severity: DeviceConnectionSeverity | null;
  rentalRelevant: boolean;
  activeBookingId: string | null;
  webhookConfigured: DeviceConnectionWebhookStatus;
  webhookConfiguration: DeviceConnectionWebhookConfigurationView;
  lastWebhookReceivedAt: string | null;
  unpluggedCount24h: number;
  unpluggedCount7d: number;
  pluggedCount24h: number;
  pluggedCount7d: number;
  recentEvents: DeviceConnectionEventView[];
  /** Epistemic interruption state — additive; do not infer from `!openUnpluggedEpisode` alone. */
  interruptionKnowledge?: 'known_none' | 'active' | 'unknown' | 'not_applicable';
  interruptionKnowledgeReason?: string;
  rawEvents?: unknown[];
  connectivityRuntime?: VehicleConnectivityRuntimeState;
}

export interface TripDeviceConnectionEvidenceItem extends DeviceConnectionEventView {
  recoveryAt: string | null;
  recoveryDurationMs: number | null;
  source: 'DIMO Vehicle Trigger';
  evidenceStatus: 'open' | 'recovered' | null;
}

export interface TripDeviceConnectionEvidenceResponse {
  events: TripDeviceConnectionEvidenceItem[];
}

export type RpmWebhookCandidateStatus =
  | 'RECEIVED'
  | 'CONTEXT_ENRICHED'
  | 'INSUFFICIENT_CONTEXT'
  | 'CLASSIFIED'
  | 'FAILED';

export interface RpmCandidateContextSummary {
  status: string | null;
  confidence: string | null;
  evidenceGrade: string | null;
  classifications: string[];
}

export interface RpmCandidateView {
  id: string;
  observedAt: string;
  observedValue: number;
  threshold: number;
  status: RpmWebhookCandidateStatus;
  tripId: string | null;
  tokenId: number;
  source: 'DIMO Vehicle Trigger';
  context: RpmCandidateContextSummary | null;
}

export interface TripRpmCandidatesResponse {
  candidates: RpmCandidateView[];
  count: number;
}

export type TripGpsSpeedEvaluationAvailability =
  | 'READY'
  | 'PENDING'
  | 'UNAVAILABLE'
  | 'NOT_ASSESSABLE';

export type TripMotionShadowMapReadStatus =
  | 'NOT_AVAILABLE'
  | 'PENDING'
  | 'FAILED'
  | 'SUCCEEDED'
  | 'SUCCEEDED_EMPTY';

export interface TripMotionShadowMapReadResponse {
  status: TripMotionShadowMapReadStatus;
  previewLabel: 'S4 Motion · vorläufig';
  runId: string | null;
  workItemId: string | null;
  pinnedSnapshotHash: string | null;
  combinedInputIdentity: string | null;
  algorithmVersions: { c4: string; fsm: string; events: string; bundle: string } | null;
  computedAtUtc: string | null;
  geometrySource: 'NONE' | 'MOTION_POSITION_GRID' | 'MAPBOX_ROUTE_ALIGNED';
  geometryNote: string | null;
  samples: Array<{
    bucketLabelUtc: string;
    speedKmh: number | null;
    motionState: string;
    evidenceQuality: string;
    latitude: number | null;
    longitude: null | number;
    positionAvailability: string | null;
  }>;
  events: Array<{
    id: string;
    kind: string;
    displayKind: 'START' | 'ACCELERATION' | 'DECELERATION';
    startLabelUtc: string;
    endLabelUtc: string;
    startSpeedKmh: number;
    endSpeedKmh: number;
    deltaKmh: number;
    peakAccel1sMps2: number | null;
    quality: string;
    artefactSuspect: boolean;
    latitude: number | null;
    longitude: number | null;
    positionResolved: boolean;
  }>;
  stopEpisodes: Array<{
    id: string;
    startEarliestUtc: string;
    startLatestUtc: string;
    endEarliestUtc: string | null;
    endLatestUtc: string | null;
    minDurationS: number;
    maxDurationS: number | null;
    evidenceQuality: string;
    observedLabels: number;
    gapLabels: number;
    firstStationarySource: string;
    observed: boolean;
    inferred: boolean;
    latitude: number | null;
    longitude: number | null;
    positionResolved: boolean;
  }>;
  limitations: string[];
  failureCode: string | null;
}

export interface TripGpsSpeedEvaluationProductV1 {
  contractVersion: string;
  qcPolicyVersion: 'DI_V0_SPEED_QC_POLICY_V2';
  availability: TripGpsSpeedEvaluationAvailability;
  assessabilityLevel: 'FULL' | 'PARTIAL' | 'INSUFFICIENT' | 'UNASSESSABLE' | null;
  limitedAssessability: boolean;
  coverage: {
    totalIntervalCount: number;
    numericCoveragePercent: number | null;
    trustedNumericCoveragePercent: number | null;
    trustedLimitedCoveragePercent: number | null;
    trustedNumericIntervalCount: number;
    trustedLimitedStationaryIntervalCount: number;
  } | null;
  speed: {
    maxKmh: number | null;
    maxScope: 'TRUSTED_NUMERIC_INTERVALS' | 'TRUSTED_LIMITED_ONLY' | 'UNAVAILABLE';
    maxAssessability: string;
    meanKmh: number | null;
    meanScope: 'TRUSTED_NUMERIC_INTERVALS_ONLY';
  } | null;
  motion: {
    stationarySupportedIntervalCount: number;
    movingEstimatedIntervalCount: number;
  } | null;
}

export interface VehicleRpmWebhookSummary {
  lteR1IceCapable: boolean;
  webhookConfigured: 'active' | 'not_configured' | 'unknown';
  count24h: number;
  count7d: number;
  lastObservedAt: string | null;
  maxObservedRpm7d: number | null;
  thresholdDefault: number;
  recentCandidates: RpmCandidateView[];
}

export type OverallConnectivityState =
  | 'TELEMETRY_ACTIVE'
  | 'STANDBY'
  | 'SOFT_OFFLINE'
  | 'OFFLINE'
  | 'DEVICE_UNPLUGGED'
  | 'AUTHORIZATION_REQUIRED'
  | 'NO_ACTIVE_DATA_SOURCE'
  | 'INTEGRATION_ERROR'
  | 'UNKNOWN';

export type ProviderLinkState =
  | 'ACTIVE'
  | 'REAUTH_REQUIRED'
  | 'REVOKED'
  | 'NO_LINK'
  | 'ERROR'
  | 'UNKNOWN';

export type PhysicalDeviceState =
  | 'PLUGGED_CONFIRMED'
  | 'PLUGGED_INFERRED'
  | 'UNPLUGGED_CONFIRMED'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type ConnectivityAttentionState = 'NONE' | 'WATCH' | 'ACTION_REQUIRED' | 'CRITICAL';

export type ConnectivityRecommendedAction =
  | 'NONE'
  | 'CHECK_DEVICE'
  | 'REAUTHORIZE_PROVIDER'
  | 'CONNECT_DATA_SOURCE'
  | 'REVIEW_CONNECTIVITY'
  | 'WAIT_FOR_TELEMETRY'
  | 'CHECK_INTEGRATION';

export type FleetDataCoverageState =
  | 'GOOD'
  | 'PARTIAL'
  | 'INSUFFICIENT'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export interface VehicleConnectivityRuntimeState {
  vehicleId: string;
  organizationId: string;
  overallState: OverallConnectivityState;
  providerLinkState: ProviderLinkState;
  telemetryState: FleetTelemetryFreshness;
  physicalDeviceState: PhysicalDeviceState;
  dataCoverageState: FleetDataCoverageState;
  attentionState: ConnectivityAttentionState;
  reasonCodes: string[];
  recommendedAction: ConnectivityRecommendedAction;
  requiresAction: boolean;
  lastTelemetryAt: string | null;
  lastProviderObservedAt: string | null;
  lastReceivedAt: string | null;
  deviceBindingId: string | null;
  activeEpisodeId: string | null;
  evidence: {
    providerConnectionStatus?: string | null;
    openUnpluggedEpisode?: boolean | null;
    deviceConnectionEpisodeId?: string | null;
    signalCoveragePercent?: number | null;
    webhookConfigured?: boolean | null;
  };
  calculatedAt: string;
  stateVersion: number;
}

export type FleetConnectivityReadinessLevel =
  | 'good'
  | 'watch'
  | 'warning'
  | 'no_data';

export type FleetDataCoverageReasonCode =
  | 'DATA_COVERAGE_PARTIAL'
  | 'DATA_COVERAGE_INSUFFICIENT'
  | 'SIGNAL_NOT_APPLICABLE'
  | 'TELEMETRY_STALE'
  | 'NO_TELEMETRY_SNAPSHOT'
  | 'CAPABILITY_UNKNOWN'
  | 'PROVIDER_CHANGED';

export interface FleetConnectivitySignals {
  gps: FleetConnectivitySignalState;
  odometer: FleetConnectivitySignalState;
  speed: FleetConnectivitySignalState;
  fuel: FleetConnectivitySignalState;
  evSoc: FleetConnectivitySignalState;
  dtc: FleetConnectivitySignalState;
  obdPlug: FleetConnectivitySignalState;
  jamming: FleetConnectivitySignalState;
}

export interface FleetConnectivityVehicle {
  vehicleId: string;
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  station: string | null;
  connectionType: string;
  sourceType: string | null;
  provider: string;
  connectionStatus: FleetConnectivityStatus;
  /** Canonical telemetry freshness — matches runtime state builder vocabulary. */
  telemetryFreshness: FleetTelemetryFreshness;
  statusNote: string;
  online: boolean;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  freshnessLabel: string;
  pairedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  odometerKm: number | null;
  hasTelemetry: boolean;
  obdIsPluggedIn: boolean | null;
  jammingDetectedCount: number;
  jammingSnapshotNote: string | null;
  jammingIncidents: JammingIncidentDto[];
  maskedDeviceSerial: string | null;
  maskedDimoTokenId: string | null;
  maskedSyntheticTokenId: string | null;
  readinessScore: number;
  readinessLevel: FleetConnectivityReadinessLevel;
  /** @deprecated Use coveragePercent */
  signalCoveragePercent: number;
  coverageState: FleetDataCoverageState;
  coveragePercent: number | null;
  expectedSignalCount: number;
  freshSignalCount: number;
  staleSignalCount: number;
  missingSignalCount: number;
  reasonCodes: FleetDataCoverageReasonCode[];
  signals: FleetConnectivitySignals;
  /** @deprecated masked alias — raw serial is never returned */
  deviceSerial: string | null;
  /** @deprecated always null — use maskedDimoTokenId */
  dimoTokenId: number | null;
  /** @deprecated always null — use maskedSyntheticTokenId */
  syntheticTokenId: number | null;
  /** Explicit DIMO webhook device connection (not snapshot/offline). */
  deviceConnection: FleetDeviceConnectionDto | null;
  /** Canonical connectivity runtime — single source of truth. */
  connectivityRuntime: VehicleConnectivityRuntimeState;
}

export interface FleetConnectivityThresholds {
  onlineMaxMinutes: number;
  standbyMaxHours: number;
  signalDelayedMaxHours: number;
}

export interface FleetConnectivitySummary {
  total: number;
  online: number;
  standby: number;
  signalDelayed: number;
  offline: number;
  notConnected: number;
  connected: number;
  withTelemetry: number;
  withoutTelemetry: number;
  obdPluggedIn: number;
  obdUnplugged: number;
  obdNoData: number;
  jammingSnapshotDetected: number;
  deviceUnpluggedOpenEpisodes: number;
  deviceUnpluggedDuringBooking: number;
  avgSignalCoverage: number | null;
  avgReadinessScore: number | null;
}

export interface DataAuthorizationDto {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  requestingEntity: string;
  moduleOrigin: string;
  purpose: string;
  purposes: string[];
  sourceType: string | null;
  processorType: string | null;
  processorName: string | null;
  scope: string;
  scopeKey: string;
  dataCategories: string[];
  destination: string;
  vehicleIds: string[] | null;
  vehicleCount: number;
  customerIds: string[];
  bookingIds: string[];
  accessPattern: string;
  accessPatternKey: string;
  status: string;
  statusKey: string;
  riskLevel: string;
  riskLevelKey: string;
  systemKey: string | null;
  isSystemGenerated: boolean;
  lastAccessAt: string | null;
  accessCount: number;
  revokeReason: string | null;
  grantedById: string | null;
  grantedByName: string | null;
  grantedAt: string | null;
  revokedById: string | null;
  revokedByName: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  scopeNote: string | null;
  /** Defensive scope-usability signal (e.g. NO_ACTIVE_VEHICLES, ACTIVE, PENDING, REVOKED, EXPIRED). */
  scopeStatus?: string | null;
  /** False when the authorization has no currently usable scope (e.g. 0 connected DIMO vehicles). */
  hasActiveScope?: boolean;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataAuthorizationStatsDto {
  total: number;
  active: number;
  pending: number;
  revoked: number;
  expired: number;
  highRisk: number;
  expiringSoon: number;
}

export interface CreateDataAuthorizationPayload {
  title: string;
  moduleOrigin: string;
  purposes: string[];
  scope: string;
  dataCategories: string[];
  destination: string;
  description?: string;
  requestingEntity?: string;
  sourceType?: string;
  processorType?: string;
  processorName?: string;
  vehicleIds?: string[];
  customerIds?: string[];
  bookingIds?: string[];
  accessPattern?: string;
  expiresAt?: string;
  notes?: string;
}

export interface DataAuthorizationAuditEntry {
  id: string;
  action: string;
  description: string;
  changeSummary: string | null;
  entityId: string | null;
  level: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string | null } | null;
  metaJson: unknown;
}

export interface FleetConnectivityPagination {
  page: number;
  limit: number;
  total: number;
  totalInOrganization: number;
}

export type ConnectivityReasonCode =
  | 'TELEMETRY_FRESH'
  | 'TELEMETRY_STANDBY'
  | 'TELEMETRY_SOFT_OFFLINE'
  | 'TELEMETRY_OFFLINE'
  | 'NO_TELEMETRY_TIMESTAMP'
  | 'DEVICE_UNPLUG_WEBHOOK'
  | 'DEVICE_RECONNECTED_EXPLICIT'
  | 'DEVICE_RECONNECTED_SNAPSHOT'
  | 'DEVICE_RECONNECTED_TELEMETRY'
  | 'DEVICE_BINDING_CHANGED'
  | 'AUTHORIZATION_EXPIRED'
  | 'CONSENT_MISSING'
  | 'TOKEN_MISSING'
  | 'PROVIDER_REVOKED'
  | 'PROVIDER_ERROR'
  | 'LINK_ACTIVE'
  | 'NO_ACTIVE_PROVIDER_LINK'
  | 'DATA_COVERAGE_PARTIAL'
  | 'DATA_COVERAGE_INSUFFICIENT'
  | 'WEBHOOK_PROCESSING_FAILED'
  | 'STATE_CONFLICT'
  | 'MANUAL_REVIEW_REQUIRED';

export interface FleetConnectivityVehicleRef {
  vehicleId: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  station: string | null;
}

export interface FleetConnectivityListItem {
  vehicle: FleetConnectivityVehicleRef;
  overallState: OverallConnectivityState;
  telemetryState: FleetTelemetryFreshness;
  attentionState: ConnectivityAttentionState;
  lastTelemetryAt: string | null;
  primaryReasonCode: ConnectivityReasonCode | null;
  recommendedAction: ConnectivityRecommendedAction;
  requiresAction: boolean;
  sortPriority: number;
}

export type FleetConnectivityTimelineEventType =
  | 'DEVICE_UNPLUGGED'
  | 'TELEMETRY_RESUMED'
  | 'DEVICE_RECONNECTED'
  | 'BINDING_CHANGED'
  | 'AUTHORIZATION_CHANGED'
  | 'INTEGRATION_ERROR';

export interface FleetConnectivityTimelineEvent {
  id: string;
  type: FleetConnectivityTimelineEventType;
  occurredAt: string;
  reasonCode: ConnectivityReasonCode | null;
  providerObservedAt?: string | null;
  receivedAt?: string | null;
  processedAt?: string | null;
  resolutionEvidenceAt?: string | null;
}

export interface FleetConnectivityActiveEpisode {
  episodeId: string | null;
  open: boolean;
  openedAt: string | null;
  durationMs: number | null;
  rentalRelevant: boolean;
  recoveryMethod: string | null;
}

export interface FleetConnectivityCapabilitySignal {
  key: string;
  availability: 'available' | 'missing' | 'unknown' | 'not_applicable';
  freshness: 'fresh' | 'stale' | 'unknown';
}

export interface FleetConnectivityCapabilitySummary {
  coverageState: FleetDataCoverageState;
  coveragePercent: number | null;
  freshSignalCount: number;
  expectedSignalCount: number;
  signals: FleetConnectivityCapabilitySignal[];
}

export interface FleetConnectivityProviderSummary {
  providerLabel: string;
  deviceKind: string;
  authorizationState: ProviderLinkState;
  consentGranted: boolean;
  triggerConfigured: boolean;
  lastSuccessfulFetchAt: string | null;
}

export interface FleetConnectivityTimestamps {
  lastTelemetryAt: string | null;
  lastProviderObservedAt: string | null;
  lastReceivedAt: string | null;
  calculatedAt: string;
  reconnectedSince: string | null;
  recoveryReceivedAt: string | null;
}

export interface FleetConnectivityWebhookSummary {
  configured: boolean;
  lastEventAt: string | null;
  openEpisode: boolean;
}

export interface FleetConnectivityDetail extends FleetConnectivityListItem {
  providerLinkState: ProviderLinkState;
  physicalDeviceState: PhysicalDeviceState;
  dataCoverageState: FleetDataCoverageState;
  reasonCodes: ConnectivityReasonCode[];
  activeEpisode: FleetConnectivityActiveEpisode | null;
  timeline: FleetConnectivityTimelineEvent[];
  provider: FleetConnectivityProviderSummary;
  capabilities: FleetConnectivityCapabilitySummary;
  timestamps: FleetConnectivityTimestamps;
  webhook: FleetConnectivityWebhookSummary;
  odometerKm: number | null;
  hasLocation: boolean;
}

/**
 * Connectivity diagnostic dimension — Master Admin only.
 *
 * Separates provider API reachability from real vehicle observation freshness.
 * A provider can be reachable while the vehicle observation is stale (device or
 * SIM not transmitting), which canonical `telemetryState` alone cannot express.
 *
 * Served only by `/admin/vehicles/:vehicleId/operational/diagnostics`. Never
 * present on tenant-facing connectivity payloads.
 */
export type ConnectivityDiagnosticState =
  | 'PROVIDER_REACHABLE_DATA_FRESH'
  | 'PROVIDER_REACHABLE_DATA_STALE'
  | 'PROVIDER_UNREACHABLE'
  | 'AUTH_OR_BINDING_ERROR'
  | 'UNKNOWN';

export type ConnectivityTriState = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';

export interface ConnectivityDiagnosticAdmin {
  provider: string | null;
  diagnosticState: ConnectivityDiagnosticState;
  providerApiReachable: boolean | null;
  /** Provider response receipt time — never vehicle freshness. */
  lastProviderFetchAt: string | null;
  lastProviderFetchAgeMs: number | null;
  /** Real vehicle observation time — drives canonical freshness. */
  lastVehicleObservationAt: string | null;
  lastVehicleObservationAgeMs: number | null;
  observationState: FleetTelemetryFreshness;
  bindingState: ConnectivityTriState;
  consentState: ConnectivityTriState;
  connectionStatus: string | null;
  /**
   * Whether the provider polling cohort currently includes this vehicle.
   * `false` explains a stale provider fetch without blaming the provider.
   */
  providerPollScheduled: boolean | null;
  deviceBindingRef: string | null;
  providerErrorCategory: ConnectivityReasonCode | null;
  calculatedAt: string;
}

export interface ConnectivityAdminDiagnosticsResponse extends FleetConnectivityDetail {
  connectivityDiagnostic: ConnectivityDiagnosticAdmin;
}

/** Canonical fleet connectivity KPI summary (API v2). */
export interface FleetConnectivityKpiSummary {
  total: number;
  actionRequired: number;
  actionRequiredOffline: number;
  actionRequiredSoftOffline: number;
  telemetryActive: number;
  standby: number;
  noActiveDataSource: number;
}

export interface FleetConnectivityResponse {
  generatedAt: string;
  summary: FleetConnectivityKpiSummary;
  pagination: FleetConnectivityPagination;
  items: FleetConnectivityListItem[];
  /** @deprecated Legacy thresholds — not used for UI decisions. */
  thresholds?: FleetConnectivityThresholds;
  /** @deprecated Legacy summary — use `summary` KPI fields. */
  legacySummary?: FleetConnectivitySummary;
  /** @deprecated Legacy full rows — use `items`. */
  vehicles?: FleetConnectivityVehicle[];
}

export type DataAnalyseIntervalStatus = 'OK' | 'Delayed' | 'Sparse' | 'Missing' | 'Unknown';
export type DataAnalyseFreshness = 'fresh' | 'stale' | 'offline' | 'insufficient_data' | 'unknown';
export type DataAnalyseHfQuality = 'Good for detection' | 'Borderline' | 'Too sparse' | 'Not available' | 'Unknown';
export type DataAnalyseLaunchFeasibility = 'Reliable' | 'Possible but weak' | 'Not reliable' | 'Not enough data';

export interface DataAnalyseVehicle {
  id: string;
  name: string;
  licensePlate: string | null;
  vin: string | null;
  provider: string | null;
  connectionStatus: string;
  lastSeenAt: string | null;
  dimoTokenId: number | null;
}

export interface DataAnalyseTelemetryOverview {
  lastTelemetryReceived: string | null;
  totalSignalsObserved: number;
  highFrequencySignalsObserved: number;
  averageObservedIntervalMs: number | null;
  fastestObservedIntervalMs: number | null;
  slowestObservedIntervalMs: number | null;
  missingExpectedSignals: string[];
  dataFreshnessStatus: DataAnalyseFreshness;
  insufficientData: boolean;
  notes: string[];
}

export interface DataAnalyseSignalRow {
  signalName: string;
  signalGroup: string;
  latestValue: string | number | boolean | null;
  unit: string | null;
  providerTimestamp: string | null;
  backendReceivedTimestamp: string | null;
  lastSeen: string | null;
  observedIntervalMs: number | null;
  expectedIntervalMs: number | null;
  intervalStatus: DataAnalyseIntervalStatus;
  sourceProvider: string | null;
  storageLocation: string;
  usedByModules: string[];
  persisted: boolean;
}

export type DataAnalyseHfReliability = 'GOOD' | 'WATCH' | 'POOR' | 'MISSING';
export type DataAnalyseLaunchUsefulness = 'POSSIBLE' | 'LIMITED' | 'NOT_POSSIBLE' | 'UNKNOWN';

export type DataAnalyseHfAvailabilityStatus =
  | 'hf_available'
  | 'sparse'
  | 'snapshot_only'
  | 'missing'
  | 'unknown';

export interface DataAnalyseHighFrequency {
  available: boolean;
  message: string | null;
  snapshotLevelOnly: boolean;
  /** Aggregated, operator-facing HF-availability label (single source of truth). */
  hfAvailabilityStatus?: DataAnalyseHfAvailabilityStatus;
  clickHouseAvailable: boolean;
  signals: Array<{
    signalKey: string;
    signalName: string;
    displayName: string;
    sourceProvider: string | null;
    pollGroup: string;
    storageTable: string;
    sampleCount24h: number | null;
    sampleCount7d: number | null;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    medianIntervalMs: number | null;
    p95IntervalMs: number | null;
    minIntervalMs: number | null;
    maxIntervalMs: number | null;
    gapCount: number | null;
    largestGapMs: number | null;
    reliabilityStatus: DataAnalyseHfReliability;
    practicalUse: string[];
    launchDetectionUsefulness: DataAnalyseLaunchUsefulness;
    explanation: string;
    observedIntervalMs: number | null;
    averageIntervalMs: number | null;
    dropoutCount: number | null;
    longestGapMs: number | null;
    providerToBackendLatencyMs: number | null;
    detectionQuality: DataAnalyseHfQuality;
    notes: string[];
  }>;
  /** telemetry_waypoints (route/waypoint stream). */
  waypointCount24h: number | null;
  waypointCount7d?: number | null;
  /** telemetry_snapshots (~30s snapshot mirror) sample counts. */
  snapshotSampleCount24h?: number | null;
  snapshotSampleCount7d?: number | null;
  /** telemetry_hf_points (real 1s/post-trip HF signal points). */
  hfConfigured?: boolean;
  hfPointCount24h?: number | null;
  hfPointCount7d?: number | null;
  hfLatestPointAt?: string | null;
  hfSignalGroupsSeen?: string[];
  /** telemetry_hf_events (HF-reconstructed events). */
  hfRecentEvents?: Array<{
    eventType: string;
    severity: string;
    eventStart: string;
    eventEnd: string | null;
    durationMs: number | null;
    confidence: string;
    primaryValue: number | null;
    primaryUnit: string | null;
  }>;
  /** HF mirror feature-flag status (read-only diagnostic). */
  hfMirrorStatus?: 'enabled' | 'disabled' | 'unknown';
}

/** Internal debug — read-only trip HF signal quality (not a canonical trip score). */
export interface DataAnalyseSignalQuality {
  available: boolean;
  degraded: boolean;
  degradedReason?: string | null;
  overallQuality: 'good' | 'medium' | 'weak' | 'unavailable';
  hfAvailability: 'hf_available' | 'sparse' | 'missing' | 'unknown';
  signalCoverage: Array<{
    signalGroup: string;
    pointCount: number;
    windowCount: number;
  }>;
  missingKeySignals: string[];
  detectorFeasibilityHints: Array<{
    detector: string;
    status: string;
    requiredSignals: string[];
    speedOnly: boolean;
  }>;
  windowCount: number;
  hfPointCount: number;
  reasons: string[];
  internalDebug: true;
  readOnly: true;
  tripId?: string | null;
}

export interface DataAnalyseLaunchFeasibilityResult {
  feasibility: DataAnalyseLaunchFeasibility;
  availableSignals: string[];
  missingSignals: string[];
  observedIntervals: Record<string, number | null>;
  minimumViableIntervalMs: number;
  providerLimitations: string[];
  recommendation: string;
  reasons: string[];
}

export type DataAnalyseHealthInputBasis =
  | 'signal-based'
  | 'modeled'
  | 'mixed'
  | 'unknown';

export interface DataAnalyseHealthTraceSection {
  status: string | null;
  lastCalculationAt: string | null;
  calculationSource: string | null;
  freshness: string;
  inputBasis: DataAnalyseHealthInputBasis;
  inputsAvailable: string[];
  inputsMissing: string[];
  evidence: Record<string, unknown>;
  notes: string[];
}

export interface DataAnalyseHealthTrace {
  brake: DataAnalyseHealthTraceSection;
  tire: DataAnalyseHealthTraceSection;
  battery: DataAnalyseHealthTraceSection;
}

export interface DataAnalysePipelineStep {
  step: string;
  status: string;
  lastSeenAt: string | null;
  sourceName: string | null;
  notes: string | null;
}

export interface DataAnalysePipeline {
  provider: string | null;
  steps: DataAnalysePipelineStep[];
  lastSuccessfulProcessing: string | null;
  lastError: string | null;
}

export interface DataAnalyseClickHouseTableDiagnostic {
  table: string;
  purpose: string;
  futureUseCase: string | null;
  producerStatus: string;
  mvpStatus: string;
  expectedEmptyAllowed: boolean;
  displayStatus: string;
  dataStatus: string;
  rowCount: number | null;
  lastEventAt: string | null;
  writeProducer: string | null;
  readConsumers: string[];
  notes: string;
}

export interface DataAnalyseClickHouseDiagnostics {
  purpose: 'temporary_internal_debug';
  clickhouseConfigured: boolean;
  clickhouseAvailable: boolean;
  clickhouseStatus: 'disabled' | 'available' | 'degraded' | 'schema_error';
  degraded: boolean;
  hfMirrorEnabled: boolean;
  hfMirrorStatus: 'enabled' | 'disabled' | 'unknown';
  schemaMigrations: {
    appliedCount: number | null;
    pendingCount: number | null;
    lastInitAt: string | null;
    lastError: string | null;
  };
  lastMirrorWriteAt: Record<string, string | null>;
  tables: DataAnalyseClickHouseTableDiagnostic[];
  notes: string[];
}

// ── LTE_R1 Event Context Architecture diagnostic ────────────────────────────
export type DataAnalyseEventLayerStatus =
  | 'active'
  | 'no_events'
  | 'unavailable'
  | 'configured'
  | 'not_configured'
  | 'failed'
  | 'insufficient'
  | 'skipped'
  | 'sparse'
  | 'snapshot_only'
  | 'unknown';

export interface DataAnalyseEventLayer {
  status: DataAnalyseEventLayerStatus;
  label: string;
  detail: string;
  counters?: Array<{ label: string; value: string }>;
}

export interface DataAnalyseEventArchitecture {
  powertrainApplicable: boolean;
  powertrainNote: string;
  nativeEventIntake: DataAnalyseEventLayer;
  deviceConnectionWebhookIntake: DataAnalyseEventLayer;
  rpmWebhookIntake: DataAnalyseEventLayer;
  eventContextEnrichment: DataAnalyseEventLayer;
  tripSignalSummaryEnrichment: DataAnalyseEventLayer;
  detectorFeasibility: {
    nativeBehaviorEvents: boolean;
    deviceConnectionWebhooks: boolean;
    rpmWebhooks: boolean;
    contextClassification: boolean;
    shortEventHfDerivedDetection: 'disabled' | 'not_reliable';
    notes: string[];
  };
  metrics: {
    effectiveCadenceMs: number | null;
    medianIntervalMs: number | null;
    p95IntervalMs: number | null;
    missingSignals: string[];
    contextWindowsProcessed: number;
    deviceConnectionEvents7d: number;
    rpmWebhookCandidates7d: number;
    openUnpluggedEpisode: boolean;
  };
}

export interface DataAnalyseSignalGroup {
  id: string;
  groupName: string;
  description: string;
  typicalSignals: string[];
  expectedIntervalMs: number | null;
  practicalUse: string;
  usedByModules: string[];
  detectionRelevance: string;
  sourceProvider: string | null;
  storageLocation: string | null;
  limitations: string | null;
  currentAvailability: string;
  availabilityNotes: string | null;
}

export interface AdminFleetConnectivityVehicle {
  vehicleId: string;
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  organizationId: string | null;
  organizationName: string | null;
  connectionType: string;
  sourceType: string | null;
  provider: string;
  deviceSerial: string | null;
  syntheticTokenId: number | null;
  dimoTokenId: number | null;
  dimoConnectionStatus: string | null;
  connectionStatus: 'online' | 'standby' | 'offline' | 'not_connected';
  statusNote: string;
  online: boolean;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  freshnessLabel: string;
  pairedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  odometerKm: number | null;
  hasTelemetry: boolean;
  obdIsPluggedIn: boolean | null;
  jammingDetectedCount: number;
  jammingIncidents: JammingIncidentDto[];
  availableSignals: string[];
  signalCoverage: number;
  diagnostics: {
    pollSuccess24h: number;
    pollFailure24h: number;
    lastPollSuccessAt: string | null;
    lastPollFailureAt: string | null;
    lastPollError: string | null;
    lastPollDurationMs: number | null;
  };
}

export interface VehicleComplaint {
  id: string;
  organizationId: string;
  vehicleId: string;
  createdByUserId: string | null;
  description: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  region: string | null;
  status:
    | 'ACTIVE'
    | 'RESOLVED'
    | 'OPEN'
    | 'IN_REVIEW'
    | 'CONFIRMED'
    | 'REJECTED'
    | 'NEW'
    | 'CONVERTED'
    | 'DISMISSED';
  source:
    | 'FIELD_AGENT'
    | 'MANUAL'
    | 'OPERATOR_RETURN'
    | 'OPERATOR_HANDOVER'
    | 'CUSTOMER_REPORT'
    | 'STAFF_INSPECTION'
    | 'AI_UPLOAD'
    | 'SYSTEM_IMPORT';
  impact?: 'SAFETY' | 'DRIVABILITY' | 'ENVIRONMENT' | 'COMFORT' | null;
  blocksRental?: boolean;
  title?: string | null;
  category?: TechnicalObservationCategory | null;
  affectedArea?: TechnicalObservationAffectedArea | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TechnicalObservationSeverity = 'low' | 'medium' | 'high' | 'critical';

export type TechnicalObservationStatus =
  | 'new'
  | 'active'
  | 'in_review'
  | 'converted'
  | 'resolved'
  | 'dismissed';

export type TechnicalObservationSource =
  | 'manual'
  | 'operator_return'
  | 'operator_handover'
  | 'customer_report'
  | 'staff_inspection'
  | 'ai_upload'
  | 'system_import'
  | 'field_agent';

export type TechnicalObservationCategory =
  | 'exterior'
  | 'interior'
  | 'lights'
  | 'wipers_windows'
  | 'wheels_tires'
  | 'electronics_controls'
  | 'noise_vibration'
  | 'driving_behavior'
  | 'comfort'
  | 'other';

export type TechnicalObservationAffectedArea =
  | 'front'
  | 'rear'
  | 'left'
  | 'right'
  | 'interior'
  | 'dashboard'
  | 'lights'
  | 'wheels'
  | 'tires'
  | 'engine_bay'
  | 'trunk'
  | 'unknown';

export interface TechnicalObservation {
  id: string;
  orgId: string;
  vehicleId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  createdByWorkerId: string | null;
  source: TechnicalObservationSource;
  title: string | null;
  shortLabel: string | null;
  description: string;
  category: TechnicalObservationCategory | null;
  affectedArea: TechnicalObservationAffectedArea | null;
  severity: TechnicalObservationSeverity;
  status: TechnicalObservationStatus;
  blocksRental: boolean;
  bookingId: string | null;
  customerId: string | null;
  driverId: string | null;
  handoverProtocolId: string | null;
  stationId: string | null;
  locationContext: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  dismissedAt: string | null;
  convertedToTaskId: string | null;
  linkedDamageId: string | null;
  linkedServiceEventId: string | null;
  linkedServiceCaseId: string | null;
  linkedServiceTaskId: string | null;
  notes: string | null;
  region: string | null;
  impact: string | null;
}

export interface TechnicalObservationListResponse {
  active: TechnicalObservation[];
  history: TechnicalObservation[];
}

export interface CreateTechnicalObservationBody {
  description: string;
  title?: string;
  severity?: TechnicalObservationSeverity;
  source?: TechnicalObservationSource;
  category?: TechnicalObservationCategory;
  affectedArea?: TechnicalObservationAffectedArea;
  region?: string;
  blocksRental?: boolean;
  bookingId?: string;
  customerId?: string;
  driverId?: string;
  handoverProtocolId?: string;
  stationId?: string;
  locationContext?: string;
  notes?: string;
  createdByWorkerId?: string;
}

export interface UpdateTechnicalObservationBody {
  description?: string;
  title?: string;
  category?: TechnicalObservationCategory;
  affectedArea?: TechnicalObservationAffectedArea;
  severity?: TechnicalObservationSeverity;
  status?: TechnicalObservationStatus;
  blocksRental?: boolean;
  notes?: string;
  region?: string;
}

export interface ConvertTechnicalObservationToTaskBody {
  title?: string;
  description?: string;
  blocksVehicleAvailability?: boolean;
}

export interface LinkTechnicalObservationDamageBody {
  damageId?: string;
  createDamage?: boolean;
  damageDescription?: string;
}

export interface LinkTechnicalObservationServiceBody {
  serviceEventId?: string;
  serviceTaskId?: string;
  createServiceCase?: boolean;
  serviceCaseTitle?: string;
}

// V4.7.50 — Exterior images (Damage Map): five canonical views per vehicle.
// Backed by `vehicle_exterior_images` (one row per (vehicleId, view) tuple).
export type VehicleExteriorViewKey = 'FRONT' | 'LEFT' | 'RIGHT' | 'REAR' | 'ROOF';

export interface VehicleExteriorImageDto {
  id: string;
  vehicleId: string;
  view: VehicleExteriorViewKey;
  imageData: string;
  caption: string | null;
  uploadedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleExteriorModelImageDto {
  id: string;
  modelKey: string;
  make: string;
  model: string;
  view: VehicleExteriorViewKey;
  imageData: string;
  caption: string | null;
  sourceVehicleId: string | null;
  uploadedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleExteriorEffectiveImageDto {
  id: string;
  view: VehicleExteriorViewKey;
  imageData: string;
  caption: string | null;
  uploadedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  source: 'vehicle' | 'model';
  vehicleId?: string;
  modelKey?: string;
  make?: string;
  model?: string;
  sourceVehicleId?: string | null;
}

export interface VehicleExteriorModelTemplateSummary {
  modelKey: string;
  make: string;
  model: string;
  views: VehicleExteriorViewKey[];
  count: number;
  updatedAt: string;
}

export interface VehicleExteriorImageEffectiveResponse {
  vehicle: VehicleExteriorImageDto[];
  model: VehicleExteriorModelImageDto[];
  effective: VehicleExteriorEffectiveImageDto[];
  modelKey: string | null;
}

export interface AdminFleetConnectivityResponse {
  summary: {
    total: number;
    online: number;
    standby: number;
    offline: number;
    notConnected: number;
    withTelemetry: number;
    avgSignalCoverage: number;
  };
  pollHealth: {
    success24h: number;
    failure24h: number;
    timeout24h: number;
    successRate: number | null;
    lastFailureAt: string | null;
    lastFailureError: string | null;
    lastFailureJobType: string | null;
  };
  vehicles: AdminFleetConnectivityVehicle[];
}

/** AI Health Care legacy agent fields (internal to ai-health-care endpoint only). */
export interface HealthSummaryResponse {
  overallStatus: { level: 'good' | 'watch' | 'attention'; title: string; shortSummary: string };
  positives: string[];
  watchpoints: string[];
  futureOutlook: { summary: string; items: string[] };
  preventiveRecommendations: string[];
  maintenanceFocus: Array<{ area: string; priority: 'low' | 'medium' | 'high'; reason: string }>;
  dataConfidence: { level: 'low' | 'medium' | 'high'; reason: string };
}

export type VehicleHealthSummaryState = 'good' | 'warning' | 'critical' | 'unknown';
export type VehicleHealthDataQualityLevel = 'high' | 'medium' | 'low' | 'unknown';
export type VehicleHealthFindingSeverity = 'critical' | 'warning' | 'info' | 'unknown';
export type VehicleHealthTargetModalKey =
  | 'battery'
  | 'tires'
  | 'brakes'
  | 'dtc'
  | 'service'
  | 'complaints'
  | 'warnings'
  | null;

export type VehicleHealthComplianceDateState = 'good' | 'warning' | 'critical' | 'unknown';

export interface ServiceComplianceModuleState {
  state: 'good' | 'warning' | 'critical' | 'unknown' | 'no_tracking';
  label: string;
  reason?: string;
  nextService?: {
    source: 'hm_oem';
    daysRemaining?: number;
    kmRemaining?: number;
  } | null;
  tuev?: {
    dueDate?: string;
    state: VehicleHealthComplianceDateState;
  };
  bokraft?: {
    dueDate?: string;
    state: VehicleHealthComplianceDateState;
  };
}

export interface VehicleHealthModuleStateBase {
  state: string;
  label: string;
  reason?: string;
}

export type VehicleHealthFindingModule =
  | 'battery'
  | 'tires'
  | 'brakes'
  | 'error_codes'
  | 'service_compliance'
  | 'complaints'
  | 'vehicle_alerts'
  | 'oem_hm'
  | 'unknown';

/** Canonical Health-tab summary DTO — matches backend VehicleHealthTabSummaryDto. */
export interface VehicleHealthTabSummaryDto {
  vehicleId: string;
  generatedAt: string;
  overall: {
    state: VehicleHealthSummaryState;
    label: string;
    headline: string;
    description: string;
    rentalBlocked: boolean;
    blockingReasons: string[];
  };
  dataQuality: {
    level: VehicleHealthDataQualityLevel;
    label: string;
    reasons: string[];
  };
  findings: Array<{
    id: string;
    module: VehicleHealthFindingModule | string;
    severity: VehicleHealthFindingSeverity;
    title: string;
    description: string;
    evidence?: string[];
    targetModalKey?: VehicleHealthTargetModalKey;
  }>;
  moduleStates: Record<string, VehicleHealthModuleStateBase | ServiceComplianceModuleState> & {
    service_compliance?: ServiceComplianceModuleState;
  };
  sourceStatus: {
    rentalHealth: 'loaded' | 'endpoint_error';
    aiHealthCare: 'loaded' | 'not_available' | 'endpoint_error';
    highMobility: 'fresh' | 'stale' | 'no_data' | 'not_connected' | 'sync_error' | 'unknown';
    dimo: 'fresh' | 'stale' | 'no_data' | 'not_connected' | 'unknown';
  };
  degradedDependencies: Array<{
    source: string;
    status: string;
    message: string;
  }>;
  oemIndicators?: {
    supported: boolean;
    freshness: 'fresh' | 'stale' | 'no_data' | 'unknown';
    indicators: Array<{
      key: string;
      label: string;
      status: 'active' | 'inactive' | 'unknown' | 'stale';
      severity: 'critical' | 'warning' | 'info' | 'unknown';
      description?: string;
    }>;
  };
  nextService?: {
    trackingStatus: 'TRACKED' | 'NO_TRACKING' | 'STALE';
    displayLine: string;
    days: number | null;
    km: number | null;
  };
}

/** @deprecated Use VehicleHealthTabSummaryDto */
export type VehicleHealthTabSummary = VehicleHealthTabSummaryDto;

// ── Phase 3: High Mobility Vehicle Activation types ──────

export type HmActivationState =
  | 'NOT_CONFIGURED'
  | 'ELIGIBLE'
  | 'CLEARANCE_PENDING'
  | 'APPROVED'
  | 'LINKED_ACTIVE'
  | 'REJECTED'
  | 'REVOKED'
  | 'ERROR';

/**
 * OEM onboarding path.
 * ELIGIBILITY_FIRST      — BMW, Mercedes, Toyota, Renault, Ford, etc.
 * DIRECT_FLEET_CLEARANCE — VW Group (Audi, VW, Skoda, SEAT, CUPRA) + Porsche
 * UNKNOWN                — unrecognized brand; safe fallback tries direct clearance
 */
export type HmOemPath = 'ELIGIBILITY_FIRST' | 'DIRECT_FLEET_CLEARANCE' | 'UNKNOWN';

export interface HmVehicleStatusDto {
  state: HmActivationState;
  hmVehicleId: string | null;
  vin: string;
  brand: string | null;
  clearanceStatus: string | null;
  eligibilityStatus: string | null;
  isLinked: boolean;
  linkedAt: string | null;
  lastCheckedAt: string | null;
  canActivate: boolean;
  canDeactivate: boolean;
  canCheckEligibility: boolean;
  canRefresh: boolean;
  /** OEM onboarding path — determines whether eligibility must be checked first. */
  oemPath: HmOemPath;
  /** True when brand uses direct fleet clearance and no HM record exists yet. */
  canRequestDirectClearance: boolean;
  /** Human-readable explanation for why eligibility is skipped (VW Group / Porsche). */
  routingNote: string | null;
}

export interface HmTirePressureSignals {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
  unit: string;
  statusFrontLeft: string | null;
  statusFrontRight: string | null;
  statusRearLeft: string | null;
  statusRearRight: string | null;
  overallStatus: 'OK' | 'ISSUE' | 'UNKNOWN';
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

export interface HmServiceSignals {
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

export interface HmAiHealthCareSignals {
  oilLevel: { value: unknown; unit: string | null; status: string | null } | null;
  limpModeActive: boolean | null;
  brakeLiningPreWarning: boolean | null;
  tirePressureWarning: boolean | null;
  dashboardLights: unknown | null;
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

export interface HmVehicleHealthPayload {
  hmActive: boolean;
  service: HmServiceSignals | null;
  tirePressure: HmTirePressureSignals | null;
  aiHealth: HmAiHealthCareSignals | null;
}

export interface HmIndicators {
  oilLevel: { value: unknown; status: 'LOW' | 'OK' | 'HIGH' | 'UNKNOWN'; unit: string | null } | null;
  limpMode: { active: boolean } | null;
  brakeLiningPreWarning: { active: boolean } | null;
  tirePressureWarning: { active: boolean } | null;
}

export type HmFreshnessStatus = 'fresh' | 'aging' | 'stale' | 'no_data';

export type AiHealthStatusLevel =
  | 'EXCELLENT'
  | 'GOOD'
  | 'ATTENTION_NEEDED'
  | 'CRITICAL'
  | 'NO_RECENT_DATA';

export interface OilLevelDisplay {
  mode: 'normalized_bar' | 'status_only' | 'no_data';
  value: number | null;
  label: string;
}

export interface AiHealthIndicators {
  limpMode: boolean | null;
  brakeWarning: boolean | null;
  tirePressureWarning: boolean | null;
  /**
   * Dashboard battery warning light (from OEM dashboard_lights.battery_low_warning
   * where available). null when the OEM does not stream this signal.
   */
  batteryWarningLight: boolean | null;
}

export type DashboardWarningLightState =
  | 'active'
  | 'off_confirmed'
  | 'no_event_yet'
  | 'unsupported'
  | 'stale'
  | 'error';

export type DashboardWarningSeverity = 'info' | 'warning' | 'critical' | 'unknown';

export type DashboardRentalImpact =
  | 'none'
  | 'watch'
  | 'inspect_before_next_rental'
  | 'block_rental';

export interface DashboardWarningLight {
  key: string;
  label: string;
  state: DashboardWarningLightState;
  severity: DashboardWarningSeverity;
  supported: boolean | null;
  observedAt: string | null;
  sourceSignal: string | null;
  sourceTimestamp: string | null;
  rawValue?: unknown;
  reason: string;
  action: string;
  rentalImpact: DashboardRentalImpact;
  /** Optional read-model enrichments */
  lastSeenAt?: string | null;
  lastConfirmedActiveAt?: string | null;
  lastConfirmedOffAt?: string | null;
  freshness?: DashboardWarningLightsResponse['freshness'];
  isCurrentActive?: boolean;
  isHistorical?: boolean;
}

export interface DashboardWarningLightsResponse {
  vehicleId: string;
  provider: 'HIGH_MOBILITY' | 'DIMO' | 'NONE' | 'UNKNOWN';
  connectionStatus: 'connected' | 'not_connected' | 'provider_error' | 'unknown';
  supportStatus: 'supported' | 'not_supported' | 'unknown' | 'not_connected' | 'no_data';
  freshness: 'fresh' | 'aging' | 'stale' | 'no_data' | 'error';
  overallStatus: 'good' | 'warning' | 'critical' | 'unknown';
  lastObservedAt: string | null;
  message: string;
  lights: DashboardWarningLight[];
  rentalHealthReady: boolean;
}

export interface AiHealthCareResponse extends HealthSummaryResponse {
  // ── New canonical fields ────────────────────────────────────────────────
  aiStatus: AiHealthStatusLevel;
  summaryText: string;
  reasons: string[];
  oilLevelDisplay: OilLevelDisplay;
  indicators: AiHealthIndicators;
  // ── Legacy HM fields ───────────────────────────────────────────────────
  hmIndicators: HmIndicators;
  lastHmUpdate: string | null;
  hmHealthActive: boolean;
  hmFreshnessStatus?: HmFreshnessStatus;
  hmLastErrorAt?: string | null;
  hmLastErrorMessage?: string | null;
  dashboardWarningLights: DashboardWarningLightsResponse;
}

// ── Vendor types ────────────────────────────────────────

export type VendorCategory =
  | 'WORKSHOP' | 'SERVICE_PARTNER' | 'PAINT_SHOP' | 'BODY_REPAIR'
  | 'AUTO_GLASS' | 'TIRE_DEALER' | 'PARTS_DEALER' | 'DETAILING'
  | 'TUV_STATION' | 'ONLINE_SUPPLIER' | 'OTHER'
  | 'INSURANCE' | 'APPRAISER' | 'TOWING' | 'DEALERSHIP' | 'OEM_SERVICE';

export type VendorSourceType = 'LOCAL_BUSINESS' | 'ONLINE_VENDOR';

/** Origin of the vendor record (manual vs prefilled from a Mapbox POI). */
export type VendorSource = 'MANUAL' | 'MAPBOX';

export type VendorVehicleRelationType =
  | 'PRIMARY_WORKSHOP' | 'TIRE_PARTNER' | 'BODY_SHOP' | 'GLASS_REPAIR'
  | 'CLEANING_PARTNER' | 'INSPECTION_PARTNER' | 'OTHER';

export interface VendorLinkedVehicle {
  id: string;
  make: string;
  model: string;
  licensePlate: string | null;
  year: number | null;
  vin?: string | null;
  /** Id of the VendorVehicle link row (used for update/unlink). */
  vendorVehicleId: string;
  relationType: VendorVehicleRelationType;
  isPreferred: boolean;
  priority: number | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
}

export interface Vendor {
  id: string;
  organizationId: string;
  name: string;
  category: VendorCategory;
  sourceType: VendorSourceType;
  source: VendorSource;
  externalPlaceId: string | null;
  street: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  serviceAreas: string[];
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactNotes: string | null;
  isActive: boolean;
  linkedVehicles: VendorLinkedVehicle[];
  linkedVehicleCount: number;
  invoiceCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Payload for create/update vendor master data (no vehicle links). */
export interface VendorInput {
  name: string;
  category?: VendorCategory;
  sourceType?: VendorSourceType;
  source?: VendorSource;
  externalPlaceId?: string | null;
  street?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  serviceAreas?: string[];
  contactName?: string | null;
  contactRole?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactNotes?: string | null;
  isActive?: boolean;
}

export interface VendorVehicleLinkInput {
  vehicleId: string;
  relationType?: VendorVehicleRelationType;
  isPreferred?: boolean;
  priority?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
}

export type VendorVehicleLinkUpdate = Omit<VendorVehicleLinkInput, 'vehicleId'>;

// ── Mapbox POI vendor search ────────────────────────────
export interface VendorMapboxSuggestion {
  mapboxId: string;
  name: string;
  category: VendorCategory;
  fullAddress: string | null;
  placeFormatted: string | null;
}

export interface VendorMapboxSearchResult {
  sessionToken: string;
  suggestions: VendorMapboxSuggestion[];
}

export interface VendorMapboxPrefill {
  name: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  category: VendorCategory;
  externalPlaceId: string | null;
  source: 'MAPBOX';
}

export interface VendorInvoiceRow {
  id: string;
  invoiceNumber: number;
  type: string;
  title: string;
  vehicleId: string | null;
  totalCents: number;
  currency: string;
  status: string;
  invoiceDate: string;
  dueDate: string | null;
}

export interface VendorAuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  changeSummary: string | null;
  level: string | null;
  userId: string | null;
  createdAt: string;
}

// ── Stations & Branches ─────────────────────────────────────────────────────
// Mirrors backend StationDto / StationsService.
export type StationStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type StationType = 'MAIN' | 'BRANCH' | 'PARKING' | 'PARTNER' | 'TEMPORARY';

export type StationOpeningHours = Record<
  string,
  { closed?: boolean; open?: string; close?: string; slots?: Array<{ open: string; close: string }> }
>;

export interface Station {
  id: string;
  name: string;
  code: string | null;
  status: StationStatus;
  statusLabel: string;
  type: StationType;
  typeLabel: string;
  isPrimary: boolean;
  address: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  radiusMeters: number | null;
  geofenceRadiusMeters: number | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  contactPerson: string | null;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  capacity: number | null;
  openingHours: StationOpeningHours | string | null;
  holidayRules: Record<string, unknown> | null;
  handoverInstructions: string | null;
  returnInstructions: string | null;
  notes: string | null;
  internalNotes: string | null;
  googlePlaceId: string | null;
  archivedAt: string | null;
  vehicleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StationOverviewStats {
  totalVehicles: number;
  availableVehicles: number;
  bookedVehicles: number;
  inServiceVehicles: number;
  vehiclesWithHealthWarnings: number | null;
  todayPickups: number;
  todayReturns: number;
  upcomingPickups: number;
  upcomingReturns: number;
  openTasks: number;
  capacity: number | null;
  capacityUsagePercent: number | null;
  hasMissingCoordinates: boolean;
  hasMissingOpeningHours: boolean;
  hasMissingPickupReturnRules: boolean;
}

export interface StationFleetVehicle {
  id: string;
  vehicleName: string | null;
  make: string;
  model: string;
  licensePlate: string | null;
  status: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
}

export interface StationBookingRow {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  pickupStationId: string | null;
  returnStationId: string | null;
  isOneWayRental: boolean;
  customerName: string;
  vehicleLabel: string;
}

export interface StationUpsertPayload {
  name: string;
  code?: string | null;
  type?: StationType;
  status?: StationStatus;
  isPrimary?: boolean;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  radiusMeters?: number | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  pickupEnabled?: boolean;
  returnEnabled?: boolean;
  afterHoursReturnEnabled?: boolean;
  keyBoxAvailable?: boolean;
  capacity?: number | null;
  openingHours?: StationOpeningHours | null;
  holidayRules?: Record<string, unknown> | null;
  handoverInstructions?: string | null;
  returnInstructions?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  googlePlaceId?: string | null;
}

export interface StationsStats {
  totalStations: number;
  activeStations: number;
  inactiveStations: number;
  totalVehicles: number;
  unassignedVehicles: number;
  stations: Array<{
    id: string;
    name: string;
    city: string | null;
    status: StationStatus;
    statusLabel: string;
    vehicleCount: number;
  }>;
}

export interface StationVehicleAssignmentResult {
  stationId: string;
  totalAssigned: number;
  newlyAttached: number;
  detached: number;
  movedFromOtherStations: number;
}

// V4.7.07 — One-shot Mapbox geocoding backfill summary returned by
// `api.stations.backfillCoordinates(orgId)`. Mirrors backend
// `StationGeocodingBackfillResult` in `stations.service.ts`.
export interface StationGeocodingBackfillResult {
  totalChecked: number;
  totalGeocoded: number;
  totalFailed: number;
  totalSkipped: number;
  results: Array<{
    stationId: string;
    stationName: string;
    status: 'geocoded' | 'failed' | 'skipped';
    latitude: number | null;
    longitude: number | null;
    reason?: string;
  }>;
}

export interface StationMapboxSuggestion {
  mapboxId: string;
  name: string;
  fullAddress: string | null;
  placeFormatted: string | null;
}

export interface StationMapboxSearchResult {
  sessionToken: string;
  suggestions: StationMapboxSuggestion[];
}

export interface StationMapboxPrefill {
  name: string | null;
  formattedAddress: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  externalPlaceId: string | null;
  source: 'MAPBOX';
}

/** @deprecated Legacy Google Places shape — use StationMapboxSuggestion */
export interface StationPlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

export interface StationPlaceDetails {
  name: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  googleMapsUrl: string | null;
}

export interface ChatMessageResponse {
  id?: string;
  role: string;
  content: string;
  createdAt: string;
  structured?: FleetChatStructuredPayload;
}

export interface FleetChatStructuredPayload {
  responseType: FleetChatResponseType;
  vehicle: { displayName: string | null; licensePlate: string | null } | null;
  dataFreshness: {
    freshness: string;
    observedAt: string | null;
    isLastKnown: boolean;
    label: string | null;
  };
  sources: { label: string }[];
  warnings: string[];
  partial: boolean;
  generatedAt: string;
  actions?: {
    kind: string;
    messageDe: string;
    messageEn: string;
  }[];
  usedDeterministicFallback: boolean;
  compactSummary?: {
    headline?: string;
    statusTone: 'good' | 'warning' | 'critical' | 'neutral' | 'info';
    facts: { id: string; label: string; value: string; tone?: 'good' | 'warning' | 'critical' | 'neutral' | 'info' }[];
  };
}

export const FLEET_CHAT_RESPONSE_TYPES = [
  'DIRECT_ANSWER',
  'LOCATION_SUMMARY',
  'HEALTH_SUMMARY',
  'OVERDUE_EXPLANATION',
  'BOOKING_SUMMARY',
  'COMBINED_SUMMARY',
  'PARTIAL_DATA',
  'INCONSISTENT_STATE',
  'PERMISSION_RESTRICTED',
  'AMBIGUITY_QUESTION',
  'TEMPORARY_UNAVAILABLE',
] as const;

export type FleetChatResponseType = (typeof FLEET_CHAT_RESPONSE_TYPES)[number];

export interface ChatAgentInfo {
  agent: { agentName: string; dimoAgentId: string; createdAt: string } | null;
  messageCount: number;
}

export interface SmsConfig {
  organizationId: string;
  hasConfigRow: boolean;
  isConnected: boolean;
  isActive: boolean;
  credentialsConfigured: boolean;
  webhookSigningConfigured: boolean;
  senderProfileConfigured: boolean;
  webhookEndpointConfigured: boolean;
  lastWebhookAt: string | null;
  updatedAt: string | null;
}

export interface WhatsAppConfig {
  id: string;
  organizationId: string;
  isConnected: boolean;
  isActive: boolean;
  phoneNumber: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  businessName: string | null;
  providerStatus?: 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR';
  providerConfigured?: boolean;
  accessTokenConfigured?: boolean;
  appSecretConfigured?: boolean;
  serviceWindowOpen?: boolean;
  aiMode: 'OFF' | 'SUGGEST_ONLY' | 'AUTO_SIMPLE' | 'FULL';
  aiCanCreateTasks: boolean;
  aiCanCreateSupport: boolean;
  aiCanUseBookings: boolean;
  aiCanContactVendors: boolean;
  aiEscalationEnabled: boolean;
  connectedAt: string | null;
  connectedByName: string | null;
  lastWebhookAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WhatsAppQuickActionId =
  | 'link_booking'
  | 'link_customer'
  | 'link_vehicle'
  | 'human_review'
  | 'assign_user'
  | 'create_task'
  | 'request_missing_documents'
  | 'send_pickup_instructions'
  | 'send_return_instructions'
  | 'send_handover_link'
  | 'send_return_link'
  | 'send_payment_deposit_reminder'
  | 'create_damage_followup_task'
  | 'close_conversation'
  | 'reopen_conversation';

export interface WhatsAppQuickActionDef {
  id: WhatsAppQuickActionId;
  label: string;
  enabled: boolean;
  reason?: string;
  requiresConfirm?: boolean;
}

export interface WhatsAppQuickActionPayload {
  bookingId?: string;
  customerId?: string;
  assignedUserId?: string;
  taskCategory?: string;
  taskTitle?: string;
  reason?: string;
}

export interface WhatsAppMsg {
  id: string;
  direction: 'incoming' | 'outgoing' | string;
  senderType: string;
  senderName: string | null;
  content: string;
  aiGenerated: boolean;
  aiSuggested: boolean;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | string;
  messageType?: string;
  templateName?: string | null;
  providerMessageId?: string | null;
  failureReason?: string | null;
  createdAt: string;
}

export interface WhatsAppStats {
  totalConversations: number;
  openConversations: number;
  totalMessages: number;
  aiMessages: number;
  unreadTotal: number;
  isConnected: boolean;
  isActive: boolean;
  providerStatus?: string;
  aiMode: string;
  lastWebhookAt?: string | null;
}

export interface WhatsAppSimulateResult {
  sandbox?: boolean;
  conversationId: string;
  message: WhatsAppMsg;
}

export type WhatsAppTemplateCategory =
  | 'BOOKING_CONFIRMATION'
  | 'PICKUP_REMINDER'
  | 'RETURN_REMINDER'
  | 'MISSING_DOCUMENTS'
  | 'PAYMENT_REMINDER'
  | 'DEPOSIT_REMINDER'
  | 'DAMAGE_FOLLOWUP'
  | 'HANDOVER_LINK'
  | 'RETURN_LINK'
  | 'SUPPORT_UPDATE'
  | 'VEHICLE_READY';

export type WhatsAppTemplateProviderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISABLED';

export interface WhatsAppTemplate {
  id: string;
  organizationId: string;
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  bodyTemplate: string;
  variableSchema?: Record<string, unknown> | null;
  providerStatus: WhatsAppTemplateProviderStatus;
  providerTemplateId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppTemplateCreatePayload {
  name: string;
  language?: string;
  category: WhatsAppTemplateCategory;
  bodyTemplate: string;
  variableSchema?: Record<string, unknown>;
}

// ─── Parts & Accessories Types ───────────────────────────────

export interface PartsProviderSummary {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  integrationType: string;
  supportedCategories: string[];
  healthStatus: string;
  capabilities: PartsProviderCapabilities | null;
}

export interface PartsProviderCapabilities {
  supportsEmbeddedSearch: boolean;
  supportsEmbeddedProductDetails: boolean;
  supportsEmbeddedCart: boolean;
  supportsEmbeddedCheckout: boolean;
  supportsRedirectCheckout: boolean;
  supportsVehicleFitment: boolean;
  supportsTireSearch: boolean;
  supportsPartsSearch: boolean;
  supportsAccessoriesSearch: boolean;
}

export interface PartsDisclosureTemplate {
  id: string;
  providerKey: string | null;
  category: string | null;
  version: number;
  title: string;
  body: string;
  isActive: boolean;
  effectiveFrom: string;
  createdAt: string;
}

export interface PartsDisclosedFieldSet {
  fields: string[];
  descriptions: Record<string, string>;
}

export interface PartsSearchParams {
  vehicleId: string;
  providerKey: string;
  category: 'TIRES' | 'PARTS' | 'ACCESSORIES';
  correlationId: string;
  query?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  filters?: Record<string, string | string[]>;
}

export interface PartsProductResult {
  id: string;
  externalId: string;
  providerKey: string;
  category: string;
  title: string;
  subtitle?: string;
  brand?: string;
  imageUrl?: string;
  priceNet?: number;
  priceGross?: number;
  currency: string;
  availabilityStatus: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  shippingInfo?: string;
  deliveryDays?: number;
  fitmentStatus: 'exact_fit' | 'likely_fit' | 'universal' | 'unknown';
  fitmentConfidence: number;
  fitmentNotes?: string;
  sellerName?: string;
  marketplaceName?: string;
  productUrl?: string;
  rating?: number;
  reviewCount?: number;
}

export interface PartsSearchResponse {
  results: PartsProductResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  searchDurationMs: number;
}

export interface PartsProductDetail extends PartsProductResult {
  description?: string;
  specifications?: Record<string, string>;
  images?: string[];
  checkoutUrl?: string;
  providerTermsNote?: string;
}

export interface PartsVehicleFitment {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  fuelType?: string;
  bodyType?: string;
  vin?: string;
  tireFrontSpec?: string;
  tireRearSpec?: string;
  driveType?: string;
  curbWeightKg?: number;
}

export interface PartsAuthorizationLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  vehicleId: string;
  providerKey: string;
  providerDisplayName: string;
  category: string;
  noticeVersion: number;
  confirmedAt: string;
  correlationId: string;
  executionStatus: string;
  executionFailureReason: string | null;
  createdAt: string;
}

export interface PartsConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message?: string;
  timestamp: string;
}

export interface PartsHealthOverview {
  totalProviders: number;
  activeProviders: number;
  healthyProviders: number;
  degradedProviders: number;
  downProviders: number;
  totalAuthorizations: number;
  recentErrors24h: number;
  providers: {
    id: string;
    key: string;
    displayName: string;
    isEnabled: boolean;
    healthStatus: string;
    lastTestedAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
  }[];
}

// ═══════════════════════════════════════════════════════════════
// Insurance Module Types
// ═══════════════════════════════════════════════════════════════

export interface InsuranceFleetOverview {
  vehicles: InsuranceFleetVehicle[];
  summary: {
    total: number;
    insured: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    pendingInquiry: number;
  };
}

export interface InsuranceFleetVehicle {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
    fuelType: string | null;
    imageUrl: string | null;
    mileageKm: number | null;
  };
  insurance: {
    id: string;
    insurerName: string | null;
    policyNumber: string | null;
    insuranceType: string | null;
    validFrom: string | null;
    validUntil: string | null;
    status: string;
    linkedDocumentIds: string[];
  } | null;
  status: string;
  hasPendingInquiry: boolean;
}

export interface InsuranceVehicleDetail {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
    fuelType: string | null;
    imageUrl: string | null;
    mileageKm: number | null;
  };
  records: {
    id: string;
    insurerName: string | null;
    policyNumber: string | null;
    insuranceType: string | null;
    validFrom: string | null;
    validUntil: string | null;
    status: string;
  }[];
  inquiries: InsuranceInquiryRow[];
  liveSharingPermissions: InsuranceLiveSharingEntry[];
}

export interface InsurancePartnerSummary {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  supportedInquiryTypes: string[];
  supportedInsuranceModels: string[];
  acceptedHistoricalData: string[];
  acceptedLiveData: string[];
  communicationChannel: string;
  healthStatus: string;
  slaInfo: string | null;
  supportsDynamicInsurance: boolean;
  supportsUsageBased: boolean;
  supportsKilometerBased: boolean;
  supportsDrivingScoreBased: boolean;
  primaryContact: string | null;
}

export interface InsuranceInquirySubmission {
  vehicleId: string;
  inquiryType: string;
  selectedInsurerIds: string[];
  selectedHistoricalData: Record<string, unknown>;
  selectedLiveData: Record<string, unknown>;
  selectedTimeRange: { from: string; to: string; label?: string };
  selectedInsuranceModels: string[];
}

export interface InsuranceInquiryResult {
  inquiryId: string;
  correlationId: string;
  recipients: {
    insurerId: string;
    insurerName: string;
    success: boolean;
    message?: string;
  }[];
}

export interface InsuranceInquiryRow {
  id: string;
  organizationId: string;
  userId: string;
  vehicleId: string;
  inquiryType: string;
  selectedInsuranceModels: string[];
  status: string;
  correlationId: string;
  createdAt: string;
  recipients: {
    id: string;
    insurerId: string;
    channelType: string;
    deliveryStatus: string;
    sentAt: string | null;
    responseStatus: string;
    failureReason: string | null;
    insurer: { displayName: string; key: string };
  }[];
}

export interface InsuranceLiveSharingEntry {
  id: string;
  organizationId: string;
  vehicleId: string;
  insurerId: string;
  enabledDataCategories: Record<string, unknown>;
  reportingFrequency: string | null;
  status: string;
  validFrom: string;
  validUntil: string | null;
  revokedAt: string | null;
  createdAt: string;
  insurer: { displayName: string; key: string };
}

export interface InsuranceMissingDocVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
}

export interface InsuranceDisclosureTemplate {
  id: string;
  insurerKey: string | null;
  inquiryType: string | null;
  version: number;
  title: string;
  body: string;
  isActive: boolean;
  effectiveFrom: string;
  createdAt: string;
}

export interface InsurancePartnerContactEntry {
  id: string;
  insurancePartnerId: string;
  fullName: string;
  roleTitle: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface InsuranceInquiryTemplateEntry {
  id: string;
  insurerKey: string | null;
  inquiryType: string | null;
  version: number;
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
  effectiveFrom: string;
}

export interface InsuranceConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message?: string;
  timestamp: string;
}

export interface InsuranceAuthorizationLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  vehicleId: string;
  insurerId: string;
  inquiryId: string | null;
  disclosedHistoricalData: Record<string, unknown>;
  authorizedLiveData: Record<string, unknown>;
  purpose: string;
  noticeVersion: number;
  confirmedAt: string;
  correlationId: string;
  transmissionChannel: string | null;
  transmissionResult: string | null;
  createdAt: string;
  insurer: { displayName: string; key: string };
}

export interface InsuranceHealthOverview {
  totalPartners: number;
  activePartners: number;
  healthyPartners: number;
  degradedPartners: number;
  downPartners: number;
  totalInquiries: number;
  recentFailures24h: number;
  activeLiveSharingPermissions: number;
  partners: {
    id: string;
    key: string;
    displayName: string;
    isEnabled: boolean;
    healthStatus: string;
    communicationChannel: string;
    lastTestedAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
    supportsDynamicInsurance: boolean;
  }[];
}

// ─── Voice Assistant ─────────────────────────────────

export type VoiceAssistantStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export type VoiceConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'DEGRADED'
  | 'CONNECTED'
  | 'ERROR';

export type VoiceConversationOutcome =
  | 'PENDING'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'FAILED'
  | 'ABANDONED';

export type VoiceConversationDirection = 'inbound' | 'outbound' | 'INBOUND' | 'OUTBOUND';

export type VoiceConversationStatus =
  | 'active'
  | 'completed'
  | 'failed'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'FAILED';

export type VoicePermissionMode = 'DISABLED' | 'SUGGEST_ONLY' | 'AUTONOMOUS';

export type VoiceToolCapabilityKey =
  | 'answerGeneralQuestions'
  | 'customerLookup'
  | 'bookingSearch'
  | 'createBookingDraft'
  | 'modifyBooking'
  | 'cancelBooking'
  | 'quotePrices'
  | 'createTask'
  | 'createDamageCase'
  | 'contactCustomer'
  | 'contactVendor'
  | 'modifyRecords'
  | 'emergencyEscalation';

export type VoiceToolPermissionsMap = Record<VoiceToolCapabilityKey, VoicePermissionMode>;

export interface VoiceToolPolicyCapability {
  key: VoiceToolCapabilityKey;
  label: string;
  mode: VoicePermissionMode;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  allowed: boolean;
  requiresHumanConfirmation: boolean;
  notes?: string;
}

export interface VoiceToolPolicy {
  version: 1;
  generatedAt: string;
  capabilities: VoiceToolPolicyCapability[];
  summary: {
    autonomous: VoiceToolCapabilityKey[];
    suggestOnly: VoiceToolCapabilityKey[];
    disabled: VoiceToolCapabilityKey[];
  };
}

/** Writable assistant fields accepted by PATCH /voice-assistant (matches backend DTO). */
export interface VoiceAssistantUpdatePayload {
  name?: string;
  role?: string;
  personality?: string;
  language?: string;
  voiceId?: string;
  voiceName?: string;
  greetingMessage?: string;
  systemPrompt?: string;
  companyContext?: string;
  businessRules?: string;
  forbiddenActions?: string;
  knowledgeSnippets?: string;
  telephonyEnabled?: boolean;
  inboundEnabled?: boolean;
  outboundEnabled?: boolean;
  permAnswerQuestions?: boolean;
  permManageBookings?: boolean;
  permCreateBookingDrafts?: boolean;
  permCancelBookings?: boolean;
  permCreateTasks?: boolean;
  permWorkshopHandling?: boolean;
  permBreakdownSupport?: boolean;
  permContactCustomers?: boolean;
  permContactVendors?: boolean;
  permModifyRecords?: boolean;
  permCreateActions?: boolean;
  permEmergencyHandling?: boolean;
  toolPermissions?: Partial<VoiceToolPermissionsMap>;
  escalationPhone?: string;
  escalationUserId?: string;
  escalationDepartment?: string;
  escalateOnLowConf?: boolean;
  escalateOnSensitive?: boolean;
  escalateOnRequest?: boolean;
  fallbackMessage?: string;
  escalationTriggers?: string[];
  businessHoursStart?: string;
  businessHoursEnd?: string;
  businessHoursTimezone?: string;
  afterHoursMessage?: string;
  businessHours?: Record<string, unknown>;
}

export interface VoiceAssistantData {
  id: string;
  organizationId: string;
  name: string;
  role: string | null;
  personality: string | null;
  language: string;
  voiceId: string | null;
  voiceName: string | null;
  greetingMessage: string | null;
  systemPrompt: string | null;
  companyContext: string | null;
  businessRules: string | null;
  forbiddenActions: string | null;
  knowledgeSnippets: string | null;
  provider: string;
  pstnProvider?: 'ELEVENLABS' | 'TWILIO' | string;
  elevenLabsAgentId: string | null;
  elevenLabsPhoneNumberId: string | null;
  phoneNumberId: string | null;
  phoneNumber: string | null;
  connectionStatus: VoiceConnectionStatus;
  lastProvisionedAt: string | null;
  lastSyncedAt: string | null;
  telephonyEnabled: boolean;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  permAnswerQuestions: boolean;
  permManageBookings: boolean;
  permCreateBookingDrafts: boolean;
  permCancelBookings: boolean;
  permCreateTasks: boolean;
  permWorkshopHandling: boolean;
  permBreakdownSupport: boolean;
  permContactCustomers: boolean;
  permContactVendors: boolean;
  permModifyRecords: boolean;
  permCreateActions: boolean;
  permEmergencyHandling: boolean;
  toolPermissions: VoiceToolPermissionsMap;
  toolPolicy?: VoiceToolPolicy;
  escalationPhone: string | null;
  escalationUserId: string | null;
  escalationDepartment: string | null;
  escalateOnLowConf: boolean;
  escalateOnSensitive: boolean;
  escalateOnRequest: boolean;
  fallbackMessage: string | null;
  escalationTriggers: string[] | Record<string, unknown> | null;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  businessHoursTimezone: string | null;
  afterHoursMessage: string | null;
  businessHours: Record<string, unknown> | null;
  status: VoiceAssistantStatus;
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  escalatedCalls: number;
  totalTalkTimeSeconds: number;
  totalTalkMinutes: number;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  deactivatedAt: string | null;
  telephonyStatus?: VoiceTelephonyStatusSnapshot;
}

export type VoiceTelephonyOperationalStatus =
  | 'provider_not_connected'
  | 'agent_not_provisioned'
  | 'no_phone_number'
  | 'assigned_inactive'
  | 'legacy_diagnostic_only'
  | 'ready_for_inbound'
  | 'telephony_disabled';

export interface VoiceTelephonyStatusSnapshot {
  status: VoiceTelephonyOperationalStatus;
  label: string;
  detail: string;
  providerConfigured: boolean;
  agentProvisioned: boolean;
  phoneAssigned: boolean;
  inboundReady: boolean;
  outboundEnabled: boolean;
}

export interface VoiceProviderPhoneNumber {
  provider?: 'elevenlabs' | 'twilio';
  phoneNumberId: string;
  phoneNumber: string | null;
  assignedAgentId: string | null;
  assignedToThisAssistant: boolean;
  assignedToOther: boolean;
}

export interface VoiceTelephonyRefreshResult {
  assistant: VoiceAssistantData;
  phoneNumbers: VoiceProviderPhoneNumber[];
  telephonyStatus: VoiceTelephonyStatusSnapshot;
}

export interface VoiceTelephonySettingsPayload {
  telephonyEnabled?: boolean;
  inboundEnabled?: boolean;
  outboundEnabled?: boolean;
}

export interface VoiceReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  required?: boolean;
  verification?: 'configured' | 'reachable' | 'authorized' | 'healthy' | 'unknown' | 'not_verified';
}

export interface VoiceAssistantReadiness {
  ready: boolean;
  checks: VoiceReadinessItem[];
  missing?: string[];
}

export interface VoiceOption {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

export interface VoiceAssistantTestSession {
  agentId: string | null;
  provider: string;
  status: 'ready' | 'blocked';
  instructions: string;
  expiresAt: string | null;
  warnings: string[];
  readinessSummary: {
    ready: boolean;
    missing: string[];
  };
  developerDetails: {
    signedUrl: string;
  } | null;
}

export interface VoiceSyncConversationsResult {
  synced: number;
  message?: string;
}

export interface VoiceAssistantAnalytics {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  escalatedCalls: number;
  escalationRate: number;
  avgDurationSeconds: number;
  totalTalkMinutes: number;
  totalTalkTimeSeconds: number;
  callsByOutcome: Record<string, number>;
  topEscalationReasons: Array<{ reason: string; count: number }>;
  knowledgeGaps: {
    available: boolean;
    message: string;
  };
  insights: {
    hasEnoughData: boolean;
    topEscalationInsight: string | null;
  };
}

export type VoicePlanCode = 'START' | 'PRO' | 'BUSINESS';

export interface VoicePlanEntitlements {
  includedMinutesPerMonth: number;
  overageCentsPerMinute: number;
  localPhoneNumbers: number;
  maxBranches: number | null;
  maxConcurrentCalls: number;
  supportedLanguages: string[];
}

export interface VoicePlanCatalogEntry {
  code: VoicePlanCode;
  catalogVersion: string;
  currency: string;
  monthlyFeeCents: number;
  monthlyFeeEuros: number;
  setupFeeCents: number;
  setupFeeEuros: number;
  entitlements: VoicePlanEntitlements;
}

export interface VoiceSubscriptionRecord {
  id: string;
  status: string;
  planCode: VoicePlanCode;
  planCatalogVersion: string;
  setupFeeCents: number;
  setupFeePaidAt: string | null;
  pendingPlanCode: string | null;
  pendingPlanEffectiveAt: string | null;
  trialEndsAt: string | null;
  activatedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface VoiceSubscriptionResponse {
  subscription: VoiceSubscriptionRecord | null;
  plan: Omit<VoicePlanCatalogEntry, 'monthlyFeeEuros' | 'setupFeeEuros'> | null;
}

export interface VoiceUsageSummary {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  planCode: VoicePlanCode | null;
  planCatalogVersion: string | null;
  includedMinutes: number;
  consumedMinutes: number;
  inboundMinutes: number;
  outboundMinutes: number;
  remainingIncludedMinutes: number;
  overageMinutes: number;
  currency: string;
  estimatedUsageRevenueCents: number;
  monthlyBaseFeeCents: number;
}

export interface VoiceRemainingMinutes {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  includedMinutes: number;
  consumedMinutes: number;
  remainingIncludedMinutes: number;
  overageMinutes: number;
}

export interface VoiceUsageForecast {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  projectedMinutes: number;
  projectedOverageMinutes: number;
  projectedRevenueCents: number;
  monthlyBaseFeeCents: number;
  setupFeeOutstandingCents: number;
}

export interface VoiceBudgetPolicy {
  id: string;
  organizationId: string;
  monthlyBudgetCents: number | null;
  dailyLimitCents: number | null;
  dailyOutboundMinutesLimit: number | null;
  maxConversationDurationSeconds: number | null;
  maxConcurrentCalls: number | null;
  overflowBehavior: string | null;
  destinationRegionPolicy: string | null;
}

export interface VoiceProtectionStatus {
  snapshot: {
    consumedMonthlyCents: number;
    consumedDailyOutboundMinutes: number;
    monthlyBudgetCents: number | null;
    usagePct: number | null;
    activeOverrides: number;
  };
  forecast: Record<string, unknown> | null;
  policy: VoiceBudgetPolicy | null;
}

export type VoiceBudgetPolicyUpdate = Partial<{
  monthlyBudgetCents: number;
  dailyLimitCents: number;
  dailyOutboundMinutesLimit: number;
  maxConversationDurationSeconds: number;
  maxConcurrentCalls: number;
  overflowBehavior: 'WARN' | 'HARD_STOP' | 'ALLOW_OVERAGE';
  destinationRegionPolicy: 'DE_ONLY' | 'DE_EEA' | 'CUSTOM';
}>;

export interface VoiceAssistantAdminOverviewRow {
  organizationId: string;
  organizationName: string;
  assistantStatus: VoiceAssistantStatus | 'NOT_CONFIGURED' | string;
  readinessPercent: number;
  missingReadinessItemsCount: number;
  elevenLabsConnected: boolean;
  twilioConnected?: boolean;
  agentProvisioned: boolean;
  telephonyEnabled: boolean;
  phoneNumber: string | null;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  totalCalls: number;
  callsToday: number;
  escalatedCalls: number;
  missedCalls: number;
  lastCallAt: string | null;
  lastSyncedAt: string | null;
  providerWarning: string | null;
  lastError: string | null;
  connectionStatus?: VoiceConnectionStatus | null;
  telephonyLabel?: string;
}

export interface VoiceAssistantAdminOverview {
  assistants: VoiceAssistantAdminOverviewRow[];
  summary: {
    totalOrgs: number;
    configuredOrgs: number;
    activeOrgs: number;
    totalCalls: number;
    totalMinutes: number;
    totalTalkTimeSeconds: number;
    costTrackingConnected: boolean;
    costTrackingMessage: string;
  };
  providerConfigured: boolean;
  elevenLabsConfigured?: boolean;
  twilioConfigured?: boolean;
}

export interface VoiceConversationAdminSummary {
  id: string;
  startedAt: string;
  direction: VoiceConversationDirection;
  callerNumber: string | null;
  durationSeconds: number | null;
  status?: string;
  outcome: VoiceConversationOutcome;
  summary: string | null;
  hasTranscript: boolean;
  escalated: boolean;
  escalationReason: string | null;
  linkedBookingId?: string | null;
  linkedCustomerId?: string | null;
  linkedVehicleId?: string | null;
  taskId?: string | null;
}

export interface VoiceAssistantAdminOrgDetail {
  exists: boolean;
  organization?: { id: string; companyName: string };
  assistant?: Partial<VoiceAssistantData> & {
    hasAgent?: boolean;
  };
  readiness?: VoiceAssistantReadiness;
  telephonyStatus?: {
    status: string;
    label: string;
    detail: string;
    providerConfigured: boolean;
    agentProvisioned: boolean;
    phoneAssigned: boolean;
    inboundReady: boolean;
    outboundEnabled: boolean;
  };
  warnings?: string[];
  providerConfigured?: boolean;
  recentConversations?: VoiceConversationAdminSummary[];
  costTracking?: {
    connected: boolean;
    message: string;
  };
}

export interface VoiceMasterAdminOrgBilling {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  planCode: string | null;
  planCatalogVersion: string | null;
  includedMinutes: number;
  consumedMinutes: number;
  inboundMinutes: number;
  outboundMinutes: number;
  remainingIncludedMinutes: number;
  overageMinutes: number;
  currency: string;
  estimatedUsageRevenueCents: number;
  monthlyBaseFeeCents: number;
  providerCostCents: number;
  revenueCents: number;
  marginCents: number;
  marginPercent: number | null;
  setupFeeOutstandingCents: number;
  estimatedCostCents: number;
  finalCostCents: number;
}

export interface VoiceControlPlanePlatformStatus {
  checkedAt: string;
  providers: {
    elevenLabs: { ok: boolean; label: string };
    twilioIe1: { ok: boolean; label: string };
    mcpGateway: { ok: boolean; label: string };
    webhookIngestion: { ok: boolean; label: string };
  };
  queues: {
    waiting: number;
    active: number;
    failed: number;
    webhookBacklog: number;
  };
  webhooks: {
    byStatus: Record<string, number>;
    dlqCount24h: number;
    avgProcessingDelayMs: number | null;
  };
  activeIncidents: Array<{ id: string; severity: 'critical' | 'warning'; message: string }>;
}

export type VoiceControlPlaneOrganizationRow = VoiceAssistantAdminOverviewRow & {
  planCode: string | null;
  subscriptionStatus: string | null;
  subaccountStatus: string | null;
  consumedMinutes: number;
  remainingMinutes: number;
  monthlyBudgetCents: number | null;
  maxConcurrentCalls: number | null;
  openErrors: number;
};

export interface VoiceControlPlaneOrganizationsResponse {
  summary: VoiceAssistantAdminOverview['summary'];
  organizations: VoiceControlPlaneOrganizationRow[];
}

export interface VoiceControlPlanePhoneNumberRow {
  id: string;
  organizationId: string;
  organizationName: string;
  maskedPhoneNumber: string;
  status: string;
  region: string | null;
  regulatoryStatus: string | null;
  elevenLabsAssigned: boolean;
  updatedAt: string;
}

export interface VoiceControlPlaneWebhookEventRow {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  provider: string;
  eventType: string | null;
  status: string;
  receivedAt: string;
  processedAt: string | null;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  diagnosticSummary: string | null;
}

export interface VoiceControlPlaneWebhookEventsResponse {
  total: number;
  items: VoiceControlPlaneWebhookEventRow[];
}

export interface VoiceControlPlaneAuditEventRow {
  id: string;
  category: 'protection' | 'tool_approval' | 'tool_execution';
  organizationId: string;
  organizationName: string;
  action: string;
  reasonCode: string | null;
  message: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface VoiceControlPlaneAuditEventsResponse {
  items: VoiceControlPlaneAuditEventRow[];
}

export interface VoiceControlPlaneOrgWorkspace {
  detail: VoiceAssistantAdminOrgDetail;
  subscription: Record<string, unknown> | null;
  billing: VoiceMasterAdminOrgBilling | null;
  protectionAudit: Array<Record<string, unknown>>;
  providerAccounts: Array<{
    id: string;
    provider: string;
    status: string;
    maskedExternalRef: string | null;
    region: string | null;
    updatedAt: string;
  }>;
  phoneNumbers: Array<{
    id: string;
    maskedPhoneNumber: string;
    status: string;
    region: string | null;
    regulatoryStatus: string | null;
    elevenLabsAssigned: boolean;
  }>;
  provisioningJobs: Array<{
    id: string;
    jobType: string;
    status: string;
    currentStep: string | null;
    resumeStep: string | null;
    lastError: string | null;
    updatedAt: string;
  }>;
  agentDeployment: {
    draft: Record<string, unknown> | null;
    diff: Record<string, unknown> | null;
  };
}

// ── High Mobility types ──────────────────────────────────────────────────────

export type HmPackageType = 'HEALTH' | 'FULL_TELEMETRY';
export type HmSourceMode  = 'DIMO_PLUS_HM' | 'HM_ONLY';
export type HmEligibilityStatus = 'UNKNOWN' | 'PENDING' | 'ELIGIBLE' | 'INELIGIBLE' | 'ERROR';
export type HmDeliveryMode = 'PULL' | 'PUSH' | 'BOTH';
export type HmClearanceStatus =
  | 'DRAFT' | 'CLEARANCE_PENDING' | 'APPROVED' | 'REJECTED'
  | 'ERROR' | 'REVOKING' | 'REVOKED' | 'CANCELED';

// Phase 2 types
export type HmRegistrationState = 'NOT_REGISTERED' | 'REGISTRATION_PENDING' | 'REGISTERED' | 'REGISTRATION_FAILED';
export type HmStreamingState = 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
export type HmIngestStatus = 'RECEIVED' | 'PARSED' | 'STORED' | 'FAILED' | 'DEDUPLICATED';
export type HmMqttConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR' | 'DISABLED';

export interface HmVehicleDto {
  id: string;
  organizationId: string | null;
  synqdriveVehicleId: string | null;
  vin: string;
  brand: string;
  packageType: HmPackageType;
  sourceMode: HmSourceMode;
  eligibilityStatus: HmEligibilityStatus;
  eligibilityDeliveryMode: HmDeliveryMode | null;
  eligibilityCheckedAt: string | null;
  clearanceStatus: HmClearanceStatus;
  clearanceRequestedAt: string | null;
  clearanceApprovedAt: string | null;
  clearanceLastCheckedAt: string | null;
  hmVehicleReference: string | null;
  isLinked: boolean;
  linkedAt: string | null;
  isActive: boolean;
  // Phase 2
  registrationState: HmRegistrationState;
  registeredAt: string | null;
  streamingState: HmStreamingState;
  providerMode: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phase 2: Streaming readiness
export interface HmStreamingReadinessDto {
  hmVehicleId: string;
  vin: string;
  packageType: HmPackageType;
  sourceMode: HmSourceMode;
  clearanceStatus: HmClearanceStatus;
  streamingState: HmStreamingState;
  mqttEnabled: boolean;
  mqttConfigured: boolean;
  ready: boolean;
  checks: { key: string; label: string; ok: boolean; note?: string }[];
}

// Phase 2: MQTT consumer status
export interface HmMqttConsumerStatusDto {
  environment: string;
  applicationId: string;
  consumerGroup: string;
  connectionState: HmMqttConnectionState;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  mqttEnabled: boolean;
  certConfigured: boolean;
  updatedAt: string;
}

// Phase 2: Stream sync log
export interface HmStreamSyncLogDto {
  id: string;
  highMobilityVehicleId: string | null;
  vin: string | null;
  messageId: string;
  topic: string;
  messageTimestamp: string | null;
  ingestStatus: HmIngestStatus;
  isDuplicate: boolean;
  normalizedSummaryJson: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface HmVehicleListDto {
  health: HmVehicleDto[];
  fullTelemetry: HmVehicleDto[];
  total: number;
}

export interface HmEligibilityResultDto {
  vin: string;
  brand: string;
  eligibilityStatus: HmEligibilityStatus;
  deliveryMode: HmDeliveryMode | null;
  capabilities: Record<string, unknown> | null;
  checkedAt: string;
  rawResponse: Record<string, unknown> | null;
}

export interface HmAvailabilityDto {
  vin: string;
  available: boolean;
  packageType: HmPackageType | null;
  clearanceStatus: HmClearanceStatus | null;
  hmVehicleId: string | null;
  isLinked: boolean;
  linkedVehicleId: string | null;
}

export interface HmStatusHistoryDto {
  id: string;
  highMobilityVehicleId: string;
  eventType: string;
  oldStatus: string | null;
  newStatus: string | null;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
}
