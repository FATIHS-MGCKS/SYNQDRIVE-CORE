import type { Organization } from '../data/platform-data';

/** Complete Master Organization row for VehicleRegistrationModal tests. */
export function testMasterOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    company_name: 'Org',
    business_type: 'Rental',
    city: 'Berlin',
    country: 'DE',
    fleet_size: 10,
    created_at: '2026-01-01T00:00:00.000Z',
    status: 'Active',
    plan: 'Business',
    mrr: 0,
    users: 1,
    contactEmail: 'ops@example.com',
    lastActive: '2026-01-01T00:00:00.000Z',
    products: [],
    integrations: [],
    invoices: [],
    ...overrides,
  };
}
