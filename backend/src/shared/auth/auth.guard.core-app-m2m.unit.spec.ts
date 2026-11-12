import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { CORE_APP_SERVICE_TOKEN_TYPE } from '@modules/core-app-m2m/core-app-m2m.constants';
import * as jwt from 'jsonwebtoken';

describe('AuthGuard — core app service token isolation', () => {
  const originalEnv = process.env;
  let guard: AuthGuard;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'user-jwt-test-secret',
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET: 'm2m-only-secret',
    };
    guard = new AuthGuard();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function contextFor(path: string, token?: string) {
    const request: Record<string, unknown> = { url: path, path };
    if (token) {
      request.headers = { authorization: `Bearer ${token}` };
    }
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    };
  }

  it('rejects service token on non-allowlisted API', async () => {
    const token = jwt.sign(
      { typ: CORE_APP_SERVICE_TOKEN_TYPE, org: 'org-a' },
      process.env.CORE_APP_M2M_SIGNING_SECRET!,
      { issuer: 'synqdrive-core-app-m2m', audience: 'synqdrive-core-api' },
    );
    await expect(
      Promise.resolve().then(() =>
        guard.canActivate(contextFor('/api/v1/admin/products', token) as any),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows service token handshake on entitlements allowlist without user principal', async () => {
    const token = jwt.sign(
      { typ: CORE_APP_SERVICE_TOKEN_TYPE, org: 'org-a' },
      process.env.CORE_APP_M2M_SIGNING_SECRET!,
      { issuer: 'synqdrive-core-app-m2m', audience: 'synqdrive-core-api' },
    );
    const ctx = contextFor('/api/v1/core/entitlements/v1/organizations/org-a', token);
    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    const req = (ctx as any).switchToHttp().getRequest();
    expect(req.authPrincipalKind).toBe('core_app_service');
    expect(req.user).toBeUndefined();
  });

  it('rejects service tokens when CORE_APP_M2M_ENABLED is false', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'false';
    const token = jwt.sign(
      { typ: CORE_APP_SERVICE_TOKEN_TYPE, org: 'org-a' },
      'any',
    );
    await expect(
      Promise.resolve().then(() =>
        guard.canActivate(
          contextFor('/api/v1/core/entitlements/v1/organizations/org-a', token) as any,
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
