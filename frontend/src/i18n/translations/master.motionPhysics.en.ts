export const masterMotionPhysicsEn = {
  'master.motionPhysics.sectionTitle': 'Motion physics reference',
  'master.motionPhysics.systemMotorPowerKw': 'Motor / system power (kW)',
  'master.motionPhysics.systemPowerDefinition': 'Power rating type',
  'master.motionPhysics.systemPowerDefinition.option.motor': 'Motor rated power (ICE / single motor)',
  'master.motionPhysics.systemPowerDefinition.option.system': 'Combined system power (hybrid / EV)',
  'master.motionPhysics.systemPowerDefinition.option.estimated': 'Estimated system power (AI / uncertain)',
  'master.motionPhysics.systemPowerDefinition.hint':
    'Do not mix motor-only and combined system ratings — especially for EV and hybrid vehicles.',
  'master.motionPhysics.systemPowerDefinition.persistHint':
    'Power rating type is not saved with “Save Changes”. Use “Confirm manual values” to persist it in the motion physics reference.',
  'master.motionPhysics.systemMotorPowerKw.hintMotor': 'Enter OEM motor rated power in kW.',
  'master.motionPhysics.systemMotorPowerKw.hintSystem': 'Enter OEM combined system power in kW (not wheel power).',
  'master.motionPhysics.accel0To100S': '0–100 km/h (s)',
  'master.motionPhysics.variantAssumption': 'Variant assumption',
  'master.motionPhysics.evidence.estimated': 'Estimated (AI)',
  'master.motionPhysics.evidence.confirmed': 'Confirmed',
  'master.motionPhysics.evidence.verified': 'Verified',
  'master.motionPhysics.confirmAction': 'Confirm AI estimate',
  'master.motionPhysics.manualConfirmAction': 'Confirm manual values',
  'master.motionPhysics.confirmSuccess': 'Motion reference confirmed',
  'master.motionPhysics.confirmError': 'Could not confirm motion reference',
  'master.motionPhysics.manualConfirmError': 'Could not save confirmed manual values',
  'master.motionPhysics.manualConfirmReloadWarning':
    'Manual values were saved, but the active reference could not be reloaded. Display uses the confirmed create response.',
  'master.motionPhysics.activeReferenceLoadError':
    'Could not load the active motion physics reference for this vehicle.',
  'master.motionPhysics.unsavedManualValuesHint':
    'Manual motion physics values differ from the stored reference. They are not saved as a reference until you use “Confirm manual values”.',
  'master.motionPhysics.confirmAiEstimateBlockedHint':
    'Form values differ from the stored AI estimate. Use “Confirm manual values” to save your edits as a confirmed reference.',
  'master.motionPhysics.unsavedAfterVehicleSave':
    'Vehicle data saved. Motion physics reference unchanged — confirm manual values to store your edits.',
  'master.motionPhysics.routineSaveWillNotPersistHint':
    'Motor power, acceleration, and variant are not stored on “Save Changes”. Use “Confirm manual values” to persist them as a confirmed reference.',
  'master.motionPhysics.backfillError':
    'Vehicle saved, but motion physics reference could not be stored. Fix the values and save again.',
  'master.motionPhysics.placeholder.systemMotorPowerKw': 'e.g. 150',
  'master.motionPhysics.placeholder.accel0To100S': 'e.g. 5.2',
  'master.motionPhysics.placeholder.variantAssumption': 'e.g. base RWD',
};
