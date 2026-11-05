import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_PRICING_SOURCE_VERSION } from './catalog/oneauto-execution-verified-registry';
import { getDocumentedOneAutoContract } from './catalog/oneauto-documented-contracts';
import { getOneAutoCatalogEntry, resolveCatalogEntryForRuntime } from './catalog/oneauto-service-catalog';
import { buildOneAutoContractGateReport } from './catalog/oneauto-verified-contracts';
import {
  evaluateOneAutoFullDataCallbackPayload,
  isOneAutoFullDataCallbackSku,
} from './oneauto-callback-full-data.util';
import {
  ONEAUTO_OE_SERVICE_SCHEDULE_EU_RUNTIME_ENABLED_ENV,
  isOneAutoSkuRuntimeExecutionEnabled,
} from './oneauto-sku-runtime-activation.util';
import {
  buildOeServiceScheduleEmptyEnvelope,
  buildOeServiceScheduleSuccessEnvelope,
  ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
} from './service-schedule/oneauto-oe-service-schedule.fixtures';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './service-schedule/oneauto-service-schedule-eu.types';

describe('OneAuto OE Service Schedule P1 integration (draft, offline)', () => {
  const documented = () => getDocumentedOneAutoContract(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU)!;

  afterEach(() => {
    delete process.env[ONEAUTO_OE_SERVICE_SCHEDULE_EU_RUNTIME_ENABLED_ENV];
  });

  it('registers E4 full-data callback SKU hook with execution-verified registry entry', () => {
    expect(isOneAutoFullDataCallbackSku(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU)).toBe(true);
    expect(buildOneAutoContractGateReport(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU).executable).toBe(
      true,
    );
  });

  it('keeps SKU runtime gate OFF by default', () => {
    expect(isOneAutoSkuRuntimeExecutionEnabled(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU)).toBe(false);
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_EU_RUNTIME_ENABLED_ENV] = '1';
    expect(isOneAutoSkuRuntimeExecutionEnabled(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU)).toBe(true);
  });

  it('quotes EUR when indicative price is configured and runtime enabled', () => {
    const entry = getOneAutoCatalogEntry(ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU)!;
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_EU_RUNTIME_ENABLED_ENV] = '1';
    const resolved = resolveCatalogEntryForRuntime(entry, {
      providerEnabled: true,
      indicativePriceMinorBySku: { OE_SERVICE_SCHEDULE: 210 },
      pricingCatalogVersion: ONEAUTO_OE_SERVICE_SCHEDULE_EU_PRICING_SOURCE_VERSION,
    });
    expect(resolved.currency).toBe('EUR');
    expect(resolved.indicativePriceMinor).toBe(210);
    expect(resolved.availabilityStatus).toBe('AVAILABLE');
  });

  it('evaluates wrapped full-data callback success envelope', () => {
    const body = {
      status: 200,
      result: buildOeServiceScheduleSuccessEnvelope(ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN),
    };
    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body,
      contract: documented(),
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
    });
    expect(evaluation.ok).toBe(true);
  });

  it('accepts verified empty schedule distinct from service history empty events', () => {
    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body: buildOeServiceScheduleEmptyEnvelope(),
      contract: documented(),
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
    });
    expect(evaluation.ok).toBe(true);
    if (evaluation.ok) {
      expect(Array.isArray(evaluation.result.normal_services)).toBe(true);
      expect(Array.isArray(evaluation.result.extra_services)).toBe(true);
    }
  });

  it('rejects HTTP 206 partial wrapper as fail-closed', () => {
    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body: {
        status: 206,
        result: buildOeServiceScheduleSuccessEnvelope(),
      },
      contract: documented(),
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
    });
    expect(evaluation.ok).toBe(false);
    if (!evaluation.ok) {
      expect(evaluation.code).toBe('ONEAUTO_PARTIAL_CONTENT');
    }
  });

  it('rejects provider success:false as business failure', () => {
    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body: { success: false, error: { message: 'No schedule' } },
      contract: documented(),
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
    });
    expect(evaluation.ok).toBe(false);
    if (!evaluation.ok) {
      expect(evaluation.code).toBe('ONEAUTO_CALLBACK_PROVIDER_FAILURE');
    }
  });

  it('rejects malformed schedule fields in callback result', () => {
    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body: {
        success: true,
        result: {
          vehicle_identification_number: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
          normal_services: [{ service_months: -1 }],
          extra_services: [],
        },
      },
      contract: documented(),
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
    });
    expect(evaluation.ok).toBe(false);
    if (!evaluation.ok) {
      expect(evaluation.code).toBe('ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE');
    }
  });

  it('rejects callback VIN mismatch', () => {
    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body: buildOeServiceScheduleSuccessEnvelope('WVWZZZ3HZLE010725'),
      contract: documented(),
      jobVinSnapshot: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
      vehicleVin: ONEAUTO_OE_SERVICE_SCHEDULE_FIXTURE_VIN,
    });
    expect(evaluation.ok).toBe(false);
    if (!evaluation.ok) {
      expect(evaluation.code).toBe('ONEAUTO_CALLBACK_VIN_MISMATCH');
    }
  });
});
