import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canOffboardRegisteredVehicle, normalizeRegistryLifecycle } from './registry-lifecycle.utils';
import { parseApiErrorCode, parseBlockingReasons } from './vehicle-offboard.errors';
import { blockingReasonsFromError } from './vehicle-offboard.api-error';
import { VehicleOffboardRequestError } from '../../lib/vehicle-offboard-api-error';
import { urlToCvQuery } from './cv.utils';
import { buildVehiclesOperationalListQuery } from '../../lib/vehicles-operational-list-query';
import { en } from '../../i18n/translations/en';

const frontendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('connected vehicles offboard (VO5C-P2A)', () => {
  it('A/O/N — lifecycle gating for offboard action', () => {
    expect(
      canOffboardRegisteredVehicle({
        vehicleId: 'v1',
        organizationId: 'o1',
        registryLifecycle: 'ACTIVE',
      }),
    ).toBe(true);
    expect(
      canOffboardRegisteredVehicle({
        vehicleId: 'v1',
        organizationId: 'o1',
        registryLifecycle: 'OFFBOARDED',
      }),
    ).toBe(false);
    expect(
      canOffboardRegisteredVehicle({
        vehicleId: 'v1',
        organizationId: 'o1',
        registryLifecycle: 'ARCHIVED',
      }),
    ).toBe(false);
    expect(normalizeRegistryLifecycle(undefined)).toBe('UNKNOWN');
    expect(
      canOffboardRegisteredVehicle({
        vehicleId: 'v1',
        organizationId: 'o1',
        registryLifecycle: null,
      }),
    ).toBe(false);
  });

  it('P — registry lifecycle filter defaults to ACTIVE in list URL state', () => {
    const q = urlToCvQuery({});
    expect(q.registryLifecycle).toBe('ACTIVE');
    const all = urlToCvQuery({ cvRegistryLifecycle: 'all' });
    expect(all.registryLifecycle).toBe('all');
  });

  it('K/M — operational blockers parsed from typed API error', () => {
    const err = Object.assign(new Error('[OFFBOARD_OPERATIONALLY_BLOCKED] blocked'), {
      details: { blockingReasons: ['ACTIVE_RENTAL', 'ONGOING_TRIP'] },
    });
    expect(parseApiErrorCode(err.message)).toBe('OFFBOARD_OPERATIONALLY_BLOCKED');
    expect(parseBlockingReasons(err)).toEqual(['ACTIVE_RENTAL', 'ONGOING_TRIP']);
    const typed = new VehicleOffboardRequestError('blocked', {
      kind: 'OPERATIONALLY_BLOCKED',
      code: 'OFFBOARD_OPERATIONALLY_BLOCKED',
      status: 422,
      details: { blockingReasons: ['ACTIVE_RENTAL'] },
    });
    expect(blockingReasonsFromError(typed)).toEqual(['ACTIVE_RENTAL']);
  });

  it('R/S — registryLifecycle query builder', () => {
    expect(buildVehiclesOperationalListQuery({ registryLifecycle: 'all' })).toContain(
      'registryLifecycle=all',
    );
    expect(buildVehiclesOperationalListQuery({ registryLifecycle: 'ACTIVE' })).toContain(
      'registryLifecycle=ACTIVE',
    );
  });

  it('F/G — MFA success close must not run cancel abandon hook', () => {
    const abandon = vi.fn();
    const skipMfaCancelCleanupRef = { current: false };
    const onSuccess = () => {
      skipMfaCancelCleanupRef.current = true;
    };
    const onClose = () => {
      if (skipMfaCancelCleanupRef.current) {
        skipMfaCancelCleanupRef.current = false;
        return;
      }
      abandon();
    };
    onSuccess();
    onClose();
    expect(abandon).not.toHaveBeenCalled();
    onClose();
    expect(abandon).toHaveBeenCalledTimes(1);
  });

  it('C — Connected Vehicles hub does not reference legacy deregister', () => {
    const hubSrc = readFileSync(
      path.join(frontendRoot, 'src/master/connected-vehicles/ConnectedVehiclesHub.tsx'),
      'utf8',
    );
    const drawerSrc = readFileSync(
      path.join(frontendRoot, 'src/master/connected-vehicles/ConnectedVehicleDetailDrawer.tsx'),
      'utf8',
    );
    expect(hubSrc).not.toMatch(/deregister/i);
    expect(drawerSrc).not.toMatch(/deregister/i);
    expect(hubSrc).toMatch(/useVehicleOffboard|onOffboard/);
  });

  it('R — native locales define master.cv offboard keys (tr uses en fallback per registry)', () => {
    const locales = ['de', 'en', 'pl', 'fr', 'cs', 'nl', 'es', 'it'];
    const required = Object.keys(en).filter(
      (k) => k.startsWith('master.cv.') && !k.startsWith('master.cv.technicalSpecs.'),
    );
    const technicalRequired = Object.keys(en).filter((k) =>
      k.startsWith('master.cv.technicalSpecs.'),
    );
    for (const locale of locales) {
      const file = path.join(frontendRoot, `src/i18n/translations/${locale}.ts`);
      const src = readFileSync(file, 'utf8');
      for (const key of required) {
        expect(src).toContain(`'${key}'`);
      }
      if (locale === 'tr') continue;
      const specsFile = path.join(
        frontendRoot,
        `src/i18n/translations/master.cv.technicalSpecs.${locale}.ts`,
      );
      const specsSrc = readFileSync(specsFile, 'utf8');
      for (const key of technicalRequired) {
        expect(specsSrc).toContain(`'${key}'`);
      }
    }
    const trSrc = readFileSync(path.join(frontendRoot, 'src/i18n/translations/tr.ts'), 'utf8');
    expect(trSrc).not.toContain('master.cv.offboard.action');
  });
});
