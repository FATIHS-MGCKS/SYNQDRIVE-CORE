import type { PartialTranslationDictionary } from '../dictionary-types';
import { masterVehicleIdentityTr } from './master.vehicleIdentity.tr';
import { masterOneAutoTr } from './master.oneAuto.tr';
import { masterCvTechnicalSpecsTr } from './master.cv.technicalSpecs.tr';
import { masterIntelligenceTr } from './master.intelligence.tr';
import { tireWearV3Tr } from './tire.wearV3.tr';

/**
 * Turkish product-copy dictionary (partial).
 * Sparse native coverage — runtime uses explicit English fallback for missing keys.
 */
export const tr = {
  ...masterVehicleIdentityTr,
  ...masterOneAutoTr,
  ...masterCvTechnicalSpecsTr,
  ...masterIntelligenceTr,
  'master.registration.lvBatteryConstructionType.label': 'LV yapı tipi',
  'master.registration.lvBatteryConstructionType.leadAcid': 'Kurşun-asit (açık)',
  'master.registration.lvBatteryChemistryHint.label': 'Kimya (yalnızca AI ipucu)',
  'master.registration.lvBatteryChemistryHint.placeholder': 'Kaydedilmez — LV yapı tipini kullanın',
  'master.registration.lvBatteryChemistryHint.title':
    'Malzeme kimyası kalıcı değildir; Battery Health LV yapı tipini kullanır.',
  'master.registration.lvBatteryType.legacyLabel': 'Kayıtlı legacy değer (güncellemek için tip seçin)',
  'master.registration.lvBatteryType.lvBatteryTypeRequiredForNumbers':
    'Kapasite veya voltaj girmeden önce desteklenen bir LV yapı tipi seçin.',
  'master.registration.lvBatteryType.lvBatteryTypeInvalid':
    'Desteklenmeyen LV yapı tipi. AGM, EFB, kurşun-asit veya lityum seçin.',
  'trips.drivingImpact.quality.partial': 'Sınırlı veri kapsamı — değerlendirme eksik olabilir.',
  'trips.drivingImpact.quality.stale': 'Değerlendirme güncel olmayabilir (yolculuk verileri değişti).',
  'trips.drivingImpact.quality.pending': 'Driving Impact değerlendirmesi devam ediyor.',
  'trips.drivingImpact.quality.failed': 'Driving Impact değerlendirmesi başarısız — gösterilen skor güncel hattı yansıtmayabilir.',
  'trips.drivingImpact.quality.unsupported': 'Bu yolculuk için Driving Impact değerlendirmesi desteklenmiyor — gösterilen skor başka bir kaynaktan olabilir.',
  'trips.drivingImpact.quality.legacyCompat': 'Eski yolculuk skoru yansımasından legacy değerlendirme — güncel Driving Impact hattı değil.',
  'trips.drivingImpact.quality.unavailable': 'Güvenilir araç yükü değerlendirmesi yok.',
  'trips.drivingImpact.quality.r1Contained': 'Araç yükü geçici olarak kullanılamıyor (R1 zaman sınırı).',
  'health.aiTireSpec.applyFailed': 'AI lastik spesifikasyonu uygulanamadı.',
  'health.aiTireSpec.applySuccess': 'AI lastik spesifikasyonu uygulandı.',
  'health.aiTireSpec.seasonMismatchWarning':
    'AI spesifikasyonu kaydedildi. Kurulum mevsimi değiştirilmedi ve AI önerisinden farklı.',
  'health.aiTireSpec.staleBinding':
    'AI çekiminden sonra lastik kurulumu değişti. Uygulamadan önce AI spesifikasyonunu yeniden alın.',
  'health.aiTireSpec.missingGenerationBinding':
    'Uygulama için üretim bağlantısı eksik. AI lastik spesifikasyonunu yeniden alın.',
  'health.aiTireSpec.missingActiveSetup': 'Aktif lastik kurulumu bulunamadı.',
  'health.aiTireSpec.identityMismatch':
    'AI spesifikasyon kimliği kurulum veya istek ile eşleşmiyor.',
  ...tireWearV3Tr,
} satisfies PartialTranslationDictionary;
