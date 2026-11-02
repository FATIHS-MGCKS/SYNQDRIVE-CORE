import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText, Loader2, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  buildZb1RegistrationFormPatch,
  type Zb1RegistrationFormPatch,
} from '../connected-vehicles/zb1-registration-form-merge.util';
import {
  isVehicleIdentityP2Enabled,
  isVehicleIdentityP3Enabled,
  provenanceBadgeClass,
  provenanceLabelKey,
  type VehicleIdentityProvenanceUi,
} from '../connected-vehicles/vehicle-identity-p2.util';

type ReviewField = {
  fieldCode: string;
  labelKey: string;
  value: string | number | null;
  provenance: VehicleIdentityProvenanceUi;
  extractionStatus: string | null;
  conflict: boolean;
  baselineValue: string | number | null;
  documentValue: string | number | null;
};

type SuggestedManualDraft = {
  displacementCc: number | null;
  motorPowerKw: number | null;
  fuelType: string | null;
};

type ReviewSnapshot = {
  fields: ReviewField[];
  vinMismatchBlocked: boolean;
  p2PowerSemanticsWarning: string;
  documentExtractionId: string | null;
  suggestedManualDraft?: SuggestedManualDraft;
  capabilities: { p2Enabled: boolean; p3Enabled?: boolean; zb1UploadEnabled: boolean };
};

type Props = {
  isDarkMode: boolean;
  organizationId: string;
  vehicleId: string;
  /** When true, document upload is only via the toolbar dialog (avoids duplicate file inputs). */
  hideDocumentUpload?: boolean;
  registrationFormCurrent?: {
    engineDisplacementCc: string;
    fuelType: string;
    curbWeight: string;
  };
  onApplyToRegistrationForm?: (patch: Zb1RegistrationFormPatch) => void;
};

export function VehicleIdentityP2Panel({
  isDarkMode,
  organizationId,
  vehicleId,
  hideDocumentUpload = false,
  registrationFormCurrent,
  onApplyToRegistrationForm,
}: Props) {
  const { t } = useLanguage();
  const enabled = isVehicleIdentityP2Enabled();

  const [manualDisplacement, setManualDisplacement] = useState('');
  const [manualPowerKw, setManualPowerKw] = useState('');
  const [manualFuel, setManualFuel] = useState('');
  const [powerKind, setPowerKind] = useState<'COMBUSTION' | 'ELECTRIC_DRIVE' | 'COMBINED_SYSTEM' | ''>('');
  const [electrificationGrade, setElectrificationGrade] = useState('');
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vinAck, setVinAck] = useState(false);
  const [confirmedFields, setConfirmedFields] = useState<Record<string, boolean>>({});
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [validateMsg, setValidateMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [applyFormMsg, setApplyFormMsg] = useState<string | null>(null);

  const p3Enabled = useMemo(
    () => isVehicleIdentityP3Enabled() && snapshot?.capabilities.p3Enabled === true,
    [snapshot],
  );

  const manualBody = useMemo(
    () => ({
      displacementCc: manualDisplacement ? Number(manualDisplacement) : null,
      motorPowerKw: manualPowerKw ? Number(manualPowerKw) : null,
      fuelType: manualFuel || null,
      powerKind: powerKind || null,
      electrificationGrade: electrificationGrade || null,
    }),
    [manualDisplacement, manualPowerKw, manualFuel, powerKind, electrificationGrade],
  );

  const refreshSnapshot = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.vehicles.registrationIdentityReview.reconcile(organizationId, vehicleId, {
        documentExtractionId: extractionId ?? undefined,
        manual: manualBody,
        vinMismatchAcknowledged: vinAck,
      });
      const next = data as ReviewSnapshot;
      setSnapshot(next);
      const draft = next.suggestedManualDraft;
      if (draft) {
        if (draft.displacementCc != null) {
          setManualDisplacement((prev) => (prev === '' ? String(draft.displacementCc) : prev));
        }
        if (draft.motorPowerKw != null) {
          setManualPowerKw((prev) => (prev === '' ? String(draft.motorPowerKw) : prev));
        }
        if (draft.fuelType) {
          setManualFuel((prev) => (prev === '' ? draft.fuelType! : prev));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled, organizationId, vehicleId, extractionId, manualBody, vinAck]);

  useEffect(() => {
    if (enabled && organizationId && vehicleId) {
      void refreshSnapshot();
    }
  }, [enabled, organizationId, vehicleId, refreshSnapshot]);

  const onUpload = async (file: File) => {
    if (!snapshot?.capabilities.zb1UploadEnabled) {
      setError(t('master.vehicleIdentity.uploadDisabled'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const uploaded = await api.vehicleIntelligence.uploadDocumentExtraction(
        vehicleId,
        file,
        'REGISTRATION_CERTIFICATE',
        'master_vehicle_identity_p2',
      );
      const id = uploaded?.id;
      if (typeof id === 'string') {
        setExtractionId(id);
      }
      await refreshSnapshot();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const buildConfirmations = () =>
    Object.entries(confirmedFields)
      .filter(([, v]) => v)
      .map(([fieldCode]) => ({ fieldCode, confirmed: true }));

  const onAiPreview = async () => {
    if (!p3Enabled) return;
    setLoading(true);
    setError(null);
    try {
      await api.vehicles.registrationIdentityReview.aiV2Preview(organizationId, vehicleId, {
        documentExtractionId: extractionId ?? undefined,
        manual: manualBody,
        confirmations: buildConfirmations(),
        vinMismatchAcknowledged: vinAck,
        acceptP2AsSystemPower: false,
      });
      setValidateMsg(t('master.vehicleIdentity.aiPreviewReady'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onSaveIdentity = async () => {
    if (!p3Enabled) return;
    setLoading(true);
    setSaveMsg(null);
    setError(null);
    try {
      await api.vehicles.registrationIdentityReview.saveIdentity(organizationId, vehicleId, {
        documentExtractionId: extractionId ?? undefined,
        manual: manualBody,
        confirmations: buildConfirmations(),
        vinMismatchAcknowledged: vinAck,
        acceptP2AsSystemPower: false,
      });
      setSaveMsg(t('master.vehicleIdentity.saveSuccess'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onValidate = async () => {
    if (!snapshot) return;
    setLoading(true);
    setValidateMsg(null);
    try {
      const confirmations = buildConfirmations();
      await api.vehicles.registrationIdentityReview.validateConfirmations(
        organizationId,
        vehicleId,
        {
          documentExtractionId: extractionId ?? undefined,
          manual: manualBody,
          confirmations,
          vinMismatchAcknowledged: vinAck,
          acceptP2AsSystemPower: false,
        },
      );
      setValidateMsg(t('master.vehicleIdentity.validateSuccess'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) {
    return (
      <p className="text-xs text-muted-foreground">{t('master.vehicleIdentity.p2Disabled')}</p>
    );
  }

  const reviewRows = (snapshot?.fields ?? []).filter((f) =>
    [
      'd1Manufacturer',
      'd3TradeName',
      'd2TypeVariantVersion',
      'eVin',
      'p1DisplacementCc',
      'p2NominalPowerKw',
      'p3FuelOrEnergy',
      'hsnCode21',
      'tsnCode22',
      'gKerbMassKg',
    ].includes(f.fieldCode),
  );

  const onApplyToForm = () => {
    if (!onApplyToRegistrationForm || !registrationFormCurrent || !snapshot) return;
    const result = buildZb1RegistrationFormPatch(
      reviewRows,
      confirmedFields,
      registrationFormCurrent,
      {
        vinMismatchBlocked: snapshot.vinMismatchBlocked,
        vinMismatchAcknowledged: vinAck,
      },
    );
    if (result.blockedReason === 'VIN_MISMATCH') {
      setApplyFormMsg(t('master.vehicleIdentity.applyToFormVinMismatchDocument'));
      return;
    }
    if (Object.keys(result.patch).length === 0) {
      setApplyFormMsg(
        result.skippedConflicts.length
          ? t('master.vehicleIdentity.applyToFormConflict')
          : t('master.vehicleIdentity.applyToFormEmpty'),
      );
      return;
    }
    onApplyToRegistrationForm(result.patch);
    setApplyFormMsg(t('master.vehicleIdentity.applyToFormSuccess'));
  };

  return (
    <div className="space-y-4" data-testid="vehicle-identity-p2-panel">
      <h4 className="text-sm font-semibold">{t('master.vehicleIdentity.sectionTitle')}</h4>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3 border-border">
          <p className="text-xs font-medium">{t('master.vehicleIdentity.pathManual')}</p>
          <p className="text-[10px] text-muted-foreground">{t('master.vehicleIdentity.dimoPrefillHint')}</p>
          <label className="block text-xs">
            {t('master.vehicleIdentity.displacementCc')}
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={manualDisplacement}
              onChange={(e) => setManualDisplacement(e.target.value)}
              data-testid="vehicle-identity-manual-displacement"
            />
          </label>
          <label className="block text-xs">
            {t('master.vehicleIdentity.motorPowerKw')}
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={manualPowerKw}
              onChange={(e) => setManualPowerKw(e.target.value)}
              data-testid="vehicle-identity-manual-power"
            />
          </label>
          <label className="block text-xs">
            {t('master.vehicleIdentity.fuelType')}
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={manualFuel}
              onChange={(e) => setManualFuel(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            {t('master.vehicleIdentity.powerKind')}
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={powerKind}
              onChange={(e) => setPowerKind(e.target.value as typeof powerKind)}
            >
              <option value="">—</option>
              <option value="COMBUSTION">{t('master.vehicleIdentity.powerKind.combustion')}</option>
              <option value="ELECTRIC_DRIVE">{t('master.vehicleIdentity.powerKind.electric')}</option>
              <option value="COMBINED_SYSTEM">{t('master.vehicleIdentity.powerKind.combined')}</option>
            </select>
          </label>
          <label className="block text-xs">
            {t('master.vehicleIdentity.electrificationGrade')}
            <input
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={electrificationGrade}
              onChange={(e) => setElectrificationGrade(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-2 rounded-lg border p-3 border-border">
          <p className="text-xs font-medium flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {t('master.vehicleIdentity.pathDocument')}
          </p>
          {!hideDocumentUpload ? (
            snapshot?.capabilities.zb1UploadEnabled ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-primary">
                <Upload className="h-4 w-4" />
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  data-testid="vehicle-identity-zb1-upload"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                  }}
                />
                {t('master.vehicleIdentity.uploadRegistrationCertificate')}
              </label>
            ) : (
              <p className="text-[10px] text-muted-foreground">{t('master.vehicleIdentity.uploadDisabled')}</p>
            )
          ) : (
            <p className="text-[10px] text-muted-foreground">{t('master.vehicleIdentity.uploadUseToolbar')}</p>
          )}
          {extractionId && (
            <p className="text-[10px] text-muted-foreground">
              {t('master.vehicleIdentity.documentLinked', { id: extractionId })}
            </p>
          )}
        </div>
      </div>

      {snapshot?.vinMismatchBlocked && (
        <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <div>
            <p>{t('master.vehicleIdentity.vinMismatch')}</p>
            <label className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={vinAck} onChange={(e) => setVinAck(e.target.checked)} />
              {t('master.vehicleIdentity.vinMismatchAck')}
            </label>
          </div>
        </div>
      )}

      <p className="text-[10px] text-amber-600 dark:text-amber-400">{snapshot?.p2PowerSemanticsWarning}</p>

      <div className="space-y-2">
        <p className="text-xs font-medium">{t('master.vehicleIdentity.reviewTitle')}</p>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">{t('master.vehicleIdentity.table.field')}</th>
              <th className="py-1">{t('master.vehicleIdentity.table.value')}</th>
              <th className="py-1">{t('master.vehicleIdentity.table.source')}</th>
              <th className="py-1">{t('master.vehicleIdentity.confirmField')}</th>
            </tr>
          </thead>
          <tbody>
            {reviewRows.map((row) => (
              <tr key={row.fieldCode} className="border-t border-border/60">
                <td className="py-1 pr-2">{t(row.labelKey as never)}</td>
                <td className="py-1 pr-2 font-mono">{row.value ?? '—'}</td>
                <td className="py-1 pr-2">
                  <span className={provenanceBadgeClass(row.provenance, isDarkMode)}>
                    {t(provenanceLabelKey(row.provenance) as never)}
                  </span>
                  {row.extractionStatus && row.extractionStatus !== 'EXTRACTED' && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {t('master.vehicleIdentity.extractionStatus', { status: row.extractionStatus })}
                    </span>
                  )}
                </td>
                <td className="py-1">
                  <input
                    type="checkbox"
                    disabled={snapshot?.vinMismatchBlocked && !vinAck && row.fieldCode === 'eVin'}
                    checked={!!confirmedFields[row.fieldCode]}
                    onChange={(e) =>
                      setConfirmedFields((prev) => ({ ...prev, [row.fieldCode]: e.target.checked }))
                    }
                    data-testid={`vehicle-identity-confirm-${row.fieldCode}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
          disabled={loading || (snapshot?.vinMismatchBlocked && !vinAck)}
          onClick={() => void onValidate()}
          data-testid="vehicle-identity-validate-confirm"
        >
          {t('master.vehicleIdentity.validateConfirm')}
        </button>
        {onApplyToRegistrationForm && registrationFormCurrent ? (
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-xs disabled:opacity-50"
            disabled={loading || (snapshot?.vinMismatchBlocked && !vinAck)}
            onClick={onApplyToForm}
            data-testid="vehicle-identity-apply-to-registration-form"
          >
            {t('master.vehicleIdentity.applyToRegistrationForm')}
          </button>
        ) : null}
        {p3Enabled && (
          <>
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-xs disabled:opacity-50"
              disabled={loading || (snapshot?.vinMismatchBlocked && !vinAck)}
              onClick={() => void onAiPreview()}
              data-testid="vehicle-identity-ai-v2-preview"
            >
              {t('master.vehicleIdentity.aiV2Preview')}
            </button>
            <button
              type="button"
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              disabled={loading || (snapshot?.vinMismatchBlocked && !vinAck)}
              onClick={() => void onSaveIdentity()}
              data-testid="vehicle-identity-save"
            >
              {t('master.vehicleIdentity.saveIdentity')}
            </button>
          </>
        )}
      </div>
      {validateMsg && <p className="text-xs text-emerald-600">{validateMsg}</p>}
      {applyFormMsg && <p className="text-xs text-muted-foreground">{applyFormMsg}</p>}
      {saveMsg && <p className="text-xs text-emerald-600">{saveMsg}</p>}
    </div>
  );
}
