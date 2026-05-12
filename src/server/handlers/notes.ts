import type { IncomingMessage, ServerResponse } from "node:http";
import { mutateUserContext, loadUserContext } from "../userContextStore";
import type { Note } from "../../types";

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

function makeId(): string {
  const d = new Date();
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `note_${date}_${rand}`;
}

export async function handleNotesRoute(
  req: IncomingMessage,
  res: ServerResponse,
  match: { method: string; id?: string },
  ctxPath: string,
): Promise<void> {
  if (match.method === "GET" && !match.id) {
    const ctx = loadUserContext(ctxPath);
    return sendJSON(res, 200, ctx.notes);
  }

  if (match.method === "POST" && !match.id) {
    const body = (await readBody(req)) as Partial<Note>;
    if (!body.target || !body.body) {
      return sendJSON(res, 400, { error: "target and body are required" });
    }
    const note: Note = {
      id: makeId(),
      target: body.target,
      body: body.body,
      suppress_flag: body.suppress_flag ?? false,
      created_at: nowIso(),
    };
    mutateUserContext(ctxPath, (ctx) => {
      ctx.notes.push(note);
    });
    return sendJSON(res, 201, note);
  }

  if (match.method === "PATCH" && match.id) {
    const body = (await readBody(req)) as Partial<Note>;
    let updated: Note | null = null;
    mutateUserContext(ctxPath, (ctx) => {
      const n = ctx.notes.find((x) => x.id === match.id);
      if (!n) return;
      Object.assign(n, body);
      updated = n;
    });
    if (!updated) return sendJSON(res, 404, { error: "not found" });
    return sendJSON(res, 200, updated);
  }

  if (match.method === "DELETE" && match.id) {
    let removed = false;
    mutateUserContext(ctxPath, (ctx) => {
      const idx = ctx.notes.findIndex((n) => n.id === match.id);
      if (idx !== -1) {
        ctx.notes.splice(idx, 1);
        removed = true;
      }
    });
    if (!removed) return sendJSON(res, 404, { error: "not found" });
    return sendJSON(res, 204, {});
  }

  sendJSON(res, 405, { error: "method not allowed" });
}
