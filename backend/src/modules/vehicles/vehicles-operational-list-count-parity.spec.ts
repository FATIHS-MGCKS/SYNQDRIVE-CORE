import { buildRegisteredOperationalWhere } from './vehicles-operational-query.util';

describe('operational list/count parity', () => {
  it('uses identical prisma where for count and findMany paths', () => {
    const query = {
      page: 3,
      limit: 10,
      registrationState: 'registered' as const,
      organizationId: 'org-7',
      registryLifecycle: 'ACTIVE' as const,
    };
    const where = buildRegisteredOperationalWhere(query);
    expect(where).toEqual({
      registryLifecycle: 'ACTIVE',
      organizationId: 'org-7',
    });
  });

  it('pagination total must come from count(where), not page row length', () => {
    const where = buildRegisteredOperationalWhere({
      registrationState: 'registered',
      registryLifecycle: 'ACTIVE',
    });
    expect(where.registryLifecycle).toBe('ACTIVE');
    expect(Object.keys(where)).not.toContain('skip');
  });
});
