export const masterMotionPhysicsCs = {
  'master.motionPhysics.sectionTitle': 'Referenční data pohybové fyziky',
  'master.motionPhysics.systemMotorPowerKw': 'Výkon motoru / systému (kW)',
  'master.motionPhysics.systemPowerDefinition': 'Typ uvedeného výkonu',
  'master.motionPhysics.systemPowerDefinition.option.motor': 'Jmenovitý výkon motoru (spalovací / jeden motor)',
  'master.motionPhysics.systemPowerDefinition.option.system': 'Kombinovaný systémový výkon (hybrid / EV)',
  'master.motionPhysics.systemPowerDefinition.option.estimated': 'Odhadovaný systémový výkon (AI / nejistý)',
  'master.motionPhysics.systemPowerDefinition.hint':
    'Nemíchejte výkon motoru a systémový výkon — zejména u EV a hybridů.',
  'master.motionPhysics.systemPowerDefinition.persistHint':
    'Typ uvedeného výkonu se neukládá tlačítkem „Uložit změny“. Použijte „Potvrdit ruční hodnoty“ pro uložení volby v referenci pohybové fyziky.',
  'master.motionPhysics.systemMotorPowerKw.hintMotor': 'Zadejte jmenovitý výkon motoru OEM v kW.',
  'master.motionPhysics.systemMotorPowerKw.hintSystem': 'Zadejte kombinovaný systémový výkon OEM v kW (ne výkon na kolech).',
  'master.motionPhysics.accel0To100S': '0–100 km/h (s)',
  'master.motionPhysics.variantAssumption': 'Předpoklad varianty',
  'master.motionPhysics.evidence.estimated': 'Odhad (AI)',
  'master.motionPhysics.evidence.confirmed': 'Potvrzeno',
  'master.motionPhysics.evidence.verified': 'Ověřeno',
  'master.motionPhysics.confirmAction': 'Potvrdit odhad AI',
  'master.motionPhysics.manualConfirmAction': 'Potvrdit ruční hodnoty',
  'master.motionPhysics.confirmSuccess': 'Referenční data potvrzena',
  'master.motionPhysics.confirmError': 'Referenci se nepodařilo potvrdit',
  'master.motionPhysics.manualConfirmError': 'Potvrzené ruční hodnoty se nepodařilo uložit',
  'master.motionPhysics.manualConfirmReloadWarning':
    'Ruční hodnoty byly uloženy, ale aktivní referenci se nepodařilo znovu načíst. Zobrazení vychází z odpovědi na potvrzení.',
  'master.motionPhysics.activeReferenceLoadError':
    'Aktivní referenci fyziky pohybu pro toto vozidlo se nepodařilo načíst.',
  'master.motionPhysics.unsavedManualValuesHint':
    'Ruční hodnoty pohybové fyziky se liší od uložené reference. Uloží se jako reference až po „Potvrdit ruční hodnoty“.',
  'master.motionPhysics.confirmAiEstimateBlockedHint':
    'Hodnoty ve formuláři se liší od uloženého odhadu AI. Použijte „Potvrdit ruční hodnoty“ pro uložení úprav jako potvrzené reference.',
  'master.motionPhysics.unsavedAfterVehicleSave':
    'Data vozidla uložena. Reference pohybové fyziky beze změny — potvrďte ruční hodnoty pro uložení úprav.',
  'master.motionPhysics.routineSaveWillNotPersistHint':
    'Výkon motoru, zrychlení a varianta se při „Uložit změny“ neukládají. Použijte „Potvrdit ruční hodnoty“ pro uložení jako potvrzenou referenci.',
  'master.motionPhysics.backfillError':
    'Vozidlo uloženo, ale referenci pohybové fyziky se nepodařilo uložit. Opravte hodnoty a uložte znovu.',
  'master.motionPhysics.placeholder.systemMotorPowerKw': 'např. 150',
  'master.motionPhysics.placeholder.accel0To100S': 'např. 5,2',
  'master.motionPhysics.placeholder.variantAssumption': 'např. základní RWD',
};
