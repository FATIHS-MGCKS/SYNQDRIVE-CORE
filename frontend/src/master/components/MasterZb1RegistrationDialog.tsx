import { FormDialog } from '../../components/patterns/app-dialog';
import { useLanguage } from '../../i18n/LanguageContext';
import { VehicleIdentityP2Panel } from './VehicleIdentityP2Panel';
import type {
  Zb1RegistrationFormCurrent,
  Zb1RegistrationFormPatch,
} from '../connected-vehicles/zb1-registration-form-merge.util';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDarkMode: boolean;
  organizationId: string;
  vehicleId: string;
  registrationFormCurrent: Zb1RegistrationFormCurrent;
  onApplyToRegistrationForm: (patch: Zb1RegistrationFormPatch) => void;
};

export function MasterZb1RegistrationDialog({
  open,
  onOpenChange,
  isDarkMode,
  organizationId,
  vehicleId,
  registrationFormCurrent,
  onApplyToRegistrationForm,
}: Props) {
  const { t } = useLanguage();

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('master.vehicleIdentity.zb1DialogTitle' as never)}
      description={t('master.vehicleIdentity.zb1DialogDescription' as never)}
      maxWidthClassName="sm:max-w-3xl"
      bodyClassName="px-4 pb-4"
    >
      <VehicleIdentityP2Panel
        isDarkMode={isDarkMode}
        organizationId={organizationId}
        vehicleId={vehicleId}
        hideDocumentUpload={false}
        registrationFormCurrent={registrationFormCurrent}
        onApplyToRegistrationForm={onApplyToRegistrationForm}
      />
    </FormDialog>
  );
}
