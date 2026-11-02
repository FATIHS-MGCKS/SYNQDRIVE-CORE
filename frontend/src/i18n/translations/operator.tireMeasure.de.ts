export const operatorTireMeasureDe = {
  'operator.tireMeasure.eyebrow': 'Reifenprofil messen',
  'operator.tireMeasure.stepProgress': 'Schritt {{current}}/{{total}} — {{step}}',

  'operator.tireMeasure.steps.vehicle': 'Fahrzeug',
  'operator.tireMeasure.steps.set': 'Reifenset',
  'operator.tireMeasure.steps.tread': 'Profil',
  'operator.tireMeasure.steps.context': 'Kontext',
  'operator.tireMeasure.steps.review': 'Prüfen',

  'operator.tireMeasure.positions.fl.short': 'VL',
  'operator.tireMeasure.positions.fl.long': 'Vorne links',
  'operator.tireMeasure.positions.fr.short': 'VR',
  'operator.tireMeasure.positions.fr.long': 'Vorne rechts',
  'operator.tireMeasure.positions.rl.short': 'HL',
  'operator.tireMeasure.positions.rl.long': 'Hinten links',
  'operator.tireMeasure.positions.rr.short': 'HR',
  'operator.tireMeasure.positions.rr.long': 'Hinten rechts',

  'operator.tireMeasure.sources.manual': 'Manuell',
  'operator.tireMeasure.sources.workshop': 'Werkstattbericht',
  'operator.tireMeasure.sources.ai_confirmed': 'AI Upload / Dokument',

  'operator.tireMeasure.seasons.SUMMER': 'Sommerreifen',
  'operator.tireMeasure.seasons.WINTER': 'Winterreifen',
  'operator.tireMeasure.seasons.ALL_SEASON': 'Ganzjahresreifen',
  'operator.tireMeasure.seasons.TRACK': 'Track',
  'operator.tireMeasure.seasons.OTHER': 'Sonstiges',
  'operator.tireMeasure.seasons.UNKNOWN': 'Unbekannt',

  'operator.tireMeasure.fields.plate': 'Kennzeichen',
  'operator.tireMeasure.fields.vehicle': 'Fahrzeug',
  'operator.tireMeasure.fields.odometer': 'Kilometerstand',
  'operator.tireMeasure.fields.tireSet': 'Reifenset',
  'operator.tireMeasure.fields.measuredAt': 'Messdatum',
  'operator.tireMeasure.fields.odometerKm': 'Kilometerstand',
  'operator.tireMeasure.fields.odometerAtMeasurement': 'Kilometerstand am Messzeitpunkt',
  'operator.tireMeasure.fields.odometerSource': 'Quelle: {{source}}',
  'operator.tireMeasure.fields.method': 'Messmethode',
  'operator.tireMeasure.fields.workshop': 'Werkstatt',
  'operator.tireMeasure.fields.note': 'Notiz',

  'operator.tireMeasure.placeholders.optional': 'Optional',
  'operator.tireMeasure.placeholders.odometerV3Required': 'Erforderlich für V3-Nachweis',
  'operator.tireMeasure.placeholders.workshopName': 'Name der Werkstatt',
  'operator.tireMeasure.placeholders.note':
    'Optional — nur lokal im Review, nicht in Tire-Health-API',

  'operator.tireMeasure.vehicle.lastMeasurement': 'Letzte Messung:',
  'operator.tireMeasure.vehicle.pipelineHint':
    'Messung wird als Evidence in die kanonische Tire-Health-Pipeline geschrieben — keine separate Berechnung im Operator.',

  'operator.tireMeasure.set.hint':
    'Welches Reifenset wurde gemessen? Standard ist das aktuell montierte Set.',

  'operator.tireMeasure.tread.hint':
    'Profiltiefe in mm — Dezimalwerte erlaubt (z. B. 5,8). Mindestens ein Reifen erforderlich.',
  'operator.tireMeasure.tread.plausibilityBounds':
    'Plausibilität: {{min}}–{{max}} mm (Backend-Grenzen)',
  'operator.tireMeasure.tread.unitMm': 'mm',
  'operator.tireMeasure.tread.ariaLabel': '{{position}} Profiltiefe mm',

  'operator.tireMeasure.context.confirmOdometer.title': 'Kilometerstand am Messzeitpunkt bestätigen',
  'operator.tireMeasure.context.confirmOdometer.hint':
    'Ohne Bestätigung wird kein expliziter V3-Odometer-Nachweis gespeichert (Fahrzeug-Telemetrie wird nicht still übernommen).',

  'operator.tireMeasure.odometerSource.workshop': 'Werkstattbericht (explizit)',
  'operator.tireMeasure.odometerSource.manualConfirmed': 'Manuell bestätigt am Messzeitpunkt',
  'operator.tireMeasure.odometerSource.fleetPrefill': 'Vorausgefüllt aus Fahrzeugdaten — bitte bestätigen',
  'operator.tireMeasure.odometerSource.unconfirmed': 'Eingabe ohne Bestätigung',
  'operator.tireMeasure.odometerSource.none': 'Kein Kilometerstand',

  'operator.tireMeasure.v3.aiSource':
    'AI Upload / Dokument: gespeicherte Werte zählen nicht als Tire-V3-Verifikationsnachweis — Profil manuell messen oder Werkstattquelle wählen.',
  'operator.tireMeasure.v3.odometerMissing':
    'Ohne Kilometerstand am Messzeitpunkt bleibt Tire-V3-Verifikation und Kalibrierung unzureichend (V2-Speicherung bleibt möglich).',
  'operator.tireMeasure.v3.odometerUnconfirmed':
    'Kilometerstand noch nicht bestätigt — für V3 wird kein expliziter Odometer-Nachweis gespeichert (Telemetrie wird nicht still übernommen).',
  'operator.tireMeasure.v3.noTread': 'Mindestens ein Radprofil ist für V3-Verifikation erforderlich.',
  'operator.tireMeasure.v3.registrationBaseline':
    'Registrierungs-Basisprofil dient nur der Bestandserfassung und verankert keine V3-Verifikation.',
  'operator.tireMeasure.v3.rateCalibrationTwoPoints':
    'Empirische Verschleißraten-Kalibrierung braucht mindestens zwei Messpunkte mit explizitem Kilometerstand.',
  'operator.tireMeasure.v3.verificationOnePoint':
    'Ein bestätigter Messpunkt kann V3-Verifikation verankern; Ratenkalibrierung braucht weitere Abstände.',
  'operator.tireMeasure.v3.recordedUnverified':
    'Profil als unverifizierter V3-Nachweis gespeichert — Kilometerstand bestätigen oder Werkstattprovenienz nutzen.',
  'operator.tireMeasure.v3.workshopOdometerMissing':
    'Werkstattbericht braucht expliziten Kilometerstand für V3-Nachweis.',
  'operator.tireMeasure.v3.workshopProvenanceIncomplete':
    'Werkstattname angeben für nachvollziehbare Werkstatt-Odometer-Provenienz.',

  'operator.tireMeasure.v3.backend.V3_ODOMETER_NOT_EXPLICIT':
    'Kein expliziter Kilometerstand für V3 gespeichert (Bestätigung am Messzeitpunkt fehlt).',
  'operator.tireMeasure.v3.backend.V3_ODOMETER_INFERRED_NOT_USED':
    'Fahrzeug-Telemetrie-Odometer wurde nicht für V3 übernommen.',
  'operator.tireMeasure.v3.backend.V3_POSTERIOR_INSUFFICIENT_EVIDENCE':
    'Ratenkalibrierung weiter gesperrt — mehr Abstand zwischen Messpunkten nötig.',
  'operator.tireMeasure.v3.backend.V3_REGISTRATION_BASELINE_NOT_VERIFICATION_ANCHOR':
    'Registrierungs-Basis verankert keine V3-Verifikation.',
  'operator.tireMeasure.v3.backend.V3_MEASUREMENT_RECORDED_UNVERIFIED':
    'Messung ohne V3-Verifikationsfähigkeit gespeichert.',
  'operator.tireMeasure.v3.backend.V3_WORKSHOP_ODOMETER_MISSING':
    'Werkstatt-Kilometerstand für V3 fehlt.',
  'operator.tireMeasure.v3.backend.V3_WORKSHOP_PROVENANCE_INCOMPLETE':
    'Werkstattprovenienz unvollständig.',
  'operator.tireMeasure.v3.backend.V3_VERIFICATION_ANCHOR_ONE_POINT':
    'Kann V3-Verifikationskadenz verankern (ein akzeptierter Punkt).',
  'operator.tireMeasure.v3.backend.V3_RATE_CALIBRATION_REQUIRES_TWO_POINTS':
    'Ratenkalibrierung braucht zwei oder mehr Abstandsmessungen mit Odometer.',

  'operator.tireMeasure.context.aiUploadTitle': 'Reifenbericht per AI Upload auslesen',
  'operator.tireMeasure.context.aiUploadHint':
    'Extrahierte Werte erst nach Bestätigung übernehmen',

  'operator.tireMeasure.review.vehicle': 'Fahrzeug:',
  'operator.tireMeasure.review.tireSet': 'Reifenset:',
  'operator.tireMeasure.review.date': 'Datum:',
  'operator.tireMeasure.review.km': 'Km:',
  'operator.tireMeasure.review.method': 'Methode:',
  'operator.tireMeasure.review.note': 'Notiz:',
  'operator.tireMeasure.review.uiWarnings': 'Hinweise (nur UI)',
  'operator.tireMeasure.review.v3EvidenceTitle': 'Tire V3 Nachweis',
  'operator.tireMeasure.review.backendHint':
    'Nach Speichern lädt Tire Health / Rental Health neu — Status und Rest-km kommen ausschließlich vom Backend.',
  'operator.tireMeasure.review.now': 'Jetzt',

  'operator.tireMeasure.actions.cancel': 'Abbrechen',
  'operator.tireMeasure.actions.back': 'Zurück',
  'operator.tireMeasure.actions.continue': 'Weiter',
  'operator.tireMeasure.actions.save': 'Messung speichern',

  'operator.tireMeasure.toast.success': 'Reifenprofilmessung gespeichert',
  'operator.tireMeasure.toast.v3EvidenceNotice': 'Gespeichert — Hinweis zum Tire-V3-Nachweis',
  'operator.tireMeasure.toast.saveError': 'Speichern fehlgeschlagen',
  'operator.tireMeasure.errors.loadFailed': 'Laden fehlgeschlagen',

  'operator.tireMeasure.validation.treadRequired': 'Mindestens eine Profiltiefe eingeben.',
  'operator.tireMeasure.validation.measuredAtInvalid': 'Messdatum ungültig.',
  'operator.tireMeasure.validation.odometerInvalid': 'Kilometerstand ungültig.',
  'operator.tireMeasure.validation.odometerRequiredV3':
    'Kilometerstand zum Messzeitpunkt ist erforderlich (V3-Nachweis).',

  'operator.tireMeasure.plausibility.range':
    '{{position}}: Wert außerhalb {{min}}–{{max}} mm.',
  'operator.tireMeasure.plausibility.legalMin':
    '{{position}}: Nahe gesetzlicher Mindestprofiltiefe ({{mm}} mm).',
  'operator.tireMeasure.plausibility.low': '{{position}}: Profil sehr niedrig ({{mm}} mm).',
  'operator.tireMeasure.plausibility.high':
    '{{position}}: Ungewöhnlich hoher Wert ({{mm}} mm) — bitte prüfen.',
  'operator.tireMeasure.plausibility.frontAxleDiff':
    'Vorderachse: Unterschied VL/VR auffällig ({{diff}} mm).',
  'operator.tireMeasure.plausibility.rearAxleDiff':
    'Hinterachse: Unterschied HL/HR auffällig ({{diff}} mm).',

  'operator.tireMeasure.setup.stored': ' (gelagert)',
  'operator.tireMeasure.setup.mounted': ' (montiert)',
  'operator.tireMeasure.setup.unknownNoSetup': 'Unbekannt — kein Reifenset hinterlegt',

  'operator.tireMeasure.fallback.unknown': 'Unbekannt',
  'operator.tireMeasure.fallback.active': 'Aktiv',
  'operator.tireMeasure.fallback.vehicle': 'Fahrzeug',

  'operator.tireMeasure.handover.notePrefix': 'Handover Buchung {{id}}…',
} as const;
