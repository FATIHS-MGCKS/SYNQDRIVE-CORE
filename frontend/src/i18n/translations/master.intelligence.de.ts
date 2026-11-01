export const masterIntelligenceDe = {
  'master.nav.vsiIntelligence': 'VSI – Signal Intelligence',
  'master.nav.apdsIntelligence': 'APDS – Adaptives Polling',

  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',

  'master.intelligence.vsi.title': 'VSI – Signal Intelligence',
  'master.intelligence.vsi.description':
    'Schreibgeschützte Fahrzeug-Signalprofile, beobachtete Übertragungs-Cadence, Revisionshistorie (falls erfasst) und Capability-Resolver-Erklärungen aus Produktionsdaten.',
  'master.intelligence.apds.title': 'APDS – Adaptives Polling',
  'master.intelligence.apds.description':
    'Schreibgeschützte Shadow-Abgleichsentscheidungen, Epochenhistorie, echte Poll-Evidenz (wenn verknüpft) und historische VSI-Korrelation. Simulierte Next-Poll-Zeiten sind keine ausgeführten Polls.',

  'master.intelligence.apds.loading': 'APDS-Lesemodelle werden geladen…',
  'master.intelligence.apds.error': 'APDS-Intelligence konnte nicht geladen werden.',
  'master.intelligence.apds.latestDecision': 'Letzte persistierte Entscheidung',
  'master.intelligence.apds.activeEpoch': 'Aktive Epoche',
  'master.intelligence.apds.decisionsForVehicle': 'Entscheidungen für dieses Fahrzeug in der Epoche',
  'master.intelligence.apds.shadowNotReal':
    'Shadow-Empfehlungen und simulierte Next-Poll-Zeitstempel sind kein Nachweis für einen geplanten oder ausgeführten echten Poll.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historische VSI-Korrelation ist Forschungsevidenz — sie hat diese APDS-Entscheidung zur Laufzeit nicht zwingend bestimmt.',
  'master.intelligence.apds.openVsiAsOf': 'VSI mit Entscheidungs-as-of-Zeit öffnen',
  'master.intelligence.apds.empty.selectScope.title': 'Organisation und Fahrzeug wählen',
  'master.intelligence.apds.empty.selectScope.body':
    'Scope wählen, um persistierte Shadow-Entscheidungen und Epochen zu laden. Provider-Quell-Link ermöglicht VSI-Korrelation; Scope wird serverseitig geprüft.',
  'master.intelligence.apds.section.epochs': 'Aktivierungs-Epochen-Timeline',
  'master.intelligence.apds.section.decisions': 'Entscheidungs-Explorer',
  'master.intelligence.apds.section.detail': 'Entscheidungsdetail',
  'master.intelligence.apds.col.time': 'Entscheidungszeit',
  'master.intelligence.apds.col.reason': 'Grund',
  'master.intelligence.apds.col.policy': 'Policy',
  'master.intelligence.apds.col.realPoll': 'Echter Poll-Link',
  'master.intelligence.apds.detail.shadow': 'Shadow-Empfehlung (persistierte Outputs)',
  'master.intelligence.apds.detail.realPoll': 'Echte Poll-Evidenz',
  'master.intelligence.apds.detail.vsiCorrelation': 'Historische VSI-Korrelation',
  'master.intelligence.apds.availability.AVAILABLE': 'Shadow-Evidenz verfügbar',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'APDS-Shadow für diesen Scope nicht aktiviert',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Keine Abgleichsentscheidungen erfasst',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Persistierte Historie nicht verfügbar',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Evidenz für diesen Scope unvollständig',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Nicht mit echtem Poll verknüpft',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Verknüpft — Poll-Log nicht verifiziert',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Verknüpft — Erfolg erfasst',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Verknüpft — Status ohne Erfolg',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Echte Poll-Evidenz nicht verfügbar',

  'master.intelligence.pdi.loading': 'Geräte-Intelligence wird geladen…',
  'master.intelligence.pdi.error': 'PDI-Geräte-Intelligence konnte nicht geladen werden.',
  'master.intelligence.pdi.section.identity': 'Identitätsübersicht',
  'master.intelligence.pdi.section.timeline': 'Chronologische Timeline',
  'master.intelligence.pdi.section.episodes': 'Verbindungs-Episoden',
  'master.intelligence.pdi.section.drift': 'Identitäts-Monitoring',
  'master.intelligence.pdi.section.bindings': 'Provider-Bindings',
  'master.intelligence.pdi.section.crossNav': 'Quernavigation',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'Kein Fahrzeug-Scope für dieses Gerät — Provider-Bindings können nicht für Navigation eingegrenzt werden.',
  'master.intelligence.pdi.bindings.noneForScope': 'Keine Provider-Bindings in der aktuellen Antwort.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Fahrzeug und Organisation je Zeile spiegeln die aktuelle Identitäts-Zuordnung (CURRENT_VEHICLE_ONLY), keinen Nachweis pro Binding.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Mehrere Provider-Bindings — wählen Sie eines, bevor Sie VSI-, APDS- oder Fahrzeug-Links öffnen.',
  'master.intelligence.pdi.bindings.staleSelection':
    'Das gewählte Provider-Binding ist nicht mehr in der Liste. Bitte aktuelles Binding wählen.',
  'master.intelligence.pdi.bindings.linkStatus': 'Link-Status',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Aktiv',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Inaktiv',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Unbekannt',
  'master.intelligence.pdi.bindings.vehicleScope': 'Fahrzeug (Zuordnung)',
  'master.intelligence.pdi.bindings.orgScope': 'Organisation (Zuordnung)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Fahrzeug-/Org-Zuordnung für diesen Scope unbekannt.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'Geräte-Organisation passt nicht zum Panel-Kontext — Querverweise deaktiviert.',
  'master.intelligence.pdi.bindings.navPending':
    'Provider-Binding wählen, um Quernavigation zu aktivieren.',
  'master.intelligence.pdi.snapshotNotHistory':
    'Aktueller Bestand und Live-Spiegel sind Momentaufnahmen — keine vollständige Historie.',
  'master.intelligence.pdi.notApplicableR1':
    'Physisches Ruptela-R1-Monitoring gilt nicht (z. B. reine Software/Tesla-Integration).',
  'master.intelligence.pdi.noDriftHistory':
    'Keine persistierte Drift-Ereignishistorie. Fehlende Einträge beweisen kein „kein Drift“.',
  'master.intelligence.pdi.episodeNotPoll':
    'Verbindungs-Episoden sind persistierte Lifecycle-Evidenz — keine APDS-Poll-Ausführung.',
  'master.intelligence.pdi.noEpisodes': 'Keine Episoden für den aktuellen Fahrzeug-Scope.',
  'master.intelligence.pdi.emptyTimeline': 'Keine Timeline-Einträge in persistierter Historie.',
  'master.intelligence.pdi.evaluatedAt': 'Evidenz bewertet',

  'master.intelligence.section.context': 'URL-Kontext',
  'master.intelligence.section.crossLinks': 'Querverweise',
  'master.intelligence.section.previewComponents': 'Darstellungsvorschau (keine Live-Daten)',
  'master.intelligence.section.evidenceSemantics': 'Evidenz-Bedeutung',

  'master.intelligence.url.invalidParams': 'Ungültige URL-Parameter ignoriert: {{params}}',

  'master.intelligence.vsi.previewNote':
    'Die Badges zeigen nur die Bedeutung der Backend-Labels. In PR1 werden keine Produktionsdaten geladen.',
  'master.intelligence.vsi.empty.title': 'Lese-APIs noch nicht angebunden',
  'master.intelligence.vsi.empty.body':
    'PR2 lädt Fahrzeug-Signalprofile, Revisionshistorie (falls erfasst) und Capability-Resolver-Erklärungen über schreibgeschützte Backend-Endpunkte.',

  'master.intelligence.apds.empty.title': 'Lese-APIs noch nicht angebunden',
  'master.intelligence.apds.empty.body':
    'PR3 lädt Shadow-Entscheidungen, Aktivierungs-Epochen und VSI-Korrelation. Shadow-Zeilen werden nie als ausgeführte Polls dargestellt.',

  'master.intelligence.crossLink.vehicle': 'Fahrzeug öffnen',
  'master.intelligence.crossLink.device': 'Geräte-Inventar öffnen',
  'master.intelligence.crossLink.vsi': 'VSI öffnen',
  'master.intelligence.crossLink.apds': 'APDS öffnen',
  'master.intelligence.crossLink.contextMissing':
    'Link zu {{target}} benötigt mehr Kontext in der URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8h beobachtet',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24h beobachtet',
  'master.intelligence.badge.lv.UNKNOWN': 'LV unbekannt',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Beobachtete Standby-Übertragung mit etwa 8 Stunden Abstand (keine bestätigte Hardware-Konfiguration).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Beobachtete Standby-Übertragung mit etwa 24 Stunden Abstand (keine bestätigte Hardware-Konfiguration).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Unzureichende oder blockierte Standby-Übertragungs-Evidenz.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM hochfrequent (empirisch)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirisch)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM unbekannt',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empirisch als hochfrequentes RPM-Profil eingestuft. Kein Nachweis nativer 1-Hz-Abtastung am Gerät.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Empirisch als Standard-RPM-Beobachtungsdichte eingestuft.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Unzureichende RPM-Cadence-Evidenz für ein stabiles Label.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE-RPM-Profil nicht anwendbar (z. B. BEV). Das ist nicht dasselbe wie unbekannte Signalqualität.',

  'master.intelligence.badge.limitation': 'Backend-Einschränkung: {{code}}',

  'master.intelligence.confidence.HIGH': 'Vertrauen: hoch',
  'master.intelligence.confidence.MEDIUM': 'Vertrauen: mittel',
  'master.intelligence.confidence.LOW': 'Vertrauen: niedrig',
  'master.intelligence.confidence.UNKNOWN': 'Vertrauen: unbekannt',

  'master.intelligence.density.SUB_ONE_HZ': 'Dichte: unter 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Dichte: 1-Sek.-Buckets unbewiesen',
  'master.intelligence.density.IRREGULAR': 'Dichte: unregelmäßig',
  'master.intelligence.density.UNKNOWN': 'Dichte: unbekannt',
  'master.intelligence.density.NOT_APPLICABLE': 'Dichte: nicht anwendbar',

  'master.intelligence.evidence.title': 'Evidenz-Zeitstempel',
  'master.intelligence.evidence.evaluatedAt': 'Ausgewertet am',
  'master.intelligence.evidence.providerSourceTimestamp': 'Provider-Quellzeit',
  'master.intelligence.evidence.providerFetchedAt': 'Provider-Abrufzeit',
  'master.intelligence.evidence.profileRevision': 'Profil-Revision',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Abrufzeit ist SynqDrive-Ingest — kein Beweis für ein neues Providersignal.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS-Shadow-Entscheidungen sind simulierte Abgleichsergebnisse, sofern keine echte Poll-ID verknüpft ist.',

  'master.intelligence.evidence.kind.observed': 'Art: beobachtete Provider-Evidenz',
  'master.intelligence.evidence.kind.simulated_shadow': 'Art: simulierte Shadow-Auswertung',
  'master.intelligence.evidence.kind.verified_real_execution': 'Art: verifizierte echte Poll-Ausführung',
  'master.intelligence.evidence.kind.not_available': 'Art: nicht verfügbar',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Art: unzureichende Evidenz',
  'master.intelligence.evidence.kind.not_applicable': 'Art: nicht anwendbar',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Art: Auswertung blockiert',

  'master.intelligence.blocked.title': 'Auswertung blockiert',
  'master.intelligence.blocked.body':
    'Profil-Klassifikation pausiert ({{code}}). Ein älteres Label darf nicht als aktuell angezeigt werden.',

  'master.intelligence.section.fleetOverview': 'Flottenkontext & Profile',
  'master.intelligence.section.signals': 'Signal-Detail',
  'master.intelligence.section.revisions': 'Profil-Revisionshistorie',
  'master.intelligence.section.capability': 'Capability-Resolver (nur Lesen)',

  'master.intelligence.vsi.picker.org': 'Organisation',
  'master.intelligence.vsi.picker.vehicle': 'Fahrzeug',
  'master.intelligence.vsi.picker.link': 'Provider-Quell-Link',
  'master.intelligence.vsi.loading': 'VSI-Lesemodelle werden geladen…',
  'master.intelligence.vsi.error': 'VSI-Intelligence konnte nicht geladen werden.',
  'master.intelligence.vsi.retry': 'Erneut versuchen',

  'master.intelligence.vsi.empty.selectScope.title': 'Organisation und Fahrzeug wählen',
  'master.intelligence.vsi.empty.selectScope.body':
    'Wählen Sie Organisation und Fahrzeug, um persistierte VSI-Signalprofile zu laden. Der Scope wird serverseitig geprüft — kein mandantenübergreifender Zugriff.',

  'master.intelligence.vsi.noProfiles.title': 'Keine VSI-Profile materialisiert',
  'master.intelligence.vsi.noProfiles.body':
    'Für dieses Fahrzeug existiert noch kein Signal-Capability-Profil. Das ist nicht dasselbe wie deaktivierte Revisionshistorie.',

  'master.intelligence.vsi.decision.lv': 'LV-Entscheidungscode: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM-Entscheidungscode: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Cadence-Labels beschreiben beobachtete Übertragungsmuster, keine bestätigte Hardware-Konfiguration.',
  'master.intelligence.vsi.signals.canonical': 'Kanonisches Signal',
  'master.intelligence.vsi.signals.provider': 'Provider-Name',
  'master.intelligence.vsi.signals.quality': 'Qualität / Vertrauen',
  'master.intelligence.vsi.signals.observedAt': 'Letzte Beobachtung (UTC + lokal)',
  'master.intelligence.vsi.signals.limitations': 'Einschränkungen',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Nicht anwendbar (Antrieb)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nie beobachtet',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Beobachtet',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Beobachtet (veraltet)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'Im Fenster nicht beobachtet',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Kombinierte RPM-Verfügbarkeit (abgeleitet)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Live nachgewiesen (frischer Snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Nur historisch nachgewiesen (HF-Kadenz; Snapshot nicht live)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Nicht nachgewiesen',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Nicht anwendbar (Antrieb)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'HF-Evidenz diesem Source-Link nicht zugeordnet',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Motordrehzahl (RPM) nutzt zwei getrennte Evidenz-Ebenen. Der Snapshot-Status stammt aus dem neuesten Vehicle-Latest-State-Bundle; HF/Kadenz aus gespiegelten Hochfrequenzpunkten und abgeschlossenen Fahrten. Sie sind nicht austauschbar.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (Vehicle Latest State)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Beobachtungsfenster: jüngstes zugeordnetes Provider-Bundle bei Profil-Materialisierung (keine HF-Historie).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / Kadenz (Fahrtfenster)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Beobachtungsfenster: linkbezogene HF-Kadenz-Anreicherung (typisch bis zu 14 Tage abgeschlossener Fahrten).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Empirische Beobachtung',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Aktualität',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Letzte gültige Beobachtung',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Qualität / Konfidenz',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Herkunft',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'HF-Stichprobenanzahl',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Aktives RPM-Profil',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profil ausgewertet am',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Abgeschlossene Fahrten im Kadenzfenster',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Klassifikationsentscheidung',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Unterstützende Fahrt-Klassifikationen',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'RPM-Kadenz-Klassifikation ist für diesen Antrieb nicht anwendbar (z. B. batterieelektrisch).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Keine HF-Kadenz-Evidenz im persistierten Profil (cadenceIntelligence fehlt oder leer).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/Kadenz',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profil {{profile}} · {{samples}} HF-Stichproben (siehe Panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Dual-Panel unten',

  'master.intelligence.vsi.revision.loading': 'Revisionshistorie wird geladen…',
  'master.intelligence.vsi.revision.loadError': 'Revisionshistorie konnte nicht geladen werden.',
  'master.intelligence.vsi.revision.retry': 'Revisionshistorie erneut laden',
  'master.intelligence.vsi.revision.notCaptured': 'Revisionshistorie: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1-Revisionserfassung ist in dieser Umgebung deaktiviert. Fehlende Historie bedeutet nicht, dass sich das Profil nie geändert hat.',
  'master.intelligence.vsi.revision.moreAvailable':
    'Weitere Revisionen verfügbar — Cursor-Pagination über die API.',

  'master.intelligence.vsi.asOf.title': 'As-of-Revisionsauflösung',
  'master.intelligence.vsi.asOf.decisionAt': 'Entscheidungszeit',
  'master.intelligence.vsi.asOf.authority': 'Autorität',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Schreibgeschützte Zusammenfassungen aus VSI-, APDS- und PDI-APIs. Labels beschreiben beobachtete oder persistierte Evidenz — kein Hardware-Nachweis.',
  'master.intelligence.vehicleDetail.loading': 'Intelligence-Zusammenfassungen werden geladen…',
  'master.intelligence.vehicleDetail.error': 'Intelligence-Zusammenfassungen für dieses Fahrzeug konnten nicht geladen werden.',
  'master.intelligence.vehicleDetail.openVsi': 'VSI-Detail öffnen',
  'master.intelligence.vehicleDetail.openVsiOverview': 'VSI-Übersicht öffnen',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Evidenz-Ledger öffnen',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Motor-RPM im Evidenz-Ledger öffnen',
  'master.intelligence.vehicleDetail.openApds': 'APDS-Detail öffnen',
  'master.intelligence.vehicleDetail.openPdi': 'Gerätedetail öffnen',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Keine persistierte Entscheidung im Scope.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Kein eindeutig installiertes physisches Gerät diesem Fahrzeug zugeordnet.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Mehrere Provider-Source-Links — vor Navigation VSI/APDS einen Link auswählen.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Provider-Source-Link',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Persistierten Provider-Link wählen. Zusammenfassungen und Navigation gelten nur für den gewählten Link.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'Die frühere Auswahl passt nicht mehr zu diesem Fahrzeug. Link erneut wählen.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Provider-Source-Link wählen, um die Intelligence-Navigation für dieses Fahrzeug zu aktivieren.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'Provider-Source-Link wählen, um LV/RPM-Zusammenfassungen anzuzeigen.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Provider-Source-Link wählen, um die APDS-Zusammenfassung für diesen Link zu laden.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'Motor-RPM-Detail ist für dieses Profil nicht anwendbar (persistierte VSI-Anwendbarkeit).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'Motor-RPM-Detail erst verfügbar, wenn VSI anwendbare RPM-Evidenz für diesen Link meldet.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Motor-RPM-Detail nicht verfügbar, solange die Profilauswertung blockiert ist.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'Motor-RPM-Detail erfordert einen gewählten Provider-Source-Link.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'Öffnet Ledger und Signaldetail zur Prüfung. Anwendbarkeit ist hier kein kombinierter RPM-Nachweis (live oder historisch)—VSI-Detail bleibt evidenzbasiert.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Unabhängige Evidenzdimensionen',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Anwendbarkeit',
  'master.intelligence.vsi.ledger.dimension.declared': 'Deklarierte Unterstützung',
  'master.intelligence.vsi.ledger.dimension.observation': 'Beobachtung',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Aktualität',
  'master.intelligence.vsi.ledger.dimension.quality': 'Qualität',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Konfidenz',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Kombinierte RPM-Evidenz',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Anwendbar',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'Nicht anwendbar',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Unbekannt',

  'master.intelligence.vsi.ledger.declared.LISTED': 'Im Katalog gelistet',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'Nicht gelistet',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Unbekannt',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Aktuell',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Veraltet',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Unbekannt',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Nie beobachtet (Qualitätsachse)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Unbekannt (Qualitätsachse)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Veraltet (Meta-Qualität)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Snapshot-Provenienz (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Cadence-Provenienz (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'Keine Einträge',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Snapshot-Evidenz-Tags',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Cadence-Evidenz-Tags',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'Kein Glossareintrag für diesen Limitierungscode — Rohausgabe des Klassifikators maßgeblich.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'HF-Stichproben existieren, können aber diesem Source-Link nicht zugeordnet werden; historischer Nachweis entfällt.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'Snapshot-Lane belegt keine HF-Cadence; Cadence wird separat bewertet.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'Eine offene Fahrt blockiert die LV-Standby-Klassifikation für diese Profilrevision.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Mehrere aktive Source-Links machen die Katalog-Zuordnung mehrdeutig.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'Letzter Fahrzeugstatus konnte diesem Source-Link nicht zugeordnet werden.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'Provider-Identität entspricht nicht den Katalogerwartungen (nur DIMO).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Letzte gültige Beobachtung',
  'master.intelligence.vsi.ledger.timestamp.source': 'Quell-Zeitstempel',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Provider-Abruf',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'Provider-Abrufzeit belegt keine neue Sensormessung.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Vorheriges Signal',
  'master.intelligence.vsi.ledger.sheet.next': 'Nächstes Signal',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Kompatible Aussagen: Live-Snapshot trug nie RPM, während historische HF-Fahrt-Evidenz existiert.',

  'master.intelligence.vsi.tabs.ariaLabel': 'VSI-Intelligence-Bereiche',
  'master.intelligence.vsi.tabs.overview': 'Übersicht',
  'master.intelligence.vsi.tabs.ledger': 'Signal-Ledger',
  'master.intelligence.vsi.tabs.revisions': 'Revisionen',

  'master.intelligence.vsi.ledger.filters.search': 'Signale suchen',
  'master.intelligence.vsi.ledger.filters.clear': 'Filter zurücksetzen',
  'master.intelligence.vsi.ledger.filters.group': 'Ledger-Filter',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Mit Limitierungen',
  'master.intelligence.vsi.ledger.filters.hasHf': 'Mit zuordenbarem HF',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Nicht anwendbare ausblenden',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{shown}} von {{total}} Signalen',

  'master.intelligence.vsi.ledger.col.signal': 'Signal',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Qualität / Konfidenz',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Letzte gültige Beobachtung',
  'master.intelligence.vsi.ledger.col.limitations': 'Limitierungen',
  'master.intelligence.vsi.ledger.col.provenance': 'Evidenz',
  'master.intelligence.vsi.ledger.col.action': 'Detail öffnen',

  'master.intelligence.vsi.ledger.table.caption': 'Fahrzeug-Signal-Evidenz-Ledger',
  'master.intelligence.vsi.ledger.selectSignal': 'Signal {{signal}} auswählen',
  'master.intelligence.vsi.ledger.emptyFiltered': 'Keine Signale entsprechen den Filtern.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} Provider-Source-Links — Evidenz gilt nur für den gewählten Link.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} Signale · Profilrevision {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Evidenz-Zusammenfassung',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Evidenz-Zeitachse',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Provenienz-Spuren',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'RPM-Evidenzdetail',
  'master.intelligence.vsi.ledger.detail.section.lv': 'LV-Cadence-Detail',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Limitierungen',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Profil ausgewertet am',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Fahrzeug',
  'master.intelligence.vsi.ledger.detail.context.link': 'Source-Link',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Profilrevision {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'LV-Standby-Profil',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Klassifikationsentscheidung',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Evidenz-Konfidenz',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Beobachtete Stichproben',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'Keine LV-Cadence-Intelligence für dieses Signal.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Verfügbare Cadence-Regime',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Tier-Auflösung',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Beobachtete Dichte',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Attribution und Source-Link-Grenzen',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Weitere Limitierungen',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'Ausgewähltes Signal ist durch Filter ausgeblendet. Filter anpassen oder Auswahl löschen.',

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
