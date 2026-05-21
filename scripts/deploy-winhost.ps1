# Web Deploy push of the API + SPA bundle to the Winhost site.
#
# Usage:
#   scripts/deploy-winhost.ps1                       # prompts for password, real deploy
#   scripts/deploy-winhost.ps1 -WhatIf               # prompts for password, prints what WOULD happen
#   scripts/deploy-winhost.ps1 -Password '<secret>'  # password as arg (used by the VSCode task)
#
# The password is never persisted or echoed. It IS passed on the command line
# when the VSCode task supplies it, so it's briefly visible in the local
# process table — fine for a personal dev box, not OK on shared hosts.
#
# DoNotDeleteRule preserves App_Data/ (user-context.json, analysis.json) on
# the server. Do not remove that flag without thinking about what happens to
# every user's data on the next push.
[Diagnostics.CodeAnalysis.SuppressMessageAttribute(
    'PSAvoidUsingPlainTextForPassword', 'Password',
    Justification = 'msdeploy CLI accepts the password as a plain command-line argument; converting to SecureString here would just round-trip back to plaintext before invocation. The VSCode task also passes a string literal via ${input:winhostPassword} — PowerShell will not auto-coerce string to SecureString, so [SecureString] would break that integration. Acceptable trade-off on a single-user dev box; never run this on a multi-tenant machine.')]
param(
    [string]$Password,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $repo "api/PortfolioReport.Api/bin/Release/net8.0/publish"

Write-Host ""
Write-Host "===== build ====="
& (Join-Path $PSScriptRoot "build-api.ps1")
if ($LASTEXITCODE -ne 0) { throw "build-api.ps1 failed" }
if (-not (Test-Path $publishDir)) { throw "publish output missing: $publishDir" }

$msdeploy = "C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe"
if (-not (Test-Path $msdeploy)) {
    $msdeploy = "C:\Program Files (x86)\IIS\Microsoft Web Deploy V3\msdeploy.exe"
}
if (-not (Test-Path $msdeploy)) {
    throw "msdeploy.exe not found. Install Microsoft Web Deploy v3."
}

if (-not $Password) {
    $secure = Read-Host -AsSecureString "Winhost (biscorpc) password"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

# The app is hosted as the /finance virtual application under the bis-corp.com
# IIS site. msdeploy's site= query parameter is always the parent site name;
# the trailing /finance in contentPath targets the virtual app inside it. The
# /finance virtual application MUST be created in Winhost's control panel
# first — otherwise IIS treats it as a static folder and the .NET app will
# never start.
$site = "bis-corp.com"
$siteVirtualPath = "$site/finance"
$user = "biscorpc"
$endpoint = "https://w31.winhost.com:8172/MsDeploy.axd?site=$site"

$msdeployArgs = @(
    "-verb:sync",
    "-source:contentPath=$publishDir",
    "-dest:contentPath=$siteVirtualPath,ComputerName=$endpoint,UserName=$user,Password=$Password,AuthType=Basic",
    "-allowUntrusted",
    "-enableRule:DoNotDeleteRule",
    # AppOffline drops app_offline.htm before the sync, which the ASP.NET
    # Core Module sees and uses to shut the app down cleanly — releasing
    # the lock on PortfolioReport.Api.dll. The file is removed at the end
    # of the sync so the app starts back up. Without this, the second and
    # subsequent deploys fail with ERROR_FILE_IN_USE because w3wp.exe
    # still owns the DLLs from the previous deploy.
    "-enableRule:AppOffline"
)
if ($WhatIf) { $msdeployArgs += "-whatif" }

Write-Host ""
Write-Host "===== deploy ====="
Write-Host "  source : $publishDir"
Write-Host "  target : $siteVirtualPath  (via $endpoint)"
if ($WhatIf) { Write-Host "  mode   : DRY RUN (no files will be written on the server)" }
Write-Host ""

& $msdeploy @msdeployArgs
if ($LASTEXITCODE -ne 0) { throw "msdeploy failed with exit code $LASTEXITCODE" }

Write-Host ""
if ($WhatIf) {
    Write-Host "Dry run complete. No changes pushed."
} else {
    Write-Host "Deploy complete: https://www.$site/finance/"
}
