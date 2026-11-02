import {
  LayoutDashboard,
  Building2,
  Target,
  Car,
  BookOpen,
  CreditCard,
  Plug,
  Radio,
  Package,
  Shield,
  ShieldCheck,
  Phone,
  HeartPulse,
  Headphones,
  Code2,
  FileText,
  Battery,
  BatteryCharging,
  Boxes,
  Activity,
  Gauge,
  CircleDot,
} from 'lucide-react';
import type { MasterNavGroupConfig, MasterNavItemConfig } from './master-nav.types';

export const MASTER_NAV_ITEMS: MasterNavItemConfig[] = [
  { id: 'dashboard', labelKey: 'master.nav.dashboard', icon: LayoutDashboard, permissions: ['MASTER_ADMIN'], mobilePrimary: true },
  { id: 'organizations', labelKey: 'master.nav.organizations', icon: Building2, permissions: ['MASTER_ADMIN'], mobilePrimary: true },
  { id: 'prospects', labelKey: 'master.nav.prospects', icon: Target, permissions: ['MASTER_ADMIN'] },
  { id: 'security-access', labelKey: 'master.nav.securityAccess', icon: ShieldCheck, permissions: ['MASTER_ADMIN'], badge: 'security-attention', mobilePrimary: true },
  { id: 'vehicles', labelKey: 'master.nav.vehicles', icon: Car, permissions: ['MASTER_ADMIN'], badge: 'connectivity-warning', mobilePrimary: true },
  { id: 'device-inventory', labelKey: 'master.nav.deviceInventory', icon: Boxes, permissions: ['MASTER_ADMIN'] },
  { id: 'vehicle-logbook', labelKey: 'master.nav.vehicleLogbook', icon: BookOpen, permissions: ['MASTER_ADMIN'] },
  { id: 'billing', labelKey: 'master.nav.billing', icon: CreditCard, permissions: ['MASTER_ADMIN', 'master-billing'], badge: 'billing-anomaly' },
  { id: 'platform-integrations', labelKey: 'master.nav.platformIntegrations', icon: Plug, permissions: ['MASTER_ADMIN'], badge: 'integration-attention', mobilePrimary: true },
  { id: 'vsi-intelligence', labelKey: 'master.nav.vsiIntelligence', icon: Activity, permissions: ['MASTER_ADMIN'] },
  { id: 'apds-intelligence', labelKey: 'master.nav.apdsIntelligence', icon: Gauge, permissions: ['MASTER_ADMIN'] },
  { id: 'high-mobility', labelKey: 'master.nav.highMobility', icon: Radio, permissions: ['MASTER_ADMIN'], badge: 'integration-outage' },
  { id: 'parts-accessories', labelKey: 'master.nav.partsAccessories', icon: Package, permissions: ['MASTER_ADMIN'] },
  { id: 'insurances', labelKey: 'master.nav.insurances', icon: Shield, permissions: ['MASTER_ADMIN'] },
  { id: 'voice-assistant', labelKey: 'master.nav.voiceAssistant', icon: Phone, permissions: ['MASTER_ADMIN'] },
  { id: 'platform-ops', labelKey: 'master.nav.platformOps', icon: HeartPulse, permissions: ['MASTER_ADMIN'], badge: 'platform-critical', mobilePrimary: true },
  { id: 'support', labelKey: 'master.nav.support', icon: Headphones, permissions: ['MASTER_ADMIN'], badge: 'support-count', mobilePrimary: true },
  { id: 'battery-v2-shadow-inspection', labelKey: 'master.nav.batteryV2ShadowInspection', icon: Battery, permissions: ['MASTER_ADMIN'] },
  { id: 'battery-v2-hv-inspection', labelKey: 'master.nav.batteryV2HvInspection', icon: BatteryCharging, permissions: ['MASTER_ADMIN'] },
  { id: 'tire-v3-calibration-center', labelKey: 'master.nav.tireV3CalibrationCenter', icon: CircleDot, permissions: ['MASTER_ADMIN'] },
  { id: 'architektur', labelKey: 'master.nav.architecture', icon: Code2, permissions: ['MASTER_ADMIN'] },
  { id: 'changes', labelKey: 'master.nav.changes', icon: FileText, permissions: ['MASTER_ADMIN'] },
];

export const MASTER_NAV_ITEM_BY_ID = Object.fromEntries(
  MASTER_NAV_ITEMS.map((item) => [item.id, item]),
) as Record<string, MasterNavItemConfig>;

export const MASTER_NAV_GROUPS: MasterNavGroupConfig[] = [
  { id: 'overview', labelKey: 'master.nav.group.overview', collapsible: false, defaultExpanded: true, items: ['dashboard'] },
  { id: 'tenants', labelKey: 'master.nav.group.tenants', collapsible: false, defaultExpanded: true, items: ['organizations', 'prospects', 'security-access'] },
  { id: 'fleet', labelKey: 'master.nav.group.fleet', collapsible: false, defaultExpanded: true, items: ['vehicles', 'device-inventory', 'vehicle-logbook'] },
  { id: 'commerce', labelKey: 'master.nav.group.commerce', collapsible: false, defaultExpanded: true, items: ['billing'] },
  { id: 'connectivity', labelKey: 'master.nav.group.connectivity', collapsible: true, defaultExpanded: true, items: ['platform-integrations', 'vsi-intelligence', 'apds-intelligence', 'high-mobility'] },
  { id: 'partners', labelKey: 'master.nav.group.partners', collapsible: true, defaultExpanded: true, items: ['parts-accessories', 'insurances', 'voice-assistant'] },
  { id: 'operations', labelKey: 'master.nav.group.operations', collapsible: true, defaultExpanded: true, items: ['platform-ops', 'support'] },
  { id: 'engineering', labelKey: 'master.nav.group.engineering', collapsible: true, defaultExpanded: false, items: ['battery-v2-shadow-inspection', 'battery-v2-hv-inspection', 'tire-v3-calibration-center', 'architektur', 'changes'] },
];

export const MASTER_MOBILE_PRIMARY_VIEWS = MASTER_NAV_ITEMS
  .filter((i) => i.mobilePrimary)
  .map((i) => i.id);

export function getGroupIdForView(view: string): string | null {
  for (const group of MASTER_NAV_GROUPS) {
    if (group.items.includes(view as never)) return group.id;
  }
  if (view === 'settings') return 'platform-integrations';
  return null;
}
