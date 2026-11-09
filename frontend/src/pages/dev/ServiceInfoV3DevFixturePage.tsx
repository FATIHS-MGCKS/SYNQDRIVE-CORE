import { useLanguage } from '../../i18n/LanguageContext';
import { ServiceInfoV3Panel } from '../../rental/components/health/ServiceInfoV3Panel';
import {
  arteonFixtureWithHistory,
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

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 overflow-x-hidden bg-background p-4 text-foreground">
      <header>
        <h1 className="text-lg font-semibold">{t('health.serviceInfo.v3.devFixture.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('health.serviceInfo.v3.devFixture.subtitle')}</p>
      </header>
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
    </main>
  );
}
