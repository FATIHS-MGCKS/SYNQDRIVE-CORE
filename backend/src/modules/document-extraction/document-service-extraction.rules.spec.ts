import { SERVICE_COMPLETE, SERVICE_MISSING_DATE } from './__fixtures__/document-service-fixtures';
import {
  assessServiceApplyGate,
  buildServiceApplyPayload,
  readServiceEventDate,
  resolveServiceEventType,
  SERVICE_DOCUMENT_TYPES,
} from './document-service-extraction.rules';

describe('document-service-extraction.rules', () => {
  it('requires explicit event date', () => {
    const gate = assessServiceApplyGate({
      documentType: SERVICE_DOCUMENT_TYPES.SERVICE,
      fields: SERVICE_MISSING_DATE,
    });
    expect(gate.canApply).toBe(false);
    expect(gate.blockers.some((blocker) => blocker.code === 'MISSING_EVENT_DATE')).toBe(true);
  });

  it('builds payload for complete service without default date', () => {
    const payload = buildServiceApplyPayload(SERVICE_DOCUMENT_TYPES.SERVICE, SERVICE_COMPLETE);
    expect(payload?.eventDate).toBe('2026-05-12');
    expect(payload?.eventType).toBe(resolveServiceEventType(SERVICE_DOCUMENT_TYPES.SERVICE));
    expect(readServiceEventDate(SERVICE_COMPLETE)).toBe('2026-05-12');
  });

  it('maps oil change document type to OIL_CHANGE event type', () => {
    const payload = buildServiceApplyPayload(SERVICE_DOCUMENT_TYPES.OIL_CHANGE, {
      ...SERVICE_COMPLETE,
      eventDate: '2026-05-14',
    });
    expect(payload?.eventType).toBe('OIL_CHANGE');
  });
});

describe('readServicePerformedWork / serviceKind (Service Info V2)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rules = require('./document-service-extraction.rules') as typeof import('./document-service-extraction.rules');

  it('parses JSON arrays, line lists and dedupes; strips bullets', () => {
    expect(rules.readServicePerformedWork({ performedWork: '["Engine: oil and filter change.", "Brake fluid replaced."]' })).toEqual([
      'Engine: oil and filter change.',
      'Brake fluid replaced.',
    ]);
    expect(rules.readServicePerformedWork({ performedWork: '- Spark plugs replaced\n• Air filter replaced\nSpark plugs replaced' })).toEqual([
      'Spark plugs replaced',
      'Air filter replaced',
    ]);
    expect(rules.readServicePerformedWork({ performedWork: ['a', ' b ', ''] })).toEqual(['a', 'b']);
    expect(rules.readServicePerformedWork({})).toEqual([]);
  });

  it('maps performedWork + serviceKind into the apply payload (SERVICE only for kind)', () => {
    const svc = rules.buildServiceApplyPayload('SERVICE', {
      eventDate: '2026-05-12',
      performedWork: 'Engine oil replaced',
      serviceKind: 'inspection_large',
    });
    expect(svc).toMatchObject({ eventType: 'FULL_SERVICE', performedWork: ['Engine oil replaced'], serviceKind: 'INSPECTION_LARGE' });
    const oil = rules.buildServiceApplyPayload('OIL_CHANGE', { eventDate: '2026-05-12', serviceKind: 'INSPECTION_LARGE' });
    expect(oil).toMatchObject({ eventType: 'OIL_CHANGE', performedWork: [], serviceKind: null });
    expect(rules.readServiceKind({ serviceKind: 'whatever' })).toBeNull();
  });
});
