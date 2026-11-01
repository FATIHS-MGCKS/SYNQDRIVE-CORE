export const masterIntelligenceTr = {
  'master.nav.vsiIntelligence': 'VSI – sinyal istihbaratı',
  'master.nav.apdsIntelligence': 'APDS – uyarlanabilir polling',

  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',
  'master.intelligence.vsi.title': 'VSI – sinyal istihbaratı',
  'master.intelligence.vsi.description':
    'Salt okunur araç sinyal profilleri, gözlemlenen kadans, yakalanmışsa revizyon geçmişi ve capability resolver açıklamaları (üretim verisi).',
  'master.intelligence.apds.title': 'APDS – uyarlanabilir polling',
  'master.intelligence.apds.description':
    'Salt okuma shadow uzlaştırma kararları, epoch geçmişi, bağlıysa gerçek poll kanıtı ve geçmiş VSI korelasyonu. Simüle next poll zamanları yürütülmüş poll değildir.',

  'master.intelligence.apds.loading': 'APDS okuma modelleri yükleniyor…',
  'master.intelligence.apds.error': 'APDS intelligence yüklenemedi.',
  'master.intelligence.apds.latestDecision': 'Son kalıcı karar',
  'master.intelligence.apds.activeEpoch': 'Aktif epoch',
  'master.intelligence.apds.decisionsForVehicle': 'epoch içinde bu araç için karar',
  'master.intelligence.apds.shadowNotReal':
    'Shadow önerileri ve simüle next poll zaman damgaları planlanmış veya yürütülmüş gerçek poll kanıtı değildir.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Geçmiş VSI korelasyonu araştırma kanıtıdır — çalışma anında bu APDS kararını zorunlu olarak yönlendirmedi.',
  'master.intelligence.apds.openVsiAsOf': 'Karar as-of zamanıyla VSI aç',
  'master.intelligence.apds.empty.selectScope.title': 'Organizasyon ve araç seçin',
  'master.intelligence.apds.empty.selectScope.body':
    'Kalıcı shadow kararları ve epoch’ları yüklemek için kapsam seçin. Sağlayıcı kaynak linki VSI korelasyonunu etkinleştirir; kapsam sunucuda doğrulanır.',
  'master.intelligence.apds.section.epochs': 'Aktivasyon epoch zaman çizelgesi',
  'master.intelligence.apds.section.decisions': 'Karar gezgini',
  'master.intelligence.apds.section.detail': 'Karar detayı',
  'master.intelligence.apds.col.time': 'Karar zamanı',
  'master.intelligence.apds.col.reason': 'Neden',
  'master.intelligence.apds.col.policy': 'Politika',
  'master.intelligence.apds.col.realPoll': 'Gerçek poll bağlantısı',
  'master.intelligence.apds.detail.shadow': 'Shadow önerisi (kalıcı çıktılar)',
  'master.intelligence.apds.detail.realPoll': 'Gerçek poll kanıtı',
  'master.intelligence.apds.detail.vsiCorrelation': 'Geçmiş VSI korelasyonu',
  'master.intelligence.apds.availability.AVAILABLE': 'Shadow kanıtı mevcut',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Bu kapsam için APDS shadow etkin değil',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Yakalanmış uzlaştırma kararı yok',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Kalıcı geçmiş kullanılamıyor',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Bu kapsam için kanıt eksik',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Gerçek polle bağlı değil',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Bağlı — poll günlüğü doğrulanmadı',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Bağlı — başarı kaydedildi',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Bağlı — başarısız durum',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Gerçek poll kanıtı mevcut değil',
  'master.intelligence.pdi.loading': 'Cihaz intelligence yükleniyor…',
  'master.intelligence.pdi.error': 'PDI cihaz intelligence yüklenemedi.',
  'master.intelligence.pdi.section.identity': 'Kimlik özeti',
  'master.intelligence.pdi.section.timeline': 'Zaman çizelgesi',
  'master.intelligence.pdi.section.episodes': 'Bağlantı epizodları',
  'master.intelligence.pdi.section.drift': 'Kimlik izleme',
  'master.intelligence.pdi.section.bindings': 'Sağlayıcı bağlantıları',
  'master.intelligence.pdi.section.crossNav': 'Çapraz gezinme',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'Bu cihazda araç kapsamı yok — sağlayıcı bağlantıları gezinme için kullanılamaz.',
  'master.intelligence.pdi.bindings.noneForScope': 'Geçerli yanıtta sağlayıcı bağlantısı yok.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Satırdaki araç ve organizasyon güncel kimlik atamasını yansıtır (CURRENT_VEHICLE_ONLY), bağlantı başına kanıt değildir.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Birden fazla bağlantı — VSI, APDS veya araç bağlantılarını açmadan birini seçin.',
  'master.intelligence.pdi.bindings.staleSelection':
    'Seçilen sağlayıcı bağlantısı artık listede değil. Güncel bir bağlantı seçin.',
  'master.intelligence.pdi.bindings.linkStatus': 'Bağlantı durumu',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Aktif',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Pasif',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Bilinmiyor',
  'master.intelligence.pdi.bindings.vehicleScope': 'Araç (atama)',
  'master.intelligence.pdi.bindings.orgScope': 'Organizasyon (atama)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Bu kapsam için araç/org ataması bilinmiyor.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'Cihaz organizasyonu panel bağlamıyla uyuşmuyor — bağlantılar devre dışı.',
  'master.intelligence.pdi.bindings.navPending':
    'Çapraz gezinmeyi etkinleştirmek için bir sağlayıcı bağlantısı seçin.',
  'master.intelligence.pdi.snapshotNotHistory': 'Güncel envanter ve canlı ayna anlık görüntüdür — tam geçmiş değildir.',
  'master.intelligence.pdi.notApplicableR1': 'Fiziksel R1 izleme uygulanmaz (ör. yalnızca yazılım Tesla).',
  'master.intelligence.pdi.noDriftHistory': 'Kalıcı drift geçmişi yok. Kayıt yokluğu drift yokluğunu kanıtlamaz.',
  'master.intelligence.pdi.episodeNotPoll': 'Bağlantı epizodları kalıcı lifecycle kanıtıdır — APDS poll değildir.',
  'master.intelligence.pdi.noEpisodes': 'Geçerli araç kapsamında epizod yok.',
  'master.intelligence.pdi.emptyTimeline': 'Kalıcı geçmişte timeline girdisi yok.',
  'master.intelligence.pdi.evaluatedAt': 'Kanıt değerlendirildi',
  'master.intelligence.section.context': 'URL bağlamı',
  'master.intelligence.section.crossLinks': 'Çapraz bağlantılar',
  'master.intelligence.section.previewComponents': 'Sunum önizlemesi (canlı veri yok)',
  'master.intelligence.section.evidenceSemantics': 'Kanıt anlamları',
  'master.intelligence.url.invalidParams': 'Geçersiz URL parametreleri yok sayıldı: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Rozetler yalnızca backend etiket anlamını gösterir. PR1’de üretim verisi yüklenmez.',
  'master.intelligence.vsi.empty.title': 'Okuma API’leri henüz bağlı değil',
  'master.intelligence.vsi.empty.body':
    'PR2, salt okunur uç noktalarla araç sinyal profilleri, revizyon geçmişi ve resolver açıklamalarını yükleyecek.',
  'master.intelligence.apds.empty.title': 'Okuma API’leri henüz bağlı değil',
  'master.intelligence.apds.empty.body':
    'PR3 shadow kararları, aktivasyon dönemleri ve VSI korelasyonunu yükleyecek. Shadow satırları asla yürütülmüş poll değildir.',
  'master.intelligence.crossLink.vehicle': 'Aracı aç',
  'master.intelligence.crossLink.device': 'Cihaz envanterini aç',
  'master.intelligence.crossLink.vsi': 'VSI aç',
  'master.intelligence.crossLink.apds': 'APDS aç',
  'master.intelligence.crossLink.contextMissing':
    '{{target}} bağlantısı URL’de daha fazla bağlam gerektirir (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 sa gözlemlendi',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 sa gözlemlendi',
  'master.intelligence.badge.lv.UNKNOWN': 'LV bilinmiyor',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Yaklaşık 8 saatte bir gözlemlenen bekleme iletimi (doğrulanmış donanım yapılandırması değil).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Yaklaşık 24 saatte bir gözlemlenen bekleme iletimi (doğrulanmış donanım yapılandırması değil).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Yetersiz veya engellenmiş bekleme iletim kanıtı.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM yüksek frekans (ampirik)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standart (ampirik)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM bilinmiyor',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Ampirik olarak yüksek frekanslı RPM profili. Yerel 1 Hz örnekleme kanıtı değildir.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Ampirik standart RPM gözlem yoğunluğu.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Kararlı etiket için yetersiz RPM kadans kanıtı.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE RPM profili uygulanamaz (ör. BEV). Bu, bilinmeyen sinyal kalitesi ile aynı değildir.',
  'master.intelligence.badge.limitation': 'Backend sınırlaması: {{code}}',
  'master.intelligence.confidence.HIGH': 'Güven: yüksek',
  'master.intelligence.confidence.MEDIUM': 'Güven: orta',
  'master.intelligence.confidence.LOW': 'Güven: düşük',
  'master.intelligence.confidence.UNKNOWN': 'Güven: bilinmiyor',
  'master.intelligence.density.SUB_ONE_HZ': 'Yoğunluk: 1 Hz altı',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Yoğunluk: 1 sn bucket kanıtlanmadı',
  'master.intelligence.density.IRREGULAR': 'Yoğunluk: düzensiz',
  'master.intelligence.density.UNKNOWN': 'Yoğunluk: bilinmiyor',
  'master.intelligence.density.NOT_APPLICABLE': 'Yoğunluk: uygulanamaz',
  'master.intelligence.evidence.title': 'Kanıt zaman damgaları',
  'master.intelligence.evidence.evaluatedAt': 'Değerlendirme zamanı',
  'master.intelligence.evidence.providerSourceTimestamp': 'Sağlayıcı kaynak zamanı',
  'master.intelligence.evidence.providerFetchedAt': 'Sağlayıcı fetch zamanı',
  'master.intelligence.evidence.profileRevision': 'Profil revizyonu',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Fetch zamanı SynqDrive alımını gösterir — yeni sağlayıcı sinyali kanıtı değildir.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS shadow kararları, gerçek poll kimliği bağlı değilse simüle uzlaştırma sonucudur.',
  'master.intelligence.evidence.kind.observed': 'Tür: gözlemlenen sağlayıcı kanıtı',
  'master.intelligence.evidence.kind.simulated_shadow': 'Tür: simüle / shadow değerlendirme',
  'master.intelligence.evidence.kind.verified_real_execution': 'Tür: doğrulanmış gerçek poll',
  'master.intelligence.evidence.kind.not_available': 'Tür: kullanılamıyor',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Tür: yetersiz kanıt',
  'master.intelligence.evidence.kind.not_applicable': 'Tür: uygulanamaz',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Tür: değerlendirme engellendi',
  'master.intelligence.blocked.title': 'Değerlendirme engellendi',
  'master.intelligence.blocked.body':
    'Profil sınıflandırması duraklatıldı ({{code}}). Eski etiket güncel gibi gösterilmemelidir.',

  'master.intelligence.section.fleetOverview': 'Filo kapsamı ve profiller',
  'master.intelligence.section.signals': 'Sinyal detayı',
  'master.intelligence.section.revisions': 'Profil revizyon geçmişi',
  'master.intelligence.section.capability': 'Capability resolver (salt okunur)',

  'master.intelligence.vsi.picker.org': 'Organizasyon',
  'master.intelligence.vsi.picker.vehicle': 'Araç',
  'master.intelligence.vsi.picker.link': 'Sağlayıcı kaynak bağlantısı',
  'master.intelligence.vsi.loading': 'VSI okuma modelleri yükleniyor…',
  'master.intelligence.vsi.error': 'VSI intelligence yüklenemedi.',
  'master.intelligence.vsi.retry': 'Yeniden dene',

  'master.intelligence.vsi.empty.selectScope.title': 'Organizasyon ve araç seçin',
  'master.intelligence.vsi.empty.selectScope.body':
    'Kalıcı VSI profilleri için organizasyon ve araç seçin. Kapsam sunucuda doğrulanır.',

  'master.intelligence.vsi.noProfiles.title': 'Materialize VSI profili yok',
  'master.intelligence.vsi.noProfiles.body':
    'Bu araç için henüz capability profili yok. Bu, devre dışı revizyon geçmişi ile aynı değildir.',

  'master.intelligence.vsi.decision.lv': 'LV karar kodu: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM karar kodu: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Kadans etiketleri gözlemlenen iletim desenlerini anlatır; yerel donanım yapılandırması değildir.',
  'master.intelligence.vsi.signals.canonical': 'Kanonik sinyal',
  'master.intelligence.vsi.signals.provider': 'Sağlayıcı adı',
  'master.intelligence.vsi.signals.quality': 'Kalite / güven',
  'master.intelligence.vsi.signals.observedAt': 'Son gözlem (UTC + yerel)',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Uygulanamaz (tahrik)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Hiç gözlemlenmedi',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Gözlemlendi',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Gözlemlendi (eski)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'Pencerede gözlemlenmedi',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Birleşik RPM kullanılabilirliği (türetilmiş)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Canlı kanıtlandı (taze snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Yalnızca geçmişte kanıtlandı (HF kadans; snapshot canlı değil)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Kanıtlanmadı',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Uygulanamaz (tahrik)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'HF kanıtı bu source link ile ilişkilendirilmedi',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Motor devri (RPM) iki ayrı kanıt düzlemi kullanır. Anlık görüntü durumu en son vehicle latest state paketinden gelir; HF/kadans yansıtılmış yüksek frekanslı noktalardan ve tamamlanan seferlerden gelir. Birbirinin yerine geçmez.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Anlık görüntü (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Gözlem penceresi: profil materializasyonunda en son atfedilen sağlayıcı paketi (HF geçmişi değil).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / kadans (sefer pencereleri)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Gözlem penceresi: link kapsamlı HF kadans zenginleştirmesi (genelde 14 güne kadar tamamlanan seferler).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Ampirik gözlem',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Tazelik',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Son geçerli gözlem',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Kalite / güven',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Köken',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'HF örnek sayısı',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Aktif RPM profili',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profil değerlendirme zamanı',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Kadans penceresindeki tamamlanan seferler',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Sınıflandırma kararı',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Destekleyici sefer sınıflandırmaları',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'RPM kadans sınıflandırması bu güç aktarımı için geçerli değil (ör. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Kalıcı profilde HF kadans kanıtı yok (cadenceIntelligence eksik veya boş).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Anlık görüntü',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/kadans',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    '{{profile}} profili · {{samples}} HF örneği (panele bakın)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Aşağıdaki panele bakın',

  'master.intelligence.vsi.signals.limitations': 'Sınırlamalar',

  'master.intelligence.vsi.revision.loading': 'Revizyon geçmişi yükleniyor…',
  'master.intelligence.vsi.revision.loadError': 'Revizyon geçmişi yüklenemedi.',
  'master.intelligence.vsi.revision.retry': 'Revizyon geçmişini yeniden dene',
  'master.intelligence.vsi.revision.notCaptured': 'Revizyon geçmişi: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1 yakalama kapalı. Eksik geçmiş profilin hiç değişmediği anlamına gelmez.',
  'master.intelligence.vsi.revision.moreAvailable': 'Daha fazla revizyon — API ile imleç sayfalama.',

  'master.intelligence.vsi.asOf.title': 'As-of revizyon çözümü',
  'master.intelligence.vsi.asOf.decisionAt': 'Karar zamanı',
  'master.intelligence.vsi.asOf.authority': 'Otorite',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'VSI, APDS ve PDI API’lerinden salt okunur özetler. Rozetler gözlemlenen veya kalıcı kanıtı yansıtır — donanım kanıtı değildir.',
  'master.intelligence.vehicleDetail.loading': 'Intelligence özetleri yükleniyor…',
  'master.intelligence.vehicleDetail.error': 'Bu araç için intelligence özetleri yüklenemedi.',
  'master.intelligence.vehicleDetail.openVsi': 'VSI ayrıntısını aç',
  'master.intelligence.vehicleDetail.openVsiOverview': 'VSI özetini aç',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Kanıt defterini aç',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Kanıt defterinde motor RPM aç',
  'master.intelligence.vehicleDetail.openApds': 'APDS ayrıntısını aç',
  'master.intelligence.vehicleDetail.openPdi': 'Cihaz ayrıntısını aç',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Kapsamda kalıcı karar yok.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Bu araca atanan tek bir kurulu fiziksel cihaz yok.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Birden fazla sağlayıcı kaynak bağlantısı — VSI/APDS gezinmesinden önce bir bağlantı seçin.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Sağlayıcı kaynak bağlantısı',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Kalıcı sağlayıcı bağlantısını seçin. Özetler ve gezinme yalnızca seçilen bağlantı için geçerlidir.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'Önceki seçim bu araçla eşleşmiyor. Bağlantıyı yeniden seçin.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Bu araç için intelligence gezinmesini etkinleştirmek üzere bir kaynak bağlantısı seçin.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'LV/RPM özetlerini görmek için bir kaynak bağlantısı seçin.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Bu bağlantı için APDS özetini yüklemek üzere bir kaynak bağlantısı seçin.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'Motor RPM sinyal ayrıntısı bu profil için geçerli değil (kalıcı VSI uygulanabilirliği).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'VSI bu bağlantı için uygulanabilir RPM kanıtı bildirene kadar RPM ayrıntısı kullanılamaz.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Profil değerlendirmesi engelliyken RPM ayrıntısı kullanılamaz.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'RPM ayrıntısı seçilmiş bir sağlayıcı kaynak bağlantısı gerektirir.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'İnceleme için defter ve sinyal ayrıntısını açar. Uygulanabilirlik burada birleşik RPM kanıtı (canlı veya geçmiş) değildir—VSI ayrıntısı kanıta dayalı kalır.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Bağımsız kanıt boyutları',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Uygulanabilirlik',
  'master.intelligence.vsi.ledger.dimension.declared': 'Bildirilen destek',
  'master.intelligence.vsi.ledger.dimension.observation': 'Gözlem',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Güncellik',
  'master.intelligence.vsi.ledger.dimension.quality': 'Kalite',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Güven',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Birleşik RPM kanıtı',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Uygulanabilir',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'Uygulanamaz',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Bilinmiyor',

  'master.intelligence.vsi.ledger.declared.LISTED': 'Katalogda listelenmiş',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'Listelenmemiş',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Bilinmiyor',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Güncel',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Eski',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Bilinmiyor',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Hiç gözlemlenmedi (kalite ekseni)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Bilinmiyor (kalite ekseni)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Eski (meta kalite)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Snapshot kökeni (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Cadence kökeni (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'Kayıt yok',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Snapshot kanıt etiketleri',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Cadence kanıt etiketleri',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'Bu kod için sözlük girişi yok — sınıflandırıcının ham çıktısı geçerlidir.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'HF örnekleri var ancak bu kaynak bağlantısına atanamıyor; tarihsel kanıt verilmez.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'Snapshot lane HF cadence kanıtlamaz; cadence ayrı değerlendirilir.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'Açık bir yolculuk bu profil revizyonu için LV standby sınıflandırmasını engeller.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Birden fazla aktif kaynak bağlantısı bildirilen katalog atamasını belirsizleştirir.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'Son araç durumu bu kaynak bağlantısına atanamadı.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'Sağlayıcı kimliği bildirilen katalogla uyuşmuyor (yalnızca DIMO).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Son geçerli gözlem',
  'master.intelligence.vsi.ledger.timestamp.source': 'Kaynak zaman damgası',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Sağlayıcı getirisi',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'Sağlayıcı getirme zamanı yeni sensör ölçümünü kanıtlamaz.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Önceki sinyal',
  'master.intelligence.vsi.ledger.sheet.next': 'Sonraki sinyal',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Uyumlu ifadeler: canlı snapshot hiç RPM taşımadı; tarihsel HF yolculuk kanıtı mevcut.',

  'master.intelligence.vsi.tabs.ariaLabel': 'VSI intelligence bölümleri',
  'master.intelligence.vsi.tabs.overview': 'Genel bakış',
  'master.intelligence.vsi.tabs.ledger': 'Sinyal defteri',
  'master.intelligence.vsi.tabs.revisions': 'Revizyonlar',
  'master.intelligence.vsi.ledger.filters.search': 'Sinyal ara',
  'master.intelligence.vsi.ledger.filters.clear': 'Filtreleri temizle',
  'master.intelligence.vsi.ledger.filters.group': 'Defter filtreleri',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Sınırlamalı',
  'master.intelligence.vsi.ledger.filters.hasHf': 'Atfedilebilir HF',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Uygulanamazları gizle',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{total}} sinyalden {{shown}}',
  'master.intelligence.vsi.ledger.col.signal': 'Sinyal',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Kalite / güven',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Son geçerli gözlem',
  'master.intelligence.vsi.ledger.col.limitations': 'Sınırlamalar',
  'master.intelligence.vsi.ledger.col.provenance': 'Kanıt',
  'master.intelligence.vsi.ledger.col.action': 'Ayrıntıyı aç',
  'master.intelligence.vsi.ledger.table.caption': 'Araç sinyal kanıt defteri',
  'master.intelligence.vsi.ledger.selectSignal': '{{signal}} sinyalini seç',
  'master.intelligence.vsi.ledger.emptyFiltered': 'Filtrelere uyan sinyal yok.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} kaynak bağlantısı — kanıt yalnızca seçili bağlantı için geçerlidir.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} sinyal · profil revizyonu {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Kanıt özeti',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Kanıt zaman çizelgesi',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Provenans izleri',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'RPM kanıt detayı',
  'master.intelligence.vsi.ledger.detail.section.lv': 'LV kadans detayı',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Sınırlamalar',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Profil değerlendirme zamanı',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Araç',
  'master.intelligence.vsi.ledger.detail.context.link': 'Kaynak bağlantısı',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Profil revizyonu {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'LV bekleme profili',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Sınıflandırma kararı',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Kanıt güveni',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Gözlemlenen örnek sayısı',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'Bu sinyal için LV kadans intelligence kaydı yok.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Mevcut kadans rejimleri',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Tier çözümlemesi',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Gözlemlenen yoğunluk etiketi',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Atıf ve bağlantı sınırları',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Diğer sınırlamalar',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'Seçili sinyal filtreler tarafından gizlendi. Filtreleri ayarlayın veya seçimi temizleyin.',

  'master.intelligence.tireCalibration.title': 'Tire V3 Calibration Center',
  'master.intelligence.tireCalibration.description':
    'Read-only monitoring of calibration shadow snapshots, writer health, and policy pairing quality. Does not change customer Tire V3 or execute the shadow writer.',
  'master.intelligence.tireCalibration.loading': 'Loading calibration read models…',
  'master.intelligence.tireCalibration.error': 'Could not load calibration data.',
  'master.intelligence.tireCalibration.tab.overview': 'Overview',
  'master.intelligence.tireCalibration.tab.snapshots': 'Snapshots',
  'master.intelligence.tireCalibration.tab.accuracy': 'Prediction accuracy',
  'master.intelligence.tireCalibration.tab.quality': 'Data quality',
  'master.intelligence.tireCalibration.writer.replicaLocal':
    'Writer tick statistics reflect this API replica only — not a global fleet aggregate.',
  'master.intelligence.tireCalibration.writer.enabled': 'Shadow writer enabled',
  'master.intelligence.tireCalibration.writer.disabled': 'Shadow writer disabled',
  'master.intelligence.tireCalibration.metric.snapshotRows': 'Snapshot rows (global)',
  'master.intelligence.tireCalibration.metric.setupsWithSnapshots': 'Setups with snapshots',
  'master.intelligence.tireCalibration.metric.latestSnapshot': 'Latest snapshot (UTC)',
  'master.intelligence.tireCalibration.metric.lastTick': 'Last writer tick',
  'master.intelligence.tireCalibration.metric.lastResult': 'Last tick result',
  'master.intelligence.tireCalibration.metric.inserted': 'Inserted (last tick)',
  'master.intelligence.tireCalibration.metric.existing': 'Existing (last tick)',
  'master.intelligence.tireCalibration.metric.skipped': 'Setups skipped (last tick)',
  'master.intelligence.tireCalibration.empty.noSnapshots.title': 'No calibration snapshots yet',
  'master.intelligence.tireCalibration.empty.noSnapshots.body':
    'The calibration shadow writer is off by default. When enabled on a leader replica, snapshots appear here after eligibility changes.',
  'master.intelligence.tireCalibration.picker.org': 'Organization',
  'master.intelligence.tireCalibration.picker.vehicle': 'Vehicle',
  'master.intelligence.tireCalibration.picker.setup': 'Tire setup',
  'master.intelligence.tireCalibration.picker.wheel': 'Wheel',
  'master.intelligence.tireCalibration.picker.mountPeriod': 'Mount period',
  'master.intelligence.tireCalibration.col.wheel': 'Wheel',
  'master.intelligence.tireCalibration.col.created': 'Snapshot time',
  'master.intelligence.tireCalibration.col.pairingEligible': 'Pairing eligible',
  'master.intelligence.tireCalibration.col.physicalTire': 'Physical tire',
  'master.intelligence.tireCalibration.physical.confirmed': 'Confirmed ID',
  'master.intelligence.tireCalibration.physical.unconfirmed': 'Unconfirmed',
  'master.intelligence.tireCalibration.accuracy.notEvaluable.title': 'Accuracy not evaluable',
  'master.intelligence.tireCalibration.accuracy.notEvaluable.body':
    'Independent measurement pairs are not persisted yet. MAE, bias, and coverage cannot be computed.',
  'master.intelligence.tireCalibration.accuracy.policyOpportunities':
    'Policy pairing opportunities (sampled, not confirmed pairs): {{count}}',
  'master.intelligence.tireCalibration.quality.sampledScope':
    'Rejection counts are from a sampled policy re-evaluation (recent measurements × wheels) — not a global census.',
  'master.intelligence.tireCalibration.quality.pairableCount': 'Policy-eligible pairings (sampled)',
  'master.intelligence.tireCalibration.quality.sampledMeasurements': 'Measurements sampled',
  'master.intelligence.tireCalibration.rejection.NO_ELIGIBLE_SNAPSHOT': 'No eligible snapshot',
  'master.intelligence.tireCalibration.rejection.SNAPSHOT_NOT_BEFORE_MEASUREMENT': 'Snapshot not before measurement',
  'master.intelligence.tireCalibration.rejection.ROTATION_DURING_MOUNT': 'Rotation during mount',
  'master.intelligence.tireCalibration.rejection.PAIRING_OBSERVATIONAL_ONLY': 'Observational only',
  'master.intelligence.tireCalibration.rejection.PHYSICAL_IDENTITY_AMBIGUOUS': 'Physical identity ambiguous',
  'master.intelligence.tireCalibration.rejection.TARGET_MEASUREMENT_IN_PREDICTION_INPUT': 'Target in prediction inputs',
  'master.intelligence.tireCalibration.rejection.POST_MEASUREMENT_DATA_LEAKAGE': 'Post-measurement leakage',
  'master.intelligence.tireCalibration.drawer.title': 'Calibration snapshot',
  'master.intelligence.tireCalibration.drawer.section.prediction': 'Prediction',
  'master.intelligence.tireCalibration.drawer.section.provenance': 'Provenance & cutoff',
  'master.intelligence.tireCalibration.drawer.section.quality': 'Model & DS4 quality',
  'master.intelligence.tireCalibration.drawer.predictedTread': 'Predicted tread (mm)',
  'master.intelligence.tireCalibration.drawer.remainingKm': 'Remaining km',
  'master.intelligence.tireCalibration.drawer.ds4Coverage': 'DS4 severity coverage',
  'master.intelligence.tireCalibration.drawer.dynamicBeta': 'Dynamic beta',
  'master.intelligence.tireCalibration.drawer.effectiveFactor': 'Effective factor',
  'master.intelligence.tireCalibration.drawer.eligibilityDigest': 'Eligibility digest (prefix)',
  'master.intelligence.tireCalibration.drawer.inputFingerprint': 'Customer fingerprint (prefix)',
  'master.intelligence.tireCalibration.drawer.measurementIdsUsed': 'Measurement IDs used in prediction',
  'master.intelligence.tireCalibration.drawer.pairingEligible': 'Pairing eligible flag',
  'master.intelligence.tireCalibration.drawer.modelVersion': 'Model / schema version',
  'master.intelligence.tireCalibration.drawer.sourceOdometerKm': 'Source odometer (km)',
  'master.intelligence.tireCalibration.drawer.sourceCutoffUtc': 'Source cutoff (UTC)',
  'master.intelligence.tireCalibration.value.yes': 'Yes',
  'master.intelligence.tireCalibration.value.no': 'No',
  'master.intelligence.tireCalibration.action.refresh': 'Refresh',
  'master.intelligence.tireCalibration.filter.allWheels': 'All wheels',
  'master.intelligence.tireCalibration.filter.allMountPeriods': 'All mount periods',
  'master.intelligence.tireCalibration.col.pairingEligible.yes': 'Pairing eligible',
  'master.intelligence.tireCalibration.col.pairingEligible.no': 'Not pairing eligible',
  'master.intelligence.tireCalibration.drawer.section.eligibility': 'Pairing eligibility',
  'master.intelligence.tireCalibration.drawer.eligibility.pairingEligible':
    'Persisted snapshot flag: eligible for prospective calibration pairing under current policy.',
  'master.intelligence.tireCalibration.drawer.eligibility.observationalOnly':
    'Persisted snapshot flag: observational-only — not eligible for pairing (pairingEligible=false at write time).',
  'master.intelligence.tireCalibration.drawer.eligibility.identityAmbiguous':
    'Physical tire identity was ambiguous when this snapshot was written.',
  'master.intelligence.tireCalibration.drawer.eligibility.rotationDuringMount':
    'Rotation events occurred during this mount period (persisted provenance).',
  'master.intelligence.tireCalibration.drawer.section.temporal': 'Temporal & DS4 quality',
  'master.intelligence.tireCalibration.drawer.temporalQuality': 'Temporal quality (persisted)',
  'master.intelligence.tireCalibration.drawer.sourceComputedAt': 'Prediction computed at (UTC)',
  'master.intelligence.tireCalibration.drawer.latestMeasurementAt': 'Latest measurement in inputs (UTC)',
  'master.intelligence.tireCalibration.drawer.ledgerRowCount': 'Trip ledger rows',
  'master.intelligence.tireCalibration.drawer.ledgerDistanceKm': 'Ledger distance (km)',
  'master.intelligence.tireCalibration.drawer.rotationDuringMount': 'Rotation during mount',
  'master.intelligence.tireCalibration.drawer.odometerAnchorStatus': 'Odometer anchor status',
  'master.intelligence.tireCalibration.drawer.pairingMode': 'Snapshot pairing mode',
  'master.intelligence.tireCalibration.drawer.pairingMode.pairingEligible': 'Pairing-eligible snapshot',
  'master.intelligence.tireCalibration.drawer.pairingMode.observationalOnly': 'Observational-only snapshot',
  'master.intelligence.tireCalibration.drawer.loadMore': 'Load more snapshots',
} as const;
