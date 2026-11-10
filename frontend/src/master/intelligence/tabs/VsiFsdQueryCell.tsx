import { useLanguage } from '../../../i18n/LanguageContext';
import type { FsdQueryTriple } from '../vsi-fsd-query-display.util';
import { classifyFsdQueryTriple } from '../vsi-fsd-query-display.util';

export function VsiFsdQueryCell({ triple, stage }: { triple: FsdQueryTriple; stage: 'catalog' | 'snapshot' | 'historical' }) {
  const { t } = useLanguage();
  const label = classifyFsdQueryTriple(triple);

  if (label === 'unknown') {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="block text-[10px] leading-tight" data-stage={stage}>
      <span className="font-medium">{t(`master.intelligence.vsi.fsd.query.${label}` as never)}</span>
      {triple && triple.queryPlanned && triple.queryAccepted != null ? (
        <span className="text-muted-foreground">
          {' '}
          · {t('master.intelligence.vsi.fsd.query.acceptedFlag' as never)}:{' '}
          {triple.queryAccepted
            ? t('master.intelligence.vsi.common.yes' as never)
            : t('master.intelligence.vsi.common.no' as never)}
        </span>
      ) : null}
      {triple && triple.observedValue != null ? (
        <span className="text-muted-foreground">
          {' '}
          · {t('master.intelligence.vsi.fsd.query.observedFlag' as never)}:{' '}
          {triple.observedValue
            ? t('master.intelligence.vsi.common.yes' as never)
            : t('master.intelligence.vsi.common.no' as never)}
        </span>
      ) : null}
    </span>
  );
}
