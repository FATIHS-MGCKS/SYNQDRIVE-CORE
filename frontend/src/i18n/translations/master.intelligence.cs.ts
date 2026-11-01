export const masterIntelligenceCs = {
  'master.nav.vsiIntelligence': 'VSI – inteligence signálů',
  'master.nav.apdsIntelligence': 'APDS – adaptivní polling',

  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',
  'master.intelligence.vsi.title': 'VSI – inteligence signálů',
  'master.intelligence.vsi.description':
    'Profily signálů pouze ke čtení, pozorovaná kadence a důkazy vyhodnocení. Živá data v PR2.',
  'master.intelligence.apds.title': 'APDS – adaptivní polling',
  'master.intelligence.apds.description':
    'Shadow rozhodnutí reconciliace pouze ke čtení, historie epoch, důkazy reálného pollu (pokud propojeno) a historická korelace VSI. Simulované časy next poll nejsou provedené polly.',

  'master.intelligence.apds.loading': 'Načítání APDS read modelů…',
  'master.intelligence.apds.error': 'APDS intelligence se nepodařilo načíst.',
  'master.intelligence.apds.latestDecision': 'Poslední uložené rozhodnutí',
  'master.intelligence.apds.activeEpoch': 'Aktivní epocha',
  'master.intelligence.apds.decisionsForVehicle': 'rozhodnutí pro toto vozidlo v epoše',
  'master.intelligence.apds.shadowNotReal':
    'Shadow doporučení a simulované časové značky next poll nejsou důkazem naplánovaného ani provedeného reálného pollu.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historická korelace VSI je výzkumný důkaz — nemusela řídit toto APDS rozhodnutí za běhu.',
  'master.intelligence.apds.openVsiAsOf': 'Otevřít VSI s časem as-of rozhodnutí',
  'master.intelligence.apds.empty.selectScope.title': 'Vyberte organizaci a vozidlo',
  'master.intelligence.apds.empty.selectScope.body':
    'Zvolte rozsah pro načtení uložených shadow rozhodnutí a epoch. Odkaz zdroje providera umožní korelaci VSI; rozsah ověřuje server.',
  'master.intelligence.apds.section.epochs': 'Časová osa epoch aktivace',
  'master.intelligence.apds.section.decisions': 'Prohlížeč rozhodnutí',
  'master.intelligence.apds.section.detail': 'Detail rozhodnutí',
  'master.intelligence.apds.col.time': 'Čas rozhodnutí',
  'master.intelligence.apds.col.reason': 'Důvod',
  'master.intelligence.apds.col.policy': 'Politika',
  'master.intelligence.apds.col.realPoll': 'Odkaz na reálný poll',
  'master.intelligence.apds.detail.shadow': 'Shadow doporučení (uložené výstupy)',
  'master.intelligence.apds.detail.realPoll': 'Důkaz reálného pollu',
  'master.intelligence.apds.detail.vsiCorrelation': 'Historická korelace VSI',
  'master.intelligence.apds.availability.AVAILABLE': 'Shadow důkazy k dispozici',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'APDS shadow pro tento rozsah neaktivní',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Žádná zachycená rozhodnutí reconciliace',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Uložená historie nedostupná',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Neúplné důkazy pro tento rozsah',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Nepřipojeno k reálnému pollu',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Připojeno — log pollu neověřen',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Připojeno — zaznamenán úspěch',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Připojeno — stav bez úspěchu',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Důkaz reálného pollu nedostupný',
  'master.intelligence.pdi.loading': 'Načítání intelligence zařízení…',
  'master.intelligence.pdi.error': 'PDI device intelligence se nepodařilo načíst.',
  'master.intelligence.pdi.section.identity': 'Shrnutí identity',
  'master.intelligence.pdi.section.timeline': 'Časová osa',
  'master.intelligence.pdi.section.episodes': 'Epizody připojení',
  'master.intelligence.pdi.section.drift': 'Monitoring identity',
  'master.intelligence.pdi.section.bindings': 'Vazby poskytovatele',
  'master.intelligence.pdi.section.crossNav': 'Křížová navigace',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'U tohoto zařízení chybí rozsah vozidla — vazby nelze použít pro navigaci.',
  'master.intelligence.pdi.bindings.noneForScope': 'V aktuální odpovědi nejsou žádné vazby poskytovatele.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Vozidlo a organizace v řádku odrážejí aktuální atribuci identity (CURRENT_VEHICLE_ONLY), ne důkaz na vazbu.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Více vazeb — vyberte jednu před otevřením odkazů VSI, APDS nebo vozidla.',
  'master.intelligence.pdi.bindings.staleSelection':
    'Vybraná vazba už není v seznamu. Zvolte aktuální vazbu.',
  'master.intelligence.pdi.bindings.linkStatus': 'Stav vazby',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Aktivní',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Neaktivní',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Neznámý',
  'master.intelligence.pdi.bindings.vehicleScope': 'Vozidlo (atribuce)',
  'master.intelligence.pdi.bindings.orgScope': 'Organizace (atribuce)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Atribuce vozidla/org pro tento rozsah neznámá.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'Organizace zařízení neodpovídá kontextu panelu — odkazy zakázány.',
  'master.intelligence.pdi.bindings.navPending':
    'Vyberte vazbu poskytovatele pro zapnutí křížové navigace.',
  'master.intelligence.pdi.snapshotNotHistory': 'Aktuální stav a live mirror jsou snímky — ne plná historie.',
  'master.intelligence.pdi.notApplicableR1': 'Fyzický R1 monitoring neplatí (např. softwarová Tesla).',
  'master.intelligence.pdi.noDriftHistory': 'Bez persistované historie driftu. Chybějící záznamy nejsou důkazem bez driftu.',
  'master.intelligence.pdi.episodeNotPoll': 'Epizody připojení jsou persistovaná lifecycle evidencia — ne APDS poll.',
  'master.intelligence.pdi.noEpisodes': 'Žádné epizody pro aktuální rozsah vozidla.',
  'master.intelligence.pdi.emptyTimeline': 'Žádné položky v persistované timeline.',
  'master.intelligence.pdi.evaluatedAt': 'Evidence vyhodnocena',
  'master.intelligence.section.context': 'Kontext URL',
  'master.intelligence.section.crossLinks': 'Přechody',
  'master.intelligence.section.previewComponents': 'Náhled prezentace (ne živá data)',
  'master.intelligence.section.evidenceSemantics': 'Význam důkazů',
  'master.intelligence.url.invalidParams': 'Ignorované neplatné parametry URL: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Odznaky ukazují jen sémantiku backendových štítků. V PR1 se nenačítají produkční data.',
  'master.intelligence.vsi.empty.title': 'Read API zatím nepropojena',
  'master.intelligence.vsi.empty.body':
    'PR2 načte profily signálů vozidla, historii revizí a vysvětlení resolveru přes read-only endpointy.',
  'master.intelligence.apds.empty.title': 'Read API zatím nepropojena',
  'master.intelligence.apds.empty.body':
    'PR3 načte shadow rozhodnutí, epochy aktivace a korelaci VSI. Shadow řádky nejsou vykonané polly.',
  'master.intelligence.crossLink.vehicle': 'Otevřít vozidlo',
  'master.intelligence.crossLink.device': 'Otevřít inventář zařízení',
  'master.intelligence.crossLink.vsi': 'Otevřít VSI',
  'master.intelligence.crossLink.apds': 'Otevřít APDS',
  'master.intelligence.crossLink.contextMissing': 'Odkaz na {{target}} vyžaduje více kontextu v URL (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h pozorováno',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h pozorováno',
  'master.intelligence.badge.lv.UNKNOWN': 'LV neznámé',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Pozorovaný standby přenos zhruba každých 8 hodin (ne potvrzená hardwarová konfigurace).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Pozorovaný standby přenos zhruba každých 24 hodin (ne potvrzená hardwarová konfigurace).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Nedostatečné nebo blokované důkazy standby přenosu.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM vysoká frekvence (empiricky)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empiricky)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM neznámé',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empiricky klasifikovaný profil RPM s vysokou frekvencí. Není důkaz nativního vzorkování 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Empiricky klasifikovaná standardní hustota pozorování RPM.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Nedostatečné důkazy kadence RPM pro stabilní štítek.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profil RPM spalovacího motoru neplatí (např. BEV). To není totéž jako neznámá kvalita signálu.',
  'master.intelligence.badge.limitation': 'Omezení backendu: {{code}}',
  'master.intelligence.confidence.HIGH': 'Spolehlivost: vysoká',
  'master.intelligence.confidence.MEDIUM': 'Spolehlivost: střední',
  'master.intelligence.confidence.LOW': 'Spolehlivost: nízká',
  'master.intelligence.confidence.UNKNOWN': 'Spolehlivost: neznámá',
  'master.intelligence.density.SUB_ONE_HZ': 'Hustota: pod 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Hustota: 1s buckety neprokázány',
  'master.intelligence.density.IRREGULAR': 'Hustota: nepravidelná',
  'master.intelligence.density.UNKNOWN': 'Hustota: neznámá',
  'master.intelligence.density.NOT_APPLICABLE': 'Hustota: neplatí',
  'master.intelligence.evidence.title': 'Časové značky důkazů',
  'master.intelligence.evidence.evaluatedAt': 'Vyhodnoceno',
  'master.intelligence.evidence.providerSourceTimestamp': 'Čas zdroje poskytovatele',
  'master.intelligence.evidence.providerFetchedAt': 'Čas stažení u poskytovatele',
  'master.intelligence.evidence.profileRevision': 'Revize profilu',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Čas stažení je ingest SynqDrive — ne důkaz nového signálu od poskytovatele.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Shadow rozhodnutí APDS popisují simulovanou reconciliaci, pokud není propojeno ID reálného pollu.',
  'master.intelligence.evidence.kind.observed': 'Druh: pozorovaný důkaz poskytovatele',
  'master.intelligence.evidence.kind.simulated_shadow': 'Druh: simulace / shadow vyhodnocení',
  'master.intelligence.evidence.kind.verified_real_execution': 'Druh: ověřené provedení pollu',
  'master.intelligence.evidence.kind.not_available': 'Druh: nedostupné',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Druh: nedostatečné důkazy',
  'master.intelligence.evidence.kind.not_applicable': 'Druh: neplatí',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Druh: vyhodnocení blokováno',
  'master.intelligence.blocked.title': 'Vyhodnocení blokováno',
  'master.intelligence.blocked.body':
    'Klasifikace profilu pozastavena ({{code}}). Starší štítek nesmí být zobrazen jako aktuální.',

  'master.intelligence.section.fleetOverview': 'Rozsah flotily a profily',
  'master.intelligence.section.signals': 'Detail signálu',
  'master.intelligence.section.revisions': 'Historie revizí profilu',
  'master.intelligence.section.capability': 'Capability resolver (pouze čtení)',

  'master.intelligence.vsi.picker.org': 'Organizace',
  'master.intelligence.vsi.picker.vehicle': 'Vozidlo',
  'master.intelligence.vsi.picker.link': 'Provider source link',
  'master.intelligence.vsi.loading': 'Načítání VSI modelů…',
  'master.intelligence.vsi.error': 'VSI data se nepodařilo načíst.',
  'master.intelligence.vsi.retry': 'Zkusit znovu',

  'master.intelligence.vsi.empty.selectScope.title': 'Vyberte organizaci a vozidlo',
  'master.intelligence.vsi.empty.selectScope.body':
    'Vyberte organizaci a vozidlo pro načtení uložených VSI profilů. Rozsah ověřuje server.',

  'master.intelligence.vsi.noProfiles.title': 'Žádné materializované VSI profily',
  'master.intelligence.vsi.noProfiles.body':
    'Pro toto vozidlo zatím neexistuje capability profil. To není totéž jako vypnutá historie revizí.',

  'master.intelligence.vsi.decision.lv': 'LV rozhodovací kód: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM rozhodovací kód: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Cadence štítky popisují pozorované vzory přenosu, ne nativní konfiguraci hardwaru.',
  'master.intelligence.vsi.signals.canonical': 'Kanonický signál',
  'master.intelligence.vsi.signals.provider': 'Název u providera',
  'master.intelligence.vsi.signals.quality': 'Kvalita / jistota',
  'master.intelligence.vsi.signals.observedAt': 'Poslední pozorování (UTC + místní)',
  'master.intelligence.vsi.signals.limitations': 'Omezení',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Neplatí (pohon)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nikdy pozorováno',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Pozorováno',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Pozorováno (zastaralé)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'V okně nepozorováno',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Kombinovaná dostupnost RPM (odvozená)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Prokázáno live (čerstvý snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Pouze historicky prokázáno (HF kadence; snapshot není live)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Neprokázáno',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Neplatí (pohon)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'HF evidence není přiřazena k tomuto source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Otáčky motoru (RPM) používají dvě oddělené vrstvy evidence. Stav snímku pochází z nejnovějšího balíčku vehicle latest state; HF/kadence z mirrorovaných HF bodů a dokončených jízd. Nejsou zaměnitelné.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snímek (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Okno pozorování: nejnovější přiřazený provider bundle při materializaci profilu (ne HF historie).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / kadence (okna jízd)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Okno pozorování: obohacení HF kadence v rozsahu linku (typicky až 14 dní dokončených jízd).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Empirické pozorování',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Čerstvost',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Poslední platné pozorování',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Kvalita / jistota',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Původ',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Počet HF vzorků',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Aktivní RPM profil',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profil vyhodnocen',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Dokončené jízdy v okně kadence',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Rozhodnutí klasifikace',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Podpůrné klasifikace jízd',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'Klasifikace kadence RPM pro tento pohon neplatí (např. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'V persistovaném profilu chybí HF kadence (chybí nebo prázdné cadenceIntelligence).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snímek',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/kadence',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profil {{profile}} · {{samples}} HF vzorků (viz panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Viz panel níže',

  'master.intelligence.vsi.revision.loading': 'Načítání historie revizí…',
  'master.intelligence.vsi.revision.loadError': 'Historii revizí se nepodařilo načíst.',
  'master.intelligence.vsi.revision.retry': 'Opakovat načtení historie revizí',
  'master.intelligence.vsi.revision.notCaptured': 'Historie revizí: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'Záznam P5-H1 je vypnutý. Chybějící historie neznamená, že se profil neměnil.',
  'master.intelligence.vsi.revision.moreAvailable': 'Další revize — stránkování kurzorem přes API.',

  'master.intelligence.vsi.asOf.title': 'As-of rozlišení revize',
  'master.intelligence.vsi.asOf.decisionAt': 'Čas rozhodnutí',
  'master.intelligence.vsi.asOf.authority': 'Autorita',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Souhrny pouze ke čtení z API VSI, APDS a PDI. Štítky odrážejí pozorované nebo persistované důkazy — ne hardware důkaz.',
  'master.intelligence.vehicleDetail.loading': 'Načítání souhrnů intelligence…',
  'master.intelligence.vehicleDetail.error': 'Souhrny intelligence pro toto vozidlo se nepodařilo načíst.',
  'master.intelligence.vehicleDetail.openVsi': 'Otevřít detail VSI',
  'master.intelligence.vehicleDetail.openVsiOverview': 'Otevřít přehled VSI',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Otevřít evidenci',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Otevřít otáčky motoru v evidenci',
  'master.intelligence.vehicleDetail.openApds': 'Otevřít detail APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Otevřít detail zařízení',
  'master.intelligence.vehicleDetail.noApdsDecision': 'V rozsahu není persistované rozhodnutí.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Tomuto vozidlu není přiřazeno jediné nainstalované fyzické zařízení.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Více provider source linků — před navigací VSI/APDS vyberte link.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Provider source link',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Vyberte persistovaný provider link. Souhrny a navigace platí pouze pro vybraný link.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'Předchozí volba neodpovídá tomuto vozidlu. Vyberte link znovu.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Vyberte provider source link pro povolení navigace intelligence u tohoto vozidla.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'Vyberte provider source link pro zobrazení souhrnů LV/RPM.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Vyberte provider source link pro načtení souhrnu APDS pro tento link.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'Detail signálu otáček motoru pro tento profil neplatí (persistovaná aplicability VSI).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'Detail otáček není k dispozici, dokud VSI nehlásí aplicable RPM evidenci pro tento link.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Detail otáček není k dispozici, dokud je vyhodnocení profilu blokováno.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'Detail otáček vyžaduje vybraný provider source link.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'Otevře ledger a detail signálu k revizi. Použitelnost zde není kombinovaný důkaz RPM (live ani historický)—detail VSI zůstává evidencí.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Nezávislé dimenze důkazů',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Použitelnost',
  'master.intelligence.vsi.ledger.dimension.declared': 'Deklarovaná podpora',
  'master.intelligence.vsi.ledger.dimension.observation': 'Pozorování',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Aktuálnost',
  'master.intelligence.vsi.ledger.dimension.quality': 'Kvalita',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Spolehlivost',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Kombinovaný důkaz RPM',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Použitelné',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'Nepoužitelné',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Neznámé',

  'master.intelligence.vsi.ledger.declared.LISTED': 'V katalogu',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'Není v katalogu',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Neznámé',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Aktuální',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Zastaralé',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Neznámé',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Nikdy nepozorováno (osa kvality)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Neznámé (osa kvality)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Zastaralé (meta kvalita)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Provenance snapshot (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Provenance cadence (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'Žádné záznamy',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Tagy důkazu snapshot',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Tagy důkazu cadence',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'Pro tento kód není glosář — rozhodující je surový výstup klasifikátoru.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'Vzorky HF existují, ale nelze je přiřadit k tomuto source linku; historický důkaz se neuděluje.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'Snapshot lane neprokazuje HF cadence; cadence se hodnotí zvlášť.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'Otevřená jízda blokuje klasifikaci LV standby pro tuto revizi profilu.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Více aktivních source linků zvyšuje nejednoznačnost katalogu.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'Poslední stav vozidla nebyl přiřazen k tomuto source linku.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'Identita providera neodpovídá katalogu (pouze DIMO).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Poslední platné pozorování',
  'master.intelligence.vsi.ledger.timestamp.source': 'Časová značka zdroje',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Stažení u providera',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'Čas stažení u providera neprokazuje nové měření senzoru.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Předchozí signál',
  'master.intelligence.vsi.ledger.sheet.next': 'Další signál',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Slučitelná tvrzení: live snapshot nikdy nenesl RPM, zatímco existují historické HF důkazy z jízd.',

  'master.intelligence.vsi.tabs.ariaLabel': 'Sekce VSI intelligence',
  'master.intelligence.vsi.tabs.overview': 'Přehled',
  'master.intelligence.vsi.tabs.ledger': 'Registr signálů',
  'master.intelligence.vsi.tabs.revisions': 'Revize',
  'master.intelligence.vsi.ledger.filters.search': 'Hledat signály',
  'master.intelligence.vsi.ledger.filters.clear': 'Vymazat filtry',
  'master.intelligence.vsi.ledger.filters.group': 'Filtry registru',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Má limitace',
  'master.intelligence.vsi.ledger.filters.hasHf': 'Má přiřaditelné HF',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Skrýt neplatné',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{shown}} z {{total}} signálů',
  'master.intelligence.vsi.ledger.col.signal': 'Signál',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Kvalita / spolehlivost',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Poslední platné pozorování',
  'master.intelligence.vsi.ledger.col.limitations': 'Limitace',
  'master.intelligence.vsi.ledger.col.provenance': 'Důkazy',
  'master.intelligence.vsi.ledger.col.action': 'Otevřít detail',
  'master.intelligence.vsi.ledger.table.caption': 'Registr důkazů signálů vozidla',
  'master.intelligence.vsi.ledger.selectSignal': 'Vybrat signál {{signal}}',
  'master.intelligence.vsi.ledger.emptyFiltered': 'Žádný signál neodpovídá filtrům.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} source linků — důkazy platí pouze pro vybraný link.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} signálů · revize profilu {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Souhrn důkazů',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Časová osa důkazů',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Provenienční stopy',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'Detail důkazu RPM',
  'master.intelligence.vsi.ledger.detail.section.lv': 'Detail kadence LV',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Omezení',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Profil vyhodnocen',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Vozidlo',
  'master.intelligence.vsi.ledger.detail.context.link': 'Zdrojový odkaz',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Revize profilu {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'LV standby profil',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Rozhodnutí klasifikace',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Spolehlivost důkazu',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Počet pozorovaných vzorků',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'Pro tento signál není zaznamenána LV kadence.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Dostupné režimy kadence',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Rozlišení tier',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Štítek pozorované hustoty',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Atribuce a limity odkazu',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Další omezení',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'Vybraný signál je skryt filtry. Upravte filtry nebo zrušte výběr.',

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
