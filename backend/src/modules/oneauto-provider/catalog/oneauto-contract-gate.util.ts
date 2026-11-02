import { buildOneAutoContractGateReport, isOneAutoSkuContractVerified } from './oneauto-verified-contracts';

export function assertOneAutoSkuExecutable(serviceSku: string): void {
  if (!isOneAutoSkuContractVerified(serviceSku)) {
    throw Object.assign(new Error('One Auto provider contract unverified'), {
      code: 'CONTRACT_UNVERIFIED',
      serviceSku,
      gate: buildOneAutoContractGateReport(serviceSku),
    });
  }
}
