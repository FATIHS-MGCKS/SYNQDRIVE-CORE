import { ForbiddenException, HttpException, HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CoreAppM2mExchangeController } from './core-app-m2m-exchange.controller';
import { CoreAppM2mExchangeRateLimitService } from './core-app-m2m-exchange-rate-limit.service';
import { CoreAppM2mRedisRateLimitService } from './core-app-m2m-redis-rate-limit.service';
import { CoreAppM2mClientService } from './core-app-m2m-client.service';
import { CoreAppM2mTokenService } from './core-app-m2m-token.service';

describe('Core app M2M token exchange — rate limit security', () => {
  let app: INestApplication;
  const originalEnv = process.env;
  const distributed = { assertExchangeAllowed: jest.fn() };
  let exchangeAttempts = 0;
  const rateLimit = new CoreAppM2mExchangeRateLimitService(
    distributed as unknown as CoreAppM2mRedisRateLimitService,
  );
  const clients = {
    assertAllowedScope: jest.fn(),
    validateExchangeCredentials: jest
      .fn()
      .mockRejectedValue(new ForbiddenException('Invalid client credentials')),
  };
  const tokens = { issue: jest.fn() };

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      CORE_APP_M2M_ENABLED: 'true',
      CORE_APP_M2M_SIGNING_SECRET:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CoreAppM2mExchangeController],
      providers: [
        { provide: CoreAppM2mExchangeRateLimitService, useValue: rateLimit },
        { provide: CoreAppM2mClientService, useValue: clients },
        { provide: CoreAppM2mTokenService, useValue: tokens },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await app.close();
  });

  beforeEach(() => {
    exchangeAttempts = 0;
    distributed.assertExchangeAllowed.mockImplementation(async () => {
      exchangeAttempts += 1;
      if (exchangeAttempts > 20) {
        throw new HttpException('Too many token exchange attempts', HttpStatus.TOO_MANY_REQUESTS);
      }
    });
  });

  it('does not key rate limits on spoofed x-forwarded-for alone', async () => {
    const body = {
      clientId: 'rental-test',
      clientSecret: 'wrong',
      organizationId: '11111111-1111-1111-1111-111111111111',
    };
    for (let i = 0; i < 20; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/core-app/token')
        .set('x-forwarded-for', `attacker-${i}`)
        .send(body);
      expect(res.status).toBe(403);
    }
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/core-app/token')
      .set('x-forwarded-for', 'attacker-final')
      .send(body);
    expect(blocked.status).toBe(429);
  });
});
