/**
 * Today's LOCAL calendar date as YYYY-MM-DD. Passed to every AI call so the
 * model reasons about "now" instead of its training cutoff. Uses local date
 * parts, not toISOString(), which would roll to tomorrow on US evenings.
 */
export function todayIso(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
