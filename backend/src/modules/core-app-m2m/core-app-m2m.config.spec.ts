import {
  assertCoreAppM2mSigningSecretWhenEnabled,
  validateCoreAppM2mSigningSecretIsolation,
} from './core-app-m2m.config';

const STRONG =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('core-app-m2m signing config', () => {
  it('allows strong dedicated secret when M2M enabled', () => {
    expect(() =>
      validateCoreAppM2mSigningSecretIsolation({
        CORE_APP_M2M_ENABLED: 'true',
        CORE_APP_M2M_SIGNING_SECRET: STRONG,
        JWT_SECRET: 'different-user-jwt-secret-value-32chars',
      }),
    ).not.toThrow();
  });

  it('rejects secret equal to JWT_SECRET', () => {
    expect(() =>
      validateCoreAppM2mSigningSecretIsolation({
        CORE_APP_M2M_ENABLED: 'true',
        CORE_APP_M2M_SIGNING_SECRET: 'shared-secret-value-32-characters!!',
        JWT_SECRET: 'shared-secret-value-32-characters!!',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects secret equal to VOICE_MCP_TOKEN_SECRET', () => {
    expect(() =>
      validateCoreAppM2mSigningSecretIsolation({
        CORE_APP_M2M_ENABLED: 'true',
        CORE_APP_M2M_SIGNING_SECRET: 'voice-mcp-shared-secret-32-chars!!',
        VOICE_MCP_TOKEN_SECRET: 'voice-mcp-shared-secret-32-chars!!',
      }),
    ).toThrow(/VOICE_MCP/);
  });

  it('skips validation when feature gate off', () => {
    expect(() =>
      assertCoreAppM2mSigningSecretWhenEnabled({
        CORE_APP_M2M_ENABLED: 'false',
      }),
    ).not.toThrow();
  });
});
