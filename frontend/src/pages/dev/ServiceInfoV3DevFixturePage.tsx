import { useLanguage } from '../../i18n/LanguageContext';
import { ServiceInfoV3ComplianceCards } from '../../rental/components/health/ServiceInfoV3ComplianceCards';
import { ServiceInfoV3Panel } from '../../rental/components/health/ServiceInfoV3Panel';
import {
  arteonFixtureModalPresentation,
  arteonFixtureWithHistory,
  iphoneUx32OverdueFixture,
  mercedesNoForecastServiceInfo,
} from '../../rental/components/health/service-info-v3-fixture-data';

/**
 * DEV-only visual fixture for Service Info V3 (Playwright / manual layout QA).
 * Not linked in product navigation.
 */
export default function ServiceInfoV3DevFixturePage() {
  const { t } = useLanguage();
  const arteon = arteonFixtureWithHistory();
  const mercedes = mercedesNoForecastServiceInfo();
  const modalArteon = arteonFixtureModalPresentation();
  const ux32 = iphoneUx32OverdueFixture();

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 overflow-x-hidden bg-background p-4 text-foreground">
      <header>
        <h1 className="text-lg font-semibold">{t('health.serviceInfo.v3.devFixture.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('health.serviceInfo.v3.devFixture.subtitle')}</p>
      </header>
      <section data-testid="fixture-ux32-iphone" className="min-w-0">
        <ServiceInfoV3Panel
          serviceInfo={ux32}
          loading={false}
          error={false}
          vehicleId="veh-ux32"
          orgId="org-fixture"
          defaultTab="overview"
        />
      </section>
      <section data-testid="fixture-arteon" className="min-w-0">
        <ServiceInfoV3Panel
          serviceInfo={arteon}
          loading={false}
          error={false}
          vehicleId="veh-arteon"
          orgId="org-fixture"
          defaultTab="overview"
        />
      </section>
      <section data-testid="fixture-mercedes" className="min-w-0">
        <ServiceInfoV3Panel
          serviceInfo={mercedes}
          loading={false}
          error={false}
          vehicleId="veh-mercedes"
          orgId="org-fixture"
          defaultTab="history"
        />
      </section>
      <section data-testid="fixture-modal-arteon" className="min-w-0">
        <div
          role="dialog"
          aria-labelledby="fixture-modal-arteon-title"
          className="surface-solid min-w-0 overflow-hidden rounded-2xl border border-border shadow-sm"
          data-testid="service-info-v3-modal-fixture-shell"
        >
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <h2 id="fixture-modal-arteon-title" className="text-base font-semibold tracking-tight">
              {t('health.serviceInfo.v3.pageTitle')}
            </h2>
          </div>
          <div className="px-4 py-4 sm:px-5 sm:py-5">
            <ServiceInfoV3Panel
              presentation="modal"
              serviceInfo={modalArteon}
              loading={false}
              error={false}
              vehicleId="veh-arteon-modal"
              orgId="org-fixture"
              defaultTab="overview"
              className="mb-5"
            />
            <ServiceInfoV3ComplianceCards serviceInfo={modalArteon} />
          </div>
        </div>
      </section>
    </main>
  );
}
