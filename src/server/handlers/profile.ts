import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { mutateUserContext, loadUserContext } from "../userContextStore";
import type { UserProfile } from "../../types";

const UserProfileBodySchema = z.object({
  age: z.number().int().min(18).max(100),
  risk_tolerance: z.enum([
    "conservative",
    "moderately_conservative",
    "moderate",
    "moderately_aggressive",
    "aggressive",
  ]),
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

export async function handleProfileRoute(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  ctxPath: string,
): Promise<void> {
  if (method === "GET") {
    const ctx = loadUserContext(ctxPath);
    return sendJSON(res, 200, ctx.profile);
  }

  if (method === "PUT") {
    const parsed = UserProfileBodySchema.safeParse(await readBody(req));
    if (!parsed.success) {
      return sendJSON(res, 400, { error: "invalid profile", issues: parsed.error.issues });
    }
    const profile: UserProfile = parsed.data;
    mutateUserContext(ctxPath, (ctx) => {
      ctx.profile = profile;
    });
    return sendJSON(res, 200, profile);
  }

  sendJSON(res, 405, { error: "method not allowed" });
}
