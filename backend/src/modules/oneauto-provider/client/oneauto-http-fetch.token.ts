/** Optional test override for One Auto outbound HTTP; production omits this provider. */
export const ONEAUTO_HTTP_FETCH = Symbol('ONEAUTO_HTTP_FETCH');

export type OneAutoHttpFetchImpl = typeof fetch;
