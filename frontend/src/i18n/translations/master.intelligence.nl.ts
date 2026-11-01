export const masterIntelligenceNl = {
  'master.nav.vsiIntelligence': 'VSI – signaalintelligentie',
  'master.nav.apdsIntelligence': 'APDS – adaptief pollen',

  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',
  'master.intelligence.vsi.title': 'VSI – signaalintelligentie',
  'master.intelligence.vsi.description':
    'Alleen-lezen signaalprofielen, waargenomen cadans en bewijs. Live vlootdata in PR2.',
  'master.intelligence.apds.title': 'APDS – adaptief pollen',
  'master.intelligence.apds.description':
    'Alleen-lezen shadow-reconciliatiebeslissingen, epochgeschiedenis, echt poll-bewijs indien gekoppeld en historische VSI-correlatie. Gesimuleerde next-poll tijden zijn geen uitgevoerde polls.',

  'master.intelligence.apds.loading': 'APDS-leesmodellen laden…',
  'master.intelligence.apds.error': 'APDS intelligence kon niet worden geladen.',
  'master.intelligence.apds.latestDecision': 'Laatste opgeslagen beslissing',
  'master.intelligence.apds.activeEpoch': 'Actieve epoch',
  'master.intelligence.apds.decisionsForVehicle': 'beslissingen voor dit voertuig in epoch',
  'master.intelligence.apds.shadowNotReal':
    'Shadow-aanbevelingen en gesimuleerde next-poll timestamps zijn geen bewijs van een geplande of uitgevoerde echte poll.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historische VSI-correlatie is onderzoeksbewijs — het stuurde deze APDS-beslissing niet per se tijdens runtime.',
  'master.intelligence.apds.openVsiAsOf': 'VSI openen met as-of tijd van beslissing',
  'master.intelligence.apds.empty.selectScope.title': 'Selecteer organisatie en voertuig',
  'master.intelligence.apds.empty.selectScope.body':
    'Kies scope om opgeslagen shadow-beslissingen en epochs te laden. Providerbronlink maakt VSI-correlatie mogelijk; scope wordt server-side gevalideerd.',
  'master.intelligence.apds.section.epochs': 'Tijdlijn activeringsepochs',
  'master.intelligence.apds.section.decisions': 'Beslissingsverkenner',
  'master.intelligence.apds.section.detail': 'Beslissingsdetail',
  'master.intelligence.apds.col.time': 'Beslissingstijd',
  'master.intelligence.apds.col.reason': 'Reden',
  'master.intelligence.apds.col.policy': 'Beleid',
  'master.intelligence.apds.col.realPoll': 'Echte poll-koppeling',
  'master.intelligence.apds.detail.shadow': 'Shadow-aanbeveling (opgeslagen outputs)',
  'master.intelligence.apds.detail.realPoll': 'Echt poll-bewijs',
  'master.intelligence.apds.detail.vsiCorrelation': 'Historische VSI-correlatie',
  'master.intelligence.apds.availability.AVAILABLE': 'Shadow-bewijs beschikbaar',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'APDS shadow niet geactiveerd voor deze scope',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Geen reconciliation-beslissingen vastgelegd',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Opgeslagen geschiedenis niet beschikbaar',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Onvolledig bewijs voor deze scope',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Niet gekoppeld aan echte poll',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Gekoppeld — poll-log niet geverifieerd',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Gekoppeld — succes geregistreerd',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Gekoppeld — status zonder succes',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Echt poll-bewijs niet beschikbaar',
  'master.intelligence.pdi.loading': 'Apparaatintelligence laden…',
  'master.intelligence.pdi.error': 'PDI device intelligence kon niet worden geladen.',
  'master.intelligence.pdi.section.identity': 'Identiteitssamenvatting',
  'master.intelligence.pdi.section.timeline': 'Chronologische tijdlijn',
  'master.intelligence.pdi.section.episodes': 'Verbindingsepisodes',
  'master.intelligence.pdi.section.drift': 'Identiteitsmonitoring',
  'master.intelligence.pdi.section.bindings': 'Provider-koppelingen',
  'master.intelligence.pdi.section.crossNav': 'Kruisnavigatie',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'Geen voertuigscope voor dit apparaat — provider-koppelingen kunnen niet voor navigatie worden gebruikt.',
  'master.intelligence.pdi.bindings.noneForScope': 'Geen provider-koppelingen in het huidige antwoord.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Voertuig en organisatie per rij weerspiegelen de huidige identiteitsattributie (CURRENT_VEHICLE_ONLY), geen per-koppeling bewijs.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Meerdere koppelingen — selecteer er één voordat u VSI-, APDS- of voertuiglinks opent.',
  'master.intelligence.pdi.bindings.staleSelection':
    'De geselecteerde koppeling staat niet meer in de lijst. Kies een actuele koppeling.',
  'master.intelligence.pdi.bindings.linkStatus': 'Koppelingsstatus',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Actief',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Inactief',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Onbekend',
  'master.intelligence.pdi.bindings.vehicleScope': 'Voertuig (attributie)',
  'master.intelligence.pdi.bindings.orgScope': 'Organisatie (attributie)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Voertuig/org-attributie onbekend voor deze scope.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'Apparaatorganisatie komt niet overeen met paneelcontext — links uitgeschakeld.',
  'master.intelligence.pdi.bindings.navPending':
    'Selecteer een provider-koppeling om kruisnavigatie in te schakelen.',
  'master.intelligence.pdi.snapshotNotHistory': 'Huidige snapshot en live mirror zijn geen volledige historie.',
  'master.intelligence.pdi.notApplicableR1': 'Fysieke R1-monitoring niet van toepassing (bijv. Tesla software-only).',
  'master.intelligence.pdi.noDriftHistory': 'Geen persistenter drift-geschiedenis. Geen records ≠ geen drift.',
  'master.intelligence.pdi.episodeNotPoll': 'Verbindingsepisodes zijn persistenter lifecycle-bewijs — geen APDS poll.',
  'master.intelligence.pdi.noEpisodes': 'Geen episodes voor huidige voertuigscope.',
  'master.intelligence.pdi.emptyTimeline': 'Geen timeline-items in persistenter historie.',
  'master.intelligence.pdi.evaluatedAt': 'Bewijs geëvalueerd',
  'master.intelligence.section.context': 'URL-context',
  'master.intelligence.section.crossLinks': 'Kruislinks',
  'master.intelligence.section.previewComponents': 'Presentatiepreview (geen live data)',
  'master.intelligence.section.evidenceSemantics': 'Betekenis van bewijs',
  'master.intelligence.url.invalidParams': 'Ongeldige URL-parameters genegeerd: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Badges tonen alleen backend-labelsemantiek. Geen productiedata in PR1.',
  'master.intelligence.vsi.empty.title': 'Read-API’s nog niet gekoppeld',
  'master.intelligence.vsi.empty.body':
    'PR2 laadt voertuigsignalprofielen, revisiegeschiedenis en resolver-uitleg via read-only endpoints.',
  'master.intelligence.apds.empty.title': 'Read-API’s nog niet gekoppeld',
  'master.intelligence.apds.empty.body':
    'PR3 laadt shadow-beslissingen, activatie-episodes en VSI-correlatie. Shadow is nooit een uitgevoerde poll.',
  'master.intelligence.crossLink.vehicle': 'Voertuig openen',
  'master.intelligence.crossLink.device': 'Apparaatinventaris openen',
  'master.intelligence.crossLink.vsi': 'VSI openen',
  'master.intelligence.crossLink.apds': 'APDS openen',
  'master.intelligence.crossLink.contextMissing':
    'Link naar {{target}} vereist meer context in de URL (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 u waargenomen',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 u waargenomen',
  'master.intelligence.badge.lv.UNKNOWN': 'LV onbekend',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Waargenomen standby-transmissie ongeveer elke 8 uur (geen bevestigde hardwareconfiguratie).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Waargenomen standby-transmissie ongeveer elke 24 uur (geen bevestigde hardwareconfiguratie).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Onvoldoende of geblokkeerd standby-transmissiebewijs.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM hoge frequentie (empirisch)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standaard (empirisch)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM onbekend',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empirisch geclassificeerd RPM-profiel met hoge frequentie. Geen bewijs van native 1 Hz sampling.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Empirisch geclassificeerde standaard RPM-dichtheid.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Onvoldoende RPM-cadansbewijs voor een stabiel label.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE RPM-profiel niet van toepassing (bv. BEV). Dat is niet hetzelfde als onbekende signaalkwaliteit.',
  'master.intelligence.badge.limitation': 'Backendbeperking: {{code}}',
  'master.intelligence.confidence.HIGH': 'Vertrouwen: hoog',
  'master.intelligence.confidence.MEDIUM': 'Vertrouwen: middel',
  'master.intelligence.confidence.LOW': 'Vertrouwen: laag',
  'master.intelligence.confidence.UNKNOWN': 'Vertrouwen: onbekend',
  'master.intelligence.density.SUB_ONE_HZ': 'Dichtheid: onder 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Dichtheid: 1s buckets niet bewezen',
  'master.intelligence.density.IRREGULAR': 'Dichtheid: onregelmatig',
  'master.intelligence.density.UNKNOWN': 'Dichtheid: onbekend',
  'master.intelligence.density.NOT_APPLICABLE': 'Dichtheid: n.v.t.',
  'master.intelligence.evidence.title': 'Bewijstijdstempels',
  'master.intelligence.evidence.evaluatedAt': 'Geëvalueerd op',
  'master.intelligence.evidence.providerSourceTimestamp': 'Brontijd provider',
  'master.intelligence.evidence.providerFetchedAt': 'Fetch-tijd provider',
  'master.intelligence.evidence.profileRevision': 'Profielrevisie',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Fetch-tijd is SynqDrive-ingest — geen bewijs van een nieuw providersignaal.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS shadow-beslissingen zijn gesimuleerde reconciliatie tenzij een echt poll-ID is gekoppeld.',
  'master.intelligence.evidence.kind.observed': 'Soort: waargenomen providerbewijs',
  'master.intelligence.evidence.kind.simulated_shadow': 'Soort: gesimuleerde / shadow evaluatie',
  'master.intelligence.evidence.kind.verified_real_execution': 'Soort: geverifieerde echte poll',
  'master.intelligence.evidence.kind.not_available': 'Soort: niet beschikbaar',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Soort: onvoldoende bewijs',
  'master.intelligence.evidence.kind.not_applicable': 'Soort: n.v.t.',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Soort: evaluatie geblokkeerd',
  'master.intelligence.blocked.title': 'Evaluatie geblokkeerd',
  'master.intelligence.blocked.body':
    'Profielclassificatie gepauzeerd ({{code}}). Een ouder label mag niet als actueel worden getoond.',

  'master.intelligence.section.fleetOverview': 'Vlootscope en profielen',
  'master.intelligence.section.signals': 'Signaaldetail',
  'master.intelligence.section.revisions': 'Profielrevisiegeschiedenis',
  'master.intelligence.section.capability': 'Capability resolver (alleen lezen)',

  'master.intelligence.vsi.picker.org': 'Organisatie',
  'master.intelligence.vsi.picker.vehicle': 'Voertuig',
  'master.intelligence.vsi.picker.link': 'Provider bronlink',
  'master.intelligence.vsi.loading': 'VSI-leesmodellen laden…',
  'master.intelligence.vsi.error': 'VSI-intelligence kon niet worden geladen.',
  'master.intelligence.vsi.retry': 'Opnieuw',

  'master.intelligence.vsi.empty.selectScope.title': 'Kies organisatie en voertuig',
  'master.intelligence.vsi.empty.selectScope.body':
    'Kies organisatie en voertuig om opgeslagen VSI-profielen te laden. Scope wordt server-side gevalideerd.',

  'master.intelligence.vsi.noProfiles.title': 'Geen VSI-profielen gematerialiseerd',
  'master.intelligence.vsi.noProfiles.body':
    'Er is nog geen capability-profiel voor dit voertuig. Dat is niet hetzelfde als uitgeschakelde revisiehistorie.',

  'master.intelligence.vsi.decision.lv': 'LV-beslissingscode: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM-beslissingscode: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Cadence-labels beschrijven waargenomen transmissiepatronen, geen native hardwareconfiguratie.',
  'master.intelligence.vsi.signals.canonical': 'Canoniek signaal',
  'master.intelligence.vsi.signals.provider': 'Providernaam',
  'master.intelligence.vsi.signals.quality': 'Kwaliteit / vertrouwen',
  'master.intelligence.vsi.signals.observedAt': 'Laatste waarneming (UTC + lokaal)',
  'master.intelligence.vsi.signals.limitations': 'Beperkingen',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Niet van toepassing (aandrijflijn)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nooit waargenomen',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Waargenomen',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Waargenomen (verouderd)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'Niet waargenomen in venster',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Gecombineerde RPM-beschikbaarheid (afgeleid)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Live bewezen (verse snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Alleen historisch bewezen (HF-cadans; snapshot niet live)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Niet bewezen',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Niet van toepassing (aandrijflijn)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'HF-bewijs niet toegeschreven aan deze source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Motortoerental (RPM) gebruikt twee aparte bewijslagen. Snapshotstatus komt uit de nieuwste vehicle-latest-state-bundle; HF/cadans uit gespiegelde HF-punten en afgeronde ritten. Ze zijn niet uitwisselbaar.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Observatievenster: nieuwste toegewezen providerbundle bij profielmaterialisatie (geen HF-geschiedenis).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadans (ritvensters)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Observatievenster: link-gebonden HF-cadansverrijking (typisch tot 14 dagen afgeronde ritten).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Empirische observatie',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Versheid',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Laatste geldige observatie',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Kwaliteit / vertrouwen',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Herkomst',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Aantal HF-monsters',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Actief RPM-profiel',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profiel geëvalueerd op',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Afgeronde ritten in cadansvenster',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Classificatiebeslissing',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Ondersteunende ritclassificaties',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'RPM-cadansclassificatie is niet van toepassing voor dit aandrijftype (bijv. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Geen HF-cadansbewijs in het opgeslagen profiel (cadenceIntelligence ontbreekt of leeg).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadans',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profiel {{profile}} · {{samples}} HF-monsters (zie paneel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Zie paneel hieronder',

  'master.intelligence.vsi.revision.loading': 'Revisiehistorie laden…',
  'master.intelligence.vsi.revision.loadError': 'Revisiehistorie kon niet worden geladen.',
  'master.intelligence.vsi.revision.retry': 'Revisiehistorie opnieuw laden',
  'master.intelligence.vsi.revision.notCaptured': 'Revisiehistorie: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1-registratie is uitgeschakeld. Ontbrekende historie betekent niet dat het profiel nooit wijzigde.',
  'master.intelligence.vsi.revision.moreAvailable': 'Meer revisies — cursorpaginering via API.',

  'master.intelligence.vsi.asOf.title': 'As-of revisie-oplossing',
  'master.intelligence.vsi.asOf.decisionAt': 'Beslissingstijd',
  'master.intelligence.vsi.asOf.authority': 'Autoriteit',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Alleen-lezen samenvattingen uit VSI-, APDS- en PDI-API’s. Labels weerspiegelen waargenomen of bewaarde evidence — geen hardwarebewijs.',
  'master.intelligence.vehicleDetail.loading': 'Intelligence-samenvattingen laden…',
  'master.intelligence.vehicleDetail.error': 'Kon intelligence-samenvattingen voor dit voertuig niet laden.',
  'master.intelligence.vehicleDetail.openVsi': 'VSI-detail openen',
  'master.intelligence.vehicleDetail.openVsiOverview': 'VSI-overzicht openen',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Bewijsledger openen',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Motortoerental in bewijsledger openen',
  'master.intelligence.vehicleDetail.openApds': 'APDS-detail openen',
  'master.intelligence.vehicleDetail.openPdi': 'Apparaatdetail openen',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Geen persistenter besluit binnen scope.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Geen enkel geïnstalleerd fysiek apparaat aan dit voertuig toegeschreven.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Meerdere provider-bronlinks — kies een link vóór VSI/APDS-navigatie.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Provider-bronlink',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Kies welke persistenter providerlink u gebruikt. Samenvattingen en navigatie gelden alleen voor de gekozen link.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'De vorige keuze hoort niet meer bij dit voertuig. Kies opnieuw een link.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Selecteer een provider-bronlink om intelligencenavigatie voor dit voertuig in te schakelen.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'Selecteer een provider-bronlink om LV/RPM-samenvattingen te zien.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Selecteer een provider-bronlink om het APDS-samenvatting voor die link te laden.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'Motortoerentaldetail is niet van toepassing op dit profiel (persistente VSI-toepasbaarheid).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'Toerentaldetail niet beschikbaar tot VSI toepasbare RPM-evidence voor deze link rapporteert.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Toerentaldetail niet beschikbaar zolang profielevaluatie geblokkeerd is.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'Toerentaldetail vereist een geselecteerde provider-bronlink.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'Opent ledger en signaaldetail ter beoordeling. Toepasbaarheid is hier geen gecombineerd RPM-bewijs (live of historisch)—VSI-detail blijft evidence-gedreven.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Onafhankelijke bewijsdimensies',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Toepasbaarheid',
  'master.intelligence.vsi.ledger.dimension.declared': 'Gedeclareerde ondersteuning',
  'master.intelligence.vsi.ledger.dimension.observation': 'Observatie',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Actualiteit',
  'master.intelligence.vsi.ledger.dimension.quality': 'Kwaliteit',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Vertrouwen',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Gecombineerd RPM-bewijs',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Toepasbaar',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'Niet van toepassing',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Onbekend',

  'master.intelligence.vsi.ledger.declared.LISTED': 'In catalogus',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'Niet in catalogus',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Onbekend',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Actueel',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Verouderd',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Onbekend',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Nooit geobserveerd (kwaliteitsas)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Onbekend (kwaliteitsas)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Verouderd (meta-kwaliteit)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Snapshot-provenance (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Cadence-provenance (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'Geen vermeldingen',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Snapshot-bewijstags',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Cadence-bewijstags',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'Geen woordenlijst voor deze code — ruwe classifier-uitvoer is leidend.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'HF-monsters bestaan maar kunnen niet aan deze bronlink worden toegeschreven; historisch bewijs wordt ingetrokken.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'Snapshot-lane bewijst geen HF-cadence; cadence wordt apart beoordeeld.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'Een open rit blokkeert LV-standby-classificatie voor deze profielrevisie.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Meerdere actieve bronlinks maken catalogusattributie dubbelzinnig.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'Laatste voertuigstatus kon niet aan deze bronlink worden toegeschreven.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'Provideridentiteit komt niet overeen met catalogus (alleen DIMO).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Laatste geldige observatie',
  'master.intelligence.vsi.ledger.timestamp.source': 'Brontimestamp',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Provider-fetch',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'Provider-fetchtijd bewijst geen nieuwe sensormeting.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Vorig signaal',
  'master.intelligence.vsi.ledger.sheet.next': 'Volgend signaal',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Compatibele uitspraken: live snapshot droeg nooit RPM terwijl historisch HF-ritbewijs bestaat.',

  'master.intelligence.vsi.tabs.ariaLabel': 'VSI-intelligence-onderdelen',
  'master.intelligence.vsi.tabs.overview': 'Overzicht',
  'master.intelligence.vsi.tabs.ledger': 'Signaalregister',
  'master.intelligence.vsi.tabs.revisions': 'Revisies',
  'master.intelligence.vsi.ledger.filters.search': 'Signalen zoeken',
  'master.intelligence.vsi.ledger.filters.clear': 'Filters wissen',
  'master.intelligence.vsi.ledger.filters.group': 'Registerfilters',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Met beperkingen',
  'master.intelligence.vsi.ledger.filters.hasHf': 'Toeschrijfbaar HF',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Verberg niet van toepassing',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{shown}} van {{total}} signalen',
  'master.intelligence.vsi.ledger.col.signal': 'Signaal',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Kwaliteit / vertrouwen',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Laatste geldige observatie',
  'master.intelligence.vsi.ledger.col.limitations': 'Beperkingen',
  'master.intelligence.vsi.ledger.col.provenance': 'Bewijs',
  'master.intelligence.vsi.ledger.col.action': 'Detail openen',
  'master.intelligence.vsi.ledger.table.caption': 'Bewijsregister voertuigsignalen',
  'master.intelligence.vsi.ledger.selectSignal': 'Selecteer signaal {{signal}}',
  'master.intelligence.vsi.ledger.emptyFiltered': 'Geen signalen komen overeen met de filters.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} bronlinks — bewijs geldt alleen voor de geselecteerde link.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} signalen · profielrevisie {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Bewijssamenvatting',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Bewijstijdlijn',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Provenance-sporen',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'RPM-bewijsdetail',
  'master.intelligence.vsi.ledger.detail.section.lv': 'LV-cadansdetail',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Beperkingen',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Profiel geëvalueerd op',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Voertuig',
  'master.intelligence.vsi.ledger.detail.context.link': 'Bronlink',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Profielrevisie {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'LV-standbyprofiel',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Classificatiebeslissing',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Bewijsvertrouwen',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Geobserveerde steekproeven',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'Geen LV-cadansintelligence voor dit signaal.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Beschikbare cadansregimes',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Tier-resolutie',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Geobserveerde dichtheidslabel',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Attributie en linklimieten',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Overige beperkingen',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'Geselecteerd signaal is verborgen door filters. Pas filters aan of wis de selectie.',

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
