/** @deprecated Wall-clock fallback — tests only; runtime uses enqueue/BullMQ identity. */
export function buildApdsV3ShadowPhysicalRequestId(input: {
  organizationId: string;
  vehicleId: string;
  pollStartedAtMs: number;
  realPollId?: string | null;
}): string {
  if (input.realPollId) return input.realPollId;
  return `v3-phys:${input.organizationId}:${input.vehicleId}:${input.pollStartedAtMs}`;
}
