#!/usr/bin/env node
/**
 * Deterministic hardcoded user-facing copy inventory for SynqDrive i18n P2+.
 * Excludes translation dictionaries, tests, and developer-only strings.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeGovernanceFindings } from './lib/i18n-governance/fingerprint.mjs';
import { collectIndirectPresentationFindings } from './lib/i18n-governance/presentation-analysis.mjs';
import { extractStructuralContext } from './lib/i18n-governance/structural-context.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');
const srcRoot = join(frontendRoot, 'src');
const inventoryPath = join(srcRoot, 'i18n/hardcoded-copy-inventory.json');

const SCAN_ROOTS = [
  join(srcRoot, 'App.tsx'),
  join(srcRoot, 'pages'),
  join(srcRoot, 'components'),
  join(srcRoot, 'i18n/components'),
  join(srcRoot, 'rental'),
  join(srcRoot, 'master'),
  join(srcRoot, 'operator'),
  join(srcRoot, 'lib'),
].filter((target) => existsSync(target));

const SKIP_FILE_RE =
  /\.(test|spec)\.(ts|tsx)$|translations\/|legal-documents\.|hardcoded-copy-inventory|login-copy\.ts$|test-utils\.ts$/;
const SKIP_DIR_RE = /\/(__tests__|node_modules)\//;

const P21_ENFORCE_CLEAN_EXACT = new Set([
  'pages/LoginPage.tsx',
  'pages/VerificationDonePage.tsx',
  'i18n/components/LanguageSelector.tsx',
  'App.tsx',
  'rental/components/TopBar.tsx',
  'rental/components/Sidebar.tsx',
  'rental/components/DashboardView.tsx',
]);

const P21_ENFORCE_CLEAN_PREFIXES = ['rental/components/dashboard/'];

const P22_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/FleetHubView.tsx',
  'rental/components/FleetView.tsx',
  'rental/components/FleetConditionView.tsx',
  'rental/components/FleetConditionDetailView.tsx',
  'rental/components/FleetConditionVirtualizedVehicleRows.tsx',
  'rental/components/FleetMapControls.tsx',
  'rental/components/LiveMapOverview.tsx',
  'rental/components/StatInlineDetail.tsx',
  'rental/components/HealthErrorsView.tsx',
  'rental/components/VehicleBookingsView.tsx',
  'rental/components/VehicleTasksView.tsx',
  'rental/components/VehicleStressPanel.tsx',
  'rental/components/BatteryDataQualityBadge.tsx',
  'rental/components/BatteryConditionBars.tsx',
  'rental/components/DashboardWarningLightsPanel.tsx',
  'rental/components/DashboardWarningLightsQuickView.tsx',
  'rental/rental-health-ui.ts',
]);

const P23_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/BookingsView.tsx',
  'rental/components/NewBookingView.tsx',
  'rental/components/BookingDocumentsSection.tsx',
  'rental/components/CustomersView.tsx',
  'rental/components/CustomerDetailView.tsx',
  'rental/components/CustomerDetailModal.tsx',
  'rental/components/CustomerDocumentUploadBox.tsx',
]);

const P23_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/bookings/',
  'rental/components/booking-detail/',
  'rental/components/new-booking/',
  'rental/components/booking-payment/',
  'rental/components/customer-list/',
  'rental/components/customer-detail/',
  'rental/components/customer-verification/',
  'rental/components/add-customer/',
  'rental/components/customer/',
  'rental/components/bookings-customers/',
  'rental/lib/booking-',
  'rental/lib/bookingHandoverGates.ts',
  'rental/lib/stationBookingUtils.ts',
  'rental/lib/customer-',
  'rental/lib/add-customer-wizard.ts',
];

const P24_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/TasksView.tsx',
  'rental/components/SettingsView.tsx',
]);

const P24_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/tasks/',
  'rental/components/settings/',
  'rental/components/tasks-settings/',
  'rental/lib/task-list.utils.ts',
  'rental/lib/task-create.utils.ts',
  'rental/lib/tasks-page.utils.ts',
  'rental/lib/task-display.utils.ts',
  'rental/lib/task-create-form.utils.ts',
  'rental/lib/taskBulkActions.utils.ts',
];

const P25_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/WorkflowAutomationView.tsx',
]);

const P25_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/workflow-automation/',
];

const P26_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/stations/',
];

const P27A_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/VoiceAssistantView.tsx',
  'rental/components/voice-assistant/VoiceAssistantBuilder.tsx',
  'rental/components/voice-assistant/VoiceConversationsPanel.tsx',
  'rental/components/voice-assistant/VoiceAnalyticsView.tsx',
  'rental/components/voice-assistant/VoicePermissionsMatrix.tsx',
  'rental/components/voice-assistant/VoiceCommandHeader.tsx',
  'rental/components/voice-assistant/VoiceSelectorField.tsx',
  'rental/components/voice-assistant/VoiceLaunchChecklist.tsx',
  'rental/components/voice-assistant/VoiceOnboardingWizard.tsx',
  'rental/components/voice-assistant/VoiceSectionNav.tsx',
]);

const P27B_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/voice-assistant/VoiceTelephonyWizard.tsx',
  'rental/components/voice-assistant/VoiceTestCenter.tsx',
  'rental/components/voice-assistant/voice-test-scenarios.ts',
]);

const P28_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/WhatsAppBusinessView.tsx',
  'rental/components/whatsapp/WhatsAppChatPanel.tsx',
  'rental/components/whatsapp/WhatsAppContextDrawer.tsx',
  'rental/components/whatsapp/WhatsAppConversationInbox.tsx',
  'rental/components/whatsapp/WhatsAppInboxLayout.tsx',
  'rental/components/whatsapp/WhatsAppKpiCards.tsx',
  'rental/components/whatsapp/WhatsAppMessageBubble.tsx',
  'rental/components/whatsapp/WhatsAppMessageComposer.tsx',
  'rental/components/whatsapp/WhatsAppOperationsHeader.tsx',
  'rental/components/whatsapp/WhatsAppOverviewTab.tsx',
  'rental/components/whatsapp/WhatsAppQuickActions.tsx',
  'rental/components/whatsapp/WhatsAppReadinessStrip.tsx',
  'rental/components/whatsapp/WhatsAppSectionNav.tsx',
  'rental/components/whatsapp/WhatsAppSettingsPanel.tsx',
  'rental/components/whatsapp/WhatsAppSetupWizard.tsx',
  'rental/components/whatsapp/WhatsAppTemplateManager.tsx',
  'rental/components/whatsapp/whatsapp.ops.ts',
  'rental/components/whatsapp/whatsapp-i18n.ts',
]);

const P29_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/SupportView.tsx',
  'rental/components/support/SupportCenterHero.tsx',
  'rental/components/support/SupportTicketInbox.tsx',
  'rental/components/support/SupportTicketDetailPanel.tsx',
  'rental/components/support/SupportCreateTicketDialog.tsx',
  'rental/components/support/support-center.utils.ts',
  'rental/components/support/support-i18n.ts',
  'components/support/CreateSupportTicketDialog.tsx',
]);

const P210_ENFORCE_CLEAN_EXACT = new Set([
  'master/components/support-ops/support-ops.utils.ts',
  'master/components/support-ops/SupportOpsWorkspace.tsx',
  'master/components/support-ops/SupportOpsInbox.tsx',
  'master/components/support-ops/SupportOpsQueue.tsx',
  'master/components/support-ops/SupportOpsKpis.tsx',
  'components/support/SupportTechnicalContextCard.tsx',
]);

const P211_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/handover/HandoverProtocolDialog.tsx',
  'rental/components/handover/SignaturePad.tsx',
  'rental/components/booking-detail/BookingHandoverTab.tsx',
  'rental/lib/bookingHandoverGates.ts',
  'rental/components/handover/handover-i18n.ts',
]);

const P212_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/FinesView.tsx',
  'rental/lib/fines-i18n.ts',
]);

const P213_ENFORCE_CLEAN_EXACT = new Set([
  'operator/handover/OperatorHandoverFlow.tsx',
  'operator/handover/OperatorHandoverStepVehicle.tsx',
  'operator/handover/OperatorHandoverStepCondition.tsx',
  'operator/handover/OperatorHandoverStepDamages.tsx',
  'operator/handover/OperatorHandoverStepDocuments.tsx',
  'operator/handover/OperatorHandoverStepSignatures.tsx',
  'operator/handover/OperatorHandoverStepReview.tsx',
  'operator/handover/OperatorHandoverTechnicalObservationsSection.tsx',
  'operator/handover/operatorHandoverPayload.ts',
  'operator/handover/operatorHandoverTechnicalObservations.ts',
  'operator/handover/operator-handover-i18n.ts',
]);

const P214_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/invoices/InvoicesPage.tsx',
  'rental/components/invoices/InvoiceList.tsx',
  'rental/components/invoices/InvoiceListTable.tsx',
  'rental/components/invoices/InvoiceListMobileCards.tsx',
  'rental/components/invoices/InvoiceListPagination.tsx',
  'rental/components/invoices/InvoiceFilters.tsx',
  'rental/components/invoices/InvoiceKpiGrid.tsx',
  'rental/components/invoices/InvoiceKpiCard.tsx',
  'rental/components/invoices/hooks/useInvoices.ts',
  'rental/components/invoices/invoiceListLabels.ts',
  'rental/components/invoices/invoiceConstants.ts',
  'rental/lib/invoice-list-i18n.ts',
]);

const P215_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/VendorManagementView.tsx',
  'rental/components/VendorDetailView.tsx',
  'rental/components/vendors/VendorOperationalTasks.tsx',
  'rental/components/vendors/VendorDirectoryCard.tsx',
  'rental/lib/vendor-directory.utils.ts',
  'rental/lib/vendor-directory-i18n.ts',
]);

const P216A_ENFORCE_CLEAN_EXACT = new Set([
  'rental/lib/service-task-semantics.ts',
  'lib/tasks/service-task-presentation-i18n.ts',
  'rental/components/vendors/VendorOperationalTasks.tsx',
  'rental/components/VehicleTasksView.tsx',
  'rental/components/EntityTasksSection.tsx',
  'rental/components/vehicle-detail/VehicleServiceContextPanel.tsx',
  'rental/components/fleet-health-service/fleet-health-service-case-list.ts',
  'rental/components/service-center/ServiceTaskCard.tsx',
  'rental/components/service-center/ServiceScheduleRow.tsx',
  'rental/components/service-center/ServiceSchedulePanel.tsx',
  'rental/components/service-center/ServiceTasksCalendar.tsx',
  'rental/components/service-center/ServiceHistoryTimelineRow.tsx',
  'rental/components/service-center/ServiceTasksBoard.tsx',
  'rental/components/service-center/ServiceTaskCreateModal.tsx',
  'rental/components/service-center/ServiceHistoryPanel.tsx',
  'rental/components/service-center/ServiceTasksPanel.tsx',
  'rental/components/service-center/ServiceCenterContextBar.tsx',
]);

const P216B1_ENFORCE_CLEAN_EXACT = new Set([
  'lib/tasks/taskTimeline.utils.ts',
  'lib/tasks/task-timeline-presentation-i18n.ts',
]);

const P216B2_ENFORCE_CLEAN_EXACT = new Set([
  'lib/tasks/taskDetailView.utils.ts',
  'lib/tasks/taskTimeline.utils.ts',
  'lib/tasks/task-timeline-presentation-i18n.ts',
  'rental/components/tasks/GlobalTaskDetailPanel.tsx',
  'rental/components/tasks/VehicleTaskDetailDrawer.tsx',
  'operator/tasks/OperatorTaskDetail.tsx',
]);

const P216C1_ENFORCE_CLEAN_EXACT = new Set([
  'lib/tasks/taskDetailView.utils.ts',
  'lib/tasks/taskDetailChecklist.utils.ts',
  'lib/tasks/components/TaskDetailBody.tsx',
  'lib/tasks/components/TaskDetailShell.tsx',
  'lib/tasks/components/TaskDetailNotesActivitySection.tsx',
  'lib/tasks/components/TaskDetailChecklistSection.tsx',
  'rental/lib/task-detail.utils.ts',
  'operator/components/OperatorTaskSheet.tsx',
]);

const P216C2A_ENFORCE_CLEAN_EXACT = new Set([
  'lib/tasks/taskDetailActions.utils.ts',
  'lib/tasks/taskDetailCompletion.utils.ts',
  'lib/tasks/taskCompleteForm.utils.ts',
  'lib/tasks/taskResolution.utils.ts',
  'lib/tasks/hooks/useTaskDetailActions.ts',
  'lib/tasks/components/TaskDetailActionBar.tsx',
  'lib/tasks/components/TaskDetailActionsHost.tsx',
  'lib/tasks/components/TaskDetailCompleteDialog.tsx',
  'lib/tasks/components/TaskDetailCompletionSummary.tsx',
]);

const P216C2B_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/tasks/VehicleTaskDetailDrawer.tsx',
  'operator/tasks/OperatorTaskDetail.tsx',
]);

const P217_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/new-booking/VehiclePickerStep.tsx',
  'rental/lib/booking-vehicle-preflight.ts',
]);

const P218_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/settings/data-authorization/DataAuthorizationTab.tsx',
]);

const P219_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/InsurancesView.tsx',
  'rental/lib/insurances-i18n.ts',
]);

const P220_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/PartsAccessoriesView.tsx',
  'rental/lib/parts-accessories-i18n.ts',
]);

const P221_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/invoices/CreateInvoiceDialog.tsx',
  'rental/lib/create-invoice-i18n.ts',
]);

const P222_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/invoices/SendInvoiceDialog.tsx',
  'rental/lib/send-invoice-i18n.ts',
]);

const P223_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/invoices/InvoiceDocuments.tsx',
  'rental/lib/invoice-documents-i18n.ts',
  'rental/components/invoices/invoiceDocuments.mapper.ts',
]);

const P224_ENFORCE_CLEAN_EXACT = new Set([
  'operator/damages/OperatorDamageCaptureFlow.tsx',
  'operator/damages/OperatorDamagePhotoStep.tsx',
  'operator/damages/OperatorDamageDetailsStep.tsx',
  'operator/damages/OperatorDamageReviewStep.tsx',
  'operator/damages/operatorDamagePayload.ts',
  'operator/lib/operator-damage-capture-i18n.ts',
]);

const P225_ENFORCE_CLEAN_EXACT = new Set([
  'operator/verification/OperatorPickupCheckSheet.tsx',
  'operator/lib/operator-pickup-check-i18n.ts',
  'operator/verification/operatorPickupCheckPayload.ts',
]);

const P226_ENFORCE_CLEAN_EXACT = new Set([
  'operator/tire-measure/OperatorTireMeasureFlow.tsx',
  'operator/tire-measure/OperatorTireMeasureTreadGrid.tsx',
  'operator/tire-measure/operatorTireMeasure.utils.ts',
  'operator/tire-measure/operatorTireMeasurePayload.ts',
  'operator/tire-measure/useOperatorTireMeasureData.ts',
  'operator/lib/operator-tire-measure-i18n.ts',
]);

const P260_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/documents/VehicleDocumentUploadDrawer.tsx',
  'rental/components/documents/DocumentIntakeUploadZone.tsx',
  'rental/components/documents/DocumentExtractionFlowStatus.tsx',
  'rental/components/documents/DocumentUploadDuplicatePanel.tsx',
  'rental/components/documents/DocumentIntakeProcessingSteps.tsx',
  'rental/components/documents/DocumentClassificationResultPanel.tsx',
  'rental/components/documents/DocumentExtractionReviewPanel.tsx',
  'rental/components/documents/DocumentApplyResultPanel.tsx',
  'rental/components/documents/DocumentFollowUpSuggestionsPanel.tsx',
  'rental/components/documents/DocumentEntityReview.tsx',
  'rental/components/documents/DocumentSchemaFieldReview.tsx',
  'rental/components/documents/DocumentActionPlanReview.tsx',
  'rental/lib/document-intake-i18n.ts',
  'rental/hooks/useDocumentIntakeFlow.ts',
  'rental/hooks/useDocumentUploadPage.ts',
  'rental/components/documents/document-extraction.shared.ts',
]);

const P261_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/DamagesView.tsx',
  'rental/components/damages/DamageControlSummary.tsx',
  'rental/components/damages/DamageInsightsSection.tsx',
  'rental/components/damages/DamageEvidenceCanvas.tsx',
  'rental/components/damages/DamageWorkQueue.tsx',
  'rental/components/damages/DamageDetailDrawer.tsx',
  'rental/components/damages/CreateDamageDialog.tsx',
  'rental/components/damages/MarkRepairedDialog.tsx',
  'rental/components/damages/CreateRepairTaskDialog.tsx',
  'rental/components/damages/DamageAiIntakeDialog.tsx',
  'rental/components/damages/AddDamagePhotoPanel.tsx',
  'rental/components/damages/DamageRentalSections.tsx',
  'rental/components/damages/DamageMapBlueprint.tsx',
  'rental/components/damages/DamageHeatmapOverlay.tsx',
  'rental/components/damages/damage-summary-display.ts',
  'rental/components/damages/damage-control.utils.ts',
  'rental/lib/rental-vehicle-damages-i18n.ts',
  'rental/hooks/useVehicleDamages.ts',
  'rental/hooks/useVehicleDamageActions.ts',
  'rental/lib/damage-insights.ts',
  'rental/lib/damage-rental-impact.ts',
  'rental/lib/damage-pickup-context.ts',
  'rental/hooks/useDamageAiIntake.ts',
]);

const P262_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/users-roles/UsersRolesTab.tsx',
  'rental/components/users-roles/TeamTab.tsx',
  'rental/components/users-roles/TeamMemberDrawer.tsx',
  'rental/components/users-roles/CreateUserWizard.tsx',
  'rental/components/users-roles/PermissionEditor.tsx',
  'rental/components/users-roles/IamBadges.tsx',
  'rental/components/users-roles/iam-team.utils.ts',
  'rental/components/users-roles/iam-member-payload.ts',
  'rental/components/users-roles/useIamTeam.ts',
  'rental/components/UsersRolesTab.tsx',
  'rental/lib/rental-organization-users-roles-i18n.ts',
]);

const P263_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/users-roles/RolesAccessTab.tsx',
  'rental/components/users-roles/SecurityAuditTab.tsx',
]);

const P264_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/MisuseCasesPanel.tsx',
  'rental/components/RentalStressAnalysisCard.tsx',
  'rental/lib/misuse-case-lifecycle.ui.ts',
  'rental/lib/rental-misuse-stress-i18n.ts',
]);

const P265_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/HelpCenterView.tsx',
]);

const P266_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/OrganizationSwitcher.tsx',
  'rental/components/AIAssistantView.tsx',
  'rental/components/HomeAwayBadge.tsx',
  'rental/components/shared/rental-requirements-ui.tsx',
  'rental/App.tsx',
]);

const P22_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/fleet/',
  'rental/components/fleet-operator/',
  'rental/components/fleet-connectivity/',
  'rental/components/fleet-health-service/',
  'rental/components/vehicle-detail/',
  'rental/components/health/',
  'rental/components/battery/',
  'rental/components/trips/',
  'rental/components/service-center/',
  'rental/components/vehicle-bookings/',
  'rental/components/rental-health/',
  'rental/lib/vehicle-',
  'rental/lib/fleet',
  'rental/lib/health-',
  'rental/lib/tire-',
  'rental/lib/brake-',
  'rental/lib/battery-',
  'rental/lib/service-',
  'rental/lib/rental-health-',
  'rental/lib/vehicle-operational-state/',
  'rental/lib/vehicle-operational-query/',
  'rental/lib/battery-health-query/',
  'rental/lib/rental-health-query/',
  'lib/formatVehicleDisplay.ts',
];

const LEGACY_CATEGORY_PATTERNS = [
  { category: 'ARIA', re: /aria-label\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'ARIA', re: /aria-label\s*=\s*\{?\s*dt\(/g, skip: true },
  { category: 'ARIA', re: /aria-label\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'ARIA', re: /aria-description\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'PLACEHOLDER', re: /placeholder\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'PLACEHOLDER', re: /placeholder\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'TITLE', re: /title\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'TITLE', re: /title\s*=\s*\{?\s*dt\(/g, skip: true },
  { category: 'TITLE', re: /title\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'TEXT', re: />\s*([A-Za-zÄÖÜäöüß][^<>{}\n]{2,}?)\s*</g },
  { category: 'LABEL', re: /<label[^>]*>\s*([A-Za-zÄÖÜäöüß][^<]{2,})\s*<\/label>/g },
  { category: 'FORMAT_LOCALE', re: /['"](de-DE|en-US|en-GB)['"]/g },
];

const ENHANCED_CATEGORY_PATTERNS = [
  { category: 'ARIA', re: /aria-label\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'ARIA', re: /aria-label\s*=\s*\{?\s*dt\(/g, skip: true },
  { category: 'ARIA', re: /aria-label\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'ARIA', re: /aria-description\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'PLACEHOLDER', re: /placeholder\s*=\s*['"]([^'"]+)['"]/g },
  { category: 'ALT', re: /alt\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'ALT', re: /alt\s*=\s*\{?\s*dt\(/g, skip: true },
  { category: 'ALT', re: /alt\s*=\s*['"]([^'"]+)['"]/g },
  { category: 'TITLE', re: /title\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'TITLE', re: /title\s*=\s*\{?\s*dt\(/g, skip: true },
  { category: 'TITLE', re: /title\s*=\s*['"]([^'"]+)['"]/g },
  { category: 'TEXT', re: />\s*([A-Za-zÄÖÜäöüß][^<>{}\n]{2,}?)\s*</g },
  { category: 'LABEL', re: /<label[^>]*>\s*([A-Za-zÄÖÜäöüß][^<]{2,})\s*<\/label>/g },
  { category: 'FORMAT_LOCALE', re: /['"](de-DE|en-US|en-GB)['"]/g },
];

function isLikelyUserCopy(sample) {
  if (!sample || sample.length < 3) return false;
  if (/useState|=>|\)\s*:|function|const |let |var |===|!==|\?\s*\(|setOpen\(|\)\s*:/.test(sample)) {
    return false;
  }
  if (/\$\{|\.[a-zA-Z]+\(|^\?\s|^\?\?|\?\s*`|\?\s*de\s*\?|&&/.test(sample)) {
    return false;
  }
  if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+$/.test(sample)) {
    return false;
  }
  if (/\?\?/.test(sample)) {
    return false;
  }
  if (/^[a-zA-Z_$][\w$]*\([^)]*\)?$/.test(sample)) {
    return false;
  }
  if (/^(void|never)\s*\|/.test(sample)) {
    return false;
  }
  if (/\bas\s+Record\b/.test(sample)) {
    return false;
  }
  if (!/[A-Za-zÄÖÜäöüß]{3,}/.test(sample)) return false;
  if (IGNORE_TEXT_RE.test(sample)) return false;
  if (IGNORE_LITERAL_RE.test(sample)) return false;
  return true;
}

const IGNORE_TEXT_RE =
  /^(true|false|null|undefined|\d+|#[0-9a-f]{3,8}|var\(--|w-\d|h-\d|flex|grid|px-|py-|text-|bg-|border-|rounded|hidden|block|sm:|md:|lg:|[A-Z_]{3,}|\/[a-z]|&mdash;)$/i;
const IGNORE_LITERAL_RE = new RegExp(
  '^(GET|POST|PUT|PATCH|DELETE|Bearer|Content-Type|application/|synqdrive\\.|https?://|#[0-9a-f]{3,8}|[a-z]+-[a-z-]+)$',
  'i',
);

function classifySurface(filePath) {
  const rel = relative(srcRoot, filePath).replace(/\\/g, '/');
  if (rel.startsWith('pages/Login') || rel === 'pages/login-copy.ts') return 'LOGIN';
  if (rel.startsWith('pages/')) return 'SHELL';
  if (rel === 'App.tsx' || rel.startsWith('components/') || rel.startsWith('i18n/components/')) {
    return 'SHELL';
  }
  if (rel.startsWith('rental/')) return 'RENTAL';
  if (rel.startsWith('master/')) return 'MASTER';
  if (rel.startsWith('operator/')) return 'OPERATOR';
  if (rel.startsWith('shared/') || rel.startsWith('lib/')) return 'SHARED';
  return 'OTHER';
}

function classifyRentalModule(relPath) {
  if (relPath === 'rental/App.tsx') return 'App / routing shell';
  if (relPath.includes('rental/components/TopBar')) return 'TopBar';
  if (relPath.includes('rental/components/Sidebar')) return 'Sidebar / navigation';
  if (
    relPath.includes('rental/components/DashboardView') ||
    relPath.startsWith('rental/components/dashboard/')
  ) {
    return 'Dashboard';
  }
  if (
    relPath.includes('HealthErrorsView') ||
    relPath.startsWith('rental/components/health/') ||
    relPath.startsWith('rental/components/battery/') ||
    relPath.includes('DashboardWarningLights') ||
    relPath.includes('rental-health')
  ) {
    return 'Vehicle Health';
  }
  if (
    relPath.startsWith('rental/components/trips/') ||
    relPath.includes('VehicleTripsFilterBar')
  ) {
    return 'Vehicle Trips';
  }
  if (
    relPath.startsWith('rental/components/service-center/') ||
    relPath.includes('service-info-display') ||
    relPath.includes('service-history') ||
    relPath.includes('service-schedule') ||
    relPath.includes('service-task-')
  ) {
    return 'Vehicle Maintenance';
  }
  if (
    relPath.startsWith('rental/components/vehicle-detail/') ||
    relPath.includes('VehicleOverview') ||
    relPath.includes('OverviewLiveMap') ||
    relPath.includes('VehicleDeviceConnection') ||
    relPath.includes('VehicleDrivingAssessment') ||
    relPath.includes('VehicleServiceContext') ||
    relPath.includes('VehicleRentalRequirements')
  ) {
    if (
      relPath.includes('VehicleTripsFilterBar') ||
      relPath.includes('VehicleBookings') ||
      relPath.includes('VehicleTasks')
    ) {
      return relPath.includes('VehicleTrips') ? 'Vehicle Trips' : 'Vehicle Detail';
    }
    return relPath.includes('VehicleOverview') ||
      relPath.includes('OverviewLiveMap') ||
      relPath.includes('VehicleDeviceConnection') ||
      relPath.includes('VehicleDrivingAssessment') ||
      relPath.includes('VehicleServiceContext') ||
      relPath.includes('VehicleRentalRequirements') ||
      relPath.includes('VehicleHealthBox')
      ? 'Vehicle Overview'
      : 'Vehicle Detail';
  }
  if (
    relPath.includes('FleetHubView') ||
    relPath.includes('FleetView') ||
    relPath.includes('FleetCondition') ||
    relPath.includes('FleetMapControls') ||
    relPath.includes('LiveMapOverview') ||
    relPath.includes('StatInlineDetail') ||
    relPath.startsWith('rental/components/fleet/') ||
    relPath.startsWith('rental/components/fleet-operator/') ||
    relPath.startsWith('rental/components/fleet-connectivity/') ||
    relPath.startsWith('rental/components/fleet-health-service/') ||
    relPath.includes('fleetVehicleDisplay') ||
    relPath.includes('fleetVisualState') ||
    relPath.includes('fleet-operator-panel') ||
    relPath.includes('fleet-command') ||
    relPath.includes('formatVehicleDisplay')
  ) {
    return 'Fleet Shell';
  }
  if (relPath.includes('booking') || relPath.includes('Booking')) return 'Bookings';
  if (relPath.includes('customer')) return 'Customers';
  if (relPath === 'rental/components/SettingsView.tsx') return 'Settings';
  if (
    relPath.includes('workflow-automation') ||
    relPath === 'rental/components/WorkflowAutomationView.tsx'
  ) {
    return 'Workflow Automation';
  }
  if (relPath.includes('voice-assistant')) return 'Voice Assistant';
  if (relPath.includes('whatsapp')) return 'WhatsApp';
  if (
    (relPath.includes('task') || relPath.includes('Task')) &&
    !relPath.includes('fleet-health-service') &&
    !relPath.includes('service-center')
  ) {
    return 'Tasks';
  }
  if (relPath.includes('notification') && !relPath.includes('dashboard/notifications')) {
    return 'Notifications';
  }
  if (relPath.includes('document') && !relPath.includes('VehicleDocument')) return 'Documents';
  if (relPath.includes('invoice') || relPath.includes('finance') || relPath.includes('billing')) {
    return 'Finance/Billing';
  }
  if (relPath.includes('settings')) return 'Settings';
  if (relPath.includes('insurance') || relPath.includes('parts-accessories') || relPath.includes('integration')) {
    return 'Integrations';
  }
  if (relPath.includes('data-analyse') || relPath.includes('financial-insight') || relPath.includes('report')) {
    return 'Reports/Analytics';
  }
  if (relPath.includes('station')) return 'Stations';
  if (relPath.includes('support') || relPath.includes('help-center')) return 'Support';
  return 'other Rental areas';
}

function isP24EnforceCleanPath(relPath) {
  if (P24_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  return P24_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP25EnforceCleanPath(relPath) {
  if (P25_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  return P25_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP26EnforceCleanPath(relPath) {
  return P26_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP27AEnforceCleanPath(relPath) {
  return P27A_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP27BEnforceCleanPath(relPath) {
  return P27B_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP28EnforceCleanPath(relPath) {
  return P28_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP29EnforceCleanPath(relPath) {
  return P29_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP210EnforceCleanPath(relPath) {
  return P210_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP211EnforceCleanPath(relPath) {
  return P211_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP212EnforceCleanPath(relPath) {
  return P212_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP213EnforceCleanPath(relPath) {
  return P213_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP214EnforceCleanPath(relPath) {
  return P214_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP215EnforceCleanPath(relPath) {
  return P215_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP216AEnforceCleanPath(relPath) {
  return P216A_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP216B1EnforceCleanPath(relPath) {
  return P216B1_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP216B2EnforceCleanPath(relPath) {
  return P216B2_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP216C1EnforceCleanPath(relPath) {
  return P216C1_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP216C2AEnforceCleanPath(relPath) {
  return P216C2A_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP216C2BEnforceCleanPath(relPath) {
  return P216C2B_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP217EnforceCleanPath(relPath) {
  return P217_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP218EnforceCleanPath(relPath) {
  return P218_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP219EnforceCleanPath(relPath) {
  return P219_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP220EnforceCleanPath(relPath) {
  return P220_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP221EnforceCleanPath(relPath) {
  return P221_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP222EnforceCleanPath(relPath) {
  return P222_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP223EnforceCleanPath(relPath) {
  return P223_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP224EnforceCleanPath(relPath) {
  return P224_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP225EnforceCleanPath(relPath) {
  return P225_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP226EnforceCleanPath(relPath) {
  return P226_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP260EnforceCleanPath(relPath) {
  return P260_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP261EnforceCleanPath(relPath) {
  return P261_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP262EnforceCleanPath(relPath) {
  return P262_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP263EnforceCleanPath(relPath) {
  return P263_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP264EnforceCleanPath(relPath) {
  return P264_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP265EnforceCleanPath(relPath) {
  return P265_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP266EnforceCleanPath(relPath) {
  return P266_ENFORCE_CLEAN_EXACT.has(relPath);
}

function isP22EnforceCleanPath(relPath) {
  if (P22_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  return P22_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP23EnforceCleanPath(relPath) {
  if (P23_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  return P23_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isEnforcedCleanSurface(surface, relPath) {
  if (surface === 'LOGIN') return true;
  if (relPath === 'i18n/components/LanguageSelector.tsx') return true;
  if (relPath === 'pages/VerificationDonePage.tsx') return true;
  if (relPath === 'App.tsx') return true;
  if (P21_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  if (surface === 'RENTAL' && P21_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
    return true;
  }
  if (surface === 'RENTAL' && isP22EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP23EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP24EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP25EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP26EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP27AEnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP27BEnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP28EnforceCleanPath(relPath)) return true;
  if (isP29EnforceCleanPath(relPath)) return true;
  if (isP210EnforceCleanPath(relPath)) return true;
  if (isP211EnforceCleanPath(relPath)) return true;
  if (isP212EnforceCleanPath(relPath)) return true;
  if (isP213EnforceCleanPath(relPath)) return true;
  if (isP214EnforceCleanPath(relPath)) return true;
  if (isP215EnforceCleanPath(relPath)) return true;
  if (isP216AEnforceCleanPath(relPath)) return true;
  if (isP216B1EnforceCleanPath(relPath)) return true;
  if (isP216B2EnforceCleanPath(relPath)) return true;
  if (isP216C1EnforceCleanPath(relPath)) return true;
  if (isP216C2AEnforceCleanPath(relPath)) return true;
  if (isP216C2BEnforceCleanPath(relPath)) return true;
  if (isP217EnforceCleanPath(relPath)) return true;
  if (isP218EnforceCleanPath(relPath)) return true;
  if (isP219EnforceCleanPath(relPath)) return true;
  if (isP220EnforceCleanPath(relPath)) return true;
  if (isP221EnforceCleanPath(relPath)) return true;
  if (isP222EnforceCleanPath(relPath)) return true;
  if (isP223EnforceCleanPath(relPath)) return true;
  if (isP224EnforceCleanPath(relPath)) return true;
  if (isP225EnforceCleanPath(relPath)) return true;
  if (isP226EnforceCleanPath(relPath)) return true;
  if (isP260EnforceCleanPath(relPath)) return true;
  if (isP261EnforceCleanPath(relPath)) return true;
  if (isP262EnforceCleanPath(relPath)) return true;
  if (isP263EnforceCleanPath(relPath)) return true;
  if (isP264EnforceCleanPath(relPath)) return true;
  if (isP265EnforceCleanPath(relPath)) return true;
  if (isP266EnforceCleanPath(relPath)) return true;
  return false;
}

function migrationPhaseFor(relPath, surface) {
  if (!isEnforcedCleanSurface(surface, relPath)) {
    return surface === 'LOGIN' || surface === 'SHELL' ? 'P2.1' : surface === 'RENTAL' ? 'P2.2' : 'P2.3';
  }
  if (isP23EnforceCleanPath(relPath)) return 'P2.2.3';
  if (isP27BEnforceCleanPath(relPath)) return 'P2.2.7B';
  if (isP28EnforceCleanPath(relPath)) return 'P2.2.8';
  if (isP211EnforceCleanPath(relPath)) return 'P2.2.11';
  if (isP212EnforceCleanPath(relPath)) return 'P2.2.12';
  if (isP213EnforceCleanPath(relPath)) return 'P2.2.13';
  if (isP214EnforceCleanPath(relPath)) return 'P2.2.14';
  if (isP215EnforceCleanPath(relPath)) return 'P2.2.15';
  if (isP216AEnforceCleanPath(relPath)) return 'P2.2.16A';
  if (isP216B1EnforceCleanPath(relPath)) return 'P2.2.16B.1';
  if (isP216B2EnforceCleanPath(relPath)) return 'P2.2.16B.2';
  if (isP216C1EnforceCleanPath(relPath)) return 'P2.2.16C.1';
  if (isP216C2AEnforceCleanPath(relPath)) return 'P2.2.16C.2A';
  if (isP216C2BEnforceCleanPath(relPath)) return 'P2.2.16C.2B';
  if (isP217EnforceCleanPath(relPath)) return 'P2.2.17';
  if (isP218EnforceCleanPath(relPath)) return 'P2.2.18';
  if (isP219EnforceCleanPath(relPath)) return 'P2.2.19';
  if (isP220EnforceCleanPath(relPath)) return 'P2.2.20';
  if (isP221EnforceCleanPath(relPath)) return 'P2.2.21';
  if (isP222EnforceCleanPath(relPath)) return 'P2.2.22';
  if (isP223EnforceCleanPath(relPath)) return 'P2.2.23';
  if (isP224EnforceCleanPath(relPath)) return 'P2.2.24';
  if (isP225EnforceCleanPath(relPath)) return 'P2.2.25';
  if (isP226EnforceCleanPath(relPath)) return 'P2.2.26';
  if (isP260EnforceCleanPath(relPath)) return 'P2.2.60';
  if (isP261EnforceCleanPath(relPath)) return 'P2.2.61';
  if (isP262EnforceCleanPath(relPath)) return 'P2.2.62';
  if (isP263EnforceCleanPath(relPath)) return 'P2.2.63';
  if (isP264EnforceCleanPath(relPath)) return 'P2.2.64';
  if (isP265EnforceCleanPath(relPath)) return 'P2.2.65';
  if (isP266EnforceCleanPath(relPath)) return 'P2.2.66';
  if (isP210EnforceCleanPath(relPath)) return 'P2.2.10';
  if (isP29EnforceCleanPath(relPath)) return 'P2.2.9';
  if (isP27AEnforceCleanPath(relPath)) return 'P2.2.7A';
  if (isP26EnforceCleanPath(relPath)) return 'P2.2.6';
  if (isP25EnforceCleanPath(relPath)) return 'P2.2.5';
  if (isP24EnforceCleanPath(relPath)) return 'P2.2.4';
  if (
    relPath.startsWith('rental/components/dashboard/') ||
    P21_ENFORCE_CLEAN_EXACT.has(relPath)
  ) {
    return 'P2.2.1';
  }
  return 'P2.2.2';
}

function relPathUnderScanRoot(relPath) {
  const normalized = String(relPath ?? '').replace(/\\/g, '/');
  for (const root of SCAN_ROOTS) {
    const rootRel = relative(srcRoot, root).replace(/\\/g, '/');
    if (!rootRel) continue;
    if (normalized === rootRel) return true;
    if (rootRel.endsWith('.ts') || rootRel.endsWith('.tsx')) continue;
    if (normalized.startsWith(`${rootRel}/`)) return true;
  }
  return false;
}

/**
 * Reproduce scanner inclusion/exclusion semantics for a src-relative path.
 */
export function isScannerEligibleRelativePath(relPath) {
  const normalized = String(relPath ?? '').replace(/\\/g, '/');
  if (!normalized) return false;
  if (!/\.(ts|tsx)$/.test(normalized)) return false;
  if (SKIP_FILE_RE.test(normalized)) return false;
  if (SKIP_DIR_RE.test(`/${normalized}/`)) return false;
  return relPathUnderScanRoot(normalized);
}

function collectFiles(target, files = []) {
  if (/\.(tsx|ts)$/.test(target)) {
    if (!SKIP_FILE_RE.test(target)) files.push(target);
    return files;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = join(target, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR_RE.test(full)) collectFiles(full, files);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(entry.name)) continue;
    if (SKIP_FILE_RE.test(full)) continue;
    files.push(full);
  }
  return files;
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function collectFindings(filePath, source, options = {}) {
  const relPath = relative(srcRoot, filePath).replace(/\\/g, '/');
  const surface = classifySurface(filePath);
  const module = surface === 'RENTAL' ? classifyRentalModule(relPath) : null;
  const findings = [];
  const patterns = options.includeEnhanced ? ENHANCED_CATEGORY_PATTERNS : LEGACY_CATEGORY_PATTERNS;

  for (const pattern of patterns) {
    const { category, re, skip } = pattern;
    if (skip) continue;
    if ((category === 'TEXT' || category === 'LABEL') && !filePath.endsWith('.tsx')) continue;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      const sample = normalizeText(match[1] ?? match[0]);
      const context = source.slice(match.index, match.index + 160);
      if (/\b(aria-label|placeholder|title)\s*=\s*\{[^}]*\b(t|dt)\(/.test(context)) continue;
      if (/\b(aria-label|placeholder|title)\s*=\s*\{[a-zA-Z_$][\w$.]*\([^}]*\}/.test(context)) continue;
      if (!isLikelyUserCopy(sample) && category !== 'FORMAT_LOCALE') continue;

      const line = source.slice(0, match.index).split('\n').length;
      const severity =
        category === 'FORMAT_LOCALE'
          ? isEnforcedCleanSurface(surface, relPath)
            ? 'enforce-clean'
            : 'debt'
          : isEnforcedCleanSurface(surface, relPath)
            ? 'enforce-clean'
            : 'debt';
      findings.push(
        enrichFinding(
          {
            file: relPath,
            line,
            surface,
            module,
            category,
            sample: sample.slice(0, 120),
            severity,
            migrationPhase: migrationPhaseFor(relPath, surface),
            structuralContext: extractStructuralContext(source, match.index),
          },
          source,
        ),
      );
    }
  }

  return findings;
}

function collectEnhancedFindings(filePath, source) {
  const relPath = relative(srcRoot, filePath).replace(/\\/g, '/');
  const indirectFindings = collectIndirectPresentationFindings(relPath, source, {
    isLikelyUserCopy,
    classifySurface: (ctx) => classifySurface(join(srcRoot, ctx.relPath)),
    classifyRentalModule,
    isEnforcedCleanSurface,
    migrationPhaseFor,
  });
  return indirectFindings.map((finding) => enrichFinding(finding, source));
}

function collectAllFindings(filePath, source, options = {}) {
  const regexFindings = collectFindings(filePath, source, options);
  if (!options.includeEnhanced) return regexFindings;
  const enhancedFindings = collectEnhancedFindings(filePath, source);
  return [...regexFindings, ...enhancedFindings];
}

function enrichFinding(finding, source = '') {
  const structuralContext =
    finding.structuralContext ??
    (source && typeof finding.line === 'number'
      ? extractStructuralContext(
          source,
          source.split('\n').slice(0, Math.max(0, finding.line - 1)).join('\n').length,
        )
      : 'module');
  return {
    ...finding,
    structuralContext,
  };
}

function dedupeFindings(findings, options = {}) {
  const mode = options.mode ?? 'fingerprint';
  const map = new Map();
  for (const finding of findings) {
    const key =
      mode === 'legacy'
        ? `${finding.surface}|${finding.category}|${finding.sample}`
        : finding.fingerprint ?? `${finding.surface}|${finding.category}|${finding.sample}|${finding.file}`;
    const existing = map.get(key);
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + 1;
      existing.files = [...new Set([...(existing.files ?? [existing.file]), finding.file])];
      continue;
    }
    map.set(key, { ...finding, occurrences: 1, files: [finding.file] });
  }
  return [...map.values()].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.category.localeCompare(b.category) ||
      a.sample.localeCompare(b.sample),
  );
}

function summarize(findings) {
  const bySurface = {};
  const byCategory = {};
  const byRentalModule = {};
  for (const finding of findings) {
    bySurface[finding.surface] = (bySurface[finding.surface] ?? 0) + 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    if (finding.surface === 'RENTAL' && finding.module) {
      byRentalModule[finding.module] = (byRentalModule[finding.module] ?? 0) + 1;
    }
  }
  return {
    total: findings.length,
    bySurface,
    byCategory,
    byRentalModule,
    enforceCleanRemaining: findings.filter((f) => f.severity === 'enforce-clean').length,
  };
}

export function scanSource(relPath, source, options = {}) {
  const fakePath = join(srcRoot, relPath);
  const rawFindings = collectAllFindings(fakePath, source, options);
  if (options.includeEnhanced) {
    finalizeGovernanceFindings(rawFindings);
  }
  return dedupeFindings(rawFindings, {
    mode: options.includeEnhanced ? 'fingerprint' : 'legacy',
  });
}

export function scanRepository(options = {}) {
  const roots = options.roots ?? SCAN_ROOTS;
  const includeEnhanced = options.includeEnhanced === true;
  const files = [...new Set(roots.flatMap((root) => collectFiles(root)))];
  const rawFindings = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return collectAllFindings(file, source, { includeEnhanced });
  });
  if (includeEnhanced) {
    finalizeGovernanceFindings(rawFindings);
  }
  const findings = dedupeFindings(rawFindings, {
    mode: includeEnhanced ? 'fingerprint' : 'legacy',
  });
  const summary = summarize(findings);
  return { files, findings, summary, includeEnhanced };
}

export {
  collectFindings,
  collectAllFindings,
  collectEnhancedFindings,
  dedupeFindings,
  summarize,
  isEnforcedCleanSurface,
  classifySurface,
  classifyRentalModule,
  isLikelyUserCopy,
  SCAN_ROOTS,
  srcRoot,
  frontendRoot,
};

const isCliMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const noWrite = process.argv.includes('--no-write');
if (!isCliMain) {
  // imported for tests/governance
} else {
const { findings, summary } = scanRepository({ includeEnhanced: false });

const inventory = {
  version: 3,
  generatedAt: new Date().toISOString().slice(0, 10),
  phases: {
    P21: {
      enforceCleanExact: [...P21_ENFORCE_CLEAN_EXACT],
      enforceCleanPrefixes: [...P21_ENFORCE_CLEAN_PREFIXES],
    },
    P22: {
      enforceCleanExact: [...P22_ENFORCE_CLEAN_EXACT],
      enforceCleanPrefixes: [...P22_ENFORCE_CLEAN_PREFIXES],
    },
    P23: {
      enforceCleanExact: [...P23_ENFORCE_CLEAN_EXACT],
      enforceCleanPrefixes: [...P23_ENFORCE_CLEAN_PREFIXES],
    },
    P24: {
      enforceCleanExact: [...P24_ENFORCE_CLEAN_EXACT],
      enforceCleanPrefixes: [...P24_ENFORCE_CLEAN_PREFIXES],
    },
  },
  summary,
  findings,
};

if (!noWrite) {
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
}
console.log('Hardcoded copy inventory');
console.log(`Total unique findings: ${summary.total}`);
console.log('By surface:', summary.bySurface);
console.log('By category:', summary.byCategory);
console.log('Rental by module:', summary.byRentalModule);
console.log(`Enforce-clean surface findings: ${summary.enforceCleanRemaining}`);
if (!noWrite) {
  console.log(`Wrote ${relative(frontendRoot, inventoryPath)}`);
} else {
  console.log('Read-only scan mode: inventory not written');
}
}
