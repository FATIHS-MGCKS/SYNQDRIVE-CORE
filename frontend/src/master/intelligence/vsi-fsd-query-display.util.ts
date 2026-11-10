/** Render planned/accepted/observed triples without collapsing to a single catalog flag. */

export type FsdQueryTriple = {
  queryPlanned: boolean;
  queryAccepted: boolean | null;
  observedValue: boolean | null;
} | null;

export type FsdQueryTripleLabel = 'planned' | 'accepted' | 'observed' | 'notPlanned' | 'unknown';

export function classifyFsdQueryTriple(triple: FsdQueryTriple): FsdQueryTripleLabel {
  if (!triple) return 'unknown';
  if (!triple.queryPlanned) return 'notPlanned';
  if (triple.queryAccepted === true && triple.observedValue === true) return 'observed';
  if (triple.queryAccepted === true) return 'accepted';
  return 'planned';
}
