import { buildAvailableSignalsQuery } from '@modules/dimo/queries/available-signals.query';
import type { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import type { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import type {
  FsdDimoGraphqlExecutionResultV1,
  FsdDimoGraphqlOutcomeKindV1,
} from '@modules/dimo/fsd-dimo-graphql-result';
import { classifyFsdSignalShape } from '../fsd-signal-shape.classifier.v1';
import { computeFsdQueryFingerprintV1, normalizeFsdQueryTextForFingerprintV1 } from '@modules/dimo/fsd-query-fingerprint.v1';
import type {
  Fsd3DiscoveryProviderPortV1,
  Fsd3ProviderCatalogResultV1,
  Fsd3ProviderSnapshotFieldValueV1,
  Fsd3ProviderSnapshotResultV1,
} from './fsd3-provider.port.v1';
import type {
  Fsd4HistoricalDiscoveryProviderPortV1,
  Fsd4HistoricalObservationV1,
  Fsd4ProviderCatalogResultV1,
  Fsd4ProviderHistoricalResultV1,
} from './fsd4-provider.port.v1';
import type { FsdGraphqlErrorV1 } from '../fsd-response.interpreter.v1';
import type { FsdDiscoveryRunIdentityV1 } from '../persistence/fsd-discovery-persistence.contract.v1';
import type { FsdDiscoveryPersistenceRepository } from '../persistence/fsd-discovery-persistence.repository';

type FsdDimoOutcomeToHttp = { httpStatus: number; dataPresent?: boolean };

/**
 * Maps classified FSD GraphQL outcomes to HTTP semantics for orchestrators (legacy checks use httpStatus).
 */
export function fsdDimoClassifiedOutcomeToHttpV1(outcome: FsdDimoGraphqlExecutionResultV1): FsdDimoOutcomeToHttp {
  const k = outcome.kind;
  const map: Record<FsdDimoGraphqlOutcomeKindV1, number> = {
    HTTP_200_OK: 200,
    HTTP_200_PARTIAL_GRAPHQL_ERRORS: 200,
    GRAPHQL_ERRORS_NO_DATA: 200,
    HTTP_400: 400,
    HTTP_422: 422,
    HTTP_401: 401,
    HTTP_403: 403,
    HTTP_429: 429,
    HTTP_5XX: outcome.httpStatus != null && outcome.httpStatus >= 500 ? outcome.httpStatus : 503,
    TIMEOUT_OR_NETWORK_UNKNOWN: 503,
    MALFORMED_RESPONSE: 502,
    QUERY_FINGERPRINT_MISMATCH: 409,
    OVERSIZED_RESPONSE: 413,
  };
  const baseHttp = map[k] ?? outcome.httpStatus ?? 502;
  return {
    httpStatus: baseHttp,
    dataPresent: k === 'HTTP_200_OK' || k === 'HTTP_200_PARTIAL_GRAPHQL_ERRORS',
  };
}

function isFsdCatalogFetchSucceededV1(outcome: FsdDimoGraphqlExecutionResultV1): boolean {
  return outcome.kind === 'HTTP_200_OK';
}

/** Exported for unit tests (presence vs null snapshot semantics). */
export function mapSignalsLatestFieldToSnapshotValue(
  fieldName: string,
  raw: unknown,
  fieldPresent: boolean,
): Fsd3ProviderSnapshotFieldValueV1 {
  const shapeMeta = classifyFsdSignalShape(fieldName);
  const shape = shapeMeta?.shape ?? 'UNKNOWN';

  if (!fieldPresent) {
    return { kind: 'MISSING' };
  }

  if (shape === 'FLOAT') {
    if (raw == null) {
      return fieldPresent ? { kind: 'NULL', numericValue: null } : { kind: 'MISSING' };
    }
    if (typeof raw === 'object' && raw !== null && 'value' in (raw as object)) {
      const v = (raw as { value?: unknown }).value;
      if (v === null) return { kind: 'NULL', numericValue: null };
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v === 0) return { kind: 'VALID_ZERO', numericValue: 0 };
        return { kind: 'VALID_NONZERO', numericValue: v };
      }
    }
    return { kind: 'INVALID' };
  }

  if (shape === 'STRING') {
    if (raw == null) {
      return fieldPresent ? { kind: 'NULL', numericValue: null } : { kind: 'MISSING' };
    }
    if (typeof raw === 'object' && raw !== null && 'value' in (raw as object)) {
      const v = (raw as { value?: unknown }).value;
      if (v === null) return { kind: 'NULL', numericValue: null };
      if (typeof v === 'string') {
        return v === ''
          ? { kind: 'VALID_ZERO', numericValue: null }
          : { kind: 'VALID_NONZERO', numericValue: null };
      }
    }
    return { kind: 'INVALID' };
  }

  if (shape === 'LOCATION') {
    if (raw == null) {
      return fieldPresent ? { kind: 'NULL', numericValue: null } : { kind: 'MISSING' };
    }
    if (typeof raw === 'object' && raw !== null) {
      const o = raw as { value?: { latitude?: unknown; longitude?: unknown } };
      const lat = o.value?.latitude;
      const lon = o.value?.longitude;
      if (
        typeof lat === 'number' &&
        typeof lon === 'number' &&
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        return { kind: 'VALID_NONZERO', numericValue: 1 };
      }
      if (lat == null && lon == null) return { kind: 'NULL', numericValue: null };
    }
    return { kind: 'INVALID' };
  }

  return { kind: 'INVALID' };
}

function parseIsoToMs(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** Exported for unit tests (MISSING vs OBSERVED_NULL on historical rows). */
export function mapHistoricalRowToObservations(
  fieldName: string,
  row: Record<string, unknown>,
  bucketLabelField: string,
): Fsd4HistoricalObservationV1[] {
  const shapeMeta = classifyFsdSignalShape(fieldName);
  if (!shapeMeta || shapeMeta.shape === 'UNKNOWN' || shapeMeta.shape === 'STRING') {
    return [];
  }
  const tsRaw = row[bucketLabelField];
  const timestampMs =
    typeof tsRaw === 'number' && Number.isFinite(tsRaw)
      ? tsRaw
      : parseIsoToMs(tsRaw) ?? (typeof tsRaw === 'string' ? Date.parse(tsRaw) : NaN);
  if (!Number.isFinite(timestampMs)) {
    return [];
  }

  const shape = shapeMeta.shape;

  if (shape === 'FLOAT') {
    if (!Object.prototype.hasOwnProperty.call(row, fieldName)) {
      return [{ timestampMs }];
    }
    const cell = row[fieldName];
    if (cell == null) {
      return [{ timestampMs, numericValue: null }];
    }
    if (typeof cell === 'number' && Number.isFinite(cell)) {
      return [{ timestampMs, numericValue: cell }];
    }
    if (typeof cell === 'object' && cell !== null && 'value' in cell) {
      const v = (cell as { value?: unknown }).value;
      if (v === null) return [{ timestampMs, numericValue: null }];
      if (typeof v === 'number' && Number.isFinite(v)) {
        return [{ timestampMs, numericValue: v }];
      }
    }
    return [];
  }

  if (shape === 'LOCATION') {
    if (!Object.prototype.hasOwnProperty.call(row, fieldName)) {
      return [{ timestampMs }];
    }
    const cell = row[fieldName];
    if (cell == null) {
      return [{ timestampMs, numericValue: null }];
    }
    if (typeof cell === 'object' && cell !== null) {
      const o = cell as { latitude?: unknown; longitude?: unknown };
      const lat = typeof o.latitude === 'number' ? o.latitude : null;
      const lon = typeof o.longitude === 'number' ? o.longitude : null;
      if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
        return [{ timestampMs, latitude: lat, longitude: lon }];
      }
    }
    return [];
  }

  return [];
}

function extractHistoricalBucketLabelField(queryText: string): string {
  const m = queryText.match(/signals\s*\([^)]*\)\s*\{\s*(\w+)/);
  return m?.[1] ?? 'timestamp';
}

function requireDispatchContext(
  dispatchContext: FsdDiscoveryRunIdentityV1 | undefined,
): FsdDiscoveryRunIdentityV1 {
  if (!dispatchContext) {
    throw new Error('FSD_LIVE_DISPATCH_CONTEXT_REQUIRED');
  }
  return dispatchContext;
}

export class FsdDimoLiveDiscoveryAdapterV1 {
  constructor(
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly persistence: FsdDiscoveryPersistenceRepository,
  ) {}

  private async ensureDispatchBinding(
    identity: FsdDiscoveryRunIdentityV1,
    tokenId: number,
  ): Promise<void> {
    if (identity.dimoTokenId != null && identity.dimoTokenId !== tokenId) {
      throw new Error('FSD_DIMO_TOKEN_MISMATCH');
    }
    await this.persistence.assertDimoDispatchBinding(identity);
  }

  private async resolveVehicleJwt(identity: FsdDiscoveryRunIdentityV1): Promise<string> {
    const tid = identity.dimoTokenId;
    if (tid == null) {
      throw new Error('FSD_DIMO_TOKEN_ID_MISSING');
    }
    return this.dimoAuth.getVehicleJwt(tid);
  }

  createFsd3Port(): Fsd3DiscoveryProviderPortV1 {
    return {
      providerKind: 'live',
      fetchAvailableSignals: async (input): Promise<Fsd3ProviderCatalogResultV1> => {
        const dispatch = requireDispatchContext(input.dispatchContext);
        await this.ensureDispatchBinding(dispatch, input.tokenId);
        const vehicleJwt = await this.resolveVehicleJwt(dispatch);
        const query = buildAvailableSignalsQuery(input.tokenId);
        const fingerprint = computeFsdQueryFingerprintV1(normalizeFsdQueryTextForFingerprintV1(query));
        const classified = await this.dimoTelemetry.queryFsdGraphql({
          vehicleJwt,
          query,
          expectedQueryFingerprint: fingerprint,
          requestContext: {
            tokenId: input.tokenId,
            vehicleId: dispatch.vehicleId,
            organizationId: dispatch.organizationId,
          },
        });
        const http = fsdDimoClassifiedOutcomeToHttpV1(classified);
        if (http.httpStatus !== 200) {
          return {
            availableSignals: [],
            httpStatus: http.httpStatus,
            catalogFetchSucceeded: false,
          };
        }
        if (!isFsdCatalogFetchSucceededV1(classified)) {
          return {
            availableSignals: [],
            httpStatus: http.httpStatus,
            catalogFetchSucceeded: false,
          };
        }
        const list = classified.data?.availableSignals;
        const availableSignals = Array.isArray(list)
          ? list.filter((e): e is string => typeof e === 'string')
          : [];
        return {
          availableSignals,
          httpStatus: 200,
          catalogFetchSucceeded: true,
        };
      },

      executeSnapshotDocument: async (request): Promise<Fsd3ProviderSnapshotResultV1> => {
        const dispatch = requireDispatchContext(request.dispatchContext);
        await this.ensureDispatchBinding(dispatch, request.tokenId);
        const vehicleJwt = await this.resolveVehicleJwt(dispatch);
        const classified = await this.dimoTelemetry.queryFsdGraphql({
          vehicleJwt,
          query: request.queryText,
          expectedQueryFingerprint: request.documentFingerprint,
          requestContext: {
            tokenId: request.tokenId,
            vehicleId: dispatch.vehicleId,
            organizationId: dispatch.organizationId,
          },
        });
        const http = fsdDimoClassifiedOutcomeToHttpV1(classified);
        const errors = classified.errors as FsdGraphqlErrorV1[];

        if (
          classified.kind === 'QUERY_FINGERPRINT_MISMATCH' ||
          classified.kind === 'OVERSIZED_RESPONSE' ||
          classified.kind === 'MALFORMED_RESPONSE'
        ) {
          return {
            documentFingerprint: request.documentFingerprint,
            fieldNamesInDocument: request.fieldNamesInDocument,
            dataPresent: false,
            httpStatus: http.httpStatus,
            providerOutcomeKind: classified.kind,
            providerDiagnostic: classified.diagnostic,
            errors,
          };
        }

        if (classified.kind === 'GRAPHQL_ERRORS_NO_DATA' || !classified.data) {
          return {
            documentFingerprint: request.documentFingerprint,
            fieldNamesInDocument: request.fieldNamesInDocument,
            dataPresent: false,
            httpStatus: http.httpStatus,
            providerOutcomeKind: classified.kind,
            providerDiagnostic: classified.diagnostic,
            errors,
          };
        }

        const signalsLatest = classified.data.signalsLatest as Record<string, unknown> | null | undefined;
        if (signalsLatest == null || typeof signalsLatest !== 'object') {
          return {
            documentFingerprint: request.documentFingerprint,
            fieldNamesInDocument: request.fieldNamesInDocument,
            dataPresent: false,
            httpStatus: http.httpStatus,
            providerOutcomeKind:
              classified.kind === 'HTTP_200_OK' || classified.kind === 'HTTP_200_PARTIAL_GRAPHQL_ERRORS'
                ? 'MALFORMED_RESPONSE'
                : classified.kind,
            providerDiagnostic: 'signals_latest_not_object',
            errors,
          };
        }

        const valuesByField: Record<string, Fsd3ProviderSnapshotFieldValueV1> = {};
        for (const fieldName of request.fieldNamesInDocument) {
          const present = Object.prototype.hasOwnProperty.call(signalsLatest, fieldName);
          valuesByField[fieldName] = mapSignalsLatestFieldToSnapshotValue(
            fieldName,
            signalsLatest[fieldName],
            present,
          );
        }

        return {
          documentFingerprint: request.documentFingerprint,
          fieldNamesInDocument: request.fieldNamesInDocument,
          dataPresent: true,
          httpStatus: http.httpStatus,
          providerOutcomeKind: classified.kind,
          providerDiagnostic: classified.diagnostic,
          errors,
          valuesByField,
        };
      },
    };
  }

  createFsd4Port(): Fsd4HistoricalDiscoveryProviderPortV1 {
    const fsd3Catalog = this.createFsd3Port();
    return {
      providerKind: 'live',
      fetchAvailableSignals: async (input): Promise<Fsd4ProviderCatalogResultV1> => {
        const r = await fsd3Catalog.fetchAvailableSignals(input);
        return {
          availableSignals: r.availableSignals,
          httpStatus: r.httpStatus,
          catalogFetchSucceeded: r.catalogFetchSucceeded,
        };
      },
      executeHistoricalDocument: async (request): Promise<Fsd4ProviderHistoricalResultV1> => {
        const dispatch = requireDispatchContext(request.dispatchContext);
        await this.ensureDispatchBinding(dispatch, request.tokenId);
        const vehicleJwt = await this.resolveVehicleJwt(dispatch);
        const classified = await this.dimoTelemetry.queryFsdGraphql({
          vehicleJwt,
          query: request.queryText,
          expectedQueryFingerprint: request.documentFingerprint,
          requestContext: {
            tokenId: request.tokenId,
            vehicleId: dispatch.vehicleId,
            organizationId: dispatch.organizationId,
          },
        });
        const http = fsdDimoClassifiedOutcomeToHttpV1(classified);
        const errors = classified.errors as FsdGraphqlErrorV1[];

        if (
          classified.kind === 'QUERY_FINGERPRINT_MISMATCH' ||
          classified.kind === 'OVERSIZED_RESPONSE' ||
          classified.kind === 'MALFORMED_RESPONSE'
        ) {
          return {
            documentFingerprint: request.documentFingerprint,
            fieldNamesInDocument: request.fieldNamesInDocument,
            dataPresent: false,
            httpStatus: http.httpStatus,
            providerOutcomeKind: classified.kind,
            providerDiagnostic: classified.diagnostic,
            errors,
          };
        }

        if (classified.kind === 'GRAPHQL_ERRORS_NO_DATA' || !classified.data) {
          return {
            documentFingerprint: request.documentFingerprint,
            fieldNamesInDocument: request.fieldNamesInDocument,
            dataPresent: false,
            httpStatus: http.httpStatus,
            providerOutcomeKind: classified.kind,
            providerDiagnostic: classified.diagnostic,
            errors,
          };
        }

        const rowsUnknown = classified.data.signals;
        if (!Array.isArray(rowsUnknown)) {
          return {
            documentFingerprint: request.documentFingerprint,
            fieldNamesInDocument: request.fieldNamesInDocument,
            dataPresent: false,
            httpStatus: http.httpStatus,
            providerOutcomeKind:
              classified.kind === 'HTTP_200_OK' || classified.kind === 'HTTP_200_PARTIAL_GRAPHQL_ERRORS'
                ? 'MALFORMED_RESPONSE'
                : classified.kind,
            providerDiagnostic: 'signals_not_array',
            errors,
          };
        }

        const bucketLabelField = extractHistoricalBucketLabelField(request.queryText);
        const observationsByField: Record<string, Fsd4HistoricalObservationV1[]> = {};
        for (const fieldName of request.fieldNamesInDocument) {
          observationsByField[fieldName] = [];
        }

        for (const row of rowsUnknown) {
          if (row == null || typeof row !== 'object') continue;
          const rec = row as Record<string, unknown>;
          for (const fieldName of request.fieldNamesInDocument) {
            const obs = mapHistoricalRowToObservations(fieldName, rec, bucketLabelField);
            if (obs.length > 0) {
              observationsByField[fieldName] = (observationsByField[fieldName] ?? []).concat(obs);
            }
          }
        }

        return {
          documentFingerprint: request.documentFingerprint,
          fieldNamesInDocument: request.fieldNamesInDocument,
          dataPresent: true,
          httpStatus: http.httpStatus,
          providerOutcomeKind: classified.kind,
          providerDiagnostic: classified.diagnostic,
          errors,
          observationsByField,
        };
      },
    };
  }
}

export function createFsdDimoLiveDiscoveryAdapterV1(deps: {
  dimoAuth: DimoAuthService;
  dimoTelemetry: DimoTelemetryService;
  persistence: FsdDiscoveryPersistenceRepository;
}): FsdDimoLiveDiscoveryAdapterV1 {
  return new FsdDimoLiveDiscoveryAdapterV1(deps.dimoAuth, deps.dimoTelemetry, deps.persistence);
}
