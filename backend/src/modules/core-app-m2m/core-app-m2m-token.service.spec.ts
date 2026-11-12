import * as jwt from 'jsonwebtoken';
import { CoreAppM2mTokenService } from './core-app-m2m-token.service';
import { CORE_APP_M2M_AUDIENCE, CORE_APP_M2M_ISSUER, CORE_APP_SERVICE_TOKEN_TYPE } from './core-app-m2m.constants';

describe('CoreAppM2mTokenService', () => {
  const originalEnv = process.env;
  const clients = {
    loadClientGrantForVerification: jest.fn(),
    assertM2mAuthorizationLive: jest.fn(),
  };
  let service: CoreAppM2mTokenService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET: 'm2m-test-signing-secret',
      CORE_APP_M2M_TOKEN_TTL_SECONDS: '120',
    };
    jest.resetAllMocks();
    service = new CoreAppM2mTokenService(clients as any);
    clients.loadClientGrantForVerification.mockResolvedValue({
      client: {
        id: 'cid-db',
        clientId: 'rental-test',
        productSlug: 'RENTAL',
        credentialVersion: 2,
        status: 'ACTIVE',
        allowedScopes: ['core:entitlements:read'],
      },
      grant: { organizationId: 'org-a', grantVersion: 3, status: 'ACTIVE' },
    });
    clients.assertM2mAuthorizationLive.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('issues token with max ttl bound', () => {
    const result = service.issue({
      clientDbId: 'cid-db',
      clientId: 'rental-test',
      organizationId: 'org-a',
      productSlug: 'RENTAL',
      credentialVersion: 2,
      grantVersion: 3,
      scope: 'core:entitlements:read',
    });
    expect(result.expiresIn).toBeLessThanOrEqual(300);
    const decoded = jwt.decode(result.accessToken) as jwt.JwtPayload;
    expect(decoded.typ).toBe(CORE_APP_SERVICE_TOKEN_TYPE);
    expect(decoded.iss).toBe(CORE_APP_M2M_ISSUER);
    expect(decoded.aud).toBe(CORE_APP_M2M_AUDIENCE);
  });

  it('verify rejects foreign organization', async () => {
    const { accessToken } = service.issue({
      clientDbId: 'cid-db',
      clientId: 'rental-test',
      organizationId: 'org-a',
      productSlug: 'RENTAL',
      credentialVersion: 2,
      grantVersion: 3,
      scope: 'core:entitlements:read',
    });
    await expect(service.verifyBearerToken(accessToken, 'org-b')).rejects.toThrow(/organization mismatch/);
  });

  it('verify fails when grant version rotated', async () => {
    clients.loadClientGrantForVerification.mockRejectedValue(new Error('revoked'));
    const { accessToken } = service.issue({
      clientDbId: 'cid-db',
      clientId: 'rental-test',
      organizationId: 'org-a',
      productSlug: 'RENTAL',
      credentialVersion: 2,
      grantVersion: 3,
      scope: 'core:entitlements:read',
    });
    await expect(service.verifyBearerToken(accessToken, 'org-a')).rejects.toBeDefined();
  });
});
