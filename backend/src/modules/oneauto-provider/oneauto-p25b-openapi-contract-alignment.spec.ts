import {
  ONEAUTO_SKU_TO_OPENAPI_PATH_KEY,
  openApiPathKeyToProviderPathTemplate,
} from './catalog/oneauto-openapi-sku-bindings';
import {
  assertOpenApi303,
  getOpenApiGetOperation,
  loadOneAutoOpenApiEvidence,
  type OneAutoOpenApiParameter,
} from './catalog/oneauto-openapi-evidence.util';
import {
  listDocumentedOneAutoContracts,
  ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS,
} from './catalog/oneauto-documented-contracts';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';

describe('OneAuto P2.5B OpenAPI evidence alignment', () => {
  const openApi = loadOneAutoOpenApiEvidence();

  it('loads supplier OpenAPI 3.0.3 evidence from repo path', () => {
    assertOpenApi303(openApi);
    expect(openApi.components?.securitySchemes?.['x-api-key']).toMatchObject({
      type: 'apiKey',
      name: 'x-api-key',
      in: 'header',
    });
  });

  it('maps six SKUs to documented GET paths in OpenAPI', () => {
    for (const [sku, pathKey] of Object.entries(ONEAUTO_SKU_TO_OPENAPI_PATH_KEY)) {
      const operation = getOpenApiGetOperation(openApi, pathKey);
      expect(operation.security).toEqual([{ 'x-api-key': [] }]);
      const doc = ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get(sku);
      expect(doc).toBeDefined();
      expect(doc!.providerPathTemplate).toBe(openApiPathKeyToProviderPathTemplate(pathKey));
      expect(doc!.httpMethod).toBe('GET');
    }
  });

  it('aligns required VIN and optional callback parameters with OpenAPI', () => {
    for (const [sku, pathKey] of Object.entries(ONEAUTO_SKU_TO_OPENAPI_PATH_KEY)) {
      const operation = getOpenApiGetOperation(openApi, pathKey);
      const queryParams = (operation.parameters ?? []).filter(
        (p: OneAutoOpenApiParameter) => p.in === 'query',
      );
      const required = queryParams.filter((p) => p.required).map((p) => p.name);
      const optional = queryParams.filter((p) => !p.required).map((p) => p.name);

      const doc = ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get(sku)!;
      expect(required).toEqual([doc.vinQueryParameter]);
      expect(optional).toEqual(doc.optionalQueryParameters.map((p) => p.name));
    }
  });

  it('documents success/result/error envelope without runtime schema validation', () => {
    for (const contract of listDocumentedOneAutoContracts()) {
      expect(contract.responseEnvelope).toBe('SUCCESS_RESULT_ERROR');
      expect(contract.responseHandling).toBe('OPAQUE_JSON');
      const pathKey = ONEAUTO_SKU_TO_OPENAPI_PATH_KEY[contract.serviceSku];
      const operation = getOpenApiGetOperation(openApi, pathKey);
      const schema = (
        operation.responses?.['200'] as {
          content?: { 'application/json'?: { schema?: { properties?: Record<string, unknown> } } };
        }
      )?.content?.['application/json']?.schema?.properties;
      expect(schema).toMatchObject({
        success: expect.anything(),
        result: expect.anything(),
      });
    }
  });

  it('keeps execution-verified registry empty (no SKU promotion)', () => {
    expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.size).toBe(0);
  });
});
