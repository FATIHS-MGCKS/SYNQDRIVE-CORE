import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { buildAvailableSignalsQuery } from './queries/available-signals.query';
import { buildLatestSnapshotQuery } from './queries/latest-vehicle-snapshot.query';
import { buildLastSeenLocationQuery } from './queries/last-seen-location.query';
import {
  buildBatteryCapabilityPreflightQuery,
  buildRechargeSegmentsProbeQuery,
} from './queries/battery-capability-preflight.query';
import { DimoProviderGateway } from './provider/dimo-provider-gateway.service';
import { DimoProviderOperation } from './provider/dimo-provider-gateway.types';
import type { DimoProviderRequestContext } from './provider/dimo-provider-gateway.types';
import { buildDimoProviderRequestContext } from './provider/dimo-provider-request-context.util';
import { DimoRequestExecutor } from './provider-budget/dimo-request-executor.service';
import type { DimoProviderCategory } from './provider-budget/dimo-provider-category.types';
import { getDimoRequestContext } from './provider-budget/dimo-request-context';
import { DimoRateLimitedError, isAxiosTimeout, readAxiosStatus } from './provider-budget/dimo-http-error.util';
import { DimoProviderRequestPriority } from './provider/dimo-provider-limiter.types';
import type { FsdGraphqlErrorV1 } from './fsd-graphql.types.v1';
import { computeFsdQueryFingerprintV1, normalizeFsdQueryTextForFingerprintV1 } from './fsd-query-fingerprint.v1';
import type {
  FsdDimoGraphqlExecutionResultV1,
  FsdDimoGraphqlOutcomeKindV1,
} from './fsd-dimo-graphql-result';

export type { DimoProviderRequestContext };

export interface DimoGraphQLHttpTiming {
  acquisitionRequestedAt: Date;
  httpRequestStartedAt: Date;
  httpResponseReceivedAt: Date;
  processingCompletedAt: Date;
  /** Earliest defensible SynqDrive receipt of provider HTTP response (RP-039). */
  synqReceivedAt: Date;
}

export interface DimoGraphQLIngressTimingResult {
  result: any;
  timing: DimoGraphQLHttpTiming;
  /** Alias fields for backward compatibility */
  requestStartedAt: Date;
  requestCompletedAt: Date;
  synqReceivedAt: Date;
}

export interface BatteryCapabilityPreflightSnapshot {
  availableSignals: string[] | null;
  signalsLatest: Record<string, unknown> | null;
  queryError?: string | null;
}

export interface RechargeSegmentProbeRow {
  start?: { timestamp?: string | null } | null;
  end?: { timestamp?: string | null } | null;
}

export interface RechargeSegmentsProbeSnapshot {
  segments: RechargeSegmentProbeRow[];
  queryError?: string | null;
}

export interface VehicleSummary {
  odometerKm: number | null;
  batteryPercent: number | null;
  fuelPercent: number | null;
  lastSignalAt: Date | null;
  powertrainType: string | null;
  speedKmh: number | null;
}

@Injectable()
export class DimoTelemetryService {
  private readonly logger = new Logger(DimoTelemetryService.name);
  private readonly client: AxiosInstance;
  /** FSD: reject oversized JSON bodies to protect memory (configurable via DIMO_FSD_GRAPHQL_MAX_RESPONSE_BYTES). */
  private readonly fsdGraphqlMaxResponseBytes: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly dimoRequestExecutor: DimoRequestExecutor,
    private readonly providerGateway: DimoProviderGateway,
  ) {
    const telemetryApiUrl =
      this.configService.get<string>('dimo.telemetryApiUrl') ??
      'https://telemetry-api.dimo.zone/query';
    const timeout =
      this.configService.get<number>('dimo.requestTimeoutMs') ?? 10000;

    this.client = axios.create({
      baseURL: telemetryApiUrl,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });
    this.fsdGraphqlMaxResponseBytes = Math.max(
      64 * 1024,
      parseInt(process.env.DIMO_FSD_GRAPHQL_MAX_RESPONSE_BYTES || `${12 * 1024 * 1024}`, 10),
    );
  }

  async fetchLatestVehicleSnapshot(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<unknown> {
    const query = buildLatestSnapshotQuery(tokenId);
    const result = await this.queryGraphQL(
      vehicleJwt,
      query,
      undefined,
      buildDimoProviderRequestContext(tokenId, requestContext),
    );
    return result?.data ?? result;
  }

  async fetchAvailableSignals(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<string[]> {
    const query = buildAvailableSignalsQuery(tokenId);
    const result = await this.queryGraphQL(
      vehicleJwt,
      query,
      undefined,
      buildDimoProviderRequestContext(tokenId, requestContext),
    );
    const list = result?.data?.availableSignals;
    return Array.isArray(list)
      ? list.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  async fetchBatteryCapabilityPreflightSnapshot(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<BatteryCapabilityPreflightSnapshot> {
    const query = buildBatteryCapabilityPreflightQuery(tokenId);
    const context = buildDimoProviderRequestContext(tokenId, requestContext);
    try {
      const result = await this.queryGraphQL(vehicleJwt, query, undefined, context);
      const available = result?.data?.availableSignals;
      const availableSignals = Array.isArray(available)
        ? available.filter((entry): entry is string => typeof entry === 'string')
        : null;
      const signalsLatest = (result?.data?.signalsLatest ?? null) as
        | Record<string, unknown>
        | null;

      const gqlErrors = result?.errors;
      const queryError =
        Array.isArray(gqlErrors) && gqlErrors.length > 0
          ? gqlErrors
              .map((entry: { message?: string }) => entry?.message ?? 'GraphQL error')
              .join('; ')
          : null;

      return {
        availableSignals,
        signalsLatest,
        queryError,
      };
    } catch (error) {
      return {
        availableSignals: null,
        signalsLatest: null,
        queryError:
          error instanceof Error
            ? error.message
            : 'DIMO battery capability preflight failed',
      };
    }
  }

  async probeRechargeSegments(
    vehicleJwt: string,
    tokenId: number,
    from: Date,
    to: Date,
    requestContext?: DimoProviderRequestContext,
  ): Promise<RechargeSegmentsProbeSnapshot> {
    const query = buildRechargeSegmentsProbeQuery(
      tokenId,
      from.toISOString(),
      to.toISOString(),
    );
    const context = buildDimoProviderRequestContext(tokenId, requestContext);
    try {
      const result = await this.queryGraphQL(vehicleJwt, query, undefined, context);
      const segments = Array.isArray(result?.data?.segments)
        ? (result.data.segments as RechargeSegmentProbeRow[])
        : [];
      const gqlErrors = result?.errors;
      const queryError =
        Array.isArray(gqlErrors) && gqlErrors.length > 0
          ? gqlErrors
              .map((entry: { message?: string }) => entry?.message ?? 'GraphQL error')
              .join('; ')
          : null;
      return { segments, queryError };
    } catch (error) {
      return {
        segments: [],
        queryError:
          error instanceof Error
            ? error.message
            : 'DIMO recharge segments probe failed',
      };
    }
  }

  async fetchLastSeenLocation(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<unknown> {
    const query = buildLastSeenLocationQuery(tokenId);
    const result = await this.queryGraphQL(
      vehicleJwt,
      query,
      undefined,
      buildDimoProviderRequestContext(tokenId, requestContext),
    );
    return result?.data ?? result;
  }

  /**
   * FSD discovery path: single HTTP attempt per reserved FSD slot, global budget via gateway + executor (maxRetries=0).
   * Returns a classified envelope — does not throw for GraphQL-only failures (preserves FSD evidence semantics).
   */
  async queryFsdGraphql(input: {
    vehicleJwt: string;
    query: string;
    variables?: Record<string, unknown>;
    expectedQueryFingerprint: string;
    requestContext?: DimoProviderRequestContext;
  }): Promise<FsdDimoGraphqlExecutionResultV1> {
    const tokenId =
      input.requestContext?.tokenId ??
      (typeof input.variables?.tokenId === 'number' ? (input.variables.tokenId as number) : undefined);

    const computedFp = computeFsdQueryFingerprintV1(
      normalizeFsdQueryTextForFingerprintV1(input.query),
    );
    if (computedFp !== input.expectedQueryFingerprint) {
      return {
        kind: 'QUERY_FINGERPRINT_MISMATCH',
        httpStatus: null,
        data: null,
        errors: [],
        diagnostic: 'client_query_fingerprint_mismatch',
      };
    }

    try {
      return await this.providerGateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        priority: DimoProviderRequestPriority.P4_BACKGROUND,
        requestContext: buildDimoProviderRequestContext(tokenId, input.requestContext),
        invoke: () =>
          this.dimoRequestExecutor.execute({
            category: 'ADMIN',
            priority: 'BACKGROUND',
            maxRetries: 0,
            bypassBudget: false,
            execute: async () => {
              const raw = await this.postGraphQLRaw(
                input.vehicleJwt,
                input.query,
                {
                  throwOnGraphqlErrorsWithoutData: false,
                  fsdTelemetryPath: true,
                },
                input.variables,
              );
              return this.classifyFsdGraphqlPayload(raw.httpStatus, raw.payload);
            },
          }),
      });
    } catch (err) {
      return this.classifyFsdGraphqlTransportError(err);
    }
  }

  async queryGraphQL(
    vehicleJwt: string,
    query: string,
    variables?: Record<string, any>,
    requestContext?: DimoProviderRequestContext,
    category?: DimoProviderCategory,
  ): Promise<any> {
    const tokenId =
      requestContext?.tokenId ??
      (typeof variables?.tokenId === 'number' ? variables.tokenId : undefined);
    const ctx = getDimoRequestContext();
    const resolvedCategory = category ?? ctx.category;

    return this.providerGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: buildDimoProviderRequestContext(tokenId, requestContext),
      invoke: () =>
        this.dimoRequestExecutor.execute({
          category: resolvedCategory,
          priority: ctx.priority,
          execute: () => this.postGraphQL(vehicleJwt, query, variables),
        }),
    });
  }

  /**
   * GraphQL query with explicit ingress timing captured at the Axios HTTP boundary (RP-039).
   */
  async queryGraphQLWithIngressTiming(
    vehicleJwt: string,
    query: string,
    variables?: Record<string, any>,
    requestContext?: DimoProviderRequestContext,
    category?: DimoProviderCategory,
  ): Promise<DimoGraphQLIngressTimingResult> {
    const acquisitionRequestedAt = new Date();
    const tokenId =
      requestContext?.tokenId ??
      (typeof variables?.tokenId === 'number' ? variables.tokenId : undefined);
    const ctx = getDimoRequestContext();
    const resolvedCategory = category ?? ctx.category;

    const posted = await this.providerGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: buildDimoProviderRequestContext(tokenId, requestContext),
      invoke: () =>
        this.dimoRequestExecutor.execute({
          category: resolvedCategory,
          priority: ctx.priority,
          execute: () =>
            this.postGraphQLWithHttpTiming(vehicleJwt, query, variables, acquisitionRequestedAt),
        }),
    });

    return {
      result: posted.data,
      timing: posted.timing,
      requestStartedAt: acquisitionRequestedAt,
      requestCompletedAt: posted.timing.processingCompletedAt,
      synqReceivedAt: posted.timing.synqReceivedAt,
    };
  }

  private async postGraphQLWithHttpTiming(
    vehicleJwt: string,
    query: string,
    variables?: Record<string, any>,
    acquisitionRequestedAt: Date = new Date(),
  ): Promise<{ data: any; timing: DimoGraphQLHttpTiming }> {
    const raw = await this.postGraphQLRaw(
      vehicleJwt,
      query,
      {
        acquisitionRequestedAt,
        throwOnGraphqlErrorsWithoutData: true,
      },
      variables,
    );
    return { data: raw.payload, timing: raw.timing };
  }

  private async postGraphQLRaw(
    vehicleJwt: string,
    query: string,
    options: {
      acquisitionRequestedAt?: Date;
      throwOnGraphqlErrorsWithoutData: boolean;
      /** FSD: do not log GraphQL error message bodies (low-cardinality only). */
      fsdTelemetryPath?: boolean;
    },
    variables?: Record<string, any>,
  ): Promise<{
    httpStatus: number;
    payload: unknown;
    timing: DimoGraphQLHttpTiming;
  }> {
    const acquisitionRequestedAt = options.acquisitionRequestedAt ?? new Date();
    const body: Record<string, unknown> = { query };
    if (variables) body.variables = variables;

    const httpRequestStartedAt = new Date();
    const response = await this.client.post('', body, {
      headers: { Authorization: `Bearer ${vehicleJwt}` },
      timeout: 15000,
    });
    const httpResponseReceivedAt = new Date();

    const gqlErrors = (response.data as { errors?: unknown })?.errors;
    if (Array.isArray(gqlErrors) && gqlErrors.length > 0) {
      if (options.fsdTelemetryPath) {
        this.logger.warn(
          `GraphQL response contains errors (FSD path: messages redacted; count=${gqlErrors.length})`,
        );
      } else {
        const messages = gqlErrors
          .map((e: { message?: string }) => e?.message ?? 'GraphQL error')
          .join('; ');
        this.logger.warn(`GraphQL response contains errors: ${messages}`);
      }

      if (options.throwOnGraphqlErrorsWithoutData && !(response.data as { data?: unknown })?.data) {
        if (options.fsdTelemetryPath) {
          throw new Error('DIMO GraphQL error (details redacted)');
        }
        const messages = gqlErrors
          .map((e: { message?: string }) => e?.message ?? 'GraphQL error')
          .join('; ');
        throw new Error(`DIMO GraphQL error: ${messages}`);
      }
    }

    const processingCompletedAt = new Date();
    return {
      httpStatus: response.status,
      payload: response.data,
      timing: {
        acquisitionRequestedAt,
        httpRequestStartedAt,
        httpResponseReceivedAt,
        processingCompletedAt,
        synqReceivedAt: httpResponseReceivedAt,
      },
    };
  }

  private normalizeGqlErrors(raw: unknown): readonly FsdGraphqlErrorV1[] {
    if (!Array.isArray(raw)) return [];
    const out: FsdGraphqlErrorV1[] = [];
    for (const entry of raw) {
      if (entry == null || typeof entry !== 'object') continue;
      const e = entry as { message?: unknown; path?: unknown };
      const path = Array.isArray(e.path)
        ? e.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number')
        : undefined;
      out.push({
        message: typeof e.message === 'string' ? e.message : undefined,
        path,
      });
    }
    return out;
  }

  private estimateJsonBytes(payload: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  private classifyFsdGraphqlPayload(httpStatus: number, payload: unknown): FsdDimoGraphqlExecutionResultV1 {
    if (httpStatus !== 200) {
      return this.mapHttpStatusToFsdOutcome(httpStatus, null, []);
    }
    if (payload == null || typeof payload !== 'object') {
      return {
        kind: 'MALFORMED_RESPONSE',
        httpStatus,
        data: null,
        errors: [],
        diagnostic: 'payload_not_object',
      };
    }
    const size = this.estimateJsonBytes(payload);
    if (size > this.fsdGraphqlMaxResponseBytes) {
      return {
        kind: 'OVERSIZED_RESPONSE',
        httpStatus,
        data: null,
        errors: [],
        diagnostic: 'max_response_bytes_exceeded',
      };
    }
    const p = payload as { data?: unknown; errors?: unknown };
    const errors = this.normalizeGqlErrors(p.errors);
    const data =
      p.data != null && typeof p.data === 'object' ? (p.data as Record<string, unknown>) : null;

    if (Array.isArray(p.errors) && p.errors.length > 0 && !data) {
      return {
        kind: 'GRAPHQL_ERRORS_NO_DATA',
        httpStatus,
        data: null,
        errors,
      };
    }
    if (Array.isArray(p.errors) && p.errors.length > 0 && data) {
      return {
        kind: 'HTTP_200_PARTIAL_GRAPHQL_ERRORS',
        httpStatus,
        data,
        errors,
      };
    }
    return { kind: 'HTTP_200_OK', httpStatus, data, errors: [] };
  }

  private mapHttpStatusToFsdOutcome(
    status: number,
    data: Record<string, unknown> | null,
    errors: readonly FsdGraphqlErrorV1[],
  ): FsdDimoGraphqlExecutionResultV1 {
    let kind: FsdDimoGraphqlOutcomeKindV1 = 'TIMEOUT_OR_NETWORK_UNKNOWN';
    if (status === 400) kind = 'HTTP_400';
    else if (status === 401) kind = 'HTTP_401';
    else if (status === 403) kind = 'HTTP_403';
    else if (status === 422) kind = 'HTTP_422';
    else if (status === 429) kind = 'HTTP_429';
    else if (status >= 500 && status < 600) kind = 'HTTP_5XX';
    else if (status === 200) kind = 'MALFORMED_RESPONSE';
    return { kind, httpStatus: status, data, errors };
  }

  private classifyFsdGraphqlTransportError(err: unknown): FsdDimoGraphqlExecutionResultV1 {
    if (err instanceof DimoRateLimitedError) {
      return {
        kind: 'HTTP_429',
        httpStatus: err.httpStatus ?? 429,
        data: null,
        errors: [],
        diagnostic: 'executor_rate_limited',
      };
    }
    const status = readAxiosStatus(err);
    if (status != null) {
      return this.mapHttpStatusToFsdOutcome(status, null, []);
    }
    if (isAxiosTimeout(err) || (isAxiosError(err) && err.code === 'ECONNRESET')) {
      return {
        kind: 'TIMEOUT_OR_NETWORK_UNKNOWN',
        httpStatus: null,
        data: null,
        errors: [],
        diagnostic: isAxiosTimeout(err) ? 'axios_timeout' : 'network_reset',
      };
    }
    return {
      kind: 'MALFORMED_RESPONSE',
      httpStatus: null,
      data: null,
      errors: [],
      diagnostic: 'unknown_transport_error',
    };
  }

  private async postGraphQL(
    vehicleJwt: string,
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    const posted = await this.postGraphQLWithHttpTiming(vehicleJwt, query, variables);
    return posted.data;
  }

  async fetchVehicleSummary(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<VehicleSummary> {
    const query = `
      query VehicleSummary {
        signalsLatest(tokenId: ${tokenId}) {
          lastSeen
          powertrainTransmissionTravelledDistance { value }
          powertrainTractionBatteryStateOfChargeCurrent { value }
          powertrainFuelSystemRelativeLevel { value }
          powertrainType { value }
          speed { value }
        }
      }
    `.trim();

    const response = await this.providerGateway.execute({
      operation: DimoProviderOperation.TELEMETRY_VEHICLE_SUMMARY,
      requestContext: buildDimoProviderRequestContext(tokenId, requestContext),
      invoke: () =>
        this.dimoRequestExecutor.execute({
          category: 'IDENTITY',
          execute: () =>
            this.client.post(
              '',
              { query },
              { headers: { Authorization: `Bearer ${vehicleJwt}` } },
            ),
        }),
    });

    const signals = response.data?.data?.signalsLatest as
      | Record<string, unknown>
      | null
      | undefined;

    if (!signals) {
      return {
        odometerKm: null,
        batteryPercent: null,
        fuelPercent: null,
        lastSignalAt: null,
        powertrainType: null,
        speedKmh: null,
      };
    }

    return {
      odometerKm: this.numVal(signals.powertrainTransmissionTravelledDistance),
      batteryPercent: this.numVal(
        signals.powertrainTractionBatteryStateOfChargeCurrent,
      ),
      fuelPercent: this.numVal(signals.powertrainFuelSystemRelativeLevel),
      lastSignalAt: signals.lastSeen
        ? new Date(signals.lastSeen as string)
        : null,
      powertrainType: this.strVal(signals.powertrainType),
      speedKmh: this.numVal(signals.speed),
    };
  }

  async fetchVehicleVin(
    vehicleJwt: string,
    tokenId: number,
    requestContext?: DimoProviderRequestContext,
  ): Promise<string | null> {
    const query = `
      query VehicleVin {
        vinVCLatest(tokenId: ${tokenId}) {
          vin
        }
      }
    `.trim();

    try {
      const response = await this.providerGateway.execute({
        operation: DimoProviderOperation.TELEMETRY_VEHICLE_VIN,
        requestContext: buildDimoProviderRequestContext(tokenId, requestContext),
        invoke: () =>
          this.dimoRequestExecutor.execute({
            category: 'IDENTITY',
            execute: () =>
              this.client.post(
                '',
                { query },
                { headers: { Authorization: `Bearer ${vehicleJwt}` } },
              ),
          }),
      });
      const vin = response.data?.data?.vinVCLatest?.vin as string | undefined;
      return vin ?? null;
    } catch {
      return null;
    }
  }

  private numVal(field: unknown): number | null {
    if (field == null) return null;
    if (typeof field === 'number') return Number.isNaN(field) ? null : field;
    if (typeof field === 'object') {
      const v = (field as Record<string, unknown>).value;
      return v != null && typeof v === 'number' && !Number.isNaN(v) ? v : null;
    }
    return null;
  }

  private strVal(field: unknown): string | null {
    if (field == null) return null;
    if (typeof field === 'string') return field;
    if (typeof field === 'object') {
      const v = (field as Record<string, unknown>).value;
      return typeof v === 'string' ? v : null;
    }
    return null;
  }
}
