import { loadEnv } from "../loadEnv";
import type { Plugin } from "vite";
import * as path from "node:path";
import { handleSituationsRoute } from "./handlers/situations";
import { handleNotesRoute } from "./handlers/notes";
import { handleChatRoute } from "./handlers/chat";

loadEnv();

const SITUATIONS_RE = /^\/api\/situations(?:\/([^/]+))?$/;
const NOTES_RE = /^\/api\/notes(?:\/([^/]+))?$/;

export interface UserContextPluginOptions {
  contextPath?: string;
}

export function userContextPlugin(opts: UserContextPluginOptions = {}): Plugin {
  const contextPath =
    opts.contextPath ??
    process.env.USER_CONTEXT_FILE ??
    path.resolve(process.cwd(), "data/user-context.json");

  return {
    name: "user-context-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";

        if (url === "/api/chat") {
          try {
            await handleChatRoute(req, res, contextPath);
          } catch (err) {
            console.error("/api/chat error", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end();
            }
          }
          return;
        }

        const sit = url.match(SITUATIONS_RE);
        if (sit) {
          try {
            await handleSituationsRoute(
              req,
              res,
              { method: req.method ?? "GET", id: sit[1] },
              contextPath,
            );
          } catch (err) {
            console.error("/api/situations error", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end();
            }
          }
          return;
        }

        const note = url.match(NOTES_RE);
        if (note) {
          try {
            await handleNotesRoute(
              req,
              res,
              { method: req.method ?? "GET", id: note[1] },
              contextPath,
            );
          } catch (err) {
            console.error("/api/notes error", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end();
            }
          }
          return;
        }

        next();
      });
    },
  };
}
