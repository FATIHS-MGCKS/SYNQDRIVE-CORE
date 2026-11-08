import type {
  MaintenanceEvidenceEvent,
  MaintenancePositionKind,
  MaintenanceSchedulePosition,
} from './maintenance-forecast.types';

/**
 * Component vocabulary used to match *structured* performed-work items against plan positions.
 * Matching is exact-substring on lower-cased text; free-text notes are never passed in.
 */
export const MAINTENANCE_COMPONENT_VOCABULARY: Record<string, string[]> = {
  engine_oil: ['engine oil', 'engine: oil', 'motor oil', 'motoröl', 'ölwechsel', 'oil and filter', 'oil filter', 'ölfilter', 'oil change'],
  brake_fluid: ['brake fluid', 'bremsflüssigkeit'],
  spark_plug: ['spark plug', 'zündkerze'],
  cabin_filter: ['cabin filter', 'interior filter', 'interior air filter', 'pollen filter', 'dust filter', 'innenraumfilter', 'pollenfilter', 'staubfilter', 'microfilter', 'mikrofilter'],
  air_filter: ['air filter', 'luftfilter', 'air cleaner'],
  fuel_filter: ['fuel filter', 'kraftstofffilter', 'dieselfilter'],
  transmission_oil: ['transmission oil', 'automatic transmission', 'atf', 'gearbox oil', 'getriebeöl', 'transmission fluid'],
  axle_oil: ['axle oil', 'rear axle', 'front axle', 'differential', 'coupling oil', 'achsöl', 'awd coupling', 'haldex'],
  coolant: ['coolant', 'kühlmittel', 'antifreeze'],
  timing_belt: ['timing belt', 'zahnriemen', 'cam belt'],
  auxiliary_belt: ['auxiliary belt', 'drive belt', 'keilrippenriemen', 'poly-v'],
  battery_12v: ['12v battery', 'starter battery', 'starterbatterie'],
};

/** Terms that disqualify an oil mention from being an *engine* oil change. */
const NON_ENGINE_OIL_CONTEXT = [
  'axle',
  'achse',
  'gear',
  'getriebe',
  'transmission',
  'differential',
  'coupling',
  'kupplung',
  'brake',
  'brems',
  'hydraul',
  'power steering',
  'servo',
  'haldex',
];

const ENGINE_OIL_TERMS = ['oil', 'öl'];

const OIL_LEVEL_CHECK_TERMS = [
  'oil level',
  'ölstand',
  'oil-level',
  'check oil',
  'oil check',
  'öl kontrolle',
  'öl kontrol',
  'kontrolle öl',
  'oil inspection',
  'top up oil',
  'oil top up',
  'top-up oil',
  'öl nachfüllen',
  'nachfüllen öl',
  'oil refill',
  'refill oil',
  'öl auffüllen',
];

const OIL_CHANGE_ACTION_TERMS = [
  'replace',
  'change',
  'wechsel',
  'tausch',
  'erneuern',
  'renew',
  'drain',
  'entleeren',
  'service oil',
  'ölwechsel',
  'oil change',
];

/** Noun phrases that identify *engine* oil service (not gearbox/axle/filter-only). */
const ENGINE_OIL_NOUN_TERMS = [
  'engine oil',
  'engine: oil',
  'motor oil',
  'motoröl',
  'motoroel',
  'ölwechsel',
  'oil change',
];

const FILTER_INSPECTION_TERMS = ['inspect', 'inspection', 'check', 'kontrolle', 'kontrol', 'prüf', 'pruf', 'pruef'];

export function normalizeWorkText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when the work item is only an oil level check / top-up without a documented change. */
export function isOilLevelCheckOnlyWorkItem(item: string): boolean {
  const t = normalizeWorkText(item);
  if (!ENGINE_OIL_TERMS.some((term) => t.includes(term))) return false;
  const looksLikeLevelCheck = OIL_LEVEL_CHECK_TERMS.some((term) => t.includes(term));
  if (!looksLikeLevelCheck) return false;
  return !OIL_CHANGE_ACTION_TERMS.some((term) => t.includes(term));
}

/** Oil-filter line that only inspects/checks — not a motor oil change baseline. */
export function isOilFilterInspectionWorkItem(item: string): boolean {
  const t = normalizeWorkText(item);
  const mentionsOilFilter = t.includes('oil filter') || t.includes('ölfilter') || t.includes('oelfilter');
  if (!mentionsOilFilter) return false;
  const hasEngineOilNoun = ENGINE_OIL_NOUN_TERMS.some((term) => t.includes(term));
  const hasChange = OIL_CHANGE_ACTION_TERMS.some((term) => t.includes(term));
  if (hasEngineOilNoun && hasChange) return false;
  if (FILTER_INSPECTION_TERMS.some((term) => t.includes(term))) return true;
  return !hasChange;
}

/**
 * True when a structured work item documents an actual *engine* oil change (not level check,
 * filter inspection, or filter-only replace without motor-oil service).
 */
export function isEngineOilChangeWorkItem(item: string): boolean {
  const t = normalizeWorkText(item);
  if (isOilLevelCheckOnlyWorkItem(item)) return false;
  if (isOilFilterInspectionWorkItem(item)) return false;
  if (NON_ENGINE_OIL_CONTEXT.some((ctx) => t.includes(ctx))) return false;

  const hasEngineOilNoun = ENGINE_OIL_NOUN_TERMS.some((term) => t.includes(term));
  const hasChangeAction = OIL_CHANGE_ACTION_TERMS.some((term) => t.includes(term));

  if (t.includes('ölwechsel') || t.includes('oil change')) return true;

  if (hasEngineOilNoun && hasChangeAction) return true;

  // Filter-only replace (no motor-oil noun) is not proof of a motor oil change.
  const filterOnly =
    (t.includes('oil filter') || t.includes('ölfilter') || t.includes('oelfilter')) && !hasEngineOilNoun;
  if (filterOnly) return false;

  if (!ENGINE_OIL_TERMS.some((term) => t.includes(term))) return false;

  // Residual oil mentions without a documented change action do not count (e.g. vague "oil service").
  return hasChangeAction;
}

/** Component keys mentioned by a text (plan description/task or structured work item). */
export function extractComponentKeys(text: string): string[] {
  const t = normalizeWorkText(text);
  const keys: string[] = [];
  for (const [key, terms] of Object.entries(MAINTENANCE_COMPONENT_VOCABULARY)) {
    if (key === 'engine_oil') {
      if (isEngineOilChangeWorkItem(t)) keys.push(key);
      continue;
    }
    if (key === 'air_filter') {
      // "interior air filter" / "cabin air filter" belong to cabin_filter.
      const cabin = MAINTENANCE_COMPONENT_VOCABULARY.cabin_filter!.some((term) => t.includes(term));
      if (!cabin && terms.some((term) => t.includes(term))) keys.push(key);
      continue;
    }
    if (terms.some((term) => t.includes(term))) keys.push(key);
  }
  return keys;
}

export function extractComponentKeysFromWorkItems(items: string[]): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    for (const key of extractComponentKeys(item)) out.add(key);
  }
  return out;
}

const INSPECTION_KINDS: MaintenancePositionKind[] = ['INSPECTION', 'INSPECTION_SMALL', 'INSPECTION_LARGE'];

/**
 * Decides whether a proven history event resets (covers) a plan position.
 *
 * Rules (SEC-DEC-003):
 * - FULL_SERVICE / GENERAL_INSPECTION cover INSPECTION. INSPECTION_SMALL/LARGE only when the
 *   event's confirmed `serviceKind` matches (a small service never covers a large one).
 * - FULL_SERVICE covers OIL_CHANGE only when a structured work item proves an engine oil change.
 * - OIL_CHANGE covers OIL_CHANGE only.
 * - REPAIR / BRAKE / TIRE / BATTERY / TUV / BOKRAFT / OTHER never cover regular positions by type.
 * - OTHER (extra) positions are covered only by a component-vocabulary match on structured work items.
 */
export function eventCoversPosition(
  event: MaintenanceEvidenceEvent,
  position: MaintenanceSchedulePosition,
): boolean {
  const type = event.eventType;
  const kind = position.kind;

  if (INSPECTION_KINDS.includes(kind)) {
    if (type !== 'FULL_SERVICE' && type !== 'GENERAL_INSPECTION') return false;
    if (kind === 'INSPECTION') return true;
    if (kind === 'INSPECTION_LARGE') return event.serviceKind === 'INSPECTION_LARGE';
    // INSPECTION_SMALL is also satisfied by a proven large inspection.
    return event.serviceKind === 'INSPECTION_SMALL' || event.serviceKind === 'INSPECTION_LARGE';
  }

  if (kind === 'OIL_CHANGE') {
    if (type === 'OIL_CHANGE') {
      if (event.performedWork.length > 0) {
        return event.performedWork.some(isEngineOilChangeWorkItem);
      }
      // OneAuto / workshop / OCR without structured proof must not reset engine oil.
      if (event.eventSource === 'SERVICE_EVENT_ONEAUTO') return false;
      if (
        event.eventSource === 'SERVICE_EVENT_OCR' ||
        event.eventSource === 'SERVICE_EVENT_WORKSHOP'
      ) {
        return false;
      }
      // Explicit confirmed manual motor-oil entry (type only) remains allowed.
      return event.eventSource === 'SERVICE_EVENT_MANUAL';
    }
    if (type === 'FULL_SERVICE' || type === 'GENERAL_INSPECTION') {
      return event.performedWork.some(isEngineOilChangeWorkItem);
    }
    return false;
  }

  // OTHER positions: structured component match only.
  if (position.componentTerms.length === 0) return false;
  if (event.performedWork.length === 0) return false;
  const eventKeys = extractComponentKeysFromWorkItems(event.performedWork);
  return position.componentTerms.some((term) => eventKeys.has(term));
}

/** Latest covering event by date (ties: higher odometer wins) or null. */
export function findLatestCoveringEvent(
  events: MaintenanceEvidenceEvent[],
  position: MaintenanceSchedulePosition,
  now: Date,
): MaintenanceEvidenceEvent | null {
  let best: MaintenanceEvidenceEvent | null = null;
  for (const event of events) {
    if (event.eventDate.getTime() > now.getTime()) continue;
    if (!eventCoversPosition(event, position)) continue;
    if (
      !best ||
      event.eventDate.getTime() > best.eventDate.getTime() ||
      (event.eventDate.getTime() === best.eventDate.getTime() &&
        (event.odometerKm ?? -1) > (best.odometerKm ?? -1))
    ) {
      best = event;
    }
  }
  return best;
}
