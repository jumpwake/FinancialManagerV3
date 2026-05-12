import type { IncomingMessage, ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { runChat, type ChatInputContext } from "../../ai/chat";
import { loadUserContext, mutateUserContext } from "../userContextStore";
import type { ChatMessage, ChatScope } from "../../types";

function readBody(req: IncomingMessage): Promise<any> {
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

function sendSSE(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeMsgId(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  return `msg_${stamp}_${rand}`;
}

function loadAnalysis(): unknown {
  const p = path.resolve("output/analysis.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export interface ChatRequestBody {
  message: string;
  scope?: ChatScope;
}

export async function handleChatRoute(
  req: IncomingMessage,
  res: ServerResponse,
  ctxPath: string,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }

  const body = (await readBody(req)) as ChatRequestBody;
  if (!body.message) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "message required" }));
    return;
  }

  const scope: ChatScope = body.scope ?? { type: "global" };

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const userCtx = loadUserContext(ctxPath);
  const userMsg: ChatMessage = {
    id: makeMsgId(),
    role: "user",
    content: body.message,
    scope,
    created_at: nowIso(),
  };

  mutateUserContext(ctxPath, (c) => {
    c.chat_history.push(userMsg);
  });

  const chatInput: ChatInputContext = {
    user_message: body.message,
    scope,
    analysis: loadAnalysis(),
    situations: userCtx.situations,
    notes: userCtx.notes,
    history: userCtx.chat_history,
  };

  let assistantText = "";
  let toolCall: { tool: string; payload: Record<string, unknown> } | null = null;

  try {
    await runChat({
      context: chatInput,
      onDelta: (delta) => {
        assistantText += delta;
        sendSSE(res, "delta", { text: delta });
      },
      onToolUse: (tool, payload) => {
        toolCall = { tool, payload };
        sendSSE(res, "tool_use", { tool, payload });
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendSSE(res, "error", { message: msg });
    res.end();
    return;
  }

  const assistantMsg: ChatMessage = {
    id: makeMsgId(),
    role: "assistant",
    content: assistantText,
    scope,
    created_at: nowIso(),
    ...(toolCall
      ? { tool_call: { ...(toolCall as { tool: string; payload: Record<string, unknown> }), status: "proposed" as const } }
      : {}),
  };
  mutateUserContext(ctxPath, (c) => {
    c.chat_history.push(assistantMsg);
  });

  sendSSE(res, "done", { id: assistantMsg.id });
  res.end();
}
