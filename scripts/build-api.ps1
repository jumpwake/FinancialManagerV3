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
dotnet publish (Join-Path $repo "api/PortfolioReport.Api/PortfolioReport.Api.csproj") -c Release
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

Write-Host "Done. Deploy the contents of:"
Write-Host "     api/PortfolioReport.Api/bin/Release/net8.0/publish/"
