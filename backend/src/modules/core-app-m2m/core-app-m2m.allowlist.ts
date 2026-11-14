import { CORE_APP_M2M_EXCHANGE_PATH } from './core-app-m2m.constants';

const ENTITLEMENTS_LIST = /^\/api\/v1\/core\/entitlements\/v1\/organizations\/[^/]+$/;
const ENTITLEMENTS_SINGLE =
  /^\/api\/v1\/core\/entitlements\/v1\/organizations\/[^/]+\/products\/[^/]+$/;

const APP_VEHICLE_READ_LIST =
  /^\/api\/v1\/core\/app\/read\/v1\/organizations\/[^/]+\/products\/[^/]+\/vehicles$/;
const APP_VEHICLE_READ_DETAIL =
  /^\/api\/v1\/core\/app\/read\/v1\/organizations\/[^/]+\/products\/[^/]+\/vehicles\/[^/]+$/;

export function isCoreAppM2mExchangePath(pathWithoutQuery: string): boolean {
  return pathWithoutQuery === CORE_APP_M2M_EXCHANGE_PATH;
}

export function isCoreAppM2mAllowlistedApiPath(pathWithoutQuery: string): boolean {
  return (
    ENTITLEMENTS_LIST.test(pathWithoutQuery) ||
    ENTITLEMENTS_SINGLE.test(pathWithoutQuery) ||
    APP_VEHICLE_READ_LIST.test(pathWithoutQuery) ||
    APP_VEHICLE_READ_DETAIL.test(pathWithoutQuery)
  );
}

export function extractOrgIdFromEntitlementsPath(pathWithoutQuery: string): string | null {
  const match =
    pathWithoutQuery.match(
      /^\/api\/v1\/core\/entitlements\/v1\/organizations\/([^/]+)(?:\/products\/[^/]+)?$/,
    ) ?? null;
  return match?.[1] ?? null;
}

export function extractOrgIdFromAppVehicleReadPath(pathWithoutQuery: string): string | null {
  const match =
    pathWithoutQuery.match(
      /^\/api\/v1\/core\/app\/read\/v1\/organizations\/([^/]+)\/products\/[^/]+\/vehicles/,
    ) ?? null;
  return match?.[1] ?? null;
}