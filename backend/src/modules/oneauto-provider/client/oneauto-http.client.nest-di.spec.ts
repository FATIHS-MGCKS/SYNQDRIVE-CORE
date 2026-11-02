import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OneAutoHttpClient } from './oneauto-http.client';

describe('OneAutoHttpClient Nest DI', () => {
  it('resolves without ONEAUTO_HTTP_FETCH provider (defaults to global fetch)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OneAutoHttpClient,
        {
          provide: ConfigService,
          useValue: {
            get: () => ({
              enabled: false,
              apiKeyPresent: false,
            }),
          },
        },
      ],
    }).compile();

    const client = moduleRef.get(OneAutoHttpClient);
    expect(client).toBeInstanceOf(OneAutoHttpClient);
    await moduleRef.close();
  });
});
