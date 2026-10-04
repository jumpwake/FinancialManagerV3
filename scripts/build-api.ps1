# Builds the React report into the API's wwwroot, then publishes the .NET app.
# wwwroot/ is gitignored, so the build leaves no git noise.
# Output: api/PortfolioReport.Api/bin/Release/net8.0/publish/
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$wwwroot = Join-Path $repo "api/PortfolioReport.Api/wwwroot"

# Production hosts the app at /finance under the bis-corp.com IIS site.
# VITE_APP_BASE feeds the `base` config in vite.config.ts so asset URLs and
# import.meta.env.BASE_URL are all prefixed correctly.
$env:VITE_APP_BASE = "/finance/"

Write-Host "1/2  Building the React report (base = $env:VITE_APP_BASE)..."
npx vite build (Join-Path $repo "src/report/app") --outDir "$wwwroot" --emptyOutDir
if ($LASTEXITCODE -ne 0) { throw "vite build failed" }

Write-Host "2/2  Publishing the .NET app..."
# Clean the publish dir first: `dotnet publish` overlays rather than cleans, so a
# stale App_Data/ from an older build would linger and get deployed even though
# the .csproj now excludes it. Wiping the dir guarantees the artifact is fresh.
$publishDir = Join-Path $repo "api/PortfolioReport.Api/bin/Release/net8.0/publish"
if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }
dotnet publish (Join-Path $repo "api/PortfolioReport.Api/PortfolioReport.Api.csproj") -c Release
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

# Guardrail: App_Data holds authoritative per-user server state and must never be
# in the deploy artifact (msdeploy would overwrite live data). Fail loudly if it
# ever reappears in the publish output.
if (Test-Path (Join-Path $publishDir "App_Data")) {
    throw "App_Data present in publish output - it would overwrite live server data on deploy. Aborting."
}

Write-Host "Done. Deploy the contents of:"
Write-Host "     api/PortfolioReport.Api/bin/Release/net8.0/publish/"
