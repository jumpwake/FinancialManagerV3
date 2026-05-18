import { z } from "zod";
import type { UserContext } from "../types";

const PortfolioEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mark_cash_pending"),
    amount_usd: z.number().positive().optional(),
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
  type: z.enum(["global", "flag", "gap", "situation", "dimension", "tactical_move"]),
  finding_key: z.string().optional(),
  situation_id: z.string().optional(),
  dimension_id: z.string().optional(),
  move_id: z.string().optional(),
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

const UserProfileSchema = z.object({
  age: z.number().int().min(18).max(100),
  risk_tolerance: z.enum([
    "conservative",
    "moderately_conservative",
    "moderate",
    "moderately_aggressive",
    "aggressive",
  ]),
});

export const UserContextSchema = z.object({
  version: z.literal(2),
  profile: UserProfileSchema.nullable(),
  situations: z.array(SituationSchema),
  notes: z.array(NoteSchema),
  chat_history: z.array(ChatMessageSchema),
});

/** Normalize a version-1 context to the version-2 shape. */
function migrateToV2(input: unknown): unknown {
  if (
    input !== null &&
    typeof input === "object" &&
    (input as { version?: unknown }).version === 1
  ) {
    return { ...(input as object), version: 2, profile: null };
  }
  return input;
}

export function parseUserContext(input: unknown): UserContext {
  return UserContextSchema.parse(migrateToV2(input)) as UserContext;
}

export function emptyUserContext(): UserContext {
  return { version: 2, profile: null, situations: [], notes: [], chat_history: [] };
}
