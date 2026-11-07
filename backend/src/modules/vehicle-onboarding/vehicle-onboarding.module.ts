import { Module, forwardRef } from '@nestjs/common';
import { DocumentExtractionModule } from '@modules/document-extraction/document-extraction.module';
import { Zb1RegistrationDocumentP4Service } from '@modules/document-extraction/zb1/zb1-registration-document-p4.service';
import { AiModule } from '@modules/ai/ai.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { DimoModule } from '@modules/dimo/dimo.module';
import { AuthModule } from '@shared/auth/auth.module';
import { VehicleOnboardingCaseService } from './services/vehicle-onboarding-case.service';
import { VehicleOnboardingActivationService } from './services/vehicle-onboarding-activation.service';
import { VehicleOnboardingReadinessService } from './services/vehicle-onboarding-readiness.service';
import { VehicleOnboardingCaptureService } from './services/vehicle-onboarding-capture.service';
import { VehicleOnboardingSourceAdoptionService } from './services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingCaptureController } from './controllers/vehicle-onboarding-capture.controller';
import { VehicleOnboardingSourceAdoptionController } from './controllers/vehicle-onboarding-source-adoption.controller';
import { VehicleOnboardingProviderCandidateController } from './controllers/vehicle-onboarding-provider-candidate.controller';
import { VehicleOnboardingProviderCandidateService } from './services/vehicle-onboarding-provider-candidate.service';
import { VehicleOffboardingService } from './services/vehicle-offboarding.service';
import { DimoSourceLinkAuditedDeactivationService } from './services/dimo-source-link-audited-deactivation.service';
import { VehicleOnboardingOffboardService } from './services/vehicle-onboarding-offboard.service';
import { VehicleOnboardingOffboardController } from './controllers/vehicle-onboarding-offboard.controller';
import { MasterVehicleOffboardAdmissionGuard } from './guards/master-vehicle-offboard-admission.guard';
import { MasterVehicleOffboardMfaGuard } from './guards/master-vehicle-offboard-mfa.guard';
import { VehicleOffboardPreflightService } from './offboarding/vehicle-offboard-preflight.service';
import { ProductionFailClosedReadinessAuthority } from './readiness/vehicle-onboarding-readiness-authority';
import { VEHICLE_ONBOARDING_READINESS_AUTHORITY } from './readiness/vehicle-onboarding-readiness.tokens';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';
import { MasterDimoCanonicalRegistrationService } from './master-dimo/master-dimo-canonical-registration.service';
import { VsiReadonlySignalComposerModule } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-readonly-composer.module';
import { VehicleIdentityReviewController } from './vehicle-identity-review/vehicle-identity-review.controller';
import { VehicleIdentityP3Service } from './vehicle-identity-review/vehicle-identity-p3.service';
import { VehicleIdentityReviewService } from './vehicle-identity-review/vehicle-identity-review.service';
import { FsdDiscoveryIntegrationModule } from '@modules/vehicle-intelligence/fsd-integration/fsd-integration.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => DimoModule),
    forwardRef(() => FsdDiscoveryIntegrationModule),
    ActivityLogModule,
    VsiReadonlySignalComposerModule,
    forwardRef(() => AiModule),
    forwardRef(() => DocumentExtractionModule),
  ],
  controllers: [
    VehicleIdentityReviewController,
    VehicleOnboardingCaptureController,
    VehicleOnboardingSourceAdoptionController,
    VehicleOnboardingProviderCandidateController,
    VehicleOnboardingOffboardController,
  ],
  providers: [
    VehicleOnboardingSourceAdoptionAuthority,
    ProductionFailClosedReadinessAuthority,
    {
      provide: VEHICLE_ONBOARDING_READINESS_AUTHORITY,
      useExisting: ProductionFailClosedReadinessAuthority,
    },
    VehicleOnboardingReadinessService,
    VehicleOnboardingCaseService,
    VehicleOnboardingActivationService,
    VehicleOnboardingCaptureService,
    VehicleOnboardingSourceAdoptionService,
    VehicleOnboardingProviderCandidateService,
    VehicleOffboardingService,
    DimoSourceLinkAuditedDeactivationService,
    VehicleOffboardPreflightService,
    VehicleOnboardingOffboardService,
    MasterVehicleOffboardAdmissionGuard,
    MasterVehicleOffboardMfaGuard,
    MasterDimoCanonicalRegistrationService,
    VehicleIdentityReviewService,
    VehicleIdentityP3Service,
  ],
  exports: [
    VehicleOnboardingCaseService,
    VehicleOnboardingActivationService,
    VehicleOnboardingReadinessService,
    VehicleOnboardingCaptureService,
    VehicleOffboardingService,
    DimoSourceLinkAuditedDeactivationService,
    VehicleOnboardingOffboardService,
    MasterDimoCanonicalRegistrationService,
  ],
})
export class VehicleOnboardingModule {}
