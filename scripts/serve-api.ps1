# Builds the React report into the API's wwwroot, then runs the API so the real
# report is served at http://localhost:5000. wwwroot/ is gitignored, so the
# build leaves no git noise. Press Ctrl+C to stop.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$wwwroot = Join-Path $repo "api/PortfolioReport.Api/wwwroot"

Write-Host "Building the React report into wwwroot..."
npx vite build (Join-Path $repo "src/report/app") --outDir "$wwwroot" --emptyOutDir
if ($LASTEXITCODE -ne 0) { throw "vite build failed" }

Write-Host "Starting the API - open http://localhost:5000  (Ctrl+C to stop)"
dotnet run --project (Join-Path $repo "api/PortfolioReport.Api")
