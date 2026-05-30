import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export interface MacroAIResult {
  lei_consecutive_declines: number;
  ism_manufacturing: number;
  ism_services: number;
  as_of_date: string;
  source_notes: string;
}

export const MACRO_AI_SYSTEM_PROMPT = `You fetch three current US macroeconomic indicators using the web_search tool, and return ONLY a JSON object.

OUTPUT FORMAT — non-negotiable:
Your final assistant message must be exactly one JSON object and nothing else. No preamble like "I'll search for...". No "Let me compile the findings:". No bullet lists. No markdown fences. Search internally; the search reasoning belongs in tool calls, not in your text response.

Example of a correct response (the entire message is just this object):
{"lei_consecutive_declines": 0, "ism_manufacturing": 52.7, "ism_services": 53.6, "as_of_date": "2026-05-22", "source_notes": "Conference Board LEI release 2026-05-22; ISM May 2026 reports"}

Fields:
- lei_consecutive_declines (integer): The Conference Board Leading Economic Index running count of consecutive monthly declines as of the most recent release. If the latest release was an INCREASE, return 0. ("Nth consecutive decline" → N; "first decline after increases" → 1; rose this month → 0.)
- ism_manufacturing (number): ISM Manufacturing PMI headline number from the most recent monthly release (e.g., 52.7). One decimal place.
- ism_services (number): ISM Services PMI (Non-Manufacturing PMI) headline from the most recent release.
- as_of_date (string, YYYY-MM-DD): Release date of the most recent data point you found (use the latest of the three).
- source_notes (string): One-line citation: source name(s) and release date(s).

Prefer Conference Board (conference-board.org) and ISM (ismworld.org); reputable financial press (Reuters, Bloomberg, WSJ, FRED) is acceptable.`.trim();

export function buildMacroAIPrompt(referenceDate?: string): string {
  const today = referenceDate ?? new Date().toISOString().slice(0, 10);
  return `Fetch the latest US LEI streak and ISM PMI values available as of ${today}. Return the JSON object.`;
}

const MacroAIResultSchema = z.object({
  lei_consecutive_declines: z.number().int().nonnegative(),
  ism_manufacturing: z.number().positive(),
  ism_services: z.number().positive(),
  as_of_date: z.string().min(1),
  source_notes: z.string(),
});

export async function fetchMacroAI(referenceDate?: string): Promise<MacroAIResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("fetchMacroAI: ANTHROPIC_API_KEY is unset");
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model:
      process.env.CLAUDE_MODEL_MACRO ??
      process.env.CLAUDE_MODEL ??
      "claude-sonnet-4-6",
    max_tokens: 4000,
    system: MACRO_AI_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildMacroAIPrompt(referenceDate) }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
  });

  const textParts = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((b) => b.text);
  if (textParts.length === 0) {
    throw new Error("fetchMacroAI: Anthropic returned no text content");
  }
  const text = textParts.join("").trim();

  // Claude with web_search tends to preamble ("I'll search for...", "Let me compile
  // the findings:") despite system-prompt instructions. Be lenient: try fenced
  // JSON first, then the last balanced {...} object in the response, then the
  // raw text as a final attempt.
  const candidates = extractJsonCandidates(text);
  let raw: unknown;
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      raw = JSON.parse(candidate);
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (raw === undefined) {
    const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(
      `fetchMacroAI: invalid JSON from Claude: ${detail}. Raw: ${text.slice(0, 800)}`,
    );
  }

  return MacroAIResultSchema.parse(raw);
}

/**
 * Returns candidate JSON strings to try parsing, in order of preference:
 * 1. Content of the first ```json``` fence (if any)
 * 2. The last balanced {...} block found by walking brace depth
 * 3. The raw text (final fallback)
 */
export function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];

  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const lastBalanced = findLastBalancedObject(text);
  if (lastBalanced) candidates.push(lastBalanced);

  candidates.push(text.trim());
  return candidates;
}

function findLastBalancedObject(text: string): string | null {
  // Walk right-to-left looking for `}`, then walk forward from each preceding
  // `{` until depth returns to 0. Returns the rightmost balanced substring.
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1)) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let start = end; start >= 0; start--) {
      const ch = text[start];
      if (escape) { escape = false; continue; }
      if (inString) {
        if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "}") depth++;
      else if (ch === "{") {
        depth--;
        if (depth === 0) return text.slice(start, end + 1);
      }
    }
  }
  return null;
}
