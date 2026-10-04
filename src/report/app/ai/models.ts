/**
 * The one place the Claude model ID lives. CLI calls can still override it per
 * call site with CLAUDE_MODEL_* env vars; browser calls (chat, pulse check) use
 * it directly. models.test.ts fails if a model ID is hardcoded anywhere else.
 */
export const DEFAULT_MODEL = "claude-opus-5-5";

interface StopInfo {
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
}

/**
 * Opus 5.5 runs safety classifiers that can decline a request with
 * stop_reason "refusal" (HTTP 200, no usable content). Returns a descriptive
 * Error for that case so callers fail loudly instead of reporting a vague
 * "no parsed_output" / "invalid JSON"; returns null otherwise.
 */
export function refusalError(label: string, response: StopInfo): Error | null {
  if (response.stop_reason !== "refusal") return null;
  const category = response.stop_details?.category ?? "unspecified";
  return new Error(`${label}: Claude declined the request (refusal, category: ${category}).`);
}

/**
 * "claude-opus-5-5" → "Claude Opus 5.5". Drops a trailing date snapshot
 * ("claude-haiku-4-5-20251001" → "Claude Haiku 4.5"). IDs that don't follow
 * the claude-<family>-<version> pattern are returned unchanged.
 */
export function modelDisplayName(id: string): string {
  const m = id.match(/^claude-([a-z]+)-(\d+(?:-\d{1,2})*)(?:-\d{8})?$/);
  if (!m) return id;
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `Claude ${family} ${m[2].replace(/-/g, ".")}`;
}

/** Which model produced each AI section of output/analysis.json. */
export interface AIModels {
  narratives?: string;
  tactical_advisor?: string;
}

/**
 * Header label for the models behind the report's AI text: one name when every
 * call used the same model, each call labeled when they differ, null when no
 * AI call ran.
 */
export function aiModelsLabel(models: AIModels | undefined): string | null {
  const parts: [string, string][] = [];
  if (models?.narratives) parts.push(["narratives", models.narratives]);
  if (models?.tactical_advisor) parts.push(["advisor", models.tactical_advisor]);
  if (parts.length === 0) return null;
  if (new Set(parts.map(([, id]) => id)).size === 1) return modelDisplayName(parts[0][1]);
  return parts.map(([label, id]) => `${modelDisplayName(id)} (${label})`).join(", ");
}
