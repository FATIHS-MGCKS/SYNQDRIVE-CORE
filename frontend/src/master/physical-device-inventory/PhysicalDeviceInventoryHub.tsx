import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Package, Plus, Radar, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { DataTable, EmptyState, MetricCard, SectionHeader } from '../../components/patterns';
import { MasterPageHeader } from '../shell';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import type { Organization } from '../data/platform-data';
import {
  isPhysicalDeviceInventoryStatus,
  isPhysicalDeviceModelCode,
  PHYSICAL_DEVICE_INVENTORY_STATUSES,
  PHYSICAL_DEVICE_MODEL_CODES,
  type PhysicalDeviceListItemDto,
  type PhysicalDeviceModelCode,
  type PhysicalDeviceStockSummaryDto,
} from '../../lib/physical-device-inventory.types';
import { PhysicalDeviceDetailDialog } from './PhysicalDeviceDetailDialog';
import { PhysicalDeviceIdentityMonitoringPanel } from './PhysicalDeviceIdentityMonitoringPanel';
import { MasterPageTabs } from '../shell/MasterPageTabs';

type PdiHubTab = 'stock' | 'monitoring';

interface PhysicalDeviceInventoryHubProps {
  organizations: Organization[];
}

export function PhysicalDeviceInventoryHub({ organizations }: PhysicalDeviceInventoryHubProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PhysicalDeviceStockSummaryDto | null>(null);
  const [items, setItems] = useState<PhysicalDeviceListItemDto[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState('');
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [intakeModel, setIntakeModel] = useState<PhysicalDeviceModelCode>('RUPTELA_R1');
  const [intakeSerial, setIntakeSerial] = useState('');
  const [intakeImei, setIntakeImei] = useState('');
  const [intakeLocation, setIntakeLocation] = useState('');
  const [intakeOwnerOrgId, setIntakeOwnerOrgId] = useState<string>('platform');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [detailDeviceId, setDetailDeviceId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PdiHubTab>('stock');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const deepLinkId = params.get('pdiDeviceId') ?? params.get('physicalDeviceId');
    if (deepLinkId && /^[0-9a-f-]{36}$/i.test(deepLinkId.trim())) {
      setDetailDeviceId(deepLinkId.trim());
      setDetailOpen(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, listRes] = await Promise.all([
        api.admin.physicalDeviceInventory.summary(),
        api.admin.physicalDeviceInventory.listDevices({
          search: search.trim() || undefined,
          status:
            statusFilter !== 'all' && isPhysicalDeviceInventoryStatus(statusFilter)
              ? statusFilter
              : undefined,
          modelCode:
            modelFilter !== 'all' && isPhysicalDeviceModelCode(modelFilter)
              ? modelFilter
              : undefined,
          warehouseLocation: locationFilter.trim() || undefined,
        }),
      ]);
      setSummary(summaryRes);
      setItems(listRes.items);
    } catch {
      toast.error(t('master.physicalDeviceInventory.intakeError'));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, modelFilter, locationFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of organizations) {
      map.set(org.id, org.company_name);
    }
    return map;
  }, [organizations]);

  const handleIntake = async () => {
    if (!intakeLocation.trim()) return;
    setIntakeSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.manualIntake({
        modelCode: intakeModel,
        serialNumber: intakeSerial.trim() || undefined,
        imei: intakeImei.trim() || undefined,
        warehouseLocation: intakeLocation.trim(),
        ownerOrganizationId: intakeOwnerOrgId === 'platform' ? null : intakeOwnerOrgId,
        intakeNotes: intakeNotes.trim() || undefined,
      });
      toast.success(t('master.physicalDeviceInventory.intakeSuccess'));
      setIntakeOpen(false);
      setIntakeSerial('');
      setIntakeImei('');
      setIntakeNotes('');
      await load();
    } catch {
      toast.error(t('master.physicalDeviceInventory.intakeError'));
    } finally {
      setIntakeSubmitting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'internalInventoryNumber',
        header: t('master.physicalDeviceInventory.col.inventoryNumber'),
        cell: (row: PhysicalDeviceListItemDto) => row.internalInventoryNumber,
      },
      {
        key: 'modelCode',
        header: t('master.physicalDeviceInventory.col.model'),
        cell: (row: PhysicalDeviceListItemDto) =>
          t(`master.physicalDeviceInventory.model.${row.modelCode}`),
      },
      {
        key: 'serialNumberMasked',
        header: t('master.physicalDeviceInventory.col.serial'),
        cell: (row: PhysicalDeviceListItemDto) => row.serialNumberMasked ?? '—',
      },
      {
        key: 'imeiMasked',
        header: t('master.physicalDeviceInventory.col.imei'),
        cell: (row: PhysicalDeviceListItemDto) => row.imeiMasked ?? '—',
      },
      {
        key: 'warehouseLocation',
        header: t('master.physicalDeviceInventory.col.location'),
        cell: (row: PhysicalDeviceListItemDto) => row.warehouseLocation,
      },
      {
        key: 'status',
        header: t('master.physicalDeviceInventory.col.status'),
        cell: (row: PhysicalDeviceListItemDto) =>
          t(`master.physicalDeviceInventory.status.${row.status}`),
      },
      {
        key: 'identityStatus',
        header: t('master.physicalDeviceInventory.col.identity'),
        cell: (row: PhysicalDeviceListItemDto) =>
          t(`master.physicalDeviceInventory.identity.${row.identityStatus}`),
      },
      {
        key: 'ownerOrganizationId',
        header: t('master.physicalDeviceInventory.ownerOrg'),
        cell: (row: PhysicalDeviceListItemDto) =>
          row.ownerOrganizationId
            ? orgNameById.get(row.ownerOrganizationId) ?? row.ownerOrganizationId
            : t('master.physicalDeviceInventory.ownerPlatform'),
      },
    ],
    [t, orgNameById],
  );

  const stockContent = (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t('master.physicalDeviceInventory.stockTotal')}
          value={summary?.total ?? (loading ? '…' : 0)}
        />
        <MetricCard
          label={t('master.physicalDeviceInventory.available')}
          value={summary?.byStatus?.AVAILABLE ?? (loading ? '…' : 0)}
        />
      </div>

      <SectionHeader title={t('master.physicalDeviceInventory.title')} />
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          className="max-w-xs"
          placeholder={t('master.physicalDeviceInventory.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('master.physicalDeviceInventory.filter.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('master.physicalDeviceInventory.filter.all')}</SelectItem>
            {PHYSICAL_DEVICE_INVENTORY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`master.physicalDeviceInventory.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modelFilter} onValueChange={setModelFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('master.physicalDeviceInventory.filter.model')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('master.physicalDeviceInventory.filter.all')}</SelectItem>
            {PHYSICAL_DEVICE_MODEL_CODES.map((m) => (
              <SelectItem key={m} value={m}>
                {t(`master.physicalDeviceInventory.model.${m}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="max-w-[200px]"
          placeholder={t('master.physicalDeviceInventory.filter.location')}
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={t('master.physicalDeviceInventory.empty')} />
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(row) => row.id}
          onRowClick={(row) => {
            setDetailDeviceId(row.id);
            setDetailOpen(true);
          }}
        />
      )}

      <PhysicalDeviceDetailDialog
        deviceId={detailDeviceId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={() => void load()}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <MasterPageHeader
        title={t('master.physicalDeviceInventory.title')}
        description={t('master.physicalDeviceInventory.description')}
        icon={<Package className="h-6 w-6" />}
        actions={
          activeTab === 'stock' ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('master.physicalDeviceInventory.refresh')}
              </Button>
              <Button size="sm" onClick={() => setIntakeOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('master.physicalDeviceInventory.intakeButton')}
              </Button>
            </div>
          ) : null
        }
      />

      <MasterPageTabs<PdiHubTab>
        ariaLabel={t('master.physicalDeviceInventory.tabs.aria')}
        activeId={activeTab}
        onChange={setActiveTab}
        tabs={[
          {
            id: 'stock',
            label: t('master.physicalDeviceInventory.tabs.stock'),
            icon: <Package className="h-4 w-4" />,
          },
          {
            id: 'monitoring',
            label: t('master.physicalDeviceInventory.tabs.monitoring'),
            icon: <Radar className="h-4 w-4" />,
          },
        ]}
      />

      {activeTab === 'stock' ? stockContent : <PhysicalDeviceIdentityMonitoringPanel />}

      <Dialog open={intakeOpen} onOpenChange={setIntakeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('master.physicalDeviceInventory.intakeTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t('master.physicalDeviceInventory.filter.model')}</Label>
              <Select
                value={intakeModel}
                onValueChange={(v) => {
                  if (isPhysicalDeviceModelCode(v)) setIntakeModel(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHYSICAL_DEVICE_MODEL_CODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`master.physicalDeviceInventory.model.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('master.physicalDeviceInventory.serialNumber')}</Label>
              <Input value={intakeSerial} onChange={(e) => setIntakeSerial(e.target.value)} />
            </div>
            <div>
              <Label>{t('master.physicalDeviceInventory.imei')}</Label>
              <Input value={intakeImei} onChange={(e) => setIntakeImei(e.target.value)} />
            </div>
            <div>
              <Label>{t('master.physicalDeviceInventory.warehouseLocation')}</Label>
              <Input value={intakeLocation} onChange={(e) => setIntakeLocation(e.target.value)} />
            </div>
            <div>
              <Label>{t('master.physicalDeviceInventory.ownerOrg')}</Label>
              <Select value={intakeOwnerOrgId} onValueChange={setIntakeOwnerOrgId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">
                    {t('master.physicalDeviceInventory.ownerPlatform')}
                  </SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('master.physicalDeviceInventory.intakeNotes')}</Label>
              <Input value={intakeNotes} onChange={(e) => setIntakeNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIntakeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleIntake()} disabled={intakeSubmitting || !intakeLocation.trim()}>
              {intakeSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('master.physicalDeviceInventory.intakeSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
