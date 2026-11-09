import { useState } from 'react';
import type {
  DashboardWarningLightsResponse,
  OilLevelDisplay,
} from '../../lib/api';
import { Icon } from './ui/Icon';
import { StatusChip, SkeletonCard } from '../../components/patterns';
import { DashboardTelltaleIcon } from './health/DashboardTelltaleIcon';
import {
  DASHBOARD_TELLTALE_KEYS,
  formatRelativeObservedAt,
  resolveTelltalePanelPresentation,
  telltaleShortLabel,
  telltaleTileStatusLabel,
  telltaleToneFromLight,
  type TelltaleTone,
} from '../lib/dashboard-warning-lights-display';
import { DashboardWarningLightsDetailDrawer } from './health/DashboardWarningLightsDetailDrawer';

export interface DashboardWarningLightsPanelProps {
  telltales?: DashboardWarningLightsResponse | null;
  loading?: boolean;
  oilLevelDisplay?: OilLevelDisplay | null;
  syncErrorMessage?: string | null;
  className?: string;
  vehicleId?: string;
  onOpenBooking?: (bookingId: string) => void;
  onOpenTrips?: (dateIso?: string) => void;
}


function tileIconBg(tone: TelltaleTone, disabled: boolean): string {
  if (disabled) return 'bg-muted/30 ring-1 ring-border';
  if (tone === 'critical') return 'sq-tone-critical ring-1 ring-border';
  if (tone === 'alert') return 'sq-tone-watch ring-1 ring-border';
  if (tone === 'ok') return 'sq-tone-success ring-1 ring-border';
  return 'bg-muted/40 ring-1 ring-border';
}

function tileBorderClass(tone: TelltaleTone, disabled: boolean): string {
  if (disabled) return 'border-border/50 bg-muted/10 opacity-60';
  if (tone === 'critical') return 'border-red-500/25 bg-red-500/[0.04]';
  if (tone === 'alert') return 'border-amber-500/25 bg-amber-500/[0.04]';
  if (tone === 'ok') return 'border-border/60 surface-premium';
  return 'border-border/60 surface-premium';
}

function statusTextClass(tone: TelltaleTone, disabled: boolean): string {
  if (disabled) return 'text-muted-foreground/60';
  if (tone === 'critical') return 'text-[color:var(--status-critical)] font-semibold';
  if (tone === 'alert') return 'text-[color:var(--status-watch)] font-semibold';
  if (tone === 'ok') return 'text-muted-foreground';
  return 'text-muted-foreground/70';
}

export function DashboardWarningLightsPanel({
  telltales,
  loading = false,
  oilLevelDisplay: _oilLevelDisplay,
  syncErrorMessage,
  className = '',
  vehicleId,
  onOpenBooking,
  onOpenTrips,
}: DashboardWarningLightsPanelProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  if (loading && !telltales) {
    return <SkeletonCard className={`h-36 rounded-xl ${className}`} />;
  }

  const presentation = resolveTelltalePanelPresentation(telltales);
  const envelopeFreshness = telltales?.freshness;
  const lastUpdateRel = formatRelativeObservedAt(telltales?.lastObservedAt ?? null);
  const disabled = !presentation.isConnected;

  const tiles = DASHBOARD_TELLTALE_KEYS.map((key) => {
    const light = telltales?.lights?.find((l) => l.key === key);
    const tone: TelltaleTone = disabled || !light ? 'neutral' : telltaleToneFromLight(light);
    const statusLabel = telltaleTileStatusLabel(light, presentation.isConnected, envelopeFreshness);
    return {
      key,
      label: telltaleShortLabel(key),
      tone,
      statusLabel,
      ariaLabel: `${telltaleShortLabel(key)}: ${statusLabel}`,
    };
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className={`group w-full text-left rounded-xl border border-border/60 bg-background shadow-sm p-2.5 transition-all duration-300 ease-out hover:shadow-lg hover:-translate-y-0.5 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer ${className}`}
        aria-labelledby="tacho-warnleuchten-title"
        aria-describedby="tacho-warnleuchten-summary"
      >
        <div className="mb-1 flex items-center justify-between gap-2 relative z-10">
          <div className="flex items-center gap-2 min-w-0">
            <div className="sq-tone-brand p-1.5 rounded-lg shrink-0">
              <Icon name="alert-triangle" className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <h3 id="tacho-warnleuchten-title" className="text-[10px] font-bold tracking-tight text-foreground">
              Tacho Warnleuchten
            </h3>
            <StatusChip tone={presentation.badgeTone} className="!text-[9px] !py-0 !px-1.5">
              {presentation.badgeLabel}
            </StatusChip>
          </div>
          <Icon
            name="chevron-right"
            className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>

        <p
          id="tacho-warnleuchten-summary"
          className="text-[10px] leading-snug text-muted-foreground mb-2 line-clamp-2 relative z-10"
        >
          {syncErrorMessage && presentation.badgeLabel === 'Unbekannt'
            ? 'Warnleuchtenstatus aktuell nicht verfügbar.'
            : presentation.summaryText}
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 pointer-events-none relative z-10">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className={`flex flex-col items-center gap-1 rounded-[10px] border px-1 py-2 min-h-[64px] ${tileBorderClass(tile.tone, disabled)}`}
              aria-hidden="true"
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tileIconBg(tile.tone, disabled)}`}
              >
                <DashboardTelltaleIcon
                  telltaleKey={tile.key}
                  className={`w-3.5 h-3.5 ${
                    disabled
                      ? 'opacity-30 grayscale'
                      : tile.tone === 'alert' || tile.tone === 'critical'
                        ? 'opacity-100'
                        : tile.tone === 'ok'
                          ? 'opacity-50 grayscale'
                          : 'opacity-40 grayscale'
                  }`}
                />
              </div>
              <span className="text-[9px] font-semibold text-foreground text-center leading-tight line-clamp-2">
                {tile.label}
              </span>
              <span
                className={`text-[8px] tabular-nums text-center leading-tight ${statusTextClass(tile.tone, disabled)}`}
              >
                {tile.statusLabel === '—' ? '\u00A0' : tile.statusLabel}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2 pt-1 border-t border-border/50 flex flex-wrap items-center justify-between gap-1.5 text-[9px] text-muted-foreground relative z-10">
          {presentation.activeCount > 0 ? (
            <span className="font-medium text-[color:var(--status-watch)]">
              {presentation.activeCount} aktiv
            </span>
          ) : presentation.historicalCount > 0 ? (
            <span>
              {presentation.historicalCount} historisch
            </span>
          ) : (
            <span className="line-clamp-1">
              {presentation.badgeLabel === 'Nicht verbunden'
                ? 'Nicht verbunden'
                : presentation.badgeLabel === 'Alles klar'
                  ? 'Alle inaktiv'
                  : '\u00A0'}
            </span>
          )}
          <span className="flex items-center gap-1 shrink-0">
            {lastUpdateRel && presentation.isConnected && (
              <span className="tabular-nums">{lastUpdateRel}</span>
            )}
            <span className="font-medium text-[color:var(--brand)]">Details</span>
          </span>
        </div>
      </button>

      <DashboardWarningLightsDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        telltales={telltales}
        vehicleId={vehicleId}
        onOpenBooking={onOpenBooking}
        onOpenTrips={onOpenTrips}
      />
    </>
  );
}
