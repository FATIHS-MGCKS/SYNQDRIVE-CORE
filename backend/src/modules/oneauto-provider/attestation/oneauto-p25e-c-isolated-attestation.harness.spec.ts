import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from '../catalog/oneauto-verified-contracts';
import {
  ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
  ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL,
  ONEAUTO_SANDBOX_ATTESTATION_BASE_URL,
} from './oneauto-sandbox-attestation.constants';
import {
  ONEAUTO_SANDBOX_ATTESTATION_FIXTURES,
} from './oneauto-sandbox-attestation-fixtures';
import {
  OneAutoSandboxAttestationRequestBudget,
  assertProductionAttestationHostnameOnly,
  assertSandboxAttestationHostnameOnly,
  rejectCustomBaseUrlOverride,
  resolveProductionAttestationBaseUrl,
  validateProductionAttestationAuthorization,
} from './oneauto-sandbox-attestation-guards.util';
import {
  runAllOfflineSandboxAttestationFixtures,
  runLiveProductionAttestation,
  runOfflineSandboxAttestationFixture,
  resolveProductionAttestationAuthorization,
} from './oneauto-sandbox-attestation.runner';
import { executeAttestationGet } from './oneauto-sandbox-attestation-transport';
import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';
import { formatAttestationEvidenceMarkdown } from './oneauto-sandbox-attestation-evidence.util';

describe('OneAuto P2.5E-C isolated attestation harness', () => {
  const doc = () => getDocumentedOneAutoContract('OE_VIN_LOOKUP_EU')!;

  it('keeps production EXECUTION_VERIFIED registry empty', () => {
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(0);
  });

  describe('offline fixtures', () => {
    it('runs all fixtures with zero real network (mock fetch only)', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const results = await runAllOfflineSandboxAttestationFixtures();
      expect(results).toHaveLength(ONEAUTO_SANDBOX_ATTESTATION_FIXTURES.length);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it.each(ONEAUTO_SANDBOX_ATTESTATION_FIXTURES.map((f) => [f.id, f] as const))(
      'fixture %s matches expected qualification and category',
      async (id, fixture) => {
        const evidence = await runOfflineSandboxAttestationFixture(id);
        expect(evidence.attestationQualified).toBe(fixture.expectQualified);
        expect(evidence.diagnosticCategory).toBe(fixture.expectCategory);
        expect(evidence.attestationEnvironment).toBe('OFFLINE');
        expect(evidence.schemaVersion).toBe('oneauto-sandbox-attestation-v2');
        expect(evidence.responseFingerprint).toBeDefined();
        expect(evidence.attemptedOutboundRequests).toBeLessThanOrEqual(1);
        expect(evidence.billingStatus).toBe('UNKNOWN');
        expect(JSON.stringify(evidence)).not.toMatch(/offline-fixture-no-key/);
      },
    );
  });

  describe('production authorization gates', () => {
    const fullAuth = {
      cliLiveProduction: true,
      apiKey: 'redacted-key',
      vin: ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
      ownerAuthorized: '1',
      vinUseAuthorized: '1',
      billingAcknowledged: '1',
      oneGetConfirmed: '1',
    };

    it('defaults CLI authorization to offline (no live flag)', () => {
      const auth = resolveProductionAttestationAuthorization(false);
      expect(auth.cliLiveProduction).toBe(false);
      expect(validateProductionAttestationAuthorization(auth)?.category).toBe(
        'LIVE_PRODUCTION_CLI_REQUIRED',
      );
    });

    it('rejects missing API key', async () => {
      const evidence = await runLiveProductionAttestation({
        authorization: { ...fullAuth, apiKey: '' },
        fetchImpl: jest.fn(),
      });
      expect(evidence.diagnosticCategory).toBe('MISSING_API_KEY');
      expect(evidence.attemptedOutboundRequests).toBe(0);
    });

    it('rejects missing VIN', async () => {
      const evidence = await runLiveProductionAttestation({
        authorization: { ...fullAuth, vin: '' },
        fetchImpl: jest.fn(),
      });
      expect(evidence.diagnosticCategory).toBe('MISSING_VIN');
    });

    it('rejects missing billing acknowledgement', async () => {
      const evidence = await runLiveProductionAttestation({
        authorization: { ...fullAuth, billingAcknowledged: '0' },
        fetchImpl: jest.fn(),
      });
      expect(evidence.diagnosticCategory).toBe('MISSING_BILLING_ACKNOWLEDGEMENT');
    });

    it('rejects missing VIN-use authorization', async () => {
      const evidence = await runLiveProductionAttestation({
        authorization: { ...fullAuth, vinUseAuthorized: undefined },
        fetchImpl: jest.fn(),
      });
      expect(evidence.diagnosticCategory).toBe('MISSING_VIN_USE_AUTHORIZATION');
    });

    it('rejects missing one-get confirmation', async () => {
      const evidence = await runLiveProductionAttestation({
        authorization: { ...fullAuth, oneGetConfirmed: undefined },
        fetchImpl: jest.fn(),
      });
      expect(evidence.diagnosticCategory).toBe('MISSING_ONE_GET_CONFIRMATION');
    });

    it('rejects missing owner authorization', async () => {
      const evidence = await runLiveProductionAttestation({
        authorization: { ...fullAuth, ownerAuthorized: undefined },
        fetchImpl: jest.fn(),
      });
      expect(evidence.diagnosticCategory).toBe('LIVE_OWNER_AUTHORIZATION_REQUIRED');
    });

    it('rejects invalid VIN before fetch', async () => {
      const fetchMock = jest.fn();
      const evidence = await runLiveProductionAttestation({
        authorization: { ...fullAuth, vin: 'NOT-A-VIN' },
        fetchImpl: fetchMock,
      });
      expect(evidence.diagnosticCategory).toBe('INVALID_VIN');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(evidence.attemptedOutboundRequests).toBe(0);
    });
  });

  describe('hostname guards', () => {
    it('rejects sandbox host for production attestation', () => {
      expect(() => assertProductionAttestationHostnameOnly(ONEAUTO_SANDBOX_ATTESTATION_BASE_URL)).toThrow(
        expect.objectContaining({ code: 'ONEAUTO_ATTESTATION_SANDBOX_HOST_FORBIDDEN' }),
      );
    });

    it('rejects custom host for production attestation', () => {
      expect(() => assertProductionAttestationHostnameOnly('https://evil.example.com')).toThrow(
        expect.objectContaining({ code: 'ONEAUTO_ATTESTATION_CUSTOM_HOST_FORBIDDEN' }),
      );
    });

    it('accepts only hardcoded production base URL', () => {
      expect(resolveProductionAttestationBaseUrl()).toBe(ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL);
    });

    it('rejects custom base URL override helper', () => {
      expect(() => rejectCustomBaseUrlOverride('https://api.oneautoapi.com')).toThrow(
        expect.objectContaining({ code: 'ONEAUTO_ATTESTATION_CUSTOM_HOST_FORBIDDEN' }),
      );
    });

    it('offline sandbox host guard accepts fixture base', () => {
      expect(() => assertSandboxAttestationHostnameOnly(ONEAUTO_SANDBOX_ATTESTATION_BASE_URL)).not.toThrow();
    });
  });

  describe('transport isolation', () => {
    it('enforces single-request budget before and after network failure', async () => {
      const budget = new OneAutoSandboxAttestationRequestBudget();
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify({ success: true, result: {} }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify({ success: true }),
        });
      await executeAttestationGet({
        contract: doc(),
        vin: ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'k',
        baseUrl: ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL,
        fetchImpl: fetchMock,
        requestBudget: budget,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const second = await executeAttestationGet({
        contract: doc(),
        vin: ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'k',
        baseUrl: ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL,
        fetchImpl: fetchMock,
        requestBudget: budget,
      });
      expect(second.transportErrorCode).toBe('ONEAUTO_ATTESTATION_REQUEST_BUDGET_EXCEEDED');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('consumes budget on timeout without second attempt', async () => {
      const budget = new OneAutoSandboxAttestationRequestBudget();
      const fetchMock = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      const outcome = await executeAttestationGet({
        contract: doc(),
        vin: ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'k',
        baseUrl: ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL,
        fetchImpl: fetchMock,
        requestBudget: budget,
        timeoutMs: 1,
      });
      expect(outcome.transportErrorCode).toBe('ONEAUTO_PROVIDER_TIMEOUT');
      expect(budget.attemptedCount).toBe(1);
    });

    it('blocks redirect without follow-up fetch', async () => {
      const budget = new OneAutoSandboxAttestationRequestBudget();
      const fetchMock = jest.fn().mockResolvedValue({
        status: 302,
        headers: { get: () => null },
        text: async () => '',
      });
      const outcome = await executeAttestationGet({
        contract: doc(),
        vin: ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'k',
        baseUrl: ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL,
        fetchImpl: fetchMock,
        requestBudget: budget,
      });
      expect(outcome.transportErrorCode).toBe('ONEAUTO_UNEXPECTED_REDIRECT');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('production live path uses production hostname in evidence when mocked', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, result: {} }),
      });
      const evidence = await runLiveProductionAttestation({
        authorization: {
          cliLiveProduction: true,
          apiKey: 'k',
          vin: ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
          ownerAuthorized: '1',
          vinUseAuthorized: '1',
          billingAcknowledged: '1',
          oneGetConfirmed: '1',
        },
        fetchImpl: fetchMock,
      });
      expect(evidence.targetHostname).toBe('api.oneautoapi.com');
      expect(evidence.attestationEnvironment).toBe('PRODUCTION');
      expect(evidence.attestationQualified).toBe(true);
      expect(evidence.attemptedOutboundRequests).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('api.oneautoapi.com/ezyvin/vinlookup/');
    });

    it('HTTP 202 fixture does not imply polling', async () => {
      const evidence = await runOfflineSandboxAttestationFixture('http-202');
      expect(evidence.diagnosticCategory).toBe('HTTP_202_ASYNC');
      expect(evidence.attestationQualified).toBe(false);
    });

    it('evidence markdown is redacted', async () => {
      const md = formatAttestationEvidenceMarkdown(
        await runOfflineSandboxAttestationFixture('http-200-success-true'),
      );
      expect(md).toContain('attemptedOutboundRequests');
      expect(md).not.toMatch(/x-api-key/i);
    });
  });
});
