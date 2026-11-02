/** Canonical English keys for Master Intelligence Center (PR1). */
export const masterIntelligenceEn = {
  'master.nav.vsiIntelligence': 'VSI – Signal Intelligence',
  'master.nav.apdsIntelligence': 'APDS – Adaptive Polling',
  'master.nav.tireV3CalibrationCenter': 'Tire V3 Calibration Center',

  'master.intelligence.vsi.title': 'VSI – Signal Intelligence',
  'master.intelligence.vsi.description':
    'Read-only vehicle signal profiles, observed cadence labels, revision history when captured, and capability resolver explanations from production data.',
  'master.intelligence.apds.title': 'APDS – Adaptive Polling',
  'master.intelligence.apds.description':
    'Read-only shadow reconciliation decisions, activation epoch history, real poll evidence when linked, and historical VSI correlation. Simulated next-poll times are not executed polls.',

  'master.intelligence.apds.loading': 'Loading APDS read models…',
  'master.intelligence.apds.error': 'Could not load APDS intelligence.',
  'master.intelligence.apds.latestDecision': 'Latest persisted decision',
  'master.intelligence.apds.activeEpoch': 'Active epoch',
  'master.intelligence.apds.decisionsForVehicle': 'decisions for this vehicle in epoch',
  'master.intelligence.apds.shadowNotReal':
    'Shadow recommendations and simulated next-poll timestamps are not proof of a real scheduled or executed poll.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historical VSI correlation is research evidence — it did not necessarily drive this APDS decision at runtime.',
  'master.intelligence.apds.openVsiAsOf': 'Open VSI with decision as-of time',

  'master.intelligence.apds.empty.selectScope.title': 'Select organization and vehicle',
  'master.intelligence.apds.empty.selectScope.body':
    'Choose scope to load persisted shadow decisions and epochs. Provider source link enables VSI correlation; scope is validated server-side.',

  'master.intelligence.apds.section.epochs': 'Activation epoch timeline',
  'master.intelligence.apds.section.decisions': 'Decision explorer',
  'master.intelligence.apds.section.detail': 'Decision detail',

  'master.intelligence.apds.col.time': 'Decision time',
  'master.intelligence.apds.col.reason': 'Reason',
  'master.intelligence.apds.col.policy': 'Policy',
  'master.intelligence.apds.col.realPoll': 'Real poll link',

  'master.intelligence.apds.detail.shadow': 'Shadow recommendation (persisted outputs)',
  'master.intelligence.apds.detail.realPoll': 'Real poll evidence',
  'master.intelligence.apds.detail.vsiCorrelation': 'VSI historical correlation',

  'master.intelligence.apds.availability.AVAILABLE': 'Shadow evidence available',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'APDS shadow not activated for this scope',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'No reconciliation decisions captured',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Persisted history unavailable',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Evidence incomplete for this scope',

  'master.intelligence.apds.realPoll.NOT_LINKED': 'Not linked to a real poll',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Linked — poll log not verified',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Linked — success recorded',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Linked — non-success status',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Real poll evidence not available',

  'master.intelligence.pdi.loading': 'Loading device intelligence…',
  'master.intelligence.pdi.error': 'Could not load PDI device intelligence.',
  'master.intelligence.pdi.section.identity': 'Identity summary',
  'master.intelligence.pdi.section.timeline': 'Chronological timeline',
  'master.intelligence.pdi.section.episodes': 'Connection episodes',
  'master.intelligence.pdi.section.drift': 'Identity monitoring',
  'master.intelligence.pdi.section.bindings': 'Provider bindings',
  'master.intelligence.pdi.section.crossNav': 'Cross-navigation',
  'master.intelligence.pdi.bindings.noVehicleScope':
    'No vehicle scope on this device — provider bindings cannot be scoped for navigation.',
  'master.intelligence.pdi.bindings.noneForScope': 'No provider bindings in the current response.',
  'master.intelligence.pdi.bindings.attributionNote':
    'Vehicle and organization on each row reflect current identity attribution (CURRENT_VEHICLE_ONLY), not per-binding proof.',
  'master.intelligence.pdi.bindings.selectRequired':
    'Multiple provider bindings — select one before opening VSI, APDS, or vehicle intelligence links.',
  'master.intelligence.pdi.bindings.staleSelection':
    'The selected provider binding is no longer in the list. Choose a current binding.',
  'master.intelligence.pdi.bindings.linkStatus': 'Link status',
  'master.intelligence.pdi.bindings.status.ACTIVE': 'Active',
  'master.intelligence.pdi.bindings.status.INACTIVE': 'Inactive',
  'master.intelligence.pdi.bindings.status.UNKNOWN': 'Unknown',
  'master.intelligence.pdi.bindings.vehicleScope': 'Vehicle (attribution)',
  'master.intelligence.pdi.bindings.orgScope': 'Organization (attribution)',
  'master.intelligence.pdi.bindings.scopeUnknown': 'Vehicle/org attribution unknown for this scope.',
  'master.intelligence.pdi.bindings.crossOrgBlocked':
    'Device organization does not match the panel context — cross-links are disabled.',
  'master.intelligence.pdi.bindings.navPending': 'Select a provider binding to enable cross-navigation.',
  'master.intelligence.pdi.snapshotNotHistory':
    'Current inventory and live mirror observations are snapshots — not a full historical record.',
  'master.intelligence.pdi.notApplicableR1':
    'Physical Ruptela R1 identity monitoring does not apply (e.g. software-only Tesla integration).',
  'master.intelligence.pdi.noDriftHistory':
    'No persisted drift event history. Missing records does not prove there was no drift.',
  'master.intelligence.pdi.episodeNotPoll':
    'Connection episodes are persisted lifecycle evidence — not APDS poll execution.',
  'master.intelligence.pdi.noEpisodes': 'No connection episodes for the current vehicle scope.',
  'master.intelligence.pdi.emptyTimeline': 'No timeline entries in persisted history.',
  'master.intelligence.pdi.evaluatedAt': 'Evidence evaluated',

  'master.intelligence.section.context': 'URL context',
  'master.intelligence.section.crossLinks': 'Cross-links',
  'master.intelligence.section.previewComponents': 'Presentation preview (not live data)',
  'master.intelligence.section.evidenceSemantics': 'Evidence semantics',

  'master.intelligence.url.invalidParams': 'Ignored invalid URL parameters: {{params}}',

  'master.intelligence.vsi.previewNote':
    'Badges below illustrate backend label semantics only. Values are not loaded from production in PR1.',
  'master.intelligence.vsi.empty.title': 'Read APIs not connected yet',
  'master.intelligence.vsi.empty.body':
    'PR2 will load vehicle signal profiles, revision history when captured, and capability resolver explanations from read-only backend endpoints.',

  'master.intelligence.apds.empty.title': 'Read APIs not connected yet',
  'master.intelligence.apds.empty.body':
    'PR3 will load shadow decisions, activation epochs, and VSI correlation evidence. Shadow rows are never shown as executed polls.',

  'master.intelligence.crossLink.vehicle': 'Open vehicle',
  'master.intelligence.crossLink.device': 'Open device inventory',
  'master.intelligence.crossLink.vsi': 'Open VSI',
  'master.intelligence.crossLink.apds': 'Open APDS',
  'master.intelligence.crossLink.contextMissing': 'Link to {{target}} needs more context in the URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8h observed',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24h observed',
  'master.intelligence.badge.lv.UNKNOWN': 'LV unknown',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Observed approximately 8-hour standby transmission cadence (not confirmed hardware configuration).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Observed approximately 24-hour standby transmission cadence (not confirmed hardware configuration).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Insufficient or blocked standby transmission evidence.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM high-frequency (empirical)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirical)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM unknown',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empirically classified high-frequency RPM profile. Not proof of native 1 Hz device sampling.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Empirically classified standard RPM observation density.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Insufficient RPM cadence evidence for a stable label.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE RPM profile not applicable (e.g. BEV). This is not the same as unknown signal quality.',

  'master.intelligence.badge.limitation': 'Backend limitation: {{code}}',

  'master.intelligence.confidence.HIGH': 'Confidence: high',
  'master.intelligence.confidence.MEDIUM': 'Confidence: medium',
  'master.intelligence.confidence.LOW': 'Confidence: low',
  'master.intelligence.confidence.UNKNOWN': 'Confidence: unknown',

  'master.intelligence.density.SUB_ONE_HZ': 'Density: sub-1 Hz buckets',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Density: 1 s buckets unproven',
  'master.intelligence.density.IRREGULAR': 'Density: irregular',
  'master.intelligence.density.UNKNOWN': 'Density: unknown',
  'master.intelligence.density.NOT_APPLICABLE': 'Density: not applicable',

  'master.intelligence.evidence.title': 'Evidence timestamps',
  'master.intelligence.evidence.evaluatedAt': 'Evaluated at',
  'master.intelligence.evidence.providerSourceTimestamp': 'Provider source time',
  'master.intelligence.evidence.providerFetchedAt': 'Provider fetch time',
  'master.intelligence.evidence.profileRevision': 'Profile revision',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Fetch time shows when SynqDrive ingested data — not proof of a new provider signal.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS shadow decisions describe simulated reconciliation outcomes unless a real poll ID is linked.',

  'master.intelligence.evidence.kind.observed': 'Kind: observed provider evidence',
  'master.intelligence.evidence.kind.simulated_shadow': 'Kind: simulated / shadow evaluation',
  'master.intelligence.evidence.kind.verified_real_execution': 'Kind: verified real poll execution',
  'master.intelligence.evidence.kind.not_available': 'Kind: not available',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Kind: insufficient evidence',
  'master.intelligence.evidence.kind.not_applicable': 'Kind: not applicable',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Kind: evaluation blocked',

  'master.intelligence.blocked.title': 'Evaluation blocked',
  'master.intelligence.blocked.body':
    'Profile classification is paused ({{code}}). An older label must not be shown as current.',

  'master.intelligence.section.fleetOverview': 'Fleet scope & profiles',
  'master.intelligence.section.signals': 'Signal detail',
  'master.intelligence.section.revisions': 'Profile revision history',
  'master.intelligence.section.capability': 'Capability resolver (read-only)',

  'master.intelligence.vsi.picker.org': 'Organization',
  'master.intelligence.vsi.picker.vehicle': 'Vehicle',
  'master.intelligence.vsi.picker.link': 'Provider source link',
  'master.intelligence.vsi.loading': 'Loading VSI read models…',
  'master.intelligence.vsi.error': 'Could not load VSI intelligence.',
  'master.intelligence.vsi.retry': 'Retry',

  'master.intelligence.vsi.empty.selectScope.title': 'Select organization and vehicle',
  'master.intelligence.vsi.empty.selectScope.body':
    'Choose an organization and vehicle to load persisted VSI signal profiles. Scope is validated server-side; no cross-tenant access.',

  'master.intelligence.vsi.noProfiles.title': 'No VSI profiles materialized',
  'master.intelligence.vsi.noProfiles.body':
    'No signal capability profile exists yet for this vehicle. This is not the same as revision history being disabled.',

  'master.intelligence.vsi.decision.lv': 'LV decision code: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM decision code: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Cadence labels describe observed transmission patterns, not native hardware configuration.',
  'master.intelligence.vsi.signals.canonical': 'Canonical signal',
  'master.intelligence.vsi.signals.provider': 'Provider name',
  'master.intelligence.vsi.signals.quality': 'Quality / confidence',
  'master.intelligence.vsi.signals.observedAt': 'Last observation (UTC + local)',
  'master.intelligence.vsi.signals.limitations': 'Limitations',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Not applicable (powertrain)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Never observed',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Observed',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Observed (stale)',
  'master.intelligence.vsi.signals.empirical.NOT_OBSERVED_IN_WINDOW': 'Not observed in window',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Combined RPM availability (derived)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Proven live (fresh snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Proven historical only (HF cadence; snapshot not live)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Not proven',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Not applicable (powertrain)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'HF evidence not attributed to this source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Engine RPM uses two separate evidence planes. Snapshot status comes from the latest vehicle latest-state bundle; HF/cadence status comes from mirrored high-frequency points and finalized trips. They are not interchangeable.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Observation window: latest attributed provider bundle at profile materialization (not HF history).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadence (trip windows)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Observation window: link-scoped HF cadence enrichment (typically up to 14 days of finalized trips).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Empirical observation',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Freshness',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Last valid observation',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Quality / confidence',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Provenance',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'HF sample count',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Active RPM profile',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profile evaluated at',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Finalized trips in cadence window',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Classification decision',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Supporting trip classifications',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'RPM cadence classification is not applicable for this powertrain (e.g. battery-electric).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'No HF cadence evidence in the persisted profile (missing or empty cadenceIntelligence).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadence',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    '{{profile}} profile · {{samples}} HF samples (see panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'See dual panel below',

  'master.intelligence.vsi.revision.loading': 'Loading revision history…',
  'master.intelligence.vsi.revision.loadError': 'Revision history could not be loaded.',
  'master.intelligence.vsi.revision.retry': 'Retry revision history',
  'master.intelligence.vsi.revision.notCaptured': 'Revision history: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1 revision capture is disabled in this environment. Missing history does not mean the profile never changed.',
  'master.intelligence.vsi.revision.moreAvailable': 'More revisions available — use cursor pagination via API.',

  'master.intelligence.vsi.asOf.title': 'As-of revision resolution',
  'master.intelligence.vsi.asOf.decisionAt': 'Decision time',
  'master.intelligence.vsi.asOf.authority': 'Authority',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Read-only summaries from VSI, APDS, and PDI APIs. Labels reflect observed or persisted evidence — not hardware proof.',
  'master.intelligence.vehicleDetail.loading': 'Loading intelligence summaries…',
  'master.intelligence.vehicleDetail.error': 'Could not load intelligence summaries for this vehicle.',
  'master.intelligence.vehicleDetail.openVsi': 'Open VSI detail',
  'master.intelligence.vehicleDetail.openVsiOverview': 'Open VSI overview',
  'master.intelligence.vehicleDetail.openVsiLedger': 'Open evidence ledger',
  'master.intelligence.vehicleDetail.openEngineRpmDetail': 'Open engine RPM in evidence ledger',
  'master.intelligence.vehicleDetail.openApds': 'Open APDS detail',
  'master.intelligence.vehicleDetail.openPdi': 'Open device detail',
  'master.intelligence.vehicleDetail.noApdsDecision': 'No persisted decision in scope.',
  'master.intelligence.vehicleDetail.noPhysicalDevice': 'No single installed physical device attributed to this vehicle.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Multiple provider source links — select one before opening VSI, APDS, or scoped summaries.',
  'master.intelligence.vehicleDetail.selectSourceLink.title': 'Provider source link',
  'master.intelligence.vehicleDetail.selectSourceLink.hint':
    'Choose which persisted provider link to use. Summaries and navigation apply only to the selected link.',
  'master.intelligence.vehicleDetail.selectSourceLink.stale':
    'The previous selection no longer matches this vehicle. Choose a link again.',
  'master.intelligence.vehicleDetail.selectSourceLink.required':
    'Select a provider source link to enable intelligence navigation for this vehicle.',
  'master.intelligence.vehicleDetail.selectSourceLink.summaryPending':
    'Select a provider source link to view LV/RPM summaries for this vehicle.',
  'master.intelligence.vehicleDetail.selectSourceLink.apdsPending':
    'Select a provider source link to load APDS summary for that link.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.notApplicable':
    'Engine RPM signal detail is not applicable for this profile (persisted VSI applicability).',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.unknownApplicability':
    'Engine RPM detail is unavailable until VSI reports applicable RPM evidence for this link.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.evaluationBlocked':
    'Engine RPM detail is unavailable while profile evaluation is blocked.',
  'master.intelligence.vehicleDetail.engineRpmUnavailable.noProfile':
    'Engine RPM detail requires a selected provider source link.',
  'master.intelligence.vehicleDetail.engineRpmDeepLinkNote':
    'Opens ledger and signal detail for review. Applicability here is not combined RPM proof (live or historical)—VSI detail remains evidence-driven.',

  'master.intelligence.vsi.ledger.summary.ariaLabel': 'Independent evidence dimensions',
  'master.intelligence.vsi.ledger.dimension.applicability': 'Applicability',
  'master.intelligence.vsi.ledger.dimension.declared': 'Declared support',
  'master.intelligence.vsi.ledger.dimension.observation': 'Observation',
  'master.intelligence.vsi.ledger.dimension.freshness': 'Freshness',
  'master.intelligence.vsi.ledger.dimension.quality': 'Quality',
  'master.intelligence.vsi.ledger.dimension.confidence': 'Confidence',
  'master.intelligence.vsi.ledger.dimension.combinedRpm': 'Combined RPM',

  'master.intelligence.vsi.ledger.applicability.APPLICABLE': 'Applicable',
  'master.intelligence.vsi.ledger.applicability.NOT_APPLICABLE': 'Not applicable',
  'master.intelligence.vsi.ledger.applicability.UNKNOWN': 'Unknown',

  'master.intelligence.vsi.ledger.declared.LISTED': 'Listed in catalog',
  'master.intelligence.vsi.ledger.declared.NOT_LISTED': 'Not listed',
  'master.intelligence.vsi.ledger.declared.UNKNOWN': 'Unknown',

  'master.intelligence.vsi.ledger.freshness.FRESH': 'Fresh',
  'master.intelligence.vsi.ledger.freshness.STALE': 'Stale',
  'master.intelligence.vsi.ledger.freshness.UNKNOWN': 'Unknown',

  'master.intelligence.vsi.ledger.quality.NEVER_OBSERVED': 'Never observed (quality axis)',
  'master.intelligence.vsi.ledger.quality.UNKNOWN': 'Unknown (quality axis)',
  'master.intelligence.vsi.ledger.quality.STALE_META': 'Stale (meta quality)',

  'master.intelligence.vsi.ledger.provenance.snapshotHeading': 'Snapshot provenance (Lane A)',
  'master.intelligence.vsi.ledger.provenance.cadenceHeading': 'Cadence provenance (Lane B)',
  'master.intelligence.vsi.ledger.provenance.empty': 'None recorded',
  'master.intelligence.vsi.ledger.provenance.laneSnapshot': 'Snapshot evidence tags',
  'master.intelligence.vsi.ledger.provenance.laneCadence': 'Cadence evidence tags',

  'master.intelligence.vsi.ledger.limitation.unknownCodeHint':
    'No glossary entry for this limitation code — treat as authoritative raw classifier output.',
  'master.intelligence.vsi.ledger.limitation.RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN':
    'HF samples exist but cannot be attributed to this source link; historical proof is withheld.',
  'master.intelligence.vsi.ledger.limitation.ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE':
    'Snapshot lane does not prove HF cadence; cadence is evaluated separately.',
  'master.intelligence.vsi.ledger.limitation.OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION':
    'An open trip blocks LV standby classification for this profile revision.',
  'master.intelligence.vsi.ledger.limitation.MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS':
    'Multiple active source links make declared catalog attribution ambiguous.',
  'master.intelligence.vsi.ledger.limitation.LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK':
    'Latest vehicle state could not be attributed to this source link.',
  'master.intelligence.vsi.ledger.limitation.PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY':
    'Provider identity does not match declared catalog expectations (DIMO-only scope).',

  'master.intelligence.vsi.ledger.timestamp.observation': 'Last valid observation',
  'master.intelligence.vsi.ledger.timestamp.source': 'Source timestamp',
  'master.intelligence.vsi.ledger.timestamp.providerFetch': 'Provider fetch',
  'master.intelligence.vsi.ledger.timestamp.utc': 'UTC',
  'master.intelligence.vsi.ledger.timestamp.fetchNotObservation':
    'Provider fetch time does not prove a new sensor measurement.',

  'master.intelligence.vsi.ledger.sheet.previous': 'Previous signal',
  'master.intelligence.vsi.ledger.sheet.next': 'Next signal',

  'master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm':
    'Compatible statements: live snapshot never carried RPM while historical HF trip evidence exists.',

  'master.intelligence.vsi.tabs.ariaLabel': 'VSI intelligence sections',
  'master.intelligence.vsi.tabs.overview': 'Overview',
  'master.intelligence.vsi.tabs.ledger': 'Signal ledger',
  'master.intelligence.vsi.tabs.revisions': 'Revisions',

  'master.intelligence.vsi.ledger.filters.search': 'Search signals',
  'master.intelligence.vsi.ledger.filters.clear': 'Clear filters',
  'master.intelligence.vsi.ledger.filters.group': 'Ledger filters',
  'master.intelligence.vsi.ledger.filters.hasLimitations': 'Has limitations',
  'master.intelligence.vsi.ledger.filters.hasHf': 'Has attributable HF',
  'master.intelligence.vsi.ledger.filters.hideNA': 'Hide not applicable',
  'master.intelligence.vsi.ledger.filters.resultCount': '{{shown}} of {{total}} signals shown',

  'master.intelligence.vsi.ledger.col.signal': 'Signal',
  'master.intelligence.vsi.ledger.col.qualityConfidence': 'Quality / confidence',
  'master.intelligence.vsi.ledger.col.lastObservation': 'Last valid observation',
  'master.intelligence.vsi.ledger.col.limitations': 'Limitations',
  'master.intelligence.vsi.ledger.col.provenance': 'Evidence',
  'master.intelligence.vsi.ledger.col.action': 'Open detail',

  'master.intelligence.vsi.ledger.table.caption': 'Vehicle signal evidence ledger',
  'master.intelligence.vsi.ledger.selectSignal': 'Select signal {{signal}}',
  'master.intelligence.vsi.ledger.emptyFiltered': 'No signals match the current filters.',
  'master.intelligence.vsi.ledger.multiLinkNotice':
    '{{count}} provider source links — evidence applies to the selected link only.',
  'master.intelligence.vsi.ledger.footerMeta': '{{count}} signals · profile revision {{revision}}',

  'master.intelligence.vsi.ledger.detail.section.summary': 'Evidence summary',
  'master.intelligence.vsi.ledger.detail.section.timeline': 'Evidence timeline',
  'master.intelligence.vsi.ledger.detail.section.provenance': 'Provenance lanes',
  'master.intelligence.vsi.ledger.detail.section.rpm': 'RPM evidence detail',
  'master.intelligence.vsi.ledger.detail.section.lv': 'LV cadence detail',
  'master.intelligence.vsi.ledger.detail.section.limitations': 'Limitations',
  'master.intelligence.vsi.ledger.detail.timeline.evaluatedAt': 'Profile evaluated at',
  'master.intelligence.vsi.ledger.detail.context.vehicle': 'Vehicle',
  'master.intelligence.vsi.ledger.detail.context.link': 'Source link',
  'master.intelligence.vsi.ledger.detail.context.revision': 'Profile revision {{revision}}',
  'master.intelligence.vsi.ledger.detail.lv.standbyProfile': 'LV standby profile',
  'master.intelligence.vsi.ledger.detail.lv.classification': 'Classification decision',
  'master.intelligence.vsi.ledger.detail.lv.confidence': 'Evidence confidence',
  'master.intelligence.vsi.ledger.detail.lv.sampleCount': 'Observed sample count',
  'master.intelligence.vsi.ledger.detail.lv.empty': 'No LV cadence intelligence recorded for this signal.',
  'master.intelligence.vsi.ledger.detail.rpm.regimes': 'Available cadence regimes',
  'master.intelligence.vsi.ledger.detail.rpm.tierResolution': 'Tier resolution',
  'master.intelligence.vsi.ledger.detail.rpm.density': 'Observed density label',
  'master.intelligence.vsi.ledger.detail.limitations.attributionGroup': 'Attribution and source-link limits',
  'master.intelligence.vsi.ledger.detail.limitations.otherGroup': 'Other limitations',
  'master.intelligence.vsi.ledger.detail.hiddenByFilters':
    'Selected signal is hidden by current filters. Adjust filters or clear the selection.',

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

export type MasterIntelligenceTranslationKey = keyof typeof masterIntelligenceEn;
