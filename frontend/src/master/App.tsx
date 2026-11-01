import { useState, useEffect, useCallback } from 'react';
import { useAppTheme } from '../context/AppThemeContext';
import { Sidebar, type MasterView } from './components/Sidebar';
import { MasterGlobalChrome } from './components/MasterGlobalChrome';
import { MasterDashboardView } from './components/MasterDashboardView';
import { OrganizationsView } from './components/OrganizationsView';
import { OrganizationDetailView } from './components/OrganizationDetailView';
import { ConnectedVehiclesHub } from './connected-vehicles/ConnectedVehiclesHub';
import { PhysicalDeviceInventoryHub } from './physical-device-inventory/PhysicalDeviceInventoryHub';
import { BillingControlCenter } from './components/billing/BillingControlCenter';
import { SupportView } from './components/SupportView';
import { PlatformIntegrationsHub } from './platform-integrations/PlatformIntegrationsHub';
import { migratePlatformIntegrationsParams } from './platform-integrations/platform-integrations-url';
import { ProspectsView } from './components/ProspectsView';
import { PartsAccessoriesAdminView } from './components/PartsAccessoriesAdminView';
import { InsurancesAdminView } from './components/InsurancesAdminView';
import { VoiceAssistantAdminView } from './components/VoiceAssistantAdminView';
import { ArchitekturView } from './components/ArchitekturView';
import { ChangesView } from './components/ChangesView';
import VehicleLogbookView from './components/VehicleLogbookView';
import BatteryV2ShadowInspectionView from './battery-v2-shadow-inspection/BatteryV2ShadowInspectionView';
import HvBatteryInspectionView from './battery-v2-hv-inspection/HvBatteryInspectionView';
import { VsiMasterIntelligenceView } from './intelligence/VsiMasterIntelligenceView';
import { ApdsMasterIntelligenceView } from './intelligence/ApdsMasterIntelligenceView';
import TireCalibrationCenterView from './tire-v3-calibration-center/TireCalibrationCenterView';
import { HighMobilityDataView } from './components/HighMobilityDataView';
import { PlatformOpsHub } from './platform-ops/PlatformOpsHub';
import { migratePlatformHealthParams, syncPlatformOpsUrl } from './platform-ops/platform-ops-url';
import { SecurityAccessHub } from './security-access/SecurityAccessHub';
import { migrateSecurityAccessParams, syncSecurityAccessUrl } from './security-access/security-access-url';
import {
  normalizeMasterNavLocation,
  pushMasterNavState,
  readInitialMasterNavLocation,
} from './navigation/master-nav-url';
import { isBillingOnlyMasterUser } from './navigation/master-nav-permissions';
import { applyMasterDrilldownUrl } from './navigation/master-drilldown';
import { pushMasterIntelligenceUrl, emptyIntelligenceContext } from './intelligence/master-intelligence-url';
import type { MasterNavLocationState } from './navigation/master-nav.types';
import { Toaster, toast } from 'sonner';
import type { Organization, PlatformUser } from './data/platform-data';
import { api } from '../lib/api';
import { MasterAdminShell, PageContainer } from './shell';
import { MasterMfaGate } from './components/MasterMfaGate';
import { MfaStepUpDialog } from '../components/mfa/MfaStepUpDialog';

function mapApiOrg(o: any): Organization {
  return {
    id: o.id,
    company_name: o.company_name ?? o.companyName ?? '',
    business_type: o.business_type ?? o.businessType ?? 'Other',
    city: o.city ?? '',
    country: o.country ?? '',
    fleet_size: o.fleet_size ?? o.vehicles?.length ?? 0,
    created_at: o.created_at ?? o.createdAt ?? '',
    status: (o.status ?? 'Active') as any,
    plan: (o.plan ?? 'Starter') as any,
    mrr: o.mrr ?? 0,
    users: o.users ?? 0,
    contactEmail: o.contactEmail ?? o.email ?? '',
    lastActive: o.lastActive ?? '',
    products: o.products ?? [],
    integrations: o.integrations ?? [],
    invoices: o.invoices ?? [],
  };
}

function mapApiUser(u: any): PlatformUser {
  return {
    id: u.id,
    name: u.name ?? '',
    email: u.email ?? '',
    role: (u.role ?? 'Worker') as any,
    organizationId: u.organizationId ?? u.organization_id ?? '',
    organizationName: u.organizationName ?? u.organization_name ?? '',
    status: (u.status ?? 'Active') as any,
    lastActive: u.lastActive ?? u.last_login ?? '',
    created_at: u.created_at ?? u.createdAt ?? '',
    avatar: u.avatar ?? (u.name ?? '').slice(0, 2).toUpperCase(),
    last_login: u.last_login ?? u.lastLogin ?? '',
  };
}

const BUSINESS_TYPE_LABEL_TO_ENUM: Record<string, string> = {
  'Car Rental': 'RENTAL', 'Fleet Management': 'FLEET', 'Car Sharing': 'RENTAL',
  'Taxi Service': 'TAXI', 'Logistics': 'LOGISTICS', 'Mobility Services': 'OTHER',
  Rental: 'RENTAL', Fleet: 'FLEET', Taxi: 'TAXI', Other: 'OTHER',
};
const STATUS_LABEL_TO_ENUM: Record<string, string> = {
  Active: 'ACTIVE', Trial: 'PENDING', Suspended: 'SUSPENDED', Churned: 'ARCHIVED',
};

const SIDEBAR_COLLAPSED_KEY = 'synqdrive-master-sidebar-collapsed';

const ARCH_CATEGORIES = new Set([
  'overview', 'signals', 'workers', 'health', 'trips', 'connectivity', 'frontend', 'modules', 'integrations',
]);

function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
}

function parseArchCategory(value: string | null | undefined): string | undefined {
  if (!value || !ARCH_CATEGORIES.has(value)) return undefined;
  return value;
}

function parseHmTab(value: string | null | undefined): 'vehicles' | 'eligibility' | 'streaming' | undefined {
  if (value === 'vehicles' || value === 'eligibility' || value === 'streaming') return value;
  return undefined;
}

export default function App() {
  const { isDarkMode } = useAppTheme();
  const initialNav = readInitialMasterNavLocation();
  const [currentView, setCurrentView] = useState<MasterView>(initialNav.view);
  const [settingsTab, setSettingsTab] = useState<string>(initialNav.settingsTab ?? 'general');
  const [archCategory, setArchCategory] = useState<string | undefined>(parseArchCategory(initialNav.archCategory));
  const [hmTab, setHmTab] = useState<'vehicles' | 'eligibility' | 'streaming' | undefined>(parseHmTab(initialNav.hmTab));
  const [billingFocusOrgId, setBillingFocusOrgId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed);

  // Centralized data state - empty by default, loaded from API
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpAction, setStepUpAction] = useState<string | undefined>();

  useEffect(() => {
    const onStepUp = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      setStepUpAction(detail?.action);
      setStepUpOpen(true);
      toast.message('2FA-Bestätigung erforderlich', {
        description: 'Bitte bestätigen Sie die Aktion mit Ihrem Authenticator-Code.',
      });
    };
    window.addEventListener('synqdrive:step-up-required', onStepUp);
    return () => window.removeEventListener('synqdrive:step-up-required', onStepUp);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [orgRes, usersRes] = await Promise.all([
          api.organizations.list().catch(() => ({ data: [], meta: { total: 0 } })),
          api.users.listAll().catch(() => []),
        ]);
        setOrganizations((orgRes.data || []).map(mapApiOrg));
        setUsers(Array.isArray(usersRes) ? usersRes.map(mapApiUser) : []);
      } catch (e) {
        console.error('Failed to load data:', e);
      }
    };
    load();
  }, []);


  const [detailOrgId, setDetailOrgId] = useState<string | null>(initialNav.orgId ?? null);

  const navigateMaster = useCallback(
    (view: MasterView, opts?: { settingsTab?: string; orgId?: string | null; replace?: boolean; keepOrg?: boolean }) => {
      if (view === 'vsi-intelligence' || view === 'apds-intelligence') {
        setCurrentView(view);
        pushMasterIntelligenceUrl(view, emptyIntelligenceContext(), { replace: opts?.replace });
        return;
      }
      const next: MasterNavLocationState = {
        view,
        settingsTab: opts?.settingsTab ?? (view === 'settings' ? settingsTab : undefined),
        orgId: opts?.orgId ?? (opts?.keepOrg ? detailOrgId ?? undefined : undefined),
        archCategory: view === 'architektur' ? archCategory : undefined,
        hmTab: view === 'high-mobility' ? hmTab : undefined,
      };
      if (!opts?.keepOrg && view !== 'organizations') {
        setDetailOrgId(null);
      }
      if (opts?.orgId !== undefined) {
        setDetailOrgId(opts.orgId);
      }
      setCurrentView(view);
      if (opts?.settingsTab) setSettingsTab(opts.settingsTab);
      pushMasterNavState(next, opts?.replace);
    },
    [archCategory, hmTab, detailOrgId, settingsTab],
  );

  useEffect(() => {
    let migrated = migratePlatformHealthParams(window.location.search);
    migrated = migrateSecurityAccessParams(migrated);
    migrated = migratePlatformIntegrationsParams(migrated);
    if (migrated !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${migrated}`);
    }
    const normalized = normalizeMasterNavLocation(
      migrated !== window.location.search ? migrated : window.location.search,
    );
    setCurrentView(normalized.view);
    if (normalized.settingsTab) setSettingsTab(normalized.settingsTab);
    setArchCategory(parseArchCategory(normalized.archCategory));
    setHmTab(parseHmTab(normalized.hmTab));
    pushMasterNavState(normalized, true);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const loc = normalizeMasterNavLocation(window.location.search);
      setCurrentView(loc.view);
      if (loc.settingsTab) setSettingsTab(loc.settingsTab);
      setArchCategory(parseArchCategory(loc.archCategory));
      setHmTab(parseHmTab(loc.hmTab));
      setDetailOrgId(loc.orgId ?? null);
      if (loc.view !== 'organizations' || !loc.orgId) {
        if (loc.view !== 'organizations') setDetailOrgId(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const orgId = new URLSearchParams(window.location.search).get('orgId');
    if (currentView === 'organizations') {
      setDetailOrgId(orgId);
    }
  }, [currentView]);

  const handleToggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const handleMasterNavigate = useCallback(
    (view: MasterView, opts?: { settingsTab?: string; replace?: boolean }) => {
      navigateMaster(view, { settingsTab: opts?.settingsTab, replace: opts?.replace, keepOrg: false });
    },
    [navigateMaster],
  );

  useEffect(() => {
    if (currentView === 'settings' && settingsTab === 'monitoring') {
      handleMasterNavigate('platform-ops', { replace: true });
      syncPlatformOpsUrl({ section: 'diagnostics', diagnosticsTab: 'alerts' }, { replace: true });
    }
  }, [currentView, settingsTab, handleMasterNavigate]);

  useEffect(() => {
    if (!isBillingOnlyMasterUser()) return;
    const allowed = new Set<MasterView>(['dashboard', 'billing']);
    if (!allowed.has(currentView)) {
      handleMasterNavigate('dashboard', { replace: true });
    }
  }, [currentView, handleMasterNavigate]);

  const reloadFromApi = async () => {
    try {
      const [orgRes, usersRes] = await Promise.all([
        api.organizations.list().catch(() => ({ data: [], meta: { total: 0 } })),
        api.users.listAll().catch(() => []),
      ]);
      setOrganizations((orgRes.data || []).map(mapApiOrg));
      setUsers(Array.isArray(usersRes) ? usersRes.map(mapApiUser) : []);
    } catch { /* keep current state */ }
  };

  // ============ ORGANIZATION CRUD ============
  const handleAddOrg = async (
    payload: {
      companyName: string;
      shortCode?: string;
      businessType: string;
      city?: string;
      country?: string;
      email?: string;
      status?: string;
    },
    adminData?: { name: string; email: string; password: string } | null,
  ) => {
    try {
      const createdOrg = await api.organizations.create({
        companyName: payload.companyName,
        shortCode: payload.shortCode,
        businessType: payload.businessType,
        email: payload.email,
        city: payload.city,
        country: payload.country,
        status: payload.status ?? 'PENDING',
      });

      if (adminData && createdOrg?.id) {
        await api.organizations.createAdmin(createdOrg.id, adminData);
        toast.success(`Organisation „${payload.companyName}" und Admin erstellt`);
      } else {
        toast.success(`Organisation „${payload.companyName}" erstellt`);
      }
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Organisation konnte nicht erstellt werden');
      throw e;
    }
  };
  const handleUpdateOrg = async (orgId: string, data: Record<string, unknown>) => {
    try {
      await api.organizations.update(orgId, data);
      toast.success('Organisation aktualisiert');
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Organisation konnte nicht aktualisiert werden');
      throw e;
    }
  };
  const handleDeleteOrg = async (id: string, reason: string) => {
    try {
      await api.organizations.delete(id, reason);
      toast.success('Organisation gelöscht');
      setDetailOrgId(null);
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Organisation konnte nicht gelöscht werden');
      throw e;
    }
  };

  // ============ USER CRUD ============
  const handleAddUser = async (user: PlatformUser) => {
    try {
      const orgId = user.organizationId;
      await api.users.create({
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: orgId || undefined,
      });
      toast.success(`User "${user.name}" created`);
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create user');
    }
  };
  const handleUpdateUser = async (user: PlatformUser) => {
    try {
      await api.users.update(user.id, {
        name: user.name,
        email: user.email,
        role: user.role,
      });
      toast.success(`User "${user.name}" updated`);
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update user');
    }
  };
  const handleDeleteUser = async (id: string) => {
    try {
      await api.users.delete(id);
      toast.success('User deleted');
      await reloadFromApi();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete user');
    }
  };


  const selectedOrgId = detailOrgId;

  return (
    <MasterAdminShell
      sidebar={(
      <Sidebar
        isDarkMode={isDarkMode}
        currentView={currentView}
        settingsTab={settingsTab}
        selectedOrgId={detailOrgId}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        onNavigate={handleMasterNavigate}
        onOpenOwnSecurity={() => {
          handleMasterNavigate('security-access');
          syncSecurityAccessUrl({ section: 'own-security', ownSecurityTab: 'mfa' });
        }}
      />
      )}
      overlays={(
        <>
          <Toaster position="top-right" richColors closeButton theme={isDarkMode ? 'dark' : 'light'} />
          <MfaStepUpDialog
            open={stepUpOpen}
            action={stepUpAction}
            onClose={() => setStepUpOpen(false)}
            onSuccess={() => toast.success('2FA bestätigt — Aktion erneut ausführen.')}
          />
        </>
      )}
    >
      <MasterMfaGate>
        <MasterGlobalChrome onOpenSettings={() => handleMasterNavigate('platform-integrations')} />

        {currentView === 'dashboard' && (
          <PageContainer variant="wide">
            <MasterDashboardView onViewChange={(view) => { handleMasterNavigate(view); }} />
          </PageContainer>
        )}

        {currentView === 'organizations' && !selectedOrgId && (
          <PageContainer variant="standard">
            <OrganizationsView
              onSelectOrg={(orgId) => {
                pushMasterNavState({ view: 'organizations', orgId });
              }}
              onAddOrg={handleAddOrg}
            />
          </PageContainer>
        )}
        {currentView === 'organizations' && selectedOrgId && (
          <PageContainer variant="standard">
            <OrganizationDetailView
              orgId={selectedOrgId}
              onBack={() => {
                pushMasterNavState({ view: 'organizations' });
              }}
              onUpdateOrg={handleUpdateOrg}
              onDeleteOrg={handleDeleteOrg}
              onOpenBillingCenter={(orgId) => {
                setBillingFocusOrgId(orgId);
                navigateMaster('billing');
                const nextSearch = `?view=billing&masterBilling=subscriptions&subscriptionId=${encodeURIComponent(orgId)}`;
                window.history.pushState(null, '', `${window.location.pathname}${nextSearch}`);
              }}
              onNavigateToVehicle={(vehicleId) => {
                pushMasterNavState({ view: 'vehicles' });
                window.history.replaceState(
                  null,
                  '',
                  `${window.location.pathname}?view=vehicles&cvSection=vehicles&vehicleId=${encodeURIComponent(vehicleId)}`,
                );
              }}
            />
          </PageContainer>
        )}

        {currentView === 'security-access' && (
          <PageContainer variant="wide">
            <SecurityAccessHub
              onOpenOrganization={(orgId) => {
                setDetailOrgId(orgId);
                pushMasterNavState({ view: 'organizations', orgId });
              }}
            />
          </PageContainer>
        )}

        {currentView === 'vehicles' && (
          <PageContainer variant="wide">
            <ConnectedVehiclesHub
              organizations={organizations}
              onOpenOrganization={(orgId) => {
                setDetailOrgId(orgId);
                pushMasterNavState({ view: 'organizations', orgId });
              }}
              onOpenPlatformHealth={() => handleMasterNavigate('platform-ops')}
            />
          </PageContainer>
        )}

        {currentView === 'device-inventory' && (
          <PageContainer variant="wide">
            <PhysicalDeviceInventoryHub organizations={organizations} />
          </PageContainer>
        )}

        {currentView === 'billing' && (
          <PageContainer variant="wide">
            <BillingControlCenter
              initialOrgId={billingFocusOrgId}
              onInitialOrgConsumed={() => setBillingFocusOrgId(null)}
              onOpenOrganization={(orgId) => {
                setDetailOrgId(orgId);
                pushMasterNavState({ view: 'organizations', orgId });
              }}
            />
          </PageContainer>
        )}

        {currentView === 'platform-ops' && (
          <PageContainer variant="wide">
            <PlatformOpsHub
              onNavigateView={(view, params) => {
                const resolved = applyMasterDrilldownUrl(view, params);
                handleMasterNavigate(resolved);
              }}
              onOpenOrganization={(orgId) => {
                setDetailOrgId(orgId);
                pushMasterNavState({ view: 'organizations', orgId });
              }}
            />
          </PageContainer>
        )}

        {currentView === 'support' && (
          <PageContainer variant="full">
            <SupportView
              organizations={organizations.map((o) => ({ id: o.id, name: o.company_name }))}
              onNavigateToOrg={(orgId) => {
                setDetailOrgId(orgId);
                pushMasterNavState({ view: 'organizations', orgId });
              }}
            />
          </PageContainer>
        )}

        {currentView === 'platform-integrations' && (
          <PageContainer variant="wide">
            <PlatformIntegrationsHub
              onNavigateView={(view, params) => {
                const resolved = applyMasterDrilldownUrl(view, params);
                handleMasterNavigate(resolved);
              }}
            />
          </PageContainer>
        )}

        {currentView === 'prospects' && (
          <PageContainer variant="standard">
            <ProspectsView />
          </PageContainer>
        )}

        {currentView === 'parts-accessories' && (
          <PageContainer variant="standard">
            <PartsAccessoriesAdminView />
          </PageContainer>
        )}

        {currentView === 'insurances' && (
          <PageContainer variant="standard">
            <InsurancesAdminView />
          </PageContainer>
        )}

        {currentView === 'voice-assistant' && (
          <PageContainer variant="wide">
            <VoiceAssistantAdminView />
          </PageContainer>
        )}

        {currentView === 'architektur' && (
          <PageContainer variant="standard">
            <ArchitekturView
              isDarkMode={isDarkMode}
              initialCategory={archCategory as 'overview' | 'signals' | 'workers' | 'health' | 'trips' | 'connectivity' | 'frontend' | 'modules' | 'integrations' | undefined}
            />
          </PageContainer>
        )}

        {currentView === 'changes' && (
          <PageContainer variant="standard">
            <ChangesView isDarkMode={isDarkMode} />
          </PageContainer>
        )}

        {currentView === 'vehicle-logbook' && (
          <PageContainer variant="standard">
            <VehicleLogbookView isDarkMode={isDarkMode} />
          </PageContainer>
        )}

        {currentView === 'battery-v2-shadow-inspection' && (
          <PageContainer variant="wide">
            <BatteryV2ShadowInspectionView
              isDarkMode={isDarkMode}
              organizations={organizations.map((o) => ({ id: o.id, companyName: o.company_name }))}
            />
          </PageContainer>
        )}

        {currentView === 'battery-v2-hv-inspection' && (
          <PageContainer variant="wide">
            <HvBatteryInspectionView
              organizations={organizations.map((o) => ({ id: o.id, companyName: o.company_name }))}
            />
          </PageContainer>
        )}

        {currentView === 'vsi-intelligence' && (
          <PageContainer variant="wide">
            <VsiMasterIntelligenceView />
          </PageContainer>
        )}

        {currentView === 'apds-intelligence' && (
          <PageContainer variant="wide">
            <ApdsMasterIntelligenceView />
          </PageContainer>
        )}

        {currentView === 'tire-v3-calibration-center' && (
          <PageContainer variant="wide">
            <TireCalibrationCenterView
              organizations={organizations.map((o) => ({ id: o.id, companyName: o.company_name }))}
            />
          </PageContainer>
        )}

        {currentView === 'high-mobility' && (
          <PageContainer variant="standard">
            <HighMobilityDataView initialTab={hmTab} />
          </PageContainer>
        )}
      </MasterMfaGate>
    </MasterAdminShell>
  );
}