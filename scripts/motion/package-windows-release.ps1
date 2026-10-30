# Real Windows installer build: permitted only AFTER the actual WebView2 E2E job passes.
# This generates an UNSIGNED Windows NSIS installer artifact, not a GitHub release.
[CmdletBinding()]
param([string]$Output = "proof/motion-installer")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not $env:CI) { throw "Installer CI gate requires a passing Windows WebView2 E2E workflow dependency" }
$expectedPin = "fa9cf47175834162806b6b03d83fb2f4bdaeeafa"
$pin = (git -C vendor/effectcraft rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $pin -ne $expectedPin) {
    throw "EffectCraft pinned engine mismatch: $pin"
}
$sha = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') { throw "Invalid Git commit SHA" }
if ($env:GITHUB_SHA -and $sha -ne $env:GITHUB_SHA) { throw "Runner SHA does not match source checkout" }
Write-Host "Building real native Windows NSIS installer for $sha"
& npm run tauri -- build --ci --config src-tauri/src/motion/tauri.release.conf.json
if ($LASTEXITCODE -ne 0) { throw "Tauri native NSIS release build failed" }
$folder = "src-tauri/target/release/bundle/nsis"
if (-not (Test-Path $folder)) { throw "Tauri build did not create the Windows NSIS bundle directory" }
$installers = @(Get-ChildItem -Path $folder -Filter "*.exe" -File)
if ($installers.Count -lt 1) { throw "Tauri did not create any actual NSIS setup executable" }
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$files = @()
foreach ($installer in $installers) {
    if ($installer.Length -lt 1048576) { throw "Installer unexpectedly small: $($installer.FullName)" }
    $dest = Join-Path $Output $installer.Name
    Copy-Item -LiteralPath $installer.FullName -Destination $dest -Force
    $actual = Get-FileHash -LiteralPath $dest -Algorithm SHA256
    $source = Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
    if ($actual.Hash -ne $source.Hash) { throw "Copied installer SHA256 differs from produced bundle" }
    $signature = Get-AuthenticodeSignature -LiteralPath $dest
    $files += [ordered]@{
        filename = $installer.Name
        bytes = $installer.Length
        sha256 = $actual.Hash.ToLowerInvariant()
        authenticode = [string]$signature.Status
    }
}
$manifest = [ordered]@{
    ok = $true
    artifact = "REAL Windows Tauri NSIS bundle, not a demo"
    gitSha = $sha
    effectCraftPin = $pin
    signed = $false
    distribution = "CI artifact only; not released or auto-installed"
    requiresVerifiedWebview2Job = $true
    installers = $files
}
$manifestPath = Join-Path $Output "manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "PASS: NSIS file present and SHA256 verified. Installer remains unsigned and unpublished."
Get-Content -LiteralPath $manifestPath
