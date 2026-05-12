import type { IncomingMessage, ServerResponse } from "node:http";
import { mutateUserContext, loadUserContext } from "../userContextStore";
import type { Situation } from "../../types";

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
    const body = (await readBody(req)) as Partial<Situation>;
    if (!body.title || !body.intent) {
      return sendJSON(res, 400, { error: "title and intent are required" });
    }
    const sit: Situation = {
      id: makeId("sit"),
      title: body.title,
      intent: body.intent,
      status: "open",
      target_date: body.target_date ?? null,
      related_findings: body.related_findings ?? [],
      portfolio_effects: body.portfolio_effects ?? [],
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
