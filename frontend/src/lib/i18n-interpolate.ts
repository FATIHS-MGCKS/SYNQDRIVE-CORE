/** Shared platform translation variable substitution (single- and double-brace). */
export function interpolateTranslationVars(
  text: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return text;
  let result = text;
  const names = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const value = String(vars[name]);
    result = result.replaceAll(`{{${name}}}`, value);
    result = result.replaceAll(`{${name}}`, value);
  }
  return result;
}
