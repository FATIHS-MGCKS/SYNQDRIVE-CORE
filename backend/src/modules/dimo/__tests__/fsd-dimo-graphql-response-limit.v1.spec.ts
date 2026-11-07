import {
  FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
  parseDimoFsdGraphqlMaxResponseBytesEnv,
} from '../fsd-dimo-graphql-response-limit.v1';

describe('parseDimoFsdGraphqlMaxResponseBytesEnv', () => {
  it('uses default for empty env', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv(undefined)).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
  });

  it('rejects invalid numeric strings', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('not-a-number')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('-1')).toBe(
      FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
    );
  });

  it('accepts valid positive integers above minimum floor', () => {
    expect(parseDimoFsdGraphqlMaxResponseBytesEnv('262144')).toBe(262_144);
  });
});
