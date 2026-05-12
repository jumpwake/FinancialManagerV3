import { z } from "zod";
import type { UserContext } from "../types";

const PortfolioEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mark_cash_pending"),
    amount_usd: z.number().positive(),
    deployment_label: z.string().optional(),
  }),
  z.object({
    type: z.literal("mark_holding_pending"),
    ticker: z.string().min(1),
    amount_usd: z.number().positive().optional(),
  }),
]);

const MacroSnapshotSchema = z.object({
  regime: z.string(),
  vix: z.number(),
  yield_curve_10y_2y: z.number(),
  hy_credit_spread_oas_bps: z.number(),
  lei_consecutive_declines: z.number(),
});

const PulseVerdictSchema = z.object({
  run_at: z.string(),
  macro_snapshot: MacroSnapshotSchema,
  verdict: z.enum(["deploy", "partial_deploy", "hold", "monitor"]),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
  suggested_action: z.string(),
  reconsider_when: z.string().nullable(),
  error: z.string().optional(),
});

const SituationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  intent: z.string(),
  status: z.enum(["open", "closed"]),
  target_date: z.string().nullable(),
  related_findings: z.array(z.string()),
  portfolio_effects: z.array(PortfolioEffectSchema),
  verdict_history: z.array(PulseVerdictSchema),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  closure_reason: z.string().nullable(),
});

const NoteSchema = z.object({
  id: z.string().min(1),
  target: z.object({
    type: z.enum(["flag", "gap", "dimension", "global"]),
    finding_key: z.string(),
  }),
  body: z.string(),
  suppress_flag: z.boolean(),
  created_at: z.string(),
});

const ChatScopeSchema = z.object({
  type: z.enum(["global", "flag", "gap", "situation"]),
  finding_key: z.string().optional(),
  situation_id: z.string().optional(),
});

const ChatToolCallSchema = z.object({
  tool: z.string(),
  payload: z.record(z.unknown()),
  status: z.enum(["proposed", "confirmed", "rejected"]),
});

const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  scope: ChatScopeSchema,
  tool_call: ChatToolCallSchema.optional(),
  created_at: z.string(),
});

export const UserContextSchema = z.object({
  version: z.literal(1),
  situations: z.array(SituationSchema),
  notes: z.array(NoteSchema),
  chat_history: z.array(ChatMessageSchema),
});

export function parseUserContext(input: unknown): UserContext {
  return UserContextSchema.parse(input) as UserContext;
}

export function emptyUserContext(): UserContext {
  return { version: 1, situations: [], notes: [], chat_history: [] };
}
