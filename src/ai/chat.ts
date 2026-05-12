import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  ChatScope,
  Situation,
  Note,
} from "../types";

export const CHAT_SYSTEM_PROMPT = `You are the user's portfolio advisor with access to their full analysis, open situations, and notes. CFA tone — direct, no hedging, no words "robust" or "optimize". Grades use Unicode minus (−), not ASCII -.

CAPABILITIES:
- Answer questions about findings, scores, allocations, macro context
- Propose creating Situations when the user describes ongoing plans (rollovers, multi-step deployments, decisions they're tracking)
- Propose creating Notes when the user gives context that explains a flag they're OK with
- Propose closing Situations when the user mentions completion

CONSTRAINTS:
- NEVER fabricate values. If the requested data isn't in the context, say so.
- When the user's scope is a specific finding, prefer answers grounded in that finding.
- Tool use is PROPOSAL ONLY — user confirms in the UI. Do not assume the tool ran; respond as if you're suggesting an action.
- Stream prose first, then emit at most one tool call per turn.
- Use Unicode minus for negatives.

FACT VS JUDGMENT RULE for tool proposals:
- If the user is telling you a fact about their portfolio the engine doesn't know (e.g., "$X cash has a deployment plan"), propose a Situation with portfolio_effects.
- If the user is explaining a judgment ("I accept this concentration"), propose a Note with suppress_flag.
- Don't inflate the grade by suppressing real problems — use Notes for judgment, not portfolio_effects.`.trim();

export const CHAT_TOOLS = [
  {
    name: "propose_situation",
    description:
      "Propose tracking an ongoing plan, deployment, or decision as a Situation. The user must confirm in the UI before this takes effect.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        intent: { type: "string" },
        target_date: { type: "string", description: "ISO date YYYY-MM-DD, optional" },
        related_findings: { type: "array", items: { type: "string" } },
        portfolio_effects: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                properties: {
                  type: { const: "mark_cash_pending" },
                  amount_usd: { type: "number" },
                  deployment_label: { type: "string" },
                },
                required: ["type", "amount_usd"],
              },
              {
                type: "object",
                properties: {
                  type: { const: "mark_holding_pending" },
                  ticker: { type: "string" },
                  amount_usd: { type: "number" },
                },
                required: ["type", "ticker"],
              },
            ],
          },
        },
      },
      required: ["title", "intent"],
    },
  },
  {
    name: "propose_note",
    description:
      "Propose attaching a judgment Note to a finding. Setting suppress_flag mutes the flag (cosmetic; score unchanged). User confirms in UI.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "object",
          properties: {
            type: { enum: ["flag", "gap", "dimension", "global"] },
            finding_key: { type: "string" },
          },
          required: ["type", "finding_key"],
        },
        body: { type: "string" },
        suppress_flag: { type: "boolean" },
      },
      required: ["target", "body", "suppress_flag"],
    },
  },
  {
    name: "propose_close_situation",
    description: "Propose marking a Situation as resolved when the user mentions completion.",
    input_schema: {
      type: "object",
      properties: {
        situation_id: { type: "string" },
        closure_reason: { type: "string" },
      },
      required: ["situation_id", "closure_reason"],
    },
  },
] as const;

export interface ChatInputContext {
  user_message: string;
  scope: ChatScope;
  analysis: any;
  situations: Situation[];
  notes: Note[];
  history: ChatMessage[];
}

function summarizeOpenSituations(situations: Situation[]) {
  return situations
    .filter((s) => s.status === "open")
    .map((s) => ({
      id: s.id,
      title: s.title,
      intent: s.intent,
      target_date: s.target_date,
      latest_verdict: s.verdict_history.at(-1) ?? null,
    }));
}

function trimAnalysisByScope(analysis: any, scope: ChatScope): unknown {
  if (!analysis) return null;
  if (scope.type === "global") {
    return {
      portfolio_grade: analysis.portfolio_grade,
      portfolio_score: analysis.portfolio_score,
      top_flags: (analysis.flags ?? []).slice(0, 3),
      dimension_scores: analysis.dimension_scores,
      macro: analysis.macro,
      aggregates: analysis.aggregates,
    };
  }
  if (scope.type === "flag" || scope.type === "gap") {
    const flag = (analysis.flags ?? []).find((f: any) => f.finding_key === scope.finding_key);
    const gap = (analysis.gap_items ?? []).find((g: any) => g.finding_key === scope.finding_key);
    return {
      portfolio_grade: analysis.portfolio_grade,
      finding: flag ?? gap ?? null,
      finding_key: scope.finding_key,
      macro: analysis.macro,
    };
  }
  if (scope.type === "situation") {
    return {
      portfolio_grade: analysis.portfolio_grade,
      macro: analysis.macro,
    };
  }
  return null;
}

function sameScope(a: ChatScope, b: ChatScope): boolean {
  if (a.type !== b.type) return false;
  if (a.finding_key !== b.finding_key) return false;
  if (a.situation_id !== b.situation_id) return false;
  return true;
}

export function renderChatInput(ctx: ChatInputContext): string {
  const historyFiltered =
    ctx.scope.type === "global"
      ? ctx.history.slice(-20)
      : ctx.history
          .filter((m) => m.scope.type === "global" || sameScope(m.scope, ctx.scope))
          .slice(-20);

  const notesScoped = ctx.notes.filter((n) => {
    if (ctx.scope.type === "flag" || ctx.scope.type === "gap") {
      return n.target.finding_key === ctx.scope.finding_key;
    }
    return false;
  });

  return JSON.stringify(
    {
      user_message: ctx.user_message,
      scope: ctx.scope,
      analysis_scope: trimAnalysisByScope(ctx.analysis, ctx.scope),
      open_situations: summarizeOpenSituations(ctx.situations),
      notes_in_scope: notesScoped,
      history: historyFiltered.map((m) => ({
        role: m.role,
        content: m.content,
        scope: m.scope,
      })),
    },
    null,
    2,
  );
}

export interface RunChatOptions {
  context: ChatInputContext;
  onDelta: (text: string) => void;
  onToolUse?: (toolName: string, payload: Record<string, unknown>) => void;
}

export async function runChat(opts: RunChatOptions): Promise<void> {
  const client = new Anthropic();
  const userContent = renderChatInput(opts.context);

  const stream = client.messages.stream({
    model:
      process.env.CLAUDE_MODEL_CHAT ??
      process.env.CLAUDE_MODEL ??
      "claude-sonnet-4-6",
    max_tokens: 2000,
    system: CHAT_SYSTEM_PROMPT,
    tools: CHAT_TOOLS as any,
    messages: [{ role: "user", content: userContent }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const d = event.delta;
      if (d.type === "text_delta") {
        opts.onDelta(d.text);
      }
    }
  }
  const final = await stream.finalMessage();
  if (opts.onToolUse) {
    for (const block of final.content) {
      if (block.type === "tool_use") {
        opts.onToolUse(block.name, block.input as Record<string, unknown>);
      }
    }
  }
}
