# Winhost Deployment Runbook — Hosted Report

## Prerequisites (verified in Task 1)
- ASP.NET Core 8 runtime available on the Winhost plan.
- An IIS site/app for `finance.bis-corp.com` with TLS.
- The app may write to an `App_Data` folder.

## One-time setup
1. In the Winhost control panel, create the `finance.bis-corp.com` subdomain
   and its IIS application; enable TLS.
2. In Google Cloud Console, add `https://finance.bis-corp.com/signin-google`
   as an authorized redirect URI on the OAuth client.
3. Provide production config. Either deploy an `appsettings.Production.json`
   (NOT in git) or set environment variables on the IIS app:
   - `Google__ClientId`, `Google__ClientSecret`
   - `Allowlist__Users__0__Email`
   - `Allowlist__Users__0__User`
   - `Allowlist__Users__0__PushToken`
     (repeat the `__0__` index — `__1__`, `__2__` … — for each additional user)
   - `Storage__DataRoot` — absolute path to the App_Data folder if it must
     live outside the site root.
4. Generate a strong random push token per user; put it in both the server
   config above and that user's local `.env.<user>`.

## Local env files (for `npm run publish`)

The publish flow loads env files in layered order (later wins):

1. `.env` — shared base. Holds `PUBLISH_API_BASE` (the prod URL) and
   `ANTHROPIC_API_KEY`.
2. `.env.<user>` — per-user, layered when `--user <name>` is on argv. Holds
   that user's `PUBLISH_PUSH_TOKEN` (must match the server's Allowlist
   PushToken), `USER_CONTEXT_FILE`, `OUTPUT_FILE`, and any portfolio paths.
3. `.env.development` — local overrides, layered when `--dev` is on argv.
   Typically just `PUBLISH_API_BASE=http://localhost:5000` for testing the
   publish flow against a local API server.

Example `.env.kevin`:
```
USER_CONTEXT_FILE=data/kevin/user-context.json
OUTPUT_FILE=output/kevin/analysis.json
PUBLISH_PUSH_TOKEN=<long random token, must match server's Allowlist[0].PushToken>
```

Example `.env.development` (only on dev machines; gitignored):
```
PUBLISH_API_BASE=http://localhost:5000
```

## Each deployment
1. Locally: `npm run build:api`.
2. Upload the contents of `api/PortfolioReport.Api/bin/Release/net8.0/publish/`
   to the IIS application folder (Web Deploy or FTP).
3. Do NOT overwrite `App_Data/` — it holds live user data.
4. Recycle the IIS app pool.

## Smoke test after deploy
- `https://finance.bis-corp.com/healthz` -> `ok`.
- `https://finance.bis-corp.com/` signed out -> redirects to Google login.
- Sign in with an allowlisted account -> report loads (or shows the
  "no analysis published" hint).
- Run `npm run publish:<name>` locally (e.g. `npm run publish:kevin`) -> report
  shows the analysis. Use the per-user script — `npm run publish -- --user <name>`
  loses the `--user` flag under Windows PowerShell.

## Backups
- `App_Data/<user>/user-context.json` is the only server-authoritative data.
  Copy `App_Data/` on a schedule. `analysis.json` is re-pushable from local.

## Gotcha: WebDAVModule blocks DELETE / PUT / etc.

IIS ships with `WebDAVModule` enabled by default. It intercepts the WebDAV
verbs (DELETE, PUT, MKCOL, COPY, MOVE, LOCK, UNLOCK) **before any handler
runs**, returning 405 "Method Not Allowed" because nothing in the app is a
WebDAV-managed resource. Symptom: `DELETE /api/situations/{id}` returns 405
with `Allow: GET, HEAD, OPTIONS, TRACE`.

The fix is `<modules><remove name="WebDAVModule" /></modules>` in `web.config`
(already committed). The previous comment in the repo claimed `<modules>`
was Winhost-locked — it isn't, at least not for WebDAVModule. If a future
`<modules>` change produces a 500.19 lock violation on deploy, that module
is locked; back it out and contact Winhost support.

**Important:** the WebDAVModule remove **must live in source** (`web.config`
in this repo). `dotnet publish` overwrites the deployed `web.config`, so
manual IIS Manager edits on the server don't survive a redeploy.
