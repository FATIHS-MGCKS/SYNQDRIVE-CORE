export const operatorTireMeasureEn = {
  'operator.tireMeasure.eyebrow': 'Measure tire tread',
  'operator.tireMeasure.stepProgress': 'Step {{current}}/{{total}} — {{step}}',

  'operator.tireMeasure.steps.vehicle': 'Vehicle',
  'operator.tireMeasure.steps.set': 'Tire set',
  'operator.tireMeasure.steps.tread': 'Tread',
  'operator.tireMeasure.steps.context': 'Context',
  'operator.tireMeasure.steps.review': 'Review',

  'operator.tireMeasure.positions.fl.short': 'FL',
  'operator.tireMeasure.positions.fl.long': 'Front left',
  'operator.tireMeasure.positions.fr.short': 'FR',
  'operator.tireMeasure.positions.fr.long': 'Front right',
  'operator.tireMeasure.positions.rl.short': 'RL',
  'operator.tireMeasure.positions.rl.long': 'Rear left',
  'operator.tireMeasure.positions.rr.short': 'RR',
  'operator.tireMeasure.positions.rr.long': 'Rear right',

  'operator.tireMeasure.sources.manual': 'Manual',
  'operator.tireMeasure.sources.workshop': 'Workshop report',
  'operator.tireMeasure.sources.ai_confirmed': 'AI upload / document',

  'operator.tireMeasure.seasons.SUMMER': 'Summer tires',
  'operator.tireMeasure.seasons.WINTER': 'Winter tires',
  'operator.tireMeasure.seasons.ALL_SEASON': 'All-season tires',
  'operator.tireMeasure.seasons.TRACK': 'Track',
  'operator.tireMeasure.seasons.OTHER': 'Other',
  'operator.tireMeasure.seasons.UNKNOWN': 'Unknown',

  'operator.tireMeasure.fields.plate': 'License plate',
  'operator.tireMeasure.fields.vehicle': 'Vehicle',
  'operator.tireMeasure.fields.odometer': 'Odometer',
  'operator.tireMeasure.fields.tireSet': 'Tire set',
  'operator.tireMeasure.fields.measuredAt': 'Measurement date',
  'operator.tireMeasure.fields.odometerKm': 'Odometer',
  'operator.tireMeasure.fields.odometerAtMeasurement': 'Odometer at measurement time',
  'operator.tireMeasure.fields.odometerSource': 'Source: {{source}}',
  'operator.tireMeasure.fields.method': 'Measurement method',
  'operator.tireMeasure.fields.workshop': 'Workshop',
  'operator.tireMeasure.fields.note': 'Note',

  'operator.tireMeasure.placeholders.optional': 'Optional',
  'operator.tireMeasure.placeholders.odometerV3Required': 'Required for V3 evidence',
  'operator.tireMeasure.placeholders.workshopName': 'Workshop name',
  'operator.tireMeasure.placeholders.note':
    'Optional — review only locally, not sent to tire-health API',

  'operator.tireMeasure.vehicle.lastMeasurement': 'Last measurement:',
  'operator.tireMeasure.vehicle.pipelineHint':
    'The measurement is written as evidence into the canonical tire-health pipeline — no separate calculation in Operator.',

  'operator.tireMeasure.set.hint':
    'Which tire set was measured? The default is the currently mounted set.',

  'operator.tireMeasure.tread.hint':
    'Tread depth in mm — decimals allowed (e.g. 5.8). At least one tire required.',
  'operator.tireMeasure.tread.plausibilityBounds': 'Plausibility: {{min}}–{{max}} mm (backend limits)',
  'operator.tireMeasure.tread.unitMm': 'mm',
  'operator.tireMeasure.tread.ariaLabel': '{{position}} tread depth mm',

  'operator.tireMeasure.context.confirmOdometer.title': 'Confirm odometer at measurement time',
  'operator.tireMeasure.context.confirmOdometer.hint':
    'Without confirmation, no explicit V3 odometer evidence is stored (vehicle telemetry is not applied silently).',

  'operator.tireMeasure.odometerSource.workshop': 'Workshop report (explicit)',
  'operator.tireMeasure.odometerSource.manualConfirmed': 'Manually confirmed at measurement time',
  'operator.tireMeasure.odometerSource.fleetPrefill': 'Prefilled from vehicle data — please confirm',
  'operator.tireMeasure.odometerSource.unconfirmed': 'Entered without confirmation',
  'operator.tireMeasure.odometerSource.none': 'No odometer reading',

  'operator.tireMeasure.v3.aiSource':
    'AI upload / document: saved values do not count as Tire V3 verification evidence — measure manually or choose workshop source.',
  'operator.tireMeasure.v3.odometerMissing':
    'Without odometer at measurement time, Tire V3 verification and calibration stay insufficient (V2 save remains available).',
  'operator.tireMeasure.v3.odometerUnconfirmed':
    'Odometer not confirmed yet — no explicit V3 odometer evidence will be stored (telemetry is not applied silently).',
  'operator.tireMeasure.v3.noTread': 'At least one wheel tread depth is required for V3 verification.',
  'operator.tireMeasure.v3.registrationBaseline':
    'Registration baseline tread is inventory-only and does not create a V3 verification anchor.',
  'operator.tireMeasure.v3.rateCalibrationTwoPoints':
    'Empirical wear-rate calibration needs at least two spaced measurements with explicit odometer.',
  'operator.tireMeasure.v3.verificationOnePoint':
    'One confirmed measurement can anchor V3 verification; rate calibration needs additional spaced points.',
  'operator.tireMeasure.v3.recordedUnverified':
    'Tread saved as unverified V3 evidence — confirm odometer or use workshop provenance for verification.',
  'operator.tireMeasure.v3.workshopOdometerMissing':
    'Workshop report needs an explicit odometer reading for V3 evidence.',
  'operator.tireMeasure.v3.workshopProvenanceIncomplete':
    'Enter workshop name for verifiable workshop odometer provenance.',

  'operator.tireMeasure.v3.backend.V3_ODOMETER_NOT_EXPLICIT':
    'No explicit odometer stored for V3 (confirm reading at measurement time).',
  'operator.tireMeasure.v3.backend.V3_ODOMETER_INFERRED_NOT_USED':
    'Vehicle telemetry odometer was not applied to V3 evidence.',
  'operator.tireMeasure.v3.backend.V3_POSTERIOR_INSUFFICIENT_EVIDENCE':
    'Rate calibration still gated — need more spaced measurement points.',
  'operator.tireMeasure.v3.backend.V3_REGISTRATION_BASELINE_NOT_VERIFICATION_ANCHOR':
    'Registration baseline does not anchor V3 verification.',
  'operator.tireMeasure.v3.backend.V3_MEASUREMENT_RECORDED_UNVERIFIED':
    'Measurement saved without V3 verification eligibility.',
  'operator.tireMeasure.v3.backend.V3_WORKSHOP_ODOMETER_MISSING':
    'Workshop odometer missing for V3 evidence.',
  'operator.tireMeasure.v3.backend.V3_WORKSHOP_PROVENANCE_INCOMPLETE':
    'Workshop provenance incomplete.',
  'operator.tireMeasure.v3.backend.V3_VERIFICATION_ANCHOR_ONE_POINT':
    'Can anchor V3 verification cadence (one accepted point).',
  'operator.tireMeasure.v3.backend.V3_RATE_CALIBRATION_REQUIRES_TWO_POINTS':
    'Rate calibration requires two or more spaced odometer-backed points.',

  'operator.tireMeasure.context.aiUploadTitle': 'Extract tire report via AI upload',
  'operator.tireMeasure.context.aiUploadHint': 'Apply extracted values only after confirmation',

  'operator.tireMeasure.review.vehicle': 'Vehicle:',
  'operator.tireMeasure.review.tireSet': 'Tire set:',
  'operator.tireMeasure.review.date': 'Date:',
  'operator.tireMeasure.review.km': 'Km:',
  'operator.tireMeasure.review.method': 'Method:',
  'operator.tireMeasure.review.note': 'Note:',
  'operator.tireMeasure.review.uiWarnings': 'Notes (UI only)',
  'operator.tireMeasure.review.v3EvidenceTitle': 'Tire V3 evidence',
  'operator.tireMeasure.review.backendHint':
    'After saving, tire health / rental health reload — status and remaining km come exclusively from the backend.',
  'operator.tireMeasure.review.now': 'Now',

  'operator.tireMeasure.actions.cancel': 'Cancel',
  'operator.tireMeasure.actions.back': 'Back',
  'operator.tireMeasure.actions.continue': 'Continue',
  'operator.tireMeasure.actions.save': 'Save measurement',

  'operator.tireMeasure.toast.success': 'Tire tread measurement saved',
  'operator.tireMeasure.toast.v3EvidenceNotice': 'Saved — Tire V3 evidence notice',
  'operator.tireMeasure.toast.saveError': 'Could not save',
  'operator.tireMeasure.errors.loadFailed': 'Loading failed',

  'operator.tireMeasure.validation.treadRequired': 'Enter at least one tread depth.',
  'operator.tireMeasure.validation.measuredAtInvalid': 'Measurement date is invalid.',
  'operator.tireMeasure.validation.odometerInvalid': 'Odometer reading is invalid.',
  'operator.tireMeasure.validation.odometerRequiredV3':
    'Odometer at measurement time is required (V3 evidence).',

  'operator.tireMeasure.plausibility.range':
    '{{position}}: Value outside {{min}}–{{max}} mm.',
  'operator.tireMeasure.plausibility.legalMin':
    '{{position}}: Near legal minimum tread depth ({{mm}} mm).',
  'operator.tireMeasure.plausibility.low': '{{position}}: Tread very low ({{mm}} mm).',
  'operator.tireMeasure.plausibility.high':
    '{{position}}: Unusually high value ({{mm}} mm) — please verify.',
  'operator.tireMeasure.plausibility.frontAxleDiff':
    'Front axle: Notable FL/FR difference ({{diff}} mm).',
  'operator.tireMeasure.plausibility.rearAxleDiff':
    'Rear axle: Notable RL/RR difference ({{diff}} mm).',

  'operator.tireMeasure.setup.stored': ' (stored)',
  'operator.tireMeasure.setup.mounted': ' (mounted)',
  'operator.tireMeasure.setup.unknownNoSetup': 'Unknown — no tire set on file',

  'operator.tireMeasure.fallback.unknown': 'Unknown',
  'operator.tireMeasure.fallback.active': 'Active',
  'operator.tireMeasure.fallback.vehicle': 'Vehicle',

  'operator.tireMeasure.handover.notePrefix': 'Handover booking {{id}}…',
} as const;
