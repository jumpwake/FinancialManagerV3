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

## Local `.env.<user>` keys (for `npm run publish`)
Each user's local `.env.<user>` file needs:
```
PUBLISH_API_BASE=https://finance.bis-corp.com
PUBLISH_PUSH_TOKEN=<that user's push token — must match the server's Allowlist PushToken>
```
`USER_CONTEXT_FILE` and `OUTPUT_FILE` are already used by the existing
`analyze` pipeline and must also be set.

Example for user `kevin`:
```
USER_CONTEXT_FILE=data/kevin/user-context.json
OUTPUT_FILE=output/kevin/analysis.json
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
- Run `npm run publish -- --user <name>` locally -> report shows the analysis.

## Backups
- `App_Data/<user>/user-context.json` is the only server-authoritative data.
  Copy `App_Data/` on a schedule. `analysis.json` is re-pushable from local.
