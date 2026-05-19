# Builds the React report into the API's wwwroot, then publishes the .NET app.
# Output: api/PortfolioReport.Api/bin/Release/net8.0/publish/
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$wwwroot = Join-Path $repo "api/PortfolioReport.Api/wwwroot"

Write-Host "1/3  Building the React report..."
npx vite build (Join-Path $repo "src/report/app") --outDir $wwwroot --emptyOutDir
if ($LASTEXITCODE -ne 0) { throw "vite build failed" }

Write-Host "2/3  Publishing the .NET app..."
dotnet publish (Join-Path $repo "api/PortfolioReport.Api/PortfolioReport.Api.csproj") `
  -c Release
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

Write-Host "3/3  Done. Deploy the contents of:"
Write-Host "     api/PortfolioReport.Api/bin/Release/net8.0/publish/"
