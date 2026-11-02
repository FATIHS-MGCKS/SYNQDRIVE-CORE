import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { dedupeProvenanceTagsForDisplay } from './dedupe-provenance-display.util';

export type ProvenanceListProps = {
  snapshotTags: readonly string[] | null | undefined;
  cadenceTags: readonly string[] | null | undefined;
  className?: string;
};

function ProvenanceLane({
  headingId,
  heading,
  tags,
  laneLabel,
}: {
  headingId: string;
  heading: string;
  tags: string[];
  laneLabel: string;
}) {
  const { t } = useLanguage();
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-1.5">
      <h4 id={headingId} className="text-[11px] font-medium text-foreground">
        {heading}
      </h4>
      {tags.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t('master.intelligence.vsi.ledger.provenance.empty' as never)}
        </p>
      ) : (
        <ul className="m-0 flex flex-wrap gap-1.5 p-0 list-none" aria-label={laneLabel}>
          {tags.map((tag) => (
            <li key={tag}>
              <code className="rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono">
                {tag}
              </code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProvenanceList({ snapshotTags, cadenceTags, className }: ProvenanceListProps) {
  const { t } = useLanguage();
  const snapshot = dedupeProvenanceTagsForDisplay(snapshotTags);
  const cadence = dedupeProvenanceTagsForDisplay(cadenceTags);

  return (
    <div
      className={cn(
        'grid min-w-0 gap-4 rounded-lg border border-border/60 bg-card/40 p-3 sm:grid-cols-2',
        className,
      )}
    >
      <ProvenanceLane
        headingId="vsi-provenance-snapshot"
        heading={t('master.intelligence.vsi.ledger.provenance.snapshotHeading' as never)}
        tags={snapshot}
        laneLabel={t('master.intelligence.vsi.ledger.provenance.laneSnapshot' as never)}
      />
      <ProvenanceLane
        headingId="vsi-provenance-cadence"
        heading={t('master.intelligence.vsi.ledger.provenance.cadenceHeading' as never)}
        tags={cadence}
        laneLabel={t('master.intelligence.vsi.ledger.provenance.laneCadence' as never)}
      />
    </div>
  );
}
