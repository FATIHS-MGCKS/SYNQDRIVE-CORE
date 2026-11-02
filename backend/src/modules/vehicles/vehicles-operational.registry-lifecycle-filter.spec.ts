import { buildRegisteredOperationalWhere } from './vehicles-operational-query.util';

describe('VehiclesOperationalService registryLifecycle filter (VO5C-P2A)', () => {
  it('defaults omitted lifecycle to ACTIVE (Connected Vehicles list parity)', () => {
    const where = buildRegisteredOperationalWhere({ registrationState: 'registered' });
    expect(where.registryLifecycle).toBe('ACTIVE');
  });

  it('filters ACTIVE, OFFBOARDED and ARCHIVED explicitly', () => {
    expect(buildRegisteredOperationalWhere({ registryLifecycle: 'ACTIVE' })).toMatchObject({
      registryLifecycle: 'ACTIVE',
    });
    expect(buildRegisteredOperationalWhere({ registryLifecycle: 'OFFBOARDED' })).toMatchObject({
      registryLifecycle: 'OFFBOARDED',
    });
    expect(buildRegisteredOperationalWhere({ registryLifecycle: 'ARCHIVED' })).toMatchObject({
      registryLifecycle: 'ARCHIVED',
    });
  });

  it('omits lifecycle predicate for ALL', () => {
    const where = buildRegisteredOperationalWhere({ registryLifecycle: 'all' });
    expect(where.registryLifecycle).toBeUndefined();
  });
});
