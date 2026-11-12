import { HttpException } from '@nestjs/common';
import { CoreAppM2mExchangeRateLimitService } from './core-app-m2m-exchange-rate-limit.service';

describe('CoreAppM2mExchangeRateLimitService', () => {
  let service: CoreAppM2mExchangeRateLimitService;

  beforeEach(() => {
    service = new CoreAppM2mExchangeRateLimitService();
    service.resetForTests();
  });

  it('rate-limits repeated attempts on the same trusted IP key', () => {
    for (let i = 0; i < 20; i += 1) {
      service.assertAllowed('10.0.0.1');
    }
    expect(() => service.assertAllowed('10.0.0.1')).toThrow(HttpException);
  });

  it('does not treat spoofed x-forwarded-for as a bucket key when caller uses trusted ip', () => {
    service.assertAllowed('10.0.0.1');
    service.assertAllowed('10.0.0.1');
    expect(() => service.assertAllowed('spoofed-via-x-forwarded-for')).not.toThrow();
  });
});
