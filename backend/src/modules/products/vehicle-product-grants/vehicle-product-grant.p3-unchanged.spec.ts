import { readFileSync } from 'fs';
import { join } from 'path';

const CONTROLLER_PATHS = [
  'core-vehicle-read/core-vehicle-read.v1.controller.ts',
  'core-trip-read/core-trip-read.v1.controller.ts',
  'core-driving-assessment-read/core-driving-assessment-read.v1.controller.ts',
  'core-battery-read/core-battery-read.v1.controller.ts',
  'core-dtc-read/core-dtc-read.v1.controller.ts',
  'core-service-intelligence-read/core-service-intelligence-read.v1.controller.ts',
  'core-tire-read/core-tire-read.v1.controller.ts',
  'core-brake-read/core-brake-read.v1.controller.ts',
];

describe('P3 core.read.v1 — vehicle product grant enforcement not wired (P3-PR9)', () => {
  it.each(CONTROLLER_PATHS)('%s has no VehicleProductGrant dependency', (relPath) => {
    const content = readFileSync(join(__dirname, '../../', relPath), 'utf8');
    expect(content).not.toMatch(/VehicleProductGrant/);
  });
});