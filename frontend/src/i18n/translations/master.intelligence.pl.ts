export const masterIntelligencePl = {
  'master.nav.vsiIntelligence': 'VSI – inteligencja sygnałów',
  'master.nav.apdsIntelligence': 'APDS – polling adaptacyjny',

  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',

  'master.intelligence.vsi.title': 'VSI – inteligencja sygnałów',
  'master.intelligence.vsi.description':
    'Tylko do odczytu: profile sygnałów pojazdu, obserwowana kadencja, historia rewizji (gdy włączona) i wyjaśnienia capability resolver z danych produkcyjnych.',
  'master.intelligence.apds.title': 'APDS – polling adaptacyjny',
  'master.intelligence.apds.description':
    'Tylko do odczytu: decyzje shadow reconciliation, historia epok, dowody rzeczywistego polla (gdy powiązane) i historyczna korelacja VSI. Symulowane czasy next poll to nie wykonane polle.',

  'master.intelligence.apds.loading': 'Ładowanie modeli odczytu APDS…',
  'master.intelligence.apds.error': 'Nie udało się załadować APDS intelligence.',
  'master.intelligence.apds.latestDecision': 'Ostatnia zapisana decyzja',
  'master.intelligence.apds.activeEpoch': 'Aktywna epoka',
  'master.intelligence.apds.decisionsForVehicle': 'decyzji dla tego pojazdu w epoce',
  'master.intelligence.apds.shadowNotReal':
    'Rekomendacje shadow i symulowane znaczniki next poll nie dowodzą zaplanowanego ani wykonanego rzeczywistego polla.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historyczna korelacja VSI to dowód badawczy — nie musiała kierować tą decyzją APDS w runtime.',
  'master.intelligence.apds.openVsiAsOf': 'Otwórz VSI z czasem as-of decyzji',
  'master.intelligence.apds.empty.selectScope.title': 'Wybierz organizację i pojazd',
  'master.intelligence.apds.empty.selectScope.body':
    'Wybierz zakres, aby załadować zapisane decyzje shadow i epoki. Link źródła providera umożliwia korelację VSI; zakres weryfikowany po stronie serwera.',
  'master.intelligence.apds.section.epochs': 'Oś czasu epok aktywacji',
  'master.intelligence.apds.section.decisions': 'Eksplorator decyzji',
  'master.intelligence.apds.section.detail': 'Szczegóły decyzji',
  'master.intelligence.apds.col.time': 'Czas decyzji',
  'master.intelligence.apds.col.reason': 'Powód',
  'master.intelligence.apds.col.policy': 'Polityka',
  'master.intelligence.apds.col.realPoll': 'Powiązanie z rzeczywistym pollem',
  'master.intelligence.apds.detail.shadow': 'Rekomendacja shadow (zapisane wyjścia)',
  'master.intelligence.apds.detail.realPoll': 'Dowód rzeczywistego polla',
  'master.intelligence.apds.detail.vsiCorrelation': 'Historyczna korelacja VSI',
  'master.intelligence.apds.availability.AVAILABLE': 'Dostępna evidencja shadow',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Shadow APDS nieaktywny dla tego zakresu',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Brak zarejestrowanych decyzji reconciliation',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Zapisana historia niedostępna',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Niepełna evidencja dla tego zakresu',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Brak powiązania z rzeczywistym pollem',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Powiązano — log polla niezweryfikowany',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Powiązano — zarejestrowano sukces',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Powiązano — status bez sukcesu',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Dowód rzeczywistego polla niedostępny',

  'master.intelligence.pdi.loading': 'Ładowanie intelligence urządzenia…',
  'master.intelligence.pdi.error': 'Nie udało się załadować PDI device intelligence.',
  'master.intelligence.pdi.section.identity': 'Podsumowanie tożsamości',
  'master.intelligence.pdi.section.timeline': 'Oś czasu',
  'master.intelligence.pdi.section.episodes': 'Epizody połączenia',
  'master.intelligence.pdi.section.drift': 'Monitoring tożsamości',
  'master.intelligence.pdi.section.bindings': 'Powiązania providera',
  'master.intelligence.pdi.section.crossNav': 'Nawigacja między modułami',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'Brak zakresu pojazdu dla tego urządzenia — powiązań providera nie można użyć do nawigacji.',
  'master.intelligence.pdi.bindings.noneForScope': 'Brak powiązań providera w bieżącej odpowiedzi.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Pojazd i organizacja w wierszu odzwierciedlają bieżącą atrybucję tożsamości (CURRENT_VEHICLE_ONLY), nie dowód per binding.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Wiele powiązań providera — wybierz jedno przed otwarciem linków VSI, APDS lub pojazdu.',
  'master.intelligence.pdi.bindings.staleSelection':
    'Wybrane powiązanie providera nie ma już na liście. Wybierz aktualne powiązanie.',
  'master.intelligence.pdi.bindings.linkStatus': 'Status linku',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Aktywny',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Nieaktywny',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Nieznany',
  'master.intelligence.pdi.bindings.vehicleScope': 'Pojazd (atrybucja)',
  'master.intelligence.pdi.bindings.orgScope': 'Organizacja (atrybucja)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Atrybucja pojazdu/org nieznana dla tego zakresu.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'Organizacja urządzenia nie pasuje do kontekstu panelu — linki wyłączone.',
  'master.intelligence.pdi.bindings.navPending':
    'Wybierz powiązanie providera, aby włączyć nawigację między modułami.',
  'master.intelligence.pdi.snapshotNotHistory':
    'Bieżący stan i live mirror to migawki — nie pełna historia.',
  'master.intelligence.pdi.notApplicableR1':
    'Monitoring fizycznego R1 nie dotyczy (np. integracja Tesla tylko software).',
  'master.intelligence.pdi.noDriftHistory':
    'Brak persistowanej historii driftu. Brak wpisów nie dowodzi braku driftu.',
  'master.intelligence.pdi.episodeNotPoll':
    'Epizody połączenia to persistowana evidencja lifecycle — nie wykonanie polla APDS.',
  'master.intelligence.pdi.noEpisodes': 'Brak epizodów dla bieżącego zakresu pojazdu.',
  'master.intelligence.pdi.emptyTimeline': 'Brak wpisów timeline w persistowanej historii.',
  'master.intelligence.pdi.evaluatedAt': 'Evidencja oceniona',

  'master.intelligence.section.context': 'Kontekst URL',
  'master.intelligence.section.crossLinks': 'Odnośniki',
  'master.intelligence.section.previewComponents': 'Podgląd prezentacji (bez danych na żywo)',
  'master.intelligence.section.evidenceSemantics': 'Znaczenie dowodów',

  'master.intelligence.url.invalidParams': 'Zignorowano nieprawidłowe parametry URL: {{params}}',

  'master.intelligence.vsi.previewNote':
    'Odznaki pokazują tylko semantykę etykiet backendu. W PR1 nie ładujemy danych produkcyjnych.',
  'master.intelligence.vsi.empty.title': 'API odczytu jeszcze niepodłączone',
  'master.intelligence.vsi.empty.body':
    'PR2 załaduje profile sygnałów pojazdu, historię rewizji (gdy jest) i wyjaśnienia resolvera przez endpointy tylko do odczytu.',

  'master.intelligence.apds.empty.title': 'API odczytu jeszcze niepodłączone',
  'master.intelligence.apds.empty.body':
    'PR3 załaduje decyzje shadow, epoki aktywacji i korelację VSI. Wiersze shadow nigdy nie są pokazywane jako wykonane polle.',

  'master.intelligence.crossLink.vehicle': 'Otwórz pojazd',
  'master.intelligence.crossLink.device': 'Otwórz inwentarz urządzeń',
  'master.intelligence.crossLink.vsi': 'Otwórz VSI',
  'master.intelligence.crossLink.apds': 'Otwórz APDS',
  'master.intelligence.crossLink.contextMissing':
    'Link do {{target}} wymaga więcej kontekstu w URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h obserwowane',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h obserwowane',
  'master.intelligence.badge.lv.UNKNOWN': 'LV nieznane',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Obserwowana transmisja w trybie czuwania co około 8 godzin (nie potwierdzona konfiguracja sprzętu).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Obserwowana transmisja w trybie czuwania co około 24 godziny (nie potwierdzona konfiguracja sprzętu).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Niewystarczające lub zablokowane dowody transmisji w czuwaniu.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM wysoka częstotliwość (empirycznie)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirycznie)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM nieznane',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empirycznie sklasyfikowany profil RPM o wysokiej częstotliwości. To nie dowód natywnego próbkowania 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Empirycznie sklasyfikowana standardowa gęstość obserwacji RPM.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Niewystarczające dowody kadencji RPM dla stabilnej etykiety.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profil RPM spalinowy nie ma zastosowania (np. BEV). To nie to samo co nieznana jakość sygnału.',

  'master.intelligence.badge.limitation': 'Ograniczenie backendu: {{code}}',

  'master.intelligence.confidence.HIGH': 'Pewność: wysoka',
  'master.intelligence.confidence.MEDIUM': 'Pewność: średnia',
  'master.intelligence.confidence.LOW': 'Pewność: niska',
  'master.intelligence.confidence.UNKNOWN': 'Pewność: nieznana',

  'master.intelligence.density.SUB_ONE_HZ': 'Gęstość: poniżej 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Gęstość: kubełki 1 s nieudowodnione',
  'master.intelligence.density.IRREGULAR': 'Gęstość: nieregularna',
  'master.intelligence.density.UNKNOWN': 'Gęstość: nieznana',
  'master.intelligence.density.NOT_APPLICABLE': 'Gęstość: nie dotyczy',

  'master.intelligence.evidence.title': 'Znaczniki czasu dowodów',
  'master.intelligence.evidence.evaluatedAt': 'Oceniono',
  'master.intelligence.evidence.providerSourceTimestamp': 'Czas źródła dostawcy',
  'master.intelligence.evidence.providerFetchedAt': 'Czas pobrania u dostawcy',
  'master.intelligence.evidence.profileRevision': 'Rewizja profilu',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Czas pobrania to ingest SynqDrive — nie dowód nowego sygnału od dostawcy.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Decyzje shadow APDS opisują symulowane wyniki reconciliation, chyba że powiązano ID rzeczywistego polla.',

  'master.intelligence.evidence.kind.observed': 'Rodzaj: obserwowany dowód dostawcy',
  'master.intelligence.evidence.kind.simulated_shadow': 'Rodzaj: symulacja / ocena shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Rodzaj: zweryfikowane wykonanie polla',
  'master.intelligence.evidence.kind.not_available': 'Rodzaj: niedostępne',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Rodzaj: niewystarczające dowody',
  'master.intelligence.evidence.kind.not_applicable': 'Rodzaj: nie dotyczy',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Rodzaj: ocena zablokowana',

  'master.intelligence.blocked.title': 'Ocena zablokowana',
  'master.intelligence.blocked.body':
    'Klasyfikacja profilu wstrzymana ({{code}}). Starsza etykieta nie może być pokazana jako aktualna.',

  'master.intelligence.section.fleetOverview': 'Zakres floty i profile',
  'master.intelligence.section.signals': 'Szczegóły sygnału',
  'master.intelligence.section.revisions': 'Historia rewizji profilu',
  'master.intelligence.section.capability': 'Capability resolver (tylko odczyt)',

  'master.intelligence.vsi.picker.org': 'Organizacja',
  'master.intelligence.vsi.picker.vehicle': 'Pojazd',
  'master.intelligence.vsi.picker.link': 'Link źródła providera',
  'master.intelligence.vsi.loading': 'Ładowanie modeli odczytu VSI…',
  'master.intelligence.vsi.error': 'Nie udało się załadować VSI.',
  'master.intelligence.vsi.retry': 'Ponów',

  'master.intelligence.vsi.empty.selectScope.title': 'Wybierz organizację i pojazd',
  'master.intelligence.vsi.empty.selectScope.body':
    'Wybierz organizację i pojazd, aby załadować zapisane profile VSI. Zakres jest weryfikowany po stronie serwera.',

  'master.intelligence.vsi.noProfiles.title': 'Brak zmaterializowanych profili VSI',
  'master.intelligence.vsi.noProfiles.body':
    'Dla tego pojazdu nie ma jeszcze profilu capability. To nie to samo co wyłączona historia rewizji.',

  'master.intelligence.vsi.decision.lv': 'Kod decyzji LV: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'Kod decyzji RPM: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Etykiety cadence opisują obserwowane wzorce transmisji, nie konfigurację sprzętu.',
  'master.intelligence.vsi.signals.canonical': 'Sygnał kanoniczny',
  'master.intelligence.vsi.signals.provider': 'Nazwa u providera',
  'master.intelligence.vsi.signals.quality': 'Jakość / pewność',
  'master.intelligence.vsi.signals.observedAt': 'Ostatnia obserwacja (UTC + lokalnie)',
  'master.intelligence.vsi.signals.limitations': 'Ograniczenia',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Nie dotyczy (napęd)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nigdy nie obserwowano',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Obserwowano',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Obserwowano (nieaktualne)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'Nie zaobserwowano w oknie',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Łączna dostępność RPM (pochodna)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Udowodnione na żywo (świeży snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Tylko historycznie udowodnione (kadencja HF; snapshot nie na żywo)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Nieudowodnione',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Nie dotyczy (napęd)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'Dowód HF nie przypisany do tego source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Obroty silnika (RPM) korzystają z dwóch oddzielnych warstw dowodów. Status migawki pochodzi z najnowszego pakietu vehicle latest state; HF/kadencja z punktów wysokiej częstotliwości i zakończonych tras. Nie są zamienne.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Migawka (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Okno obserwacji: najnowszy przypisany pakiet providera przy materializacji profilu (bez historii HF).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / kadencja (okna tras)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Okno obserwacji: wzbogacenie kadencji HF w zakresie linku (zwykle do 14 dni zakończonych tras).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Obserwacja empiryczna',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Świeżość',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Ostatnia ważna obserwacja',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Jakość / pewność',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Pochodzenie',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Liczba próbek HF',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Aktywny profil RPM',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profil oceniono',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Zakończone trasy w oknie kadencji',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Decyzja klasyfikacji',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Wspierające klasyfikacje tras',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'Klasyfikacja kadencji RPM nie ma zastosowania dla tego napędu (np. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Brak dowodów kadencji HF w zapisanym profilu (brak lub puste cadenceIntelligence).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Migawka',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/kadencja',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profil {{profile}} · {{samples}} próbek HF (patrz panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Patrz panel poniżej',

  'master.intelligence.vsi.revision.loading': 'Ładowanie historii rewizji…',
  'master.intelligence.vsi.revision.loadError': 'Nie udało się załadować historii rewizji.',
  'master.intelligence.vsi.revision.retry': 'Ponów ładowanie historii rewizji',
  'master.intelligence.vsi.revision.notCaptured': 'Historia rewizji: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'Rejestracja P5-H1 jest wyłączona. Brak historii nie oznacza braku zmian profilu.',
  'master.intelligence.vsi.revision.moreAvailable': 'Dostępne kolejne rewizje — paginacja kursorem przez API.',

  'master.intelligence.vsi.asOf.title': 'Rozstrzygnięcie rewizji as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Czas decyzji',
  'master.intelligence.vsi.asOf.authority': 'Autorytet',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Podsumowania tylko do odczytu z API VSI, APDS i PDI. Etykiety odzwierciedlają obserwacje lub trwałe dowody — nie dowód sprzętu.',
  'master.intelligence.vehicleDetail.loading': 'Ładowanie podsumowań intelligence…',
  'master.intelligence.vehicleDetail.error': 'Nie udało się załadować podsumowań intelligence dla tego pojazdu.',
  'master.intelligence.vehicleDetail.openVsi': 'Otwórz szczegóły VSI',
  'master.intelligence.vehicleDetail.openVsiOverview': 'Otwórz przegląd VSI',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Otwórz rejestr dowodów',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Otwórz RPM silnika w rejestrze dowodów',
  'master.intelligence.vehicleDetail.openApds': 'Otwórz szczegóły APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Otwórz szczegóły urządzenia',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Brak trwałej decyzji w zakresie.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Brak pojedynczego zainstalowanego urządzenia fizycznego przypisanego do tego pojazdu.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Wiele linków źródłowych dostawcy — wybierz link przed nawigacją VSI/APDS.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Link źródłowy dostawcy',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Wybierz persistowany link dostawcy. Podsumowania i nawigacja dotyczą tylko wybranego linku.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'Poprzedni wybór nie pasuje do tego pojazdu. Wybierz link ponownie.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Wybierz link źródłowy dostawcy, aby włączyć nawigację intelligence dla tego pojazdu.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'Wybierz link źródłowy, aby zobaczyć podsumowania LV/RPM.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Wybierz link źródłowy, aby załadować podsumowanie APDS dla tego linku.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'Szczegół sygnału RPM silnika nie ma zastosowania dla tego profilu (persistowana aplicability VSI).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'Szczegół RPM niedostępny, dopóki VSI nie zgłosi aplicable dowodów RPM dla tego linku.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Szczegół RPM niedostępny, gdy ocena profilu jest zablokowana.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'Szczegół RPM wymaga wybranego linku źródłowego dostawcy.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'Otwiera rejestr i szczegół sygnału do weryfikacji. Zastosowanie nie oznacza dowodu RPM (live ani historycznego)—szczegół VSI pozostaje oparty na dowodach.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Niezależne wymiary dowodów',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Zastosowanie',
  'master.intelligence.vsi.ledger.dimension.declared': 'Deklarowane wsparcie',
  'master.intelligence.vsi.ledger.dimension.observation': 'Obserwacja',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Aktualność',
  'master.intelligence.vsi.ledger.dimension.quality': 'Jakość',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Pewność',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Połączone dowody RPM',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Zastosowalne',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'Nie dotyczy',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Nieznane',

  'master.intelligence.vsi.ledger.declared.LISTED': 'W katalogu',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'Poza katalogiem',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Nieznane',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Aktualne',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Nieaktualne',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Nieznane',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Nigdy nie zaobserwowano (oś jakości)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Nieznane (oś jakości)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Nieaktualne (meta jakość)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Pochodzenie snapshot (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Pochodzenie cadence (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'Brak wpisów',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Tagi dowodów snapshot',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Tagi dowodów cadence',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'Brak wpisu w słowniku dla tego kodu — obowiązuje surowy wynik klasyfikatora.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'Próbki HF istnieją, ale nie można przypisać ich do tego linku źródłowego; dowód historyczny wstrzymany.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'Lane snapshot nie dowodzi cadence HF; cadence oceniana osobno.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'Otwarta podróż blokuje klasyfikację standby LV dla tej rewizji profilu.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Wiele aktywnych linków źródłowych zwiększa niejednoznaczność katalogu.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'Nie przypisano ostatniego stanu pojazdu do tego linku źródłowego.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'Tożsamość dostawcy nie zgadza się z katalogiem (tylko DIMO).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Ostatnia ważna obserwacja',
  'master.intelligence.vsi.ledger.timestamp.source': 'Znacznik czasu źródła',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Pobranie u dostawcy',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'Czas pobrania u dostawcy nie dowodzi nowego pomiaru sensora.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Poprzedni sygnał',
  'master.intelligence.vsi.ledger.sheet.next': 'Następny sygnał',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Zgodne stwierdzenia: snapshot live nigdy nie zawierał RPM, a historyczne dowody HF z podróży istnieją.',

  'master.intelligence.vsi.tabs.ariaLabel': 'Sekcje intelligence VSI',
  'master.intelligence.vsi.tabs.overview': 'Przegląd',
  'master.intelligence.vsi.tabs.ledger': 'Rejestr sygnałów',
  'master.intelligence.vsi.tabs.revisions': 'Rewizje',
  'master.intelligence.vsi.ledger.filters.search': 'Szukaj sygnałów',
  'master.intelligence.vsi.ledger.filters.clear': 'Wyczyść filtry',
  'master.intelligence.vsi.ledger.filters.group': 'Filtry rejestru',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Ma ograniczenia',
  'master.intelligence.vsi.ledger.filters.hasHf': 'Ma przypisywalne HF',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Ukryj nie dotyczy',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{shown}} z {{total}} sygnałów',
  'master.intelligence.vsi.ledger.col.signal': 'Sygnał',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Jakość / pewność',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Ostatnia ważna obserwacja',
  'master.intelligence.vsi.ledger.col.limitations': 'Ograniczenia',
  'master.intelligence.vsi.ledger.col.provenance': 'Dowody',
  'master.intelligence.vsi.ledger.col.action': 'Otwórz szczegóły',
  'master.intelligence.vsi.ledger.table.caption': 'Rejestr dowodów sygnałów pojazdu',
  'master.intelligence.vsi.ledger.selectSignal': 'Wybierz sygnał {{signal}}',
  'master.intelligence.vsi.ledger.emptyFiltered': 'Żaden sygnał nie pasuje do filtrów.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} linków źródłowych — dowody dotyczą tylko wybranego linku.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} sygnałów · rewizja profilu {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Podsumowanie dowodów',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Oś czasu dowodów',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Ścieżki pochodzenia',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'Szczegóły dowodów RPM',
  'master.intelligence.vsi.ledger.detail.section.lv': 'Szczegóły kadencji LV',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Ograniczenia',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Profil oceniono',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Pojazd',
  'master.intelligence.vsi.ledger.detail.context.link': 'Link źródła',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Rewizja profilu {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'Profil standby LV',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Decyzja klasyfikacji',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Pewność dowodu',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Liczba próbek',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'Brak intelligence kadencji LV dla tego sygnału.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Dostępne reżimy kadencji',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Rozstrzygnięcie tier',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Etykieta gęstości',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Atrybucja i limity linku',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Inne ograniczenia',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'Wybrany sygnał jest ukryty przez filtry. Dostosuj filtry lub wyczyść wybór.',

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
