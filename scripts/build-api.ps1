# Builds the React report into the API's wwwroot, then publishes the .NET app.
# The deployable artifact is the publish/ folder below; the source wwwroot is
# restored to its committed placeholder afterward so the build never dirties
# the working tree.
# Output: api/PortfolioReport.Api/bin/Release/net8.0/publish/
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$wwwroot = Join-Path $repo "api/PortfolioReport.Api/wwwroot"
$assets = Join-Path $wwwroot "assets"

try {
    Write-Host "1/3  Building the React report..."
    npx vite build (Join-Path $repo "src/report/app") --outDir "$wwwroot" --emptyOutDir
    if ($LASTEXITCODE -ne 0) { throw "vite build failed" }

    Write-Host "2/3  Publishing the .NET app..."
    dotnet publish (Join-Path $repo "api/PortfolioReport.Api/PortfolioReport.Api.csproj") -c Release
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

    Write-Host "3/3  Done. Deploy the contents of:"
    Write-Host "     api/PortfolioReport.Api/bin/Release/net8.0/publish/"
}
finally {
    # Restore the source wwwroot to its committed placeholder. The real build
    # lives in the publish/ folder; the source tree keeps only the placeholder
    # (which SpaFallbackTests serves from disk).
    Write-Host "Restoring the wwwroot placeholder..."
    git -C $repo checkout -- "api/PortfolioReport.Api/wwwroot/index.html"
    if (Test-Path $assets) { Remove-Item -Recurse -Force $assets }
}
