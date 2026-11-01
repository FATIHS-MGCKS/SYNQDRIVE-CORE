export const masterIntelligenceFr = {
  'master.nav.vsiIntelligence': 'VSI – intelligence signal',
  'master.nav.apdsIntelligence': 'APDS – polling adaptatif',

  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',

  'master.intelligence.vsi.title': 'VSI – intelligence signal',
  'master.intelligence.vsi.description':
    'Profils de signaux véhicule en lecture seule, cadence observée, historique si capturé et explications capability resolver (données production).',
  'master.intelligence.apds.title': 'APDS – polling adaptatif',
  'master.intelligence.apds.description':
    'Décisions shadow de réconciliation en lecture seule, historique d’époques, preuves de poll réel si liées et corrélation VSI historique. Les prochains polls simulés ne sont pas des polls exécutés.',

  'master.intelligence.apds.loading': 'Chargement des modèles de lecture APDS…',
  'master.intelligence.apds.error': 'Impossible de charger l’intelligence APDS.',
  'master.intelligence.apds.latestDecision': 'Dernière décision persistée',
  'master.intelligence.apds.activeEpoch': 'Époque active',
  'master.intelligence.apds.decisionsForVehicle': 'décisions pour ce véhicule dans l’époque',
  'master.intelligence.apds.shadowNotReal':
    'Les recommandations shadow et les horodatages de prochain poll simulé ne prouvent pas un poll réel planifié ou exécuté.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'La corrélation VSI historique est une preuve de recherche — elle n’a pas nécessairement piloté cette décision APDS à l’exécution.',
  'master.intelligence.apds.openVsiAsOf': 'Ouvrir VSI avec l’heure as-of de la décision',
  'master.intelligence.apds.empty.selectScope.title': 'Choisir organisation et véhicule',
  'master.intelligence.apds.empty.selectScope.body':
    'Choisir le périmètre pour charger décisions shadow et époques persistées. Le lien source provider active la corrélation VSI ; périmètre validé côté serveur.',
  'master.intelligence.apds.section.epochs': 'Chronologie des époques d’activation',
  'master.intelligence.apds.section.decisions': 'Explorateur de décisions',
  'master.intelligence.apds.section.detail': 'Détail de la décision',
  'master.intelligence.apds.col.time': 'Heure de décision',
  'master.intelligence.apds.col.reason': 'Motif',
  'master.intelligence.apds.col.policy': 'Politique',
  'master.intelligence.apds.col.realPoll': 'Lien poll réel',
  'master.intelligence.apds.detail.shadow': 'Recommandation shadow (sorties persistées)',
  'master.intelligence.apds.detail.realPoll': 'Preuve de poll réel',
  'master.intelligence.apds.detail.vsiCorrelation': 'Corrélation VSI historique',
  'master.intelligence.apds.availability.AVAILABLE': 'Preuves shadow disponibles',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Shadow APDS non activé pour ce périmètre',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Aucune décision de réconciliation enregistrée',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Historique persisté indisponible',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Preuves incomplètes pour ce périmètre',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Non lié à un poll réel',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Lié — journal de poll non vérifié',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Lié — succès enregistré',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Lié — statut sans succès',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Preuve de poll réel indisponible',

  'master.intelligence.pdi.loading': 'Chargement de l’intelligence appareil…',
  'master.intelligence.pdi.error': 'Impossible de charger l’intelligence PDI.',
  'master.intelligence.pdi.section.identity': 'Résumé d’identité',
  'master.intelligence.pdi.section.timeline': 'Chronologie',
  'master.intelligence.pdi.section.episodes': 'Épisodes de connexion',
  'master.intelligence.pdi.section.drift': 'Surveillance d’identité',
  'master.intelligence.pdi.section.bindings': 'Liaisons fournisseur',
  'master.intelligence.pdi.section.crossNav': 'Navigation croisée',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'Aucun périmètre véhicule pour cet appareil — les liaisons ne peuvent pas être utilisées pour la navigation.',
  'master.intelligence.pdi.bindings.noneForScope': 'Aucune liaison fournisseur dans la réponse actuelle.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Véhicule et organisation par ligne reflètent l’attribution d’identité actuelle (CURRENT_VEHICLE_ONLY), pas une preuve par liaison.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Plusieurs liaisons — sélectionnez-en une avant d’ouvrir VSI, APDS ou le véhicule.',
  'master.intelligence.pdi.bindings.staleSelection':
    'La liaison sélectionnée n’est plus dans la liste. Choisissez une liaison actuelle.',
  'master.intelligence.pdi.bindings.linkStatus': 'Statut de liaison',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Active',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Inactive',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Inconnu',
  'master.intelligence.pdi.bindings.vehicleScope': 'Véhicule (attribution)',
  'master.intelligence.pdi.bindings.orgScope': 'Organisation (attribution)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Attribution véhicule/org inconnue pour ce périmètre.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'L’organisation de l’appareil ne correspond pas au contexte du panneau — liens désactivés.',
  'master.intelligence.pdi.bindings.navPending':
    'Sélectionnez une liaison fournisseur pour activer la navigation croisée.',
  'master.intelligence.pdi.snapshotNotHistory':
    'Inventaire actuel et miroir live = instantanés, pas un historique complet.',
  'master.intelligence.pdi.notApplicableR1':
    'Monitoring R1 physique non applicable (ex. intégration Tesla logicielle).',
  'master.intelligence.pdi.noDriftHistory':
    'Pas d’historique d’événements drift persisté. L’absence d’enregistrements ne prouve pas l’absence de drift.',
  'master.intelligence.pdi.episodeNotPoll':
    'Les épisodes de connexion sont une preuve lifecycle persistée — pas une exécution de poll APDS.',
  'master.intelligence.pdi.noEpisodes': 'Aucun épisode pour le périmètre véhicule actuel.',
  'master.intelligence.pdi.emptyTimeline': 'Aucune entrée de chronologie persistée.',
  'master.intelligence.pdi.evaluatedAt': 'Preuve évaluée',

  'master.intelligence.section.context': 'Contexte URL',
  'master.intelligence.section.crossLinks': 'Liens croisés',
  'master.intelligence.section.previewComponents': 'Aperçu de présentation (pas de données live)',
  'master.intelligence.section.evidenceSemantics': 'Sémantique des preuves',

  'master.intelligence.url.invalidParams': 'Paramètres URL invalides ignorés : {{params}}',

  'master.intelligence.vsi.previewNote':
    'Les badges illustrent uniquement la sémantique des libellés backend. Aucune donnée production en PR1.',
  'master.intelligence.vsi.empty.title': 'API de lecture non connectées',
  'master.intelligence.vsi.empty.body':
    'PR2 chargera les profils signal véhicule, l’historique de révision et le resolver via des endpoints en lecture seule.',

  'master.intelligence.apds.empty.title': 'API de lecture non connectées',
  'master.intelligence.apds.empty.body':
    'PR3 chargera les décisions shadow, épisodes d’activation et corrélation VSI. Les lignes shadow ne sont jamais des polls exécutés.',

  'master.intelligence.crossLink.vehicle': 'Ouvrir le véhicule',
  'master.intelligence.crossLink.device': 'Ouvrir l’inventaire appareils',
  'master.intelligence.crossLink.vsi': 'Ouvrir VSI',
  'master.intelligence.crossLink.apds': 'Ouvrir APDS',
  'master.intelligence.crossLink.contextMissing':
    'Le lien vers {{target}} nécessite plus de contexte dans l’URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h observé',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h observé',
  'master.intelligence.badge.lv.UNKNOWN': 'LV inconnu',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Transmission veille observée environ toutes les 8 heures (pas une config matérielle confirmée).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Transmission veille observée environ toutes les 24 heures (pas une config matérielle confirmée).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Preuves de transmission veille insuffisantes ou bloquées.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM haute fréquence (empirique)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirique)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM inconnu',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Profil RPM haute fréquence classé empiriquement. Ce n’est pas une preuve d’échantillonnage natif à 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Densité d’observation RPM standard classée empiriquement.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Preuves de cadence RPM insuffisantes pour un libellé stable.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profil RPM thermique non applicable (ex. BEV). Ce n’est pas la même chose qu’une qualité de signal inconnue.',

  'master.intelligence.badge.limitation': 'Limitation backend : {{code}}',

  'master.intelligence.confidence.HIGH': 'Confiance : élevée',
  'master.intelligence.confidence.MEDIUM': 'Confiance : moyenne',
  'master.intelligence.confidence.LOW': 'Confiance : faible',
  'master.intelligence.confidence.UNKNOWN': 'Confiance : inconnue',

  'master.intelligence.density.SUB_ONE_HZ': 'Densité : sous 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Densité : buckets 1 s non prouvés',
  'master.intelligence.density.IRREGULAR': 'Densité : irrégulière',
  'master.intelligence.density.UNKNOWN': 'Densité : inconnue',
  'master.intelligence.density.NOT_APPLICABLE': 'Densité : non applicable',

  'master.intelligence.evidence.title': 'Horodatages des preuves',
  'master.intelligence.evidence.evaluatedAt': 'Évalué le',
  'master.intelligence.evidence.providerSourceTimestamp': 'Heure source fournisseur',
  'master.intelligence.evidence.providerFetchedAt': 'Heure de fetch fournisseur',
  'master.intelligence.evidence.profileRevision': 'Révision de profil',
  'master.intelligence.evidence.fetchNotSignalProof':
    'L’heure de fetch indique l’ingestion SynqDrive — pas une preuve de nouveau signal fournisseur.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Les décisions shadow APDS décrivent une réconciliation simulée sauf si un ID de poll réel est lié.',

  'master.intelligence.evidence.kind.observed': 'Type : preuve fournisseur observée',
  'master.intelligence.evidence.kind.simulated_shadow': 'Type : évaluation simulée / shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Type : exécution de poll réelle vérifiée',
  'master.intelligence.evidence.kind.not_available': 'Type : non disponible',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Type : preuves insuffisantes',
  'master.intelligence.evidence.kind.not_applicable': 'Type : non applicable',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Type : évaluation bloquée',

  'master.intelligence.blocked.title': 'Évaluation bloquée',
  'master.intelligence.blocked.body':
    'Classification de profil en pause ({{code}}). Un ancien libellé ne doit pas être affiché comme actuel.',

  'master.intelligence.section.fleetOverview': 'Périmètre flotte et profils',
  'master.intelligence.section.signals': 'Détail des signaux',
  'master.intelligence.section.revisions': 'Historique des révisions de profil',
  'master.intelligence.section.capability': 'Capability resolver (lecture seule)',

  'master.intelligence.vsi.picker.org': 'Organisation',
  'master.intelligence.vsi.picker.vehicle': 'Véhicule',
  'master.intelligence.vsi.picker.link': 'Lien source provider',
  'master.intelligence.vsi.loading': 'Chargement des modèles VSI…',
  'master.intelligence.vsi.error': 'Impossible de charger l’intelligence VSI.',
  'master.intelligence.vsi.retry': 'Réessayer',

  'master.intelligence.vsi.empty.selectScope.title': 'Choisir organisation et véhicule',
  'master.intelligence.vsi.empty.selectScope.body':
    'Sélectionnez une organisation et un véhicule pour charger les profils VSI persistés. Périmètre validé côté serveur.',

  'master.intelligence.vsi.noProfiles.title': 'Aucun profil VSI matérialisé',
  'master.intelligence.vsi.noProfiles.body':
    'Aucun profil de capability pour ce véhicule. Ce n’est pas la même chose qu’un historique de révisions désactivé.',

  'master.intelligence.vsi.decision.lv': 'Code décision LV : {{code}}',
  'master.intelligence.vsi.decision.rpm': 'Code décision RPM : {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Les libellés de cadence décrivent des schémas de transmission observés, pas une configuration matérielle native.',
  'master.intelligence.vsi.signals.canonical': 'Signal canonique',
  'master.intelligence.vsi.signals.provider': 'Nom provider',
  'master.intelligence.vsi.signals.quality': 'Qualité / confiance',
  'master.intelligence.vsi.signals.observedAt': 'Dernière observation (UTC + local)',
  'master.intelligence.vsi.signals.limitations': 'Limitations',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Non applicable (motorisation)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Jamais observé',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Observé',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Observé (périmé)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'Non observé dans la fenêtre',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Disponibilité RPM combinée (dérivée)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Prouvé en direct (snapshot frais)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Prouvé historique uniquement (cadence HF ; snapshot non live)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Non prouvé',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Non applicable (motorisation)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'Preuve HF non attribuée à ce source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Le régime moteur (RPM) repose sur deux plans de preuve distincts. L’état instantané vient du dernier bundle vehicle latest state ; HF/cadence vient des points haute fréquence miroir et des trajets finalisés. Ils ne sont pas interchangeables.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Instantané (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Fenêtre d’observation : dernier bundle provider attribué à la matérialisation du profil (pas l’historique HF).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadence (fenêtres trajet)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Fenêtre d’observation : enrichissement cadence HF lié au link (jusqu’à 14 jours de trajets finalisés).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Observation empirique',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Fraîcheur',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Dernière observation valide',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Qualité / confiance',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Provenance',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Nombre d’échantillons HF',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Profil RPM actif',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profil évalué à',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Trajets finalisés dans la fenêtre cadence',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Décision de classification',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Classifications trajet associées',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'La classification cadence RPM ne s’applique pas à cette motorisation (ex. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Aucune preuve cadence HF dans le profil persisté (cadenceIntelligence absent ou vide).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Instantané',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadence',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profil {{profile}} · {{samples}} échantillons HF (voir panneau)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Voir le panneau ci-dessous',

  'master.intelligence.vsi.revision.loading': 'Chargement de l’historique des révisions…',
  'master.intelligence.vsi.revision.loadError': 'Impossible de charger l’historique des révisions.',
  'master.intelligence.vsi.revision.retry': 'Réessayer l’historique des révisions',
  'master.intelligence.vsi.revision.notCaptured': 'Historique : NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'La capture P5-H1 est désactivée. L’absence d’historique ne signifie pas l’absence de changements.',
  'master.intelligence.vsi.revision.moreAvailable': 'Révisions supplémentaires — pagination par curseur via l’API.',

  'master.intelligence.vsi.asOf.title': 'Résolution de révision as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Heure de décision',
  'master.intelligence.vsi.asOf.authority': 'Autorité',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Résumés en lecture seule des API VSI, APDS et PDI. Les badges reflètent des preuves observées ou persistées — pas une preuve matérielle.',
  'master.intelligence.vehicleDetail.loading': 'Chargement des résumés intelligence…',
  'master.intelligence.vehicleDetail.error': 'Impossible de charger les résumés intelligence pour ce véhicule.',
  'master.intelligence.vehicleDetail.openVsi': 'Ouvrir le détail VSI',
  'master.intelligence.vehicleDetail.openVsiOverview': 'Ouvrir la vue d’ensemble VSI',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Ouvrir le registre de preuves',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Ouvrir RPM moteur dans le registre de preuves',
  'master.intelligence.vehicleDetail.openApds': 'Ouvrir le détail APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Ouvrir le détail appareil',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Aucune décision persistée dans le périmètre.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Aucun appareil physique installé unique attribué à ce véhicule.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Plusieurs liens source fournisseur — sélectionnez un lien avant la navigation VSI/APDS.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Lien source fournisseur',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Choisissez le lien fournisseur persisté. Les résumés et la navigation s’appliquent au lien sélectionné uniquement.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'La sélection précédente ne correspond plus à ce véhicule. Choisissez à nouveau un lien.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Sélectionnez un lien source pour activer la navigation intelligence sur ce véhicule.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'Sélectionnez un lien source pour afficher les résumés LV/RPM.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Sélectionnez un lien source pour charger le résumé APDS de ce lien.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'Le détail signal RPM moteur ne s’applique pas à ce profil (applicabilité VSI persistée).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'Détail RPM indisponible tant que VSI ne signale pas de preuve RPM applicable pour ce lien.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Détail RPM indisponible tant que l’évaluation du profil est bloquée.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'Le détail RPM requiert un lien source fournisseur sélectionné.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'Ouvre le registre et le détail du signal pour revue. L’applicabilité n’est pas une preuve RPM combinée (live ou historique)—le détail VSI reste fondé sur les preuves.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Dimensions de preuve indépendantes',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Applicabilité',
  'master.intelligence.vsi.ledger.dimension.declared': 'Support déclaré',
  'master.intelligence.vsi.ledger.dimension.observation': 'Observation',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Fraîcheur',
  'master.intelligence.vsi.ledger.dimension.quality': 'Qualité',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Confiance',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Preuve RPM combinée',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Applicable',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'Non applicable',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Inconnu',

  'master.intelligence.vsi.ledger.declared.LISTED': 'Listé au catalogue',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'Non listé',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Inconnu',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Frais',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Périmé',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Inconnu',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Jamais observé (axe qualité)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Inconnu (axe qualité)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Périmé (qualité meta)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Provenance snapshot (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Provenance cadence (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'Aucune entrée',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Tags de preuve snapshot',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Tags de preuve cadence',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'Aucune entrée de glossaire pour ce code — sortie brute du classificateur faisant foi.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'Des échantillons HF existent mais ne peuvent être attribués à ce lien source ; preuve historique retenue.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'La lane snapshot ne prouve pas la cadence HF ; cadence évaluée séparément.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'Un trajet ouvert bloque la classification standby LV pour cette révision de profil.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Plusieurs liens source actifs rendent le catalogue ambigu.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'Le dernier état véhicule n’a pas pu être attribué à ce lien source.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'Identité fournisseur incompatible avec le catalogue (DIMO uniquement).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Dernière observation valide',
  'master.intelligence.vsi.ledger.timestamp.source': 'Horodatage source',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Récupération fournisseur',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'L’heure de récupération fournisseur ne prouve pas une nouvelle mesure capteur.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Signal précédent',
  'master.intelligence.vsi.ledger.sheet.next': 'Signal suivant',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Affirmations compatibles : le snapshot live n’a jamais porté de RPM alors que des preuves HF historiques existent.',

  'master.intelligence.vsi.tabs.ariaLabel': 'Sections intelligence VSI',
  'master.intelligence.vsi.tabs.overview': 'Vue d’ensemble',
  'master.intelligence.vsi.tabs.ledger': 'Registre des signaux',
  'master.intelligence.vsi.tabs.revisions': 'Révisions',
  'master.intelligence.vsi.ledger.filters.search': 'Rechercher des signaux',
  'master.intelligence.vsi.ledger.filters.clear': 'Effacer les filtres',
  'master.intelligence.vsi.ledger.filters.group': 'Filtres du registre',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Avec limitations',
  'master.intelligence.vsi.ledger.filters.hasHf': 'HF attribuable',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Masquer non applicable',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{shown}} sur {{total}} signaux',
  'master.intelligence.vsi.ledger.col.signal': 'Signal',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Qualité / confiance',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Dernière observation valide',
  'master.intelligence.vsi.ledger.col.limitations': 'Limitations',
  'master.intelligence.vsi.ledger.col.provenance': 'Preuves',
  'master.intelligence.vsi.ledger.col.action': 'Ouvrir le détail',
  'master.intelligence.vsi.ledger.table.caption': 'Registre de preuves des signaux véhicule',
  'master.intelligence.vsi.ledger.selectSignal': 'Sélectionner le signal {{signal}}',
  'master.intelligence.vsi.ledger.emptyFiltered': 'Aucun signal ne correspond aux filtres.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} liens source — les preuves concernent uniquement le lien sélectionné.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} signaux · révision profil {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Résumé des preuves',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Chronologie des preuves',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Voies de provenance',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'Détail preuve RPM',
  'master.intelligence.vsi.ledger.detail.section.lv': 'Détail cadence LV',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Limitations',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Profil évalué le',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Véhicule',
  'master.intelligence.vsi.ledger.detail.context.link': 'Lien source',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Révision profil {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'Profil standby LV',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Décision de classification',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Confiance de preuve',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Échantillons observés',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'Aucune intelligence cadence LV pour ce signal.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Régimes de cadence disponibles',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Résolution de tier',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Libellé de densité observée',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Attribution et limites de lien',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Autres limitations',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'Le signal sélectionné est masqué par les filtres. Ajustez les filtres ou effacez la sélection.',

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
