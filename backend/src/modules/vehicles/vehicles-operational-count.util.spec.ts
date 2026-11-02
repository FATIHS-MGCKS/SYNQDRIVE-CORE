import { buildRegisteredOperationalWhere, resolveRegistryLifecycleFilter } from './vehicles-operational-query.util';

describe('vehicles-operational-query.util', () => {
  it('defaults omitted registryLifecycle to ACTIVE for list parity', () => {
    expect(resolveRegistryLifecycleFilter({})).toBe('ACTIVE');
    expect(buildRegisteredOperationalWhere({ registrationState: 'registered' })).toEqual({
      registryLifecycle: 'ACTIVE',
    });
  });

  it('preserves organization scope in where', () => {
    expect(
      buildRegisteredOperationalWhere({
        organizationId: 'org-a',
        registryLifecycle: 'ACTIVE',
      }),
    ).toMatchObject({ organizationId: 'org-a', registryLifecycle: 'ACTIVE' });
  });

  it('omits lifecycle predicate when filter is all', () => {
    const where = buildRegisteredOperationalWhere({ registryLifecycle: 'all' });
    expect(where.registryLifecycle).toBeUndefined();
  });

  it('supports OFFBOARDED and ARCHIVED filters', () => {
    expect(
      buildRegisteredOperationalWhere({ registryLifecycle: 'OFFBOARDED' }).registryLifecycle,
    ).toBe('OFFBOARDED');
    expect(
      buildRegisteredOperationalWhere({ registryLifecycle: 'ARCHIVED' }).registryLifecycle,
    ).toBe('ARCHIVED');
  });
});
