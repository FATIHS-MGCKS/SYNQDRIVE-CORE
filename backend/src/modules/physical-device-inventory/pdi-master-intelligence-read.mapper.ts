export function maskIdentifier(id: string | null | undefined): string | null {
  if (!id?.trim()) return null;
  const t = id.trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 12)}…`;
}

export function mapEpisodeRow(row: {
  id: string;
  organizationId: string;
  vehicleId: string;
  status: string;
  openedReason: string;
  openedAt: Date;
  resolvedAt: Date | null;
  resolutionMethod: string | null;
}): import('./pdi-master-intelligence-read.types').MasterPdiConnectionEpisodeDto {
  return {
    idPrefix: maskIdentifier(row.id) ?? row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    status: row.status,
    openedReason: row.openedReason,
    openedAt: row.openedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionMethod: row.resolutionMethod,
    episodeIsNotRealPoll: true,
    attributionNote:
      'Connection episodes describe DIMO device connection lifecycle on a vehicle — not APDS poll execution.',
  };
}
