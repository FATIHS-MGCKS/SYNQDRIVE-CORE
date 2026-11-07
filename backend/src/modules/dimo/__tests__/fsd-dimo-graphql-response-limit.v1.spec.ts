import type { AxiosError } from 'axios';
import {
  FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
  FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MAX_V1,
  FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1,
  isAxiosFsdResponseByteLimitErrorV1,
  parseDimoFsdGraphqlMaxResponseBytesEnv,
} from '../fsd-dimo-graphql-response-limit.v1';

describe('parseDimoFsdGraphqlMaxResponseBytesEnv', () => {
  it('uses default for empty env', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv(undefined)).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
  });

  it('rejects non-decimal and partial numeric strings', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('not-a-number')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('123abc')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('12.5')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('-1')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
  });

  it('rejects exponent notation', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('1e6')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('2E10')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
  });

  it('rejects unsafe overflow integers', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('9007199254740992')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
  });

  it('clamps excessive configured values to documented max', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv(String(FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MAX_V1 + 1))).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MAX_V1,
    );
  });

  it('accepts valid boundaries above minimum floor', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv(String(FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1))).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1,
    );
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('262144')).toBe(262_144);
  });
});

describe('isAxiosFsdResponseByteLimitErrorV1', () => {
  it('detects maxContentLength transport failures', () => {
    const err = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'maxContentLength size of 131072 exceeded',
      code: 'ERR_BAD_RESPONSE',
      config: {},
      toJSON: () => ({}),
    } as AxiosError;
    expect(isAxiosFsdResponseByteLimitErrorV1(err)).toBe(true);
  });

  it('does not treat generic ERR_BAD_RESPONSE as oversized', () => {
    const err = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'Request failed with status code 502',
      code: 'ERR_BAD_RESPONSE',
      config: {},
      toJSON: () => ({}),
    } as AxiosError;
    expect(isAxiosFsdResponseByteLimitErrorV1(err)).toBe(false);
  });
});
