import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import type {
  PhysicalDeviceDetailDto,
  PhysicalDeviceListItemDto,
} from '../../lib/physical-device-inventory.types';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { PhysicalDeviceIntelligencePanel } from './PhysicalDeviceIntelligencePanel';

type VehicleOption = { id: string; label: string; registryLifecycle?: string };

interface PhysicalDeviceDetailDialogProps {
  deviceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function PhysicalDeviceDetailDialog({
  deviceId,
  open,
  onOpenChange,
  onUpdated,
}: PhysicalDeviceDetailDialogProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PhysicalDeviceDetailDto | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [reconcileVehicleId, setReconcileVehicleId] = useState('');
  const [installVehicleId, setInstallVehicleId] = useState('');
  const [installConfirm, setInstallConfirm] = useState(false);
  const [uninstallReason, setUninstallReason] = useState('');
  const [uninstallConfirm, setUninstallConfirm] = useState(false);
  const [uninstallReturn, setUninstallReturn] = useState(false);
  const [uninstallWarehouse, setUninstallWarehouse] = useState('');
  const [uninstallDefective, setUninstallDefective] = useState(false);
  const [defectDescription, setDefectDescription] = useState('');
  const [returnWarehouse, setReturnWarehouse] = useState('');
  const [returnConfirm, setReturnConfirm] = useState(false);
  const [lostEvidence, setLostEvidence] = useState('');
  const [retireReason, setRetireReason] = useState('');
  const [retireConfirm, setRetireConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const uninstallIdempotencyKey = useRef(crypto.randomUUID());
  const returnIdempotencyKey = useRef(crypto.randomUUID());
  const defectiveIdempotencyKey = useRef(crypto.randomUUID());
  const lostIdempotencyKey = useRef(crypto.randomUUID());
  const retireIdempotencyKey = useRef(crypto.randomUUID());

  const reviewerUserId = getStoredUser()?.id ?? '';

  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.registryLifecycle === 'ACTIVE'),
    [vehicles],
  );

  const loadDetail = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const [d, vehicleRes] = await Promise.all([
        api.admin.physicalDeviceInventory.getDevice(deviceId),
        api.vehicles.listAll({ limit: 300 }),
      ]);
      setDetail(d);
      const rows = (vehicleRes as { data?: unknown[] })?.data ?? vehicleRes;
      const list = Array.isArray(rows) ? rows : [];
      setVehicles(
        list.map((v) => {
          const row = v as Record<string, unknown>;
          return {
            id: String(row.id),
            label: `${row.licensePlate ?? row.vehicleName ?? row.id}`.trim(),
            registryLifecycle: row.registryLifecycle as string | undefined,
          };
        }),
      );
    } catch {
      toast.error(t('master.physicalDeviceInventory.intakeError'));
    } finally {
      setLoading(false);
    }
  }, [deviceId, t]);

  useEffect(() => {
    if (open && deviceId) {
      void loadDetail();
    }
  }, [open, deviceId, loadDetail]);

  const handleVerify = async () => {
    if (!deviceId || !reconcileVehicleId || !reviewerUserId) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.verifyIdentity(deviceId, {
        attestationKind: 'PROVIDER_DIMO_SERIAL_RECONCILIATION',
        providerReconciliationVehicleId: reconcileVehicleId,
        reviewerUserId,
      });
      toast.success(t('master.physicalDeviceInventory.verifySuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.verifyError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUninstall = async () => {
    if (!deviceId || !detail?.currentVehicleId || !detail.activeInstallAssignmentId) return;
    if (!uninstallConfirm || !uninstallReason.trim()) return;
    if (uninstallReturn && !uninstallWarehouse.trim()) return;
    if (uninstallDefective && !defectDescription.trim()) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.uninstallFromVehicle(deviceId, {
        vehicleId: detail.currentVehicleId,
        assignmentId: detail.activeInstallAssignmentId,
        physicalUninstallConfirmed: true,
        uninstallReason: uninstallReason.trim(),
        deviceConditionAfterUninstall: uninstallDefective ? 'DEFECTIVE' : 'FUNCTIONAL',
        physicalReturnConfirmed: uninstallReturn,
        warehouseLocation: uninstallReturn ? uninstallWarehouse.trim() : undefined,
        defectDescription: uninstallDefective ? defectDescription.trim() : undefined,
        idempotencyKey: uninstallIdempotencyKey.current,
      });
      toast.success(t('master.physicalDeviceInventory.uninstallSuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.uninstallError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnToStock = async () => {
    if (!deviceId || !returnWarehouse.trim() || !returnConfirm) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.returnToStock(deviceId, {
        warehouseLocation: returnWarehouse.trim(),
        physicalReturnConfirmed: true,
        idempotencyKey: returnIdempotencyKey.current,
      });
      toast.success(t('master.physicalDeviceInventory.returnSuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.returnError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDefective = async () => {
    if (!deviceId || !defectDescription.trim()) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.markDefective(deviceId, {
        defectDescription: defectDescription.trim(),
        physicalInspectionConfirmed: true,
        idempotencyKey: defectiveIdempotencyKey.current,
      });
      toast.success(t('master.physicalDeviceInventory.defectiveSuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.defectiveError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkLost = async () => {
    if (!deviceId || !lostEvidence.trim()) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.markLost(deviceId, {
        lossAttestationKind: 'MASTER_ADMIN_LOSS_CONFIRMATION',
        lossEvidenceNotes: lostEvidence.trim(),
        idempotencyKey: lostIdempotencyKey.current,
      });
      toast.success(t('master.physicalDeviceInventory.lostSuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.lostError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetire = async () => {
    if (!deviceId || !retireReason.trim() || !retireConfirm) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.retire(deviceId, {
        retireReason: retireReason.trim(),
        retirementConfirmation: true,
        idempotencyKey: retireIdempotencyKey.current,
      });
      toast.success(t('master.physicalDeviceInventory.retireSuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.retireError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleInstall = async () => {
    if (!deviceId || !installVehicleId || !installConfirm) return;
    setSubmitting(true);
    try {
      await api.admin.physicalDeviceInventory.installOnVehicle(deviceId, {
        vehicleId: installVehicleId,
        installConfirmation: true,
      });
      toast.success(t('master.physicalDeviceInventory.installSuccess'));
      await loadDetail();
      onUpdated();
    } catch {
      toast.error(t('master.physicalDeviceInventory.installError'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderSummary = (row: PhysicalDeviceListItemDto) => (
    <div className="grid gap-2 text-sm">
      <div>
        <span className="text-muted-foreground">{t('master.physicalDeviceInventory.col.serial')}: </span>
        {row.serialNumberMasked ?? '—'}
      </div>
      <div>
        <span className="text-muted-foreground">{t('master.physicalDeviceInventory.col.identity')}: </span>
        {t(`master.physicalDeviceInventory.identity.${row.identityStatus}`)}
      </div>
      <div>
        <span className="text-muted-foreground">{t('master.physicalDeviceInventory.currentVehicle')}: </span>
        {row.currentVehicleId ?? t('master.physicalDeviceInventory.noVehicle')}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('master.physicalDeviceInventory.detailTitle')}</DialogTitle>
        </DialogHeader>
        {loading || !detail ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {renderSummary(detail)}
            {detail.identityStatus === 'NEEDS_CLARIFICATION' && detail.modelCode === 'RUPTELA_R1' && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  {t('master.physicalDeviceInventory.verifyDescription')}
                </p>
                <Label>{t('master.physicalDeviceInventory.verifyReconcileVehicle')}</Label>
                <Select value={reconcileVehicleId} onValueChange={setReconcileVehicleId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={submitting || !reconcileVehicleId}
                  onClick={() => void handleVerify()}
                >
                  {t('master.physicalDeviceInventory.verifySubmit')}
                </Button>
              </div>
            )}
            {detail.status === 'INSTALLED' && detail.activeInstallAssignmentId && detail.currentVehicleId && (
              <div className="space-y-3 rounded-lg border border-amber-500/30 p-4">
                <p className="font-medium text-sm">{t('master.physicalDeviceInventory.uninstallTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('master.physicalDeviceInventory.uninstallVehicleHint', {
                    vehicleId: detail.currentVehicleId,
                    serial: detail.serialNumberMasked ?? '—',
                  })}
                </p>
                <Label>{t('master.physicalDeviceInventory.uninstallReason')}</Label>
                <Textarea value={uninstallReason} onChange={(e) => setUninstallReason(e.target.value)} rows={2} />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="uninstall-defective"
                    checked={uninstallDefective}
                    onCheckedChange={(v) => setUninstallDefective(v === true)}
                  />
                  <Label htmlFor="uninstall-defective" className="font-normal">
                    {t('master.physicalDeviceInventory.uninstallDefectiveLabel')}
                  </Label>
                </div>
                {uninstallDefective && (
                  <>
                    <Label>{t('master.physicalDeviceInventory.defectDescription')}</Label>
                    <Textarea value={defectDescription} onChange={(e) => setDefectDescription(e.target.value)} rows={2} />
                  </>
                )}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="uninstall-return"
                    checked={uninstallReturn}
                    onCheckedChange={(v) => setUninstallReturn(v === true)}
                  />
                  <Label htmlFor="uninstall-return" className="font-normal">
                    {t('master.physicalDeviceInventory.uninstallReturnLabel')}
                  </Label>
                </div>
                {uninstallReturn && (
                  <>
                    <Label>{t('master.physicalDeviceInventory.returnWarehouse')}</Label>
                    <Input value={uninstallWarehouse} onChange={(e) => setUninstallWarehouse(e.target.value)} />
                  </>
                )}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="uninstall-confirm"
                    checked={uninstallConfirm}
                    onCheckedChange={(v) => setUninstallConfirm(v === true)}
                  />
                  <Label htmlFor="uninstall-confirm" className="font-normal">
                    {t('master.physicalDeviceInventory.uninstallConfirmLabel')}
                  </Label>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={submitting || !uninstallConfirm || !uninstallReason.trim()}
                  onClick={() => void handleUninstall()}
                >
                  {t('master.physicalDeviceInventory.uninstallSubmit')}
                </Button>
              </div>
            )}
            {detail.status === 'PENDING_RETURN' && !detail.currentVehicleId && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-medium text-sm">{t('master.physicalDeviceInventory.returnTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('master.physicalDeviceInventory.pendingReturnHint')}
                </p>
                <Label>{t('master.physicalDeviceInventory.returnWarehouse')}</Label>
                <Input value={returnWarehouse} onChange={(e) => setReturnWarehouse(e.target.value)} />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="return-confirm"
                    checked={returnConfirm}
                    onCheckedChange={(v) => setReturnConfirm(v === true)}
                  />
                  <Label htmlFor="return-confirm" className="font-normal">
                    {t('master.physicalDeviceInventory.returnConfirmLabel')}
                  </Label>
                </div>
                <Button
                  size="sm"
                  disabled={submitting || !returnConfirm || !returnWarehouse.trim()}
                  onClick={() => void handleReturnToStock()}
                >
                  {t('master.physicalDeviceInventory.returnSubmit')}
                </Button>
              </div>
            )}
            {(detail.status === 'AVAILABLE' || detail.status === 'RESERVED') && !detail.currentVehicleId && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-medium text-sm">{t('master.physicalDeviceInventory.defectiveTitle')}</p>
                <Label>{t('master.physicalDeviceInventory.defectDescription')}</Label>
                <Textarea value={defectDescription} onChange={(e) => setDefectDescription(e.target.value)} rows={2} />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={submitting || !defectDescription.trim()}
                  onClick={() => void handleMarkDefective()}
                >
                  {t('master.physicalDeviceInventory.defectiveSubmit')}
                </Button>
              </div>
            )}
            {detail.status !== 'LOST' && detail.status !== 'RETIRED' && !detail.currentVehicleId && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-medium text-sm">{t('master.physicalDeviceInventory.lostTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('master.physicalDeviceInventory.lostHint')}</p>
                <Label>{t('master.physicalDeviceInventory.lostEvidence')}</Label>
                <Textarea value={lostEvidence} onChange={(e) => setLostEvidence(e.target.value)} rows={2} />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={submitting || !lostEvidence.trim()}
                  onClick={() => void handleMarkLost()}
                >
                  {t('master.physicalDeviceInventory.lostSubmit')}
                </Button>
              </div>
            )}
            {detail.status !== 'RETIRED' && detail.status !== 'INSTALLED' && !detail.currentVehicleId && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-medium text-sm">{t('master.physicalDeviceInventory.retireTitle')}</p>
                <Label>{t('master.physicalDeviceInventory.retireReason')}</Label>
                <Textarea value={retireReason} onChange={(e) => setRetireReason(e.target.value)} rows={2} />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="retire-confirm"
                    checked={retireConfirm}
                    onCheckedChange={(v) => setRetireConfirm(v === true)}
                  />
                  <Label htmlFor="retire-confirm" className="font-normal">
                    {t('master.physicalDeviceInventory.retireConfirmLabel')}
                  </Label>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={submitting || !retireConfirm || !retireReason.trim()}
                  onClick={() => void handleRetire()}
                >
                  {t('master.physicalDeviceInventory.retireSubmit')}
                </Button>
              </div>
            )}
            {detail.installEligible && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="font-medium text-sm">{t('master.physicalDeviceInventory.installTitle')}</p>
                <Label>{t('master.physicalDeviceInventory.installVehicle')}</Label>
                <Select value={installVehicleId} onValueChange={setInstallVehicleId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="install-confirm"
                    checked={installConfirm}
                    onCheckedChange={(v) => setInstallConfirm(v === true)}
                  />
                  <Label htmlFor="install-confirm" className="font-normal">
                    {t('master.physicalDeviceInventory.installConfirmLabel')}
                  </Label>
                </div>
                <Button
                  size="sm"
                  disabled={submitting || !installVehicleId || !installConfirm}
                  onClick={() => void handleInstall()}
                >
                  {t('master.physicalDeviceInventory.installSubmit')}
                </Button>
              </div>
            )}
            <PhysicalDeviceIntelligencePanel
              physicalDeviceId={detail.id}
              organizationId={detail.ownerOrganizationId ?? undefined}
            />
            <div>
              <p className="font-medium text-sm mb-2">{t('master.physicalDeviceInventory.historyTitle')}</p>
              <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {detail.auditHistory.map((e) => (
                  <li key={e.id}>
                    {e.eventKind} — {new Date(e.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
