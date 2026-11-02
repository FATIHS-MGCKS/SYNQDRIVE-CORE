/**
 * P2.5C offline harness — build expected GET URL from a documented contract (no outbound HTTP).
 */
import type { OneAutoDocumentedProviderContract } from './oneauto-contract-types';

export function buildOneAutoDocumentedGetUrl(
  baseUrl: string,
  contract: Pick<
    OneAutoDocumentedProviderContract,
    'providerPathTemplate' | 'vinQueryParameter'
  >,
  vin: string,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const path = contract.providerPathTemplate.replace(/^\/+/, '');
  return `${base}/${path}?${encodeURIComponent(contract.vinQueryParameter)}=${encodeURIComponent(vin)}`;
}
