# Hosted Report on Winhost — Design

**Date:** 2026-05-18
**Status:** Approved architecture, pending spec review
**Topic:** Deploy the Portfolio Analyzer report as a multi-user, mobile-friendly hosted app

## Summary

Today the report runs only on a local Vite dev server, with `/api/*` routes
implemented as Vite middleware. This design takes it to a hosted app on Winhost
(Windows / IIS, domain `bis-corp.com`) for a small known group of users, with
Google login, mobile/PWA support, and a clean split between work that runs
locally and work that runs on the server.

The core architecture: a **static React report** plus an **all-TypeScript AI
layer running in the browser**, served and backed by a **basic ASP.NET Core Web
API on Winhost** that handles Google auth, file gating, situation/note/profile
persistence, and a thin authenticated proxy to the Anthropic API. The `analyze`
pipeline does **not** run on the server — it runs locally and pushes its
`analysis.json` output up.

## Goals / Requirements

1. **Google login.** Per-user authentication against an allowlist of known
   Google accounts. Each account maps to its own data and configuration.
2. **`analyze` runs locally, result is pushed.** The brokerage-data download is
   already a (mostly automated) local process. Right after it, `analyze` runs
   locally and pushes the resulting `analysis.json` to the server. The server
   never runs the pipeline and never holds raw brokerage data.
3. **Backend owns the served data.** `analysis.json` and `user-context.json`
   live on the server where the API can gate access to them. Raw brokerage
   exports stay on the local machine.
4. **Mobile.** The report works in a phone browser (responsive) and is
   installable as a PWA (home-screen icon, full-screen launch).

## Non-goals

- Running the `analyze` pipeline on the server.
- Hosting raw brokerage data on the server.
- Open public sign-up. The user set is a fixed allowlist of 2–5 known people.
- A native mobile app.
- Offline support beyond the PWA app-shell (the report needs the network for
  data and AI).

## Architecture Overview

Two halves with a clean boundary.

**Local machine — the producer:**

```
manual-ish data download  ->  data/<user>/ raw brokerage files
        |
        |  (first: pull latest user-context.json from server)
        v
  npm run analyze --user <name>     pipeline + narratives + tacticalAdvisor
        |
        v
  data/<user>/analysis.json
        |
        v
  push  ->  POST https://finance.bis-corp.com/api/analysis   (token auth)
```

**Server — Winhost, a single ASP.NET Core app:**

```
   App_Data/<user>/analysis.json          (pushed from local, gated)
   App_Data/<user>/user-context.json      (server-authoritative)
        |
   +----+-----------------------------------------------+
   |  ASP.NET Core app (IIS on Winhost)                  |
   |   - Google OAuth + cookie session + email allowlist |
   |   - serves the built React SPA (wwwroot)            |
   |   - GET  /api/analysis        gated file read       |
   |   - POST /api/analysis        receives the push     |
   |   - GET  /api/user-context    gated file read       |
   |   - CRUD /api/situations /notes /profile /chat      |
   |   - POST /api/ai              thin Anthropic proxy  |
   +-----------------------------------------------------+
        |
        v
   Mobile browser / installed PWA  ->  finance.bis-corp.com
```

**Key boundary:** the server stores, gates, and serves a finished
`analysis.json`; it owns `user-context.json`; it relays AI calls. It never runs
the analysis pipeline. All AI *logic* runs in the browser; the server proxy only
injects the API key and forwards.

## Hosting & Deployment

- **One ASP.NET Core app, one origin.** A single app serves both the static
  React build (from `wwwroot`, with SPA fallback routing) and the `/api/*`
  endpoints. Single origin means no CORS and auth cookies "just work." The
  report UI and the API are not split across hosts.
- **Winhost / IIS.** ASP.NET Core is Winhost's first-class workload. The app is
  published with `dotnet publish` and deployed to an IIS site/app via Winhost's
  supported method (Web Deploy or FTP).
- **Domain.** Default to a subdomain `finance.bis-corp.com`, configured as its
  own site in the Winhost control panel so it does not disturb anything already
  on `bis-corp.com`. (Adjustable — root domain or a different subdomain is fine.)
- **TLS.** Winhost issues the certificate for the site.
- **Builds.** `vite build src/report/app` produces the static bundle; it is
  copied into the ASP.NET Core app's `wwwroot`. `dotnet publish` produces the
  deployable API. Both steps are scripted.
- **Backups.** `analysis.json` is disposable (re-pushable from local).
  `user-context.json` is the only server-authoritative data and must be backed
  up — a periodic copy of `App_Data/` is sufficient.

## The .NET Web API

A deliberately small ASP.NET Core app. Endpoints:

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/` + static assets | GET | public | Serve the React SPA + PWA assets |
| `/api/me` | GET | session | Current user identity + display info |
| `/api/analysis` | GET | session | Return the user's `analysis.json` |
| `/api/analysis` | POST | push token | Receive a pushed `analysis.json` from local |
| `/api/user-context` | GET | session **or** push token | Return the user's `user-context.json` |
| `/api/situations` `/api/situations/{id}` | GET/POST/PATCH/DELETE | session | Situation CRUD |
| `/api/notes` `/api/notes/{id}` | GET/POST/DELETE | session | Note CRUD |
| `/api/profile` | GET/PUT | session | Investor profile read/update |
| `/api/chat` | GET/POST | session | Read chat history; append messages |
| `/api/ai` | POST | session, rate-limited | Thin proxy to the Anthropic API |

The CRUD endpoints (`situations`, `notes`, `profile`, `chat`) reimplement the
logic of today's `src/server/handlers/*` and `userContextStore.ts` in C# — these
are simple JSON read/modify/write operations against `user-context.json`. File
writes use a per-file lock to keep concurrent mutations safe.

## Authentication & Authorization

- **Google OAuth** via ASP.NET Core's built-in Google authentication handler.
  Login produces a signed cookie session.
- **Allowlist.** A server-side config maps each permitted Google email to a
  user record. A successful Google login whose email is not in the allowlist is
  rejected — no implicit provisioning.
- **User record** (server config, one per person):
  - `email` — the Google account.
  - `user` — short key, also the data-folder name (e.g. `kevin`, `luke`).
  - `anthropicApiKey` — that user's Anthropic key, used by the AI proxy. This is
    the server-side replacement for the old per-user `.env.<name>` model and
    satisfies requirement 1 ("tie the env to the user account").
  - `pushToken` — a long-lived secret bearer token used only by that user's
    local push/pull script.
- **Session auth** gates all `/api/*` endpoints except `POST /api/analysis` and
  the read side of `/api/user-context`, which also accept the **push token** so
  the headless local script can authenticate without a browser session.
- The user key derived from the session (or push token) selects the
  `App_Data/<user>/` folder for every request. A user can never address another
  user's folder.

## Data Model & Storage Layout

```
App_Data/                      (outside wwwroot — never served as static files)
  kevin/
    analysis.json              pushed from local; served via /api/analysis
    user-context.json          server-authoritative; situations/notes/profile/chat
  luke/
    analysis.json
    user-context.json
```

- `App_Data/` lives outside the web root so the JSON is never directly
  downloadable; it is reachable only through authenticated endpoints.
- `analysis.json` schema is unchanged — it is exactly what `analyze` emits.
- `user-context.json` schema is unchanged — `situations`, `notes`, `profile`,
  `chat_history`.

## Browser-side AI Layer + the Proxy

- `chat.ts`, `pulseCheck.ts`, and `advisorPersona.ts` move from running on the
  server to running **in the browser**, inside the React app. They keep using
  the Anthropic TypeScript SDK and the existing TypeScript types — no C# port,
  no second-language copy of the prompt/scope logic.
- The browser SDK is configured with `baseURL` pointed at `/api/ai` and a
  **placeholder** API key, plus `dangerouslyAllowBrowser: true` (safe here — the
  browser holds no real key and talks only to our own proxy).
- **`POST /api/ai`** is a thin relay: verify the session, look up the user's
  real `anthropicApiKey`, attach it as `x-api-key`, forward the request body to
  `api.anthropic.com`, and pipe the response — including SSE streams — straight
  back to the browser. The proxy has no knowledge of prompts, tools, or schemas.
- **Proxy safety:** `/api/ai` requires a valid session, enforces a per-user
  request rate limit, and rejects requests whose `max_tokens` exceeds a
  configured ceiling — so it cannot be abused as an open relay on the account's
  Anthropic bill.
- **Persistence after an AI turn:** the browser performs the AI call via the
  proxy, then persists results through CRUD endpoints — appending chat messages
  via `POST /api/chat`, and (after the user confirms a proposed Situation/Note
  in the UI) creating them via `POST /api/situations` / `POST /api/notes`.
- `narratives.ts` and `tacticalAdvisor.ts` are **not** moved — they run inside
  the local `analyze` pipeline and stay in `src/ai/`.

## Local `analyze` + Push/Pull Flow

A small local script (new npm script, e.g. `npm run publish -- --user <name>`)
wraps the existing pipeline:

1. **Pull** — `GET /api/user-context` with the user's push token; write the
   result to the local `data/<user>/user-context.json` so `analyze` reads the
   current server-side profile.
2. **Analyze** — run the existing pipeline (`analyze`), producing
   `data/<user>/analysis.json`. This includes the `narratives` and
   `tacticalAdvisor` Anthropic calls, which use the **local** `ANTHROPIC_API_KEY`
   from the local `.env`.
3. **Push** — `POST /api/analysis` with the push token and the new
   `analysis.json`. The server writes it to `App_Data/<user>/analysis.json`.

## `user-context.json` Ownership

`user-context.json` is **server-authoritative**. The server writes it (via the
CRUD endpoints); the local `analyze` step only ever **reads** a pulled copy and
never writes it back. This prevents divergence between server-side edits
(situations, notes, profile changes made in the hosted UI) and the local copy
that `analyze` consumes for the investor profile.

## Mobile / Responsive / PWA

- **Responsive pass** over the React report sections so all 9 sections, the top
  bar, the profile drawer, and the chat sidebar are usable on a phone.
- **PWA:** add `manifest.json`, app icons, and a minimal service worker. The
  service worker caches the **app shell only**; it uses a **network-first**
  strategy for `/api/*` and the analysis data so a freshly pushed
  `analysis.json` is never masked by a stale cache.

## Repo Structure Changes

- **New** `api/` directory: the ASP.NET Core project (C#).
- **Move** `src/ai/chat.ts`, `src/ai/pulseCheck.ts`, `src/ai/advisorPersona.ts`
  into the React app so the browser bundle can import them. This crosses the
  current two-tsconfig boundary (the React app does not import from `src/`
  today); the move resolves that by relocating the files into
  `src/report/app/`. Their dependence on shared types is satisfied by the React
  app's existing `types.ts` mirror (extend the mirror as needed).
- **Keep** `src/ai/narratives.ts`, `src/ai/tacticalAdvisor.ts`, the engine, and
  intake as-is — they run in the local `analyze` pipeline.
- **Retire** `src/server/vitePlugin.ts` and the Vite middleware approach for
  production; the `src/server/handlers/*` logic is reimplemented in the C# API.
  (See Local Development for how the dev loop changes.)
- **Add** the local push/pull script under `scripts/`.

## Local Development Workflow

Production no longer uses the Vite middleware, so local dev changes:

- Run the ASP.NET Core API locally (`dotnet run`) and the Vite dev server with
  its `server.proxy` pointed at the local API for `/api/*`. This mirrors
  production (single logical origin) while keeping Vite's fast HMR.
- Auth in local dev can use the same Google OAuth client with a `localhost`
  redirect URI registered, or a dev bypass that assumes a fixed user.

## Security Considerations

- Data files live in `App_Data/`, outside the web root — never directly
  servable; reachable only via authenticated endpoints scoped to the user.
- The Anthropic API key never reaches the browser; it is injected only by the
  server-side `/api/ai` proxy.
- `/api/ai` is session-gated, per-user rate-limited, and `max_tokens`-capped to
  prevent open-relay abuse.
- Push tokens are long-lived secrets; they are stored only in server config and
  in the local push script's environment, never in the repo or the browser.
- All traffic is HTTPS (Winhost-issued certificate).

## Open Items to Verify with Winhost

- Supported ASP.NET Core runtime version (target the newest LTS Winhost offers).
- Streaming/response-buffering behavior for the `/api/ai` proxy (SSE
  passthrough). Low risk for a relay, but confirm and disable response buffering
  if needed.
- Ability to create and write a data folder outside the web root.
- Outbound HTTPS allowed to `api.anthropic.com` and Google's OAuth endpoints.
- Subdomain setup and TLS issuance for `finance.bis-corp.com`.

## Suggested Implementation Phasing

The architecture is committed as a whole; this is only a suggested build order.

1. **Phase 1 — Secured static report.** ASP.NET Core app serving the React
   build, Google auth + allowlist, `GET /api/analysis` + `GET /api/user-context`
   gating, `POST /api/analysis` push, and the local push/pull script. Report is
   live, mobile-responsive, and access-controlled.
2. **Phase 2 — Interactive CRUD.** `situations` / `notes` / `profile` / `chat`
   endpoints; hosted editing of situations, notes, and profile.
3. **Phase 3 — Browser AI.** Move `chat`/`pulseCheck` into the React app; build
   the `/api/ai` proxy with rate limiting; wire chat and pulse-check.
4. **Phase 4 — PWA polish.** `manifest.json`, icons, service worker.
