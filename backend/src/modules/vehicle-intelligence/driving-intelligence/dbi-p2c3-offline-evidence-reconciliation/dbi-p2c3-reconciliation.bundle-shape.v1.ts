import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateBundleInputShape(input: unknown): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];
  if (!isPlainObject(input)) {
    return ['BUNDLE_INPUT_SHAPE_INVALID'];
  }
  if (typeof input.contractVersion !== 'string') {
    codes.push('BUNDLE_INPUT_SHAPE_INVALID');
  }
  if (!('powertrainProxies' in input) || !Array.isArray(input.powertrainProxies)) {
    codes.push('BUNDLE_INPUT_SHAPE_INVALID');
    return [...new Set(codes)];
  }
  if ('descriptive' in input && input.descriptive !== null && !isPlainObject(input.descriptive)) {
    codes.push('BUNDLE_INPUT_SHAPE_INVALID');
  }
  for (const plane of input.powertrainProxies) {
    if (!isPlainObject(plane)) {
      codes.push('BUNDLE_INPUT_SHAPE_INVALID');
      continue;
    }
    if (plane.participant === null || plane.participant === undefined) {
      codes.push('MISSING_PARTICIPANT_HEADER');
    } else if (!isPlainObject(plane.participant)) {
      codes.push('BUNDLE_INPUT_SHAPE_INVALID');
    }
    if (!Array.isArray(plane.candidates)) {
      codes.push('BUNDLE_INPUT_SHAPE_INVALID');
    }
  }
  return [...new Set(codes)].sort();
}
