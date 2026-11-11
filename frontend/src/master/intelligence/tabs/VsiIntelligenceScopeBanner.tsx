import { useLanguage } from '../../../i18n/LanguageContext';

type Props = {
  orgLabel: string | null;
  vehicleLabel: string | null;
  linkLabel: string | null;
  providerSourceLinkId: string | null;
};

export function VsiIntelligenceScopeBanner({
  orgLabel,
  vehicleLabel,
  linkLabel,
  providerSourceLinkId,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-xs" data-testid="vsi-scope-banner">
      <p className="font-medium text-muted-foreground">{t('master.intelligence.vsi.cockpit.scopeTitle' as never)}</p>
      <dl className="mt-1 grid gap-1 sm:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('master.intelligence.vsi.picker.org' as never)}
          </dt>
          <dd className="font-mono text-[11px]">{orgLabel ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('master.intelligence.vsi.picker.vehicle' as never)}
          </dt>
          <dd className="font-mono text-[11px]">{vehicleLabel ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('master.intelligence.vsi.picker.link' as never)}
          </dt>
          <dd className="font-mono text-[11px] break-all">{linkLabel ?? providerSourceLinkId ?? '—'}</dd>
        </div>
      </dl>
    </div>
  );
}
