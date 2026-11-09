import { useMemo } from 'react';
import { FleetProvider } from '../../rental/FleetContext';
import { RentalProvider } from '../../rental/RentalContext';
import { HealthErrorsView } from '../../rental/components/HealthErrorsView';
import {
  RentalEntityNavigationProvider,
  type RentalEntityNavigationValue,
} from '../../rental/context/RentalEntityNavigationContext';

const VEHICLE_ID = 'veh-svc-e2e-arteon';

/**
 * DEV + Playwright harness: real `HealthErrorsView` service portal modal (not a static shell).
 */
export default function HealthErrorsServiceModalDevPage() {
  const nav = useMemo<RentalEntityNavigationValue>(
    () => ({
      openDocumentIntake: () => undefined,
      openVehicleById: () => undefined,
      openBookingById: () => undefined,
      openInvoiceById: () => undefined,
      openCustomerById: () => undefined,
      openDocumentById: () => undefined,
      openAlertById: () => undefined,
      openServiceCaseById: () => undefined,
      openFineById: () => undefined,
      openVendorById: () => undefined,
    }),
    [],
  );

  return (
    <RentalProvider>
      <FleetProvider>
        <RentalEntityNavigationProvider value={nav}>
          <main
            data-testid="health-errors-service-e2e-root"
            className="mx-auto min-h-screen max-w-5xl overflow-x-hidden bg-background p-4 text-foreground"
          >
            <HealthErrorsView
              vehicleId={VEHICLE_ID}
              fuelType="Gasoline"
              initialModuleTab="service"
              onConsumeInitialModuleTab={() => undefined}
            />
          </main>
        </RentalEntityNavigationProvider>
      </FleetProvider>
    </RentalProvider>
  );
}
