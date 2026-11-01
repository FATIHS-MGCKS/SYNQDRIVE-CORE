export const masterIntelligenceIt = {
  'master.nav.vsiIntelligence': 'VSI – intelligence segnale',
  'master.nav.apdsIntelligence': 'APDS – polling adattivo',

  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',
  'master.intelligence.vsi.title': 'VSI – intelligence segnale',
  'master.intelligence.vsi.description':
    'Profili segnale veicolo in sola lettura, cadenza osservata, storico revisioni se catturato e spiegazioni capability resolver dai dati di produzione.',
  'master.intelligence.apds.title': 'APDS – polling adattivo',
  'master.intelligence.apds.description':
    'Decisioni shadow di riconciliazione in sola lettura, cronologia epoche, prove di poll reale se collegate e correlazione VSI storica. I next poll simulati non sono poll eseguiti.',

  'master.intelligence.apds.loading': 'Caricamento modelli di lettura APDS…',
  'master.intelligence.apds.error': 'Impossibile caricare l’intelligence APDS.',
  'master.intelligence.apds.latestDecision': 'Ultima decisione persistita',
  'master.intelligence.apds.activeEpoch': 'Epoca attiva',
  'master.intelligence.apds.decisionsForVehicle': 'decisioni per questo veicolo nell’epoca',
  'master.intelligence.apds.shadowNotReal':
    'Le raccomandazioni shadow e i timestamp di next poll simulato non provano un poll reale pianificato o eseguito.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'La correlazione VSI storica è evidenza di ricerca — non ha necessariamente guidato questa decisione APDS a runtime.',
  'master.intelligence.apds.openVsiAsOf': 'Apri VSI con ora as-of della decisione',
  'master.intelligence.apds.empty.selectScope.title': 'Seleziona organizzazione e veicolo',
  'master.intelligence.apds.empty.selectScope.body':
    'Scegli l’ambito per caricare decisioni shadow ed epoche persistite. Il link sorgente provider abilita la correlazione VSI; ambito validato lato server.',
  'master.intelligence.apds.section.epochs': 'Cronologia epoche di attivazione',
  'master.intelligence.apds.section.decisions': 'Esploratore decisioni',
  'master.intelligence.apds.section.detail': 'Dettaglio decisione',
  'master.intelligence.apds.col.time': 'Ora decisione',
  'master.intelligence.apds.col.reason': 'Motivo',
  'master.intelligence.apds.col.policy': 'Policy',
  'master.intelligence.apds.col.realPoll': 'Collegamento poll reale',
  'master.intelligence.apds.detail.shadow': 'Raccomandazione shadow (output persistiti)',
  'master.intelligence.apds.detail.realPoll': 'Evidenza poll reale',
  'master.intelligence.apds.detail.vsiCorrelation': 'Correlazione VSI storica',
  'master.intelligence.apds.availability.AVAILABLE': 'Evidenza shadow disponibile',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Shadow APDS non attivo per questo ambito',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Nessuna decisione di riconciliazione catturata',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Storico persistito non disponibile',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Evidenza incompleta per questo ambito',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Non collegato a poll reale',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Collegato — log poll non verificato',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Collegato — successo registrato',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Collegato — stato senza successo',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Evidenza poll reale non disponibile',
  'master.intelligence.pdi.loading': 'Caricamento intelligence dispositivo…',
  'master.intelligence.pdi.error': 'Impossibile caricare l’intelligence PDI.',
  'master.intelligence.pdi.section.identity': 'Riepilogo identità',
  'master.intelligence.pdi.section.timeline': 'Timeline cronologica',
  'master.intelligence.pdi.section.episodes': 'Episodi di connessione',
  'master.intelligence.pdi.section.drift': 'Monitoraggio identità',
  'master.intelligence.pdi.section.bindings': 'Collegamenti provider',
  'master.intelligence.pdi.section.crossNav': 'Navigazione incrociata',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'Nessun ambito veicolo per questo dispositivo — i collegamenti non possono essere usati per la navigazione.',
  'master.intelligence.pdi.bindings.noneForScope': 'Nessun collegamento provider nella risposta attuale.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Veicolo e organizzazione per riga riflettono l’attribuzione identità corrente (CURRENT_VEHICLE_ONLY), non prova per collegamento.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Più collegamenti — selezionarne uno prima di aprire VSI, APDS o il veicolo.',
  'master.intelligence.pdi.bindings.staleSelection':
    'Il collegamento selezionato non è più nell’elenco. Scegliere un collegamento attuale.',
  'master.intelligence.pdi.bindings.linkStatus': 'Stato collegamento',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Attivo',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Inattivo',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Sconosciuto',
  'master.intelligence.pdi.bindings.vehicleScope': 'Veicolo (attribuzione)',
  'master.intelligence.pdi.bindings.orgScope': 'Organizzazione (attribuzione)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Attribuzione veicolo/org sconosciuta per questo ambito.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'L’organizzazione del dispositivo non corrisponde al contesto del pannello — link disabilitati.',
  'master.intelligence.pdi.bindings.navPending':
    'Selezionare un collegamento provider per abilitare la navigazione incrociata.',
  'master.intelligence.pdi.snapshotNotHistory': 'Inventario attuale e mirror live sono snapshot, non storico completo.',
  'master.intelligence.pdi.notApplicableR1': 'Monitoraggio R1 fisico non applicabile (es. Tesla solo software).',
  'master.intelligence.pdi.noDriftHistory': 'Nessuna cronologia drift persistita. Assenza record ≠ nessun drift.',
  'master.intelligence.pdi.episodeNotPoll': 'Episodi connessione = evidenza lifecycle persistita, non poll APDS.',
  'master.intelligence.pdi.noEpisodes': 'Nessun episodio per l’ambito veicolo corrente.',
  'master.intelligence.pdi.emptyTimeline': 'Nessuna voce timeline persistita.',
  'master.intelligence.pdi.evaluatedAt': 'Evidenza valutata',
  'master.intelligence.section.context': 'Contesto URL',
  'master.intelligence.section.crossLinks': 'Collegamenti incrociati',
  'master.intelligence.section.previewComponents': 'Anteprima presentazione (nessun dato live)',
  'master.intelligence.section.evidenceSemantics': 'Semantica delle prove',
  'master.intelligence.url.invalidParams': 'Parametri URL non validi ignorati: {{params}}',
  'master.intelligence.vsi.previewNote':
    'I badge mostrano solo la semantica delle etichette backend. Nessun dato di produzione in PR1.',
  'master.intelligence.vsi.empty.title': 'API di lettura non ancora collegate',
  'master.intelligence.vsi.empty.body':
    'PR2 caricherà profili segnale veicolo, storico revisioni e spiegazioni resolver via endpoint read-only.',
  'master.intelligence.apds.empty.title': 'API di lettura non ancora collegate',
  'master.intelligence.apds.empty.body':
    'PR3 caricherà decisioni shadow, epoche di attivazione e correlazione VSI. Le righe shadow non sono poll eseguiti.',
  'master.intelligence.crossLink.vehicle': 'Apri veicolo',
  'master.intelligence.crossLink.device': 'Apri inventario dispositivi',
  'master.intelligence.crossLink.vsi': 'Apri VSI',
  'master.intelligence.crossLink.apds': 'Apri APDS',
  'master.intelligence.crossLink.contextMissing':
    'Il link a {{target}} richiede più contesto nell’URL (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h osservato',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h osservato',
  'master.intelligence.badge.lv.UNKNOWN': 'LV sconosciuto',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Trasmissione standby osservata circa ogni 8 ore (non configurazione hardware confermata).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Trasmissione standby osservata circa ogni 24 ore (non configurazione hardware confermata).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Prove di trasmissione standby insufficienti o bloccate.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM alta frequenza (empirico)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirico)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM sconosciuto',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Profilo RPM ad alta frequenza classificato empiricamente. Non prova di campionamento nativo a 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Densità RPM standard classificata empiricamente.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Prove di cadenza RPM insufficienti per un’etichetta stabile.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profilo RPM ICE non applicabile (es. BEV). Non equivale a qualità segnale sconosciuta.',
  'master.intelligence.badge.limitation': 'Limitazione backend: {{code}}',
  'master.intelligence.confidence.HIGH': 'Confidenza: alta',
  'master.intelligence.confidence.MEDIUM': 'Confidenza: media',
  'master.intelligence.confidence.LOW': 'Confidenza: bassa',
  'master.intelligence.confidence.UNKNOWN': 'Confidenza: sconosciuta',
  'master.intelligence.density.SUB_ONE_HZ': 'Densità: sotto 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Densità: bucket 1 s non provati',
  'master.intelligence.density.IRREGULAR': 'Densità: irregolare',
  'master.intelligence.density.UNKNOWN': 'Densità: sconosciuta',
  'master.intelligence.density.NOT_APPLICABLE': 'Densità: non applicabile',
  'master.intelligence.evidence.title': 'Timestamp delle prove',
  'master.intelligence.evidence.evaluatedAt': 'Valutato il',
  'master.intelligence.evidence.providerSourceTimestamp': 'Ora sorgente provider',
  'master.intelligence.evidence.providerFetchedAt': 'Ora fetch provider',
  'master.intelligence.evidence.profileRevision': 'Revisione profilo',
  'master.intelligence.evidence.fetchNotSignalProof':
    'L’ora di fetch è ingest SynqDrive — non prova di un nuovo segnale provider.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Le decisioni shadow APDS descrivono riconciliazione simulata salvo ID poll reale collegato.',
  'master.intelligence.evidence.kind.observed': 'Tipo: prova provider osservata',
  'master.intelligence.evidence.kind.simulated_shadow': 'Tipo: valutazione simulata / shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Tipo: esecuzione poll reale verificata',
  'master.intelligence.evidence.kind.not_available': 'Tipo: non disponibile',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Tipo: prove insufficienti',
  'master.intelligence.evidence.kind.not_applicable': 'Tipo: non applicabile',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Tipo: valutazione bloccata',
  'master.intelligence.blocked.title': 'Valutazione bloccata',
  'master.intelligence.blocked.body':
    'Classificazione profilo in pausa ({{code}}). Un’etichetta precedente non deve essere mostrata come attuale.',

  'master.intelligence.section.fleetOverview': 'Ambito flotta e profili',
  'master.intelligence.section.signals': 'Dettaglio segnale',
  'master.intelligence.section.revisions': 'Cronologia revisioni profilo',
  'master.intelligence.section.capability': 'Capability resolver (sola lettura)',

  'master.intelligence.vsi.picker.org': 'Organizzazione',
  'master.intelligence.vsi.picker.vehicle': 'Veicolo',
  'master.intelligence.vsi.picker.link': 'Link sorgente provider',
  'master.intelligence.vsi.loading': 'Caricamento modelli VSI…',
  'master.intelligence.vsi.error': 'Impossibile caricare l’intelligence VSI.',
  'master.intelligence.vsi.retry': 'Riprova',

  'master.intelligence.vsi.empty.selectScope.title': 'Seleziona organizzazione e veicolo',
  'master.intelligence.vsi.empty.selectScope.body':
    'Scegli organizzazione e veicolo per caricare i profili VSI persistiti. L’ambito è validato lato server.',

  'master.intelligence.vsi.noProfiles.title': 'Nessun profilo VSI materializzato',
  'master.intelligence.vsi.noProfiles.body':
    'Non esiste ancora un profilo capability per questo veicolo. Non equivale a cronologia revisioni disabilitata.',

  'master.intelligence.vsi.decision.lv': 'Codice decisione LV: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'Codice decisione RPM: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Le etichette di cadenza descrivono pattern di trasmissione osservati, non la configurazione hardware nativa.',
  'master.intelligence.vsi.signals.canonical': 'Segnale canonico',
  'master.intelligence.vsi.signals.provider': 'Nome provider',
  'master.intelligence.vsi.signals.quality': 'Qualità / fiducia',
  'master.intelligence.vsi.signals.observedAt': 'Ultima osservazione (UTC + locale)',
  'master.intelligence.vsi.signals.limitations': 'Limitazioni',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Non applicabile (powertrain)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Mai osservato',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Osservato',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Osservato (obsoleto)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'Non osservato nella finestra',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Disponibilità RPM combinata (derivata)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Provato live (snapshot fresco)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Solo provato storicamente (cadence HF; snapshot non live)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Non provato',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Non applicabile (powertrain)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'Evidenza HF non attribuita a questo source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Il regime motore (RPM) usa due piani di evidenza separati. Lo stato snapshot proviene dall’ultimo bundle vehicle latest state; HF/cadenza dai punti ad alta frequenza mirrorati e dai viaggi finalizzati. Non sono intercambiabili.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Finestra di osservazione: ultimo bundle provider attribuito alla materializzazione del profilo (non storico HF).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadenza (finestre viaggio)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Finestra di osservazione: arricchimento cadenza HF legato al link (fino a 14 giorni di viaggi finalizzati).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Osservazione empirica',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Freschezza',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Ultima osservazione valida',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Qualità / confidenza',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Provenienza',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Conteggio campioni HF',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Profilo RPM attivo',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profilo valutato il',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Viaggi finalizzati nella finestra cadenza',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Decisione di classificazione',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Classificazioni viaggio di supporto',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'La classificazione cadenza RPM non si applica a questo powertrain (es. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Nessuna evidenza HF cadenza nel profilo persistito (cadenceIntelligence assente o vuoto).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadenza',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profilo {{profile}} · {{samples}} campioni HF (vedi pannello)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Vedi pannello sotto',

  'master.intelligence.vsi.revision.loading': 'Caricamento cronologia revisioni…',
  'master.intelligence.vsi.revision.loadError': 'Impossibile caricare la cronologia delle revisioni.',
  'master.intelligence.vsi.revision.retry': 'Riprova cronologia revisioni',
  'master.intelligence.vsi.revision.notCaptured': 'Cronologia: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'La cattura P5-H1 è disabilitata. La mancanza di cronologia non significa assenza di modifiche al profilo.',
  'master.intelligence.vsi.revision.moreAvailable': 'Altre revisioni — paginazione a cursore via API.',

  'master.intelligence.vsi.asOf.title': 'Risoluzione revisione as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Ora decisione',
  'master.intelligence.vsi.asOf.authority': 'Autorita',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Riepiloghi in sola lettura dalle API VSI, APDS e PDI. Le etichette riflettono evidenze osservate o persistite — non prova hardware.',
  'master.intelligence.vehicleDetail.loading': 'Caricamento riepiloghi intelligence…',
  'master.intelligence.vehicleDetail.error': 'Impossibile caricare i riepiloghi intelligence per questo veicolo.',
  'master.intelligence.vehicleDetail.openVsi': 'Apri dettaglio VSI',
  'master.intelligence.vehicleDetail.openVsiOverview': 'Apri panoramica VSI',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Apri registro evidenze',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Apri RPM motore nel registro evidenze',
  'master.intelligence.vehicleDetail.openApds': 'Apri dettaglio APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Apri dettaglio dispositivo',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Nessuna decisione persistita nell’ambito.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Nessun singolo dispositivo fisico installato attribuito a questo veicolo.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Più link sorgente provider — selezionare un link prima della navigazione VSI/APDS.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Link sorgente provider',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Scegli il link provider persistito. Riepiloghi e navigazione valgono solo per il link selezionato.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'La selezione precedente non corrisponde più a questo veicolo. Scegli di nuovo un link.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Seleziona un link sorgente per abilitare la navigazione intelligence su questo veicolo.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'Seleziona un link sorgente per vedere i riepiloghi LV/RPM.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Seleziona un link sorgente per caricare il riepilogo APDS per quel link.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'Il dettaglio segnale RPM motore non si applica a questo profilo (applicabilità VSI persistita).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'Dettaglio RPM non disponibile finché VSI non segnala evidenza RPM applicabile per questo link.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Dettaglio RPM non disponibile mentre la valutazione del profilo è bloccata.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'Il dettaglio RPM richiede un link sorgente provider selezionato.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'Apre registro e dettaglio segnale per revisione. L’applicabilità non è prova RPM combinata (live o storica)—il dettaglio VSI resta guidato dalle evidenze.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Dimensioni di evidenza indipendenti',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Applicabilità',
  'master.intelligence.vsi.ledger.dimension.declared': 'Supporto dichiarato',
  'master.intelligence.vsi.ledger.dimension.observation': 'Osservazione',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Attualità',
  'master.intelligence.vsi.ledger.dimension.quality': 'Qualità',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Confidenza',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Evidenza RPM combinata',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Applicabile',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'Non applicabile',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Sconosciuto',

  'master.intelligence.vsi.ledger.declared.LISTED': 'In catalogo',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'Non in catalogo',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Sconosciuto',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Attuale',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Obsoleto',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Sconosciuto',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Mai osservato (asse qualità)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Sconosciuto (asse qualità)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Obsoleto (meta qualità)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Provenienza snapshot (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Provenienza cadence (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'Nessuna voce',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Tag evidenza snapshot',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Tag evidenza cadence',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'Nessuna voce di glossario per questo codice — vale l’output grezzo del classificatore.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'Esistono campioni HF ma non possono essere attribuiti a questo link sorgente; prova storica trattenuta.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'La lane snapshot non prova la cadence HF; cadence valutata separatamente.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'Un viaggio aperto blocca la classificazione standby LV per questa revisione profilo.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Più link sorgente attivi rendono ambiguo il catalogo dichiarato.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'L’ultimo stato veicolo non è stato attribuito a questo link sorgente.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'Identità provider non allineata al catalogo (solo DIMO).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Ultima osservazione valida',
  'master.intelligence.vsi.ledger.timestamp.source': 'Timestamp sorgente',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Fetch provider',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'L’ora di fetch provider non prova una nuova misura sensore.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Segnale precedente',
  'master.intelligence.vsi.ledger.sheet.next': 'Segnale successivo',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Affermazioni compatibili: lo snapshot live non ha mai riportato RPM mentre esistono evidenze HF storiche.',

  'master.intelligence.vsi.tabs.ariaLabel': 'Sezioni intelligence VSI',
  'master.intelligence.vsi.tabs.overview': 'Panoramica',
  'master.intelligence.vsi.tabs.ledger': 'Registro segnali',
  'master.intelligence.vsi.tabs.revisions': 'Revisioni',
  'master.intelligence.vsi.ledger.filters.search': 'Cerca segnali',
  'master.intelligence.vsi.ledger.filters.clear': 'Cancella filtri',
  'master.intelligence.vsi.ledger.filters.group': 'Filtri registro',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Con limitazioni',
  'master.intelligence.vsi.ledger.filters.hasHf': 'HF attribuibile',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Nascondi non applicabile',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{shown}} di {{total}} segnali',
  'master.intelligence.vsi.ledger.col.signal': 'Segnale',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Qualità / confidenza',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Ultima osservazione valida',
  'master.intelligence.vsi.ledger.col.limitations': 'Limitazioni',
  'master.intelligence.vsi.ledger.col.provenance': 'Evidenza',
  'master.intelligence.vsi.ledger.col.action': 'Apri dettaglio',
  'master.intelligence.vsi.ledger.table.caption': 'Registro evidenze segnali veicolo',
  'master.intelligence.vsi.ledger.selectSignal': 'Seleziona segnale {{signal}}',
  'master.intelligence.vsi.ledger.emptyFiltered': 'Nessun segnale corrisponde ai filtri.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} link sorgente — l’evidenza vale solo per il link selezionato.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} segnali · revisione profilo {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Riepilogo evidenze',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Timeline evidenze',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Percorsi di provenienza',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'Dettaglio evidenza RPM',
  'master.intelligence.vsi.ledger.detail.section.lv': 'Dettaglio cadenza LV',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Limitazioni',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Profilo valutato il',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Veicolo',
  'master.intelligence.vsi.ledger.detail.context.link': 'Link sorgente',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Revisione profilo {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'Profilo standby LV',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Decisione di classificazione',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Confidenza evidenza',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Campioni osservati',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'Nessuna intelligence cadenza LV per questo segnale.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Regimi di cadenza disponibili',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Risoluzione tier',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Etichetta densità osservata',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Attribuzione e limiti del link',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Altre limitazioni',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'Il segnale selezionato è nascosto dai filtri. Modifica i filtri o cancella la selezione.',

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
