export const masterIntelligenceEs = {
  'master.nav.vsiIntelligence': 'VSI – inteligencia de señales',
  'master.nav.apdsIntelligence': 'APDS – polling adaptativo',

  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',
  'master.intelligence.vsi.title': 'VSI – inteligencia de señales',
  'master.intelligence.vsi.description':
    'Perfiles de señal del vehículo en solo lectura, cadencia observada, historial de revisiones si está capturado y explicaciones del capability resolver desde datos de producción.',
  'master.intelligence.apds.title': 'APDS – polling adaptativo',
  'master.intelligence.apds.description':
    'Decisiones shadow de reconciliación de solo lectura, historial de épocas, evidencia de poll real si está vinculada y correlación VSI histórica. Los next poll simulados no son polls ejecutados.',

  'master.intelligence.apds.loading': 'Cargando modelos de lectura APDS…',
  'master.intelligence.apds.error': 'No se pudo cargar la inteligencia APDS.',
  'master.intelligence.apds.latestDecision': 'Última decisión persistida',
  'master.intelligence.apds.activeEpoch': 'Época activa',
  'master.intelligence.apds.decisionsForVehicle': 'decisiones para este vehículo en la época',
  'master.intelligence.apds.shadowNotReal':
    'Las recomendaciones shadow y las marcas de next poll simulado no prueban un poll real programado o ejecutado.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'La correlación VSI histórica es evidencia de investigación — no necesariamente impulsó esta decisión APDS en runtime.',
  'master.intelligence.apds.openVsiAsOf': 'Abrir VSI con hora as-of de la decisión',
  'master.intelligence.apds.empty.selectScope.title': 'Seleccione organización y vehículo',
  'master.intelligence.apds.empty.selectScope.body':
    'Elija alcance para cargar decisiones shadow y épocas persistidas. El enlace de origen del proveedor habilita correlación VSI; el alcance se valida en el servidor.',
  'master.intelligence.apds.section.epochs': 'Línea temporal de épocas de activación',
  'master.intelligence.apds.section.decisions': 'Explorador de decisiones',
  'master.intelligence.apds.section.detail': 'Detalle de la decisión',
  'master.intelligence.apds.col.time': 'Hora de decisión',
  'master.intelligence.apds.col.reason': 'Motivo',
  'master.intelligence.apds.col.policy': 'Política',
  'master.intelligence.apds.col.realPoll': 'Enlace a poll real',
  'master.intelligence.apds.detail.shadow': 'Recomendación shadow (salidas persistidas)',
  'master.intelligence.apds.detail.realPoll': 'Evidencia de poll real',
  'master.intelligence.apds.detail.vsiCorrelation': 'Correlación VSI histórica',
  'master.intelligence.apds.availability.AVAILABLE': 'Evidencia shadow disponible',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Shadow APDS no activado para este alcance',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'No hay decisiones de reconciliación capturadas',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Historial persistido no disponible',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Evidencia incompleta para este alcance',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Sin enlace a poll real',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Vinculado — registro de poll no verificado',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Vinculado — éxito registrado',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Vinculado — estado sin éxito',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Evidencia de poll real no disponible',
  'master.intelligence.pdi.loading': 'Cargando intelligence del dispositivo…',
  'master.intelligence.pdi.error': 'No se pudo cargar la intelligence PDI.',
  'master.intelligence.pdi.section.identity': 'Resumen de identidad',
  'master.intelligence.pdi.section.timeline': 'Línea temporal',
  'master.intelligence.pdi.section.episodes': 'Episodios de conexión',
  'master.intelligence.pdi.section.drift': 'Monitorización de identidad',
  'master.intelligence.pdi.section.bindings': 'Enlaces de proveedor',
  'master.intelligence.pdi.section.crossNav': 'Navegación cruzada',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'Sin ámbito de vehículo en este dispositivo — los enlaces no pueden usarse para navegar.',
  'master.intelligence.pdi.bindings.noneForScope': 'No hay enlaces de proveedor en la respuesta actual.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Vehículo y organización por fila reflejan la atribución de identidad actual (CURRENT_VEHICLE_ONLY), no prueba por enlace.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Varios enlaces — seleccione uno antes de abrir VSI, APDS o el vehículo.',
  'master.intelligence.pdi.bindings.staleSelection':
    'El enlace seleccionado ya no está en la lista. Elija un enlace actual.',
  'master.intelligence.pdi.bindings.linkStatus': 'Estado del enlace',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Activo',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Inactivo',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Desconocido',
  'master.intelligence.pdi.bindings.vehicleScope': 'Vehículo (atribución)',
  'master.intelligence.pdi.bindings.orgScope': 'Organización (atribución)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Atribución vehículo/org desconocida para este ámbito.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'La organización del dispositivo no coincide con el contexto del panel — enlaces desactivados.',
  'master.intelligence.pdi.bindings.navPending':
    'Seleccione un enlace de proveedor para habilitar la navegación cruzada.',
  'master.intelligence.pdi.snapshotNotHistory': 'Inventario actual y espejo live son instantáneas, no historial completo.',
  'master.intelligence.pdi.notApplicableR1': 'Monitorización R1 física no aplicable (p. ej. Tesla solo software).',
  'master.intelligence.pdi.noDriftHistory': 'Sin historial persistido de drift. Sin registros no prueba ausencia de drift.',
  'master.intelligence.pdi.episodeNotPoll': 'Episodios de conexión = evidencia lifecycle persistida, no poll APDS.',
  'master.intelligence.pdi.noEpisodes': 'Sin episodios para el alcance de vehículo actual.',
  'master.intelligence.pdi.emptyTimeline': 'Sin entradas de timeline persistidas.',
  'master.intelligence.pdi.evaluatedAt': 'Evidencia evaluada',
  'master.intelligence.section.context': 'Contexto URL',
  'master.intelligence.section.crossLinks': 'Enlaces cruzados',
  'master.intelligence.section.previewComponents': 'Vista previa (sin datos en vivo)',
  'master.intelligence.section.evidenceSemantics': 'Semántica de evidencia',
  'master.intelligence.url.invalidParams': 'Parámetros URL no válidos ignorados: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Las insignias muestran solo la semántica de etiquetas del backend. Sin datos de producción en PR1.',
  'master.intelligence.vsi.empty.title': 'API de lectura aún no conectadas',
  'master.intelligence.vsi.empty.body':
    'PR2 cargará perfiles de señal, historial de revisión y explicaciones del resolver vía endpoints de solo lectura.',
  'master.intelligence.apds.empty.title': 'API de lectura aún no conectadas',
  'master.intelligence.apds.empty.body':
    'PR3 cargará decisiones shadow, épocas de activación y correlación VSI. Las filas shadow nunca son polls ejecutados.',
  'master.intelligence.crossLink.vehicle': 'Abrir vehículo',
  'master.intelligence.crossLink.device': 'Abrir inventario de dispositivos',
  'master.intelligence.crossLink.vsi': 'Abrir VSI',
  'master.intelligence.crossLink.apds': 'Abrir APDS',
  'master.intelligence.crossLink.contextMissing':
    'El enlace a {{target}} necesita más contexto en la URL (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h observado',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h observado',
  'master.intelligence.badge.lv.UNKNOWN': 'LV desconocido',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Transmisión en standby observada aproximadamente cada 8 horas (no configuración de hardware confirmada).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Transmisión en standby observada aproximadamente cada 24 horas (no configuración de hardware confirmada).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Evidencia de transmisión standby insuficiente o bloqueada.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM alta frecuencia (empírico)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM estándar (empírico)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM desconocido',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Perfil RPM de alta frecuencia clasificado empíricamente. No prueba de muestreo nativo a 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Densidad RPM estándar clasificada empíricamente.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Evidencia de cadencia RPM insuficiente para una etiqueta estable.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Perfil RPM de combustión no aplicable (p. ej. BEV). No es lo mismo que calidad de señal desconocida.',
  'master.intelligence.badge.limitation': 'Limitación del backend: {{code}}',
  'master.intelligence.confidence.HIGH': 'Confianza: alta',
  'master.intelligence.confidence.MEDIUM': 'Confianza: media',
  'master.intelligence.confidence.LOW': 'Confianza: baja',
  'master.intelligence.confidence.UNKNOWN': 'Confianza: desconocida',
  'master.intelligence.density.SUB_ONE_HZ': 'Densidad: bajo 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Densidad: buckets de 1 s no probados',
  'master.intelligence.density.IRREGULAR': 'Densidad: irregular',
  'master.intelligence.density.UNKNOWN': 'Densidad: desconocida',
  'master.intelligence.density.NOT_APPLICABLE': 'Densidad: no aplicable',
  'master.intelligence.evidence.title': 'Marcas de tiempo de evidencia',
  'master.intelligence.evidence.evaluatedAt': 'Evaluado el',
  'master.intelligence.evidence.providerSourceTimestamp': 'Hora fuente del proveedor',
  'master.intelligence.evidence.providerFetchedAt': 'Hora de fetch del proveedor',
  'master.intelligence.evidence.profileRevision': 'Revisión de perfil',
  'master.intelligence.evidence.fetchNotSignalProof':
    'La hora de fetch es ingestión SynqDrive — no prueba de una señal nueva del proveedor.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Las decisiones shadow APDS describen reconciliación simulada salvo que haya un ID de poll real vinculado.',
  'master.intelligence.evidence.kind.observed': 'Tipo: evidencia observada del proveedor',
  'master.intelligence.evidence.kind.simulated_shadow': 'Tipo: evaluación simulada / shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Tipo: ejecución de poll real verificada',
  'master.intelligence.evidence.kind.not_available': 'Tipo: no disponible',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Tipo: evidencia insuficiente',
  'master.intelligence.evidence.kind.not_applicable': 'Tipo: no aplicable',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Tipo: evaluación bloqueada',
  'master.intelligence.blocked.title': 'Evaluación bloqueada',
  'master.intelligence.blocked.body':
    'Clasificación de perfil en pausa ({{code}}). Una etiqueta anterior no debe mostrarse como actual.',

  'master.intelligence.section.fleetOverview': 'Alcance de flota y perfiles',
  'master.intelligence.section.signals': 'Detalle de señales',
  'master.intelligence.section.revisions': 'Historial de revisiones del perfil',
  'master.intelligence.section.capability': 'Capability resolver (solo lectura)',

  'master.intelligence.vsi.picker.org': 'Organización',
  'master.intelligence.vsi.picker.vehicle': 'Vehículo',
  'master.intelligence.vsi.picker.link': 'Enlace de origen del proveedor',
  'master.intelligence.vsi.loading': 'Cargando modelos VSI…',
  'master.intelligence.vsi.error': 'No se pudo cargar la inteligencia VSI.',
  'master.intelligence.vsi.retry': 'Reintentar',

  'master.intelligence.vsi.empty.selectScope.title': 'Seleccione organización y vehículo',
  'master.intelligence.vsi.empty.selectScope.body':
    'Elija organización y vehículo para cargar perfiles VSI persistidos. El alcance se valida en el servidor.',

  'master.intelligence.vsi.noProfiles.title': 'Sin perfiles VSI materializados',
  'master.intelligence.vsi.noProfiles.body':
    'Aún no hay perfil de capability para este vehículo. No es lo mismo que historial de revisiones desactivado.',

  'master.intelligence.vsi.decision.lv': 'Código de decisión LV: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'Código de decisión RPM: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Las etiquetas de cadencia describen patrones de transmisión observados, no configuración nativa del hardware.',
  'master.intelligence.vsi.signals.canonical': 'Señal canónica',
  'master.intelligence.vsi.signals.provider': 'Nombre del proveedor',
  'master.intelligence.vsi.signals.quality': 'Calidad / confianza',
  'master.intelligence.vsi.signals.observedAt': 'Última observación (UTC + local)',
  'master.intelligence.vsi.signals.limitations': 'Limitaciones',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'No aplicable (tren motriz)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nunca observado',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Observado',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Observado (obsoleto)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'No observado en la ventana',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Disponibilidad RPM combinada (derivada)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Probado en vivo (snapshot fresco)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Solo probado históricamente (cadencia HF; snapshot no en vivo)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'No probado',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'No aplicable (tren motriz)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'Evidencia HF no atribuida a este source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Las RPM del motor usan dos planos de evidencia separados. El estado snapshot proviene del último bundle vehicle latest state; HF/cadencia de puntos HF reflejados y viajes finalizados. No son intercambiables.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Ventana de observación: último bundle del proveedor atribuido al materializar el perfil (sin historial HF).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadencia (ventanas de viaje)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Ventana de observación: enriquecimiento de cadencia HF del link (hasta 14 días de viajes finalizados).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Observación empírica',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Frescura',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Última observación válida',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Calidad / confianza',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Procedencia',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Recuento de muestras HF',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Perfil RPM activo',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Perfil evaluado en',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Viajes finalizados en ventana de cadencia',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Decisión de clasificación',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Clasificaciones de viaje de apoyo',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'La clasificación de cadencia RPM no aplica a este tren motriz (p. ej. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Sin evidencia HF de cadencia en el perfil persistido (cadenceIntelligence ausente o vacío).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadencia',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Perfil {{profile}} · {{samples}} muestras HF (ver panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Ver panel abajo',

  'master.intelligence.vsi.revision.loading': 'Cargando historial de revisiones…',
  'master.intelligence.vsi.revision.loadError': 'No se pudo cargar el historial de revisiones.',
  'master.intelligence.vsi.revision.retry': 'Reintentar historial de revisiones',
  'master.intelligence.vsi.revision.notCaptured': 'Historial: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'La captura P5-H1 está desactivada. La falta de historial no significa que el perfil no haya cambiado.',
  'master.intelligence.vsi.revision.moreAvailable': 'Hay más revisiones — paginación por cursor vía API.',

  'master.intelligence.vsi.asOf.title': 'Resolución de revisión as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Hora de decisión',
  'master.intelligence.vsi.asOf.authority': 'Autoridad',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Resúmenes de solo lectura de las API VSI, APDS y PDI. Las etiquetas reflejan evidencia observada o persistida — no prueba de hardware.',
  'master.intelligence.vehicleDetail.loading': 'Cargando resúmenes de intelligence…',
  'master.intelligence.vehicleDetail.error': 'No se pudieron cargar los resúmenes de intelligence para este vehículo.',
  'master.intelligence.vehicleDetail.openVsi': 'Abrir detalle VSI',
  'master.intelligence.vehicleDetail.openVsiOverview': 'Abrir resumen VSI',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Abrir registro de evidencia',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Abrir RPM del motor en registro de evidencia',
  'master.intelligence.vehicleDetail.openApds': 'Abrir detalle APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Abrir detalle del dispositivo',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Sin decisión persistida en el ámbito.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Ningún dispositivo físico instalado único atribuido a este vehículo.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Varios enlaces fuente del proveedor — seleccione un enlace antes de navegar a VSI/APDS.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Enlace fuente del proveedor',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Elija el enlace persistido del proveedor. Los resúmenes y la navegación aplican solo al enlace seleccionado.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'La selección anterior ya no coincide con este vehículo. Elija un enlace de nuevo.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Seleccione un enlace fuente para habilitar la navegación de intelligence en este vehículo.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'Seleccione un enlace fuente para ver resúmenes LV/RPM.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Seleccione un enlace fuente para cargar el resumen APDS de ese enlace.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'El detalle de señal RPM del motor no aplica a este perfil (aplicabilidad VSI persistida).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'Detalle RPM no disponible hasta que VSI informe evidencia RPM aplicable para este enlace.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Detalle RPM no disponible mientras la evaluación del perfil esté bloqueada.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'El detalle RPM requiere un enlace fuente del proveedor seleccionado.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'Abre el registro y el detalle de la señal para revisión. La aplicabilidad no es prueba RPM combinada (en vivo o histórica)—el detalle VSI sigue basado en evidencia.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Dimensiones de evidencia independientes',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Aplicabilidad',
  'master.intelligence.vsi.ledger.dimension.declared': 'Soporte declarado',
  'master.intelligence.vsi.ledger.dimension.observation': 'Observación',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Actualidad',
  'master.intelligence.vsi.ledger.dimension.quality': 'Calidad',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Confianza',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Evidencia RPM combinada',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Aplicable',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'No aplicable',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Desconocido',

  'master.intelligence.vsi.ledger.declared.LISTED': 'Listado en catálogo',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'No listado',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Desconocido',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Actual',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Obsoleto',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Desconocido',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Nunca observado (eje calidad)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Desconocido (eje calidad)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Obsoleto (meta calidad)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Procedencia snapshot (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Procedencia cadence (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'Sin entradas',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Etiquetas de evidencia snapshot',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Etiquetas de evidencia cadence',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'Sin entrada de glosario para este código — prevalece la salida bruta del clasificador.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'Existen muestras HF pero no pueden atribuirse a este enlace fuente; prueba histórica retenida.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'La lane snapshot no prueba cadence HF; cadence se evalúa por separado.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'Un viaje abierto bloquea la clasificación standby LV para esta revisión de perfil.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Varios enlaces fuente activos hacen ambiguo el catálogo declarado.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'El último estado del vehículo no pudo atribuirse a este enlace fuente.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'La identidad del proveedor no coincide con el catálogo (solo DIMO).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Última observación válida',
  'master.intelligence.vsi.ledger.timestamp.source': 'Marca de tiempo de origen',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Fetch del proveedor',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'La hora de fetch del proveedor no prueba una nueva medición del sensor.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Señal anterior',
  'master.intelligence.vsi.ledger.sheet.next': 'Señal siguiente',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Afirmaciones compatibles: el snapshot en vivo nunca llevó RPM mientras existen evidencias HF históricas.',

  'master.intelligence.vsi.tabs.ariaLabel': 'Secciones de intelligence VSI',
  'master.intelligence.vsi.tabs.overview': 'Resumen',
  'master.intelligence.vsi.tabs.ledger': 'Registro de señales',
  'master.intelligence.vsi.tabs.revisions': 'Revisiones',
  'master.intelligence.vsi.ledger.filters.search': 'Buscar señales',
  'master.intelligence.vsi.ledger.filters.clear': 'Borrar filtros',
  'master.intelligence.vsi.ledger.filters.group': 'Filtros del registro',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Con limitaciones',
  'master.intelligence.vsi.ledger.filters.hasHf': 'HF atribuible',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Ocultar no aplicable',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{shown}} de {{total}} señales',
  'master.intelligence.vsi.ledger.col.signal': 'Señal',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Calidad / confianza',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Última observación válida',
  'master.intelligence.vsi.ledger.col.limitations': 'Limitaciones',
  'master.intelligence.vsi.ledger.col.provenance': 'Evidencia',
  'master.intelligence.vsi.ledger.col.action': 'Abrir detalle',
  'master.intelligence.vsi.ledger.table.caption': 'Registro de evidencia de señales del vehículo',
  'master.intelligence.vsi.ledger.selectSignal': 'Seleccionar señal {{signal}}',
  'master.intelligence.vsi.ledger.emptyFiltered': 'Ninguna señal coincide con los filtros.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} enlaces fuente — la evidencia aplica solo al enlace seleccionado.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} señales · revisión de perfil {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Resumen de evidencia',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Línea temporal de evidencia',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Vías de procedencia',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'Detalle de evidencia RPM',
  'master.intelligence.vsi.ledger.detail.section.lv': 'Detalle de cadencia LV',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Limitaciones',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Perfil evaluado el',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Vehículo',
  'master.intelligence.vsi.ledger.detail.context.link': 'Enlace de origen',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Revisión de perfil {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'Perfil standby LV',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Decisión de clasificación',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Confianza de evidencia',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Muestras observadas',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'No hay inteligencia de cadencia LV para esta señal.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Regímenes de cadencia disponibles',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Resolución de tier',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Etiqueta de densidad observada',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Atribución y límites de enlace',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Otras limitaciones',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'La señal seleccionada está oculta por los filtros. Ajuste los filtros o borre la selección.',

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
