import type { IncomingMessage, ServerResponse } from "node:http";
import { mutateUserContext, loadUserContext } from "../userContextStore";
import { z } from "zod";
import type { Situation } from "../../types";

const PortfolioEffectInputSchema = z.discriminatedUnion("type", [
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

const SituationPostBodySchema = z.object({
  title: z.string().min(1),
  intent: z.string().min(1),
  target_date: z.string().nullish(),
  related_findings: z.array(z.string()).optional(),
  portfolio_effects: z.array(PortfolioEffectInputSchema).optional(),
});

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw.length === 0 ? {} : JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const d = new Date();
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${date}_${rand}`;
}

export async function handleSituationsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  match: { method: string; id?: string },
  ctxPath: string,
): Promise<void> {
  if (match.method === "GET" && !match.id) {
    const ctx = loadUserContext(ctxPath);
    return sendJSON(res, 200, ctx.situations);
  }

  if (match.method === "POST" && !match.id) {
    const raw = await readBody(req);
    const parsed = SituationPostBodySchema.safeParse(raw);
    if (!parsed.success) {
      return sendJSON(res, 400, { error: "invalid situation payload", issues: parsed.error.issues });
    }
    const body = parsed.data;
    const sit: Situation = {
      id: makeId("sit"),
      title: body.title,
      intent: body.intent,
      status: "open",
      target_date: body.target_date ?? null,
      related_findings: body.related_findings ?? [],
      portfolio_effects: (body.portfolio_effects ?? []) as Situation["portfolio_effects"],
      verdict_history: [],
      created_at: nowIso(),
      updated_at: nowIso(),
      closed_at: null,
      closure_reason: null,
    };
    mutateUserContext(ctxPath, (ctx) => {
      ctx.situations.push(sit);
    });
    return sendJSON(res, 201, sit);
  }

  if (match.method === "PATCH" && match.id) {
    const body = (await readBody(req)) as Partial<Situation>;
    let updated: Situation | null = null;
    mutateUserContext(ctxPath, (ctx) => {
      const sit = ctx.situations.find((s) => s.id === match.id);
      if (!sit) return;
      Object.assign(sit, body, { updated_at: nowIso() });
      if (body.status === "closed" && !sit.closed_at) {
        sit.closed_at = nowIso();
      }
      updated = sit;
    });
    if (!updated) return sendJSON(res, 404, { error: "not found" });
    return sendJSON(res, 200, updated);
  }

  if (match.method === "DELETE" && match.id) {
    let removed = false;
    mutateUserContext(ctxPath, (ctx) => {
      const idx = ctx.situations.findIndex((s) => s.id === match.id);
      if (idx !== -1) {
        ctx.situations.splice(idx, 1);
        removed = true;
      }
    });
    if (!removed) return sendJSON(res, 404, { error: "not found" });
    return sendJSON(res, 204, {});
  }

  sendJSON(res, 405, { error: "method not allowed" });
}
