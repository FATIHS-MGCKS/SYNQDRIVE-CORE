import * as fs from 'node:fs';
import * as path from 'node:path';
import { ONEAUTO_OPENAPI_EVIDENCE_REPO_PATH } from './oneauto-openapi-sku-bindings';

export type OneAutoOpenApiParameter = {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string };
};

export type OneAutoOpenApiGetOperation = {
  operationId?: string;
  parameters?: OneAutoOpenApiParameter[];
  security?: Array<Record<string, unknown[]>>;
  responses?: Record<string, unknown>;
};

export type OneAutoOpenApiEvidenceDocument = {
  openapi: string;
  paths: Record<string, { get?: OneAutoOpenApiGetOperation }>;
  components?: {
    securitySchemes?: Record<
      string,
      { type?: string; name?: string; in?: string }
    >;
  };
};

export function resolveOneAutoOpenApiEvidenceAbsolutePath(): string {
  return path.resolve(__dirname, '../../../../../', ONEAUTO_OPENAPI_EVIDENCE_REPO_PATH);
}

export function loadOneAutoOpenApiEvidence(): OneAutoOpenApiEvidenceDocument {
  const filePath = resolveOneAutoOpenApiEvidenceAbsolutePath();
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as OneAutoOpenApiEvidenceDocument;
}

export function assertOpenApi303(document: OneAutoOpenApiEvidenceDocument): void {
  if (document.openapi !== '3.0.3') {
    throw new Error(`Expected OpenAPI 3.0.3, got ${document.openapi ?? 'missing'}`);
  }
}

export function getOpenApiGetOperation(
  document: OneAutoOpenApiEvidenceDocument,
  pathKey: string,
): OneAutoOpenApiGetOperation {
  const operation = document.paths[pathKey]?.get;
  if (!operation) {
    throw new Error(`OpenAPI evidence missing GET ${pathKey}`);
  }
  return operation;
}
