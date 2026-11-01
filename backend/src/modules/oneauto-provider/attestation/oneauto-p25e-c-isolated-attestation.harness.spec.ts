import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from '../catalog/oneauto-verified-contracts';
import {
  ONEAUTO_SANDBOX_ATTESTATION_FIXTURES,
  getSandboxAttestationFixture,
} from './oneauto-sandbox-attestation-fixtures';
import {
  OneAutoSandboxAttestationRequestBudget,
  assertSandboxAttestationHostnameOnly,
  assertLiveAttestationPreconditions,
  resolveSandboxAttestationBaseUrl,
} from './oneauto-sandbox-attestation-guards.util';
import {
  runAllOfflineSandboxAttestationFixtures,
  runLiveSandboxAttestation,
  runOfflineSandboxAttestationFixture,
} from './oneauto-sandbox-attestation.runner';
import {
  ONEAUTO_SANDBOX_ATTESTATION_BASE_URL,
  ONEAUTO_SANDBOX_LIVE_ATTESTATION_CODE_ENABLED,
} from './oneauto-sandbox-attestation.constants';
import { executeSandboxAttestationGet } from './oneauto-sandbox-attestation-transport';
import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';
import { ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN } from './oneauto-sandbox-attestation.constants';
import { formatAttestationEvidenceMarkdown } from './oneauto-sandbox-attestation-evidence.util';

describe('OneAuto P2.5E-C isolated sandbox attestation harness', () => {
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
        expect(evidence.billingStatus).toBe('UNKNOWN');
        expect(evidence.providerContractStatus).toBe('DOCUMENTED');
        expect(evidence.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(evidence)).not.toMatch(/offline-fixture-no-key/);
      },
    );
  });

  describe('isolation and guards', () => {
    it('rejects production host override', () => {
      expect(() => resolveSandboxAttestationBaseUrl('https://api.oneautoapi.com')).toThrow(
        expect.objectContaining({ code: 'ONEAUTO_ATTESTATION_PRODUCTION_HOST_FORBIDDEN' }),
      );
    });

    it('accepts sandbox host only', () => {
      expect(resolveSandboxAttestationBaseUrl(ONEAUTO_SANDBOX_ATTESTATION_BASE_URL)).toBe(
        ONEAUTO_SANDBOX_ATTESTATION_BASE_URL,
      );
    });

    it('blocks live mode in repository build (code gate)', async () => {
      expect(ONEAUTO_SANDBOX_LIVE_ATTESTATION_CODE_ENABLED).toBe(false);
      const evidence = await runLiveSandboxAttestation({
        vin: ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'must-not-be-used',
        ownerAuthorizedEnv: '1',
        fetchImpl: jest.fn(),
      });
      expect(evidence.diagnosticCategory).toBe('LIVE_ATTESTATION_CODE_DISABLED');
      expect(evidence.attestationQualified).toBe(false);
    });

    it('blocks live mode without owner authorization env', async () => {
      const evidence = await runLiveSandboxAttestation({
        vin: ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'key',
        ownerAuthorizedEnv: undefined,
        fetchImpl: jest.fn(),
      });
      expect(evidence.diagnosticCategory).toBe('LIVE_ATTESTATION_CODE_DISABLED');
    });

    it('enforces single-request budget', async () => {
      const budget = new OneAutoSandboxAttestationRequestBudget();
      const fetchMock = jest.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, result: {} }),
      });
      const first = await executeSandboxAttestationGet({
        contract: doc(),
        vin: ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'k',
        fetchImpl: fetchMock,
        requestBudget: budget,
      });
      expect(first.transportErrorCode).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const second = await executeSandboxAttestationGet({
        contract: doc(),
        vin: ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'k',
        fetchImpl: fetchMock,
        requestBudget: budget,
      });
      expect(second.transportErrorCode).toBe('ONEAUTO_ATTESTATION_REQUEST_BUDGET_EXCEEDED');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('invalid VIN does not invoke fetch', async () => {
      const budget = new OneAutoSandboxAttestationRequestBudget();
      const fetchMock = jest.fn();
      const outcome = await executeSandboxAttestationGet({
        contract: doc(),
        vin: 'BAD-VIN',
        apiKey: 'k',
        fetchImpl: fetchMock,
        requestBudget: budget,
      });
      expect(outcome.transportErrorCode).toBe('ONEAUTO_INVALID_VIN');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('redirect response fails closed without second fetch', async () => {
      const budget = new OneAutoSandboxAttestationRequestBudget();
      const fetchMock = jest.fn().mockResolvedValue({
        status: 302,
        headers: { get: () => null },
        text: async () => '',
      });
      const outcome = await executeSandboxAttestationGet({
        contract: doc(),
        vin: ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN,
        apiKey: 'k',
        fetchImpl: fetchMock,
        requestBudget: budget,
      });
      expect(outcome.transportErrorCode).toBe('ONEAUTO_UNEXPECTED_REDIRECT');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(budget.hasUsed).toBe(true);
    });

    it('HTTP 202 does not enqueue polling (classification only)', async () => {
      const evidence = await runOfflineSandboxAttestationFixture('http-202');
      expect(evidence.diagnosticCategory).toBe('HTTP_202_ASYNC');
      expect(evidence.attestationQualified).toBe(false);
    });

    it('evidence markdown omits api key material', async () => {
      const evidence = await runOfflineSandboxAttestationFixture('http-200-success-true');
      const md = formatAttestationEvidenceMarkdown(evidence);
      expect(md).not.toMatch(/x-api-key/i);
      expect(md).toContain('billingStatus');
    });
  });

  describe('live precondition helper', () => {
    it('assertLiveAttestationPreconditions throws when code disabled', () => {
      expect(() =>
        assertLiveAttestationPreconditions({ ownerAuthorizedEnv: '1', apiKeyPresent: true }),
      ).toThrow(expect.objectContaining({ code: 'ONEAUTO_ATTESTATION_LIVE_CODE_DISABLED' }));
    });
  });

  it('documents unknown fixture id', async () => {
    const evidence = await runOfflineSandboxAttestationFixture('does-not-exist');
    expect(evidence.diagnosticCategory).toBe('FIXTURE_UNKNOWN');
    expect(getSandboxAttestationFixture('does-not-exist')).toBeUndefined();
  });

  it('assertSandboxAttestationHostnameOnly rejects non-https', () => {
    expect(() => assertSandboxAttestationHostnameOnly('http://sandbox.oneautoapi.com')).toThrow();
  });
});
