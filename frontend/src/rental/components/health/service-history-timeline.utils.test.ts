import { describe, expect, it } from 'vitest';
import type { ServiceInfoStatus } from '../../../lib/api';
import {
  groupServiceHistoryByYear,
  mergeServiceHistoryPages,
  resolveServiceHistoryOriginKey,
  sortServiceHistoryItems,
} from './service-history-timeline.utils';

type Item = ServiceInfoStatus['serviceHistory'][number];

const item = (partial: Partial<Item> & Pick<Item, 'id' | 'date'>): Item => ({
  eventType: 'OTHER',
  odometerKm: null,
  workshopName: null,
  notes: null,
  ...partial,
});

describe('service-history-timeline.utils', () => {
  it('sorts newest first with stable id tie-break', () => {
    const sorted = sortServiceHistoryItems([
      item({ id: 'b', date: '2024-01-01' }),
      item({ id: 'a', date: '2025-01-01' }),
      item({ id: 'c', date: '2025-01-01' }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('dedupes by id across pages', () => {
    const merged = mergeServiceHistoryPages(
      [item({ id: '1', date: '2025-01-01' })],
      [item({ id: '1', date: '2025-01-02' }), item({ id: '2', date: '2024-01-01' })],
    );
    expect(merged.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('groups by year and keeps same-day events in year bucket', () => {
    const groups = groupServiceHistoryByYear([
      item({ id: 'a', date: '2025-06-15T10:00:00Z' }),
      item({ id: 'b', date: '2025-06-15T14:00:00Z' }),
      item({ id: 'c', date: '2024-01-01' }),
    ]);
    expect(groups.map((g) => g.year)).toEqual([2025, 2024]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('resolves origin keys without certified manufacturer wording', () => {
    expect(resolveServiceHistoryOriginKey({ ...item({ id: 'x', date: '2025-01-01' }), origin: 'OEM' })).toBe(
      'health.serviceInfo.v3.history.origin.oem',
    );
    expect(
      resolveServiceHistoryOriginKey({ ...item({ id: 'y', date: '2025-01-01' }), externalSource: true, origin: 'MANUAL' }),
    ).toBe('health.serviceInfo.v3.history.origin.oneAuto');
  });
});
