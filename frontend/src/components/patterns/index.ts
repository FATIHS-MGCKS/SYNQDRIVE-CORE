/* ════════════════════════════════════════════════════════════════════
   SynqDrive pattern library — the shared, token-based, icon-agnostic
   building blocks for every page. Import from here instead of
   hand-rolling cards / chips / tables / headers per view.

     import { PageHeader, MetricCard, StatusChip, DataTable } from '@/components/patterns';
   ════════════════════════════════════════════════════════════════════ */

export { StatusChip, StatusDot, HealthStatusChip, PriorityBadge } from './status';
export type {
  StatusChipProps,
  StatusDotProps,
  HealthStatusChipProps,
  PriorityBadgeProps,
} from './status';

export {
  chipClassForTone,
  dotClassForTone,
  healthTone,
  normalizeHealthState,
  normalizePriority,
  toneForStatus,
  platformRoleTone,
  userAccountStatusTone,
  fleetVehicleStatusTone,
  vehicleHealthLabelTone,
  onlineSignalTone,
  hmVehicleStateTone,
  hmClearanceTone,
  tokenAuthStatusTone,
  workerMonitoringTone,
  monitoringSystemHealthTone,
  pollLogStatusTone,
  prospectStatusTone,
  prospectPriorityTone,
  activityActionTone,
  activityEntityTone,
  supportStatusTone,
  subscriptionStatusTone,
  paymentStatusTone,
  planTone,
  communicationHealthStateTone,
  COMMUNICATION_HEALTH_STATE_LABEL_DE,
} from './status-utils';
export type { StatusTone, HealthState, TaskPriority } from './status-utils';

export { PageHeader, SectionHeader } from './page-header';
export type { PageHeaderProps, PageHeaderVariant, SectionHeaderProps } from './page-header';

export { DataCard, MetricCard } from './data-card';
export type { DataCardProps, DataCardSurface, MetricCardProps, MetricTrend } from './data-card';

export { formatRelativeDe, formatDateTimeDe } from './format-utils';

export { EmptyState, ErrorState, SkeletonRows, SkeletonMetricGrid, SkeletonCard } from './states';
export type {
  EmptyStateProps,
  ErrorStateProps,
  SkeletonRowsProps,
  SkeletonGridProps,
  SkeletonCardProps,
} from './states';

export {
  surfaceClassName,
  resolveCardSurface,
  resolveDataCardSurface,
} from './surface';
export type {
  SolidSurface,
  CardSurface,
  DialogSurface,
  TabsListSurface,
  FooterSurface,
  EmptySurface,
} from './surface';

export {
  chromeTabBarClass,
  chromeTabTriggerClass,
  chromeSectionNavClass,
  chromeSectionNavItemClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
  CHROME_TAB_TRIGGER_BASE,
  CHROME_TAB_TRIGGER_ACTIVE,
  CHROME_TAB_TRIGGER_INACTIVE,
  CHROME_RADIX_TAB_TRIGGER_CLASS,
  INSET_SEGMENTED_BAR_CLASS,
} from './chrome-tab-bar';

export { DataTable } from './data-table';
export type { DataTableProps, DataTableColumn } from './data-table';

export { DetailDrawer } from './detail-drawer';
export type { DetailDrawerProps } from './detail-drawer';

export { AppDialog, FormDialog, ConfirmDialog } from './app-dialog';
export type {
  AppDialogProps,
  AppDialogStackLayer,
  FormDialogProps,
  ConfirmDialogProps,
} from './app-dialog';

export { Timeline } from './timeline';
export type { TimelineProps, TimelineItem } from './timeline';

export { VehicleMiniCard } from './vehicle-mini-card';
export type { VehicleMiniCardProps } from './vehicle-mini-card';

export { AppShell } from '../shell/app-shell';
export type { AppShellProps, AppShellVariant } from '../shell/app-shell';
export {
  navItemClass,
  subNavItemClass,
  navSectionHeaderClass,
  navSectionLabelClass,
} from '../shell/nav-utils';
export { CollapsedNavTooltip, NavComingSoonBadge } from '../shell/nav-primitives';
