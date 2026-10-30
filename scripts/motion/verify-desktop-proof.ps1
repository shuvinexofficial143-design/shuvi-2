# Fail-closed validation of ACTUAL Windows WebView2 user-click test artifacts.
# CI is allowed to build a candidate installer only after all these checks PASS.
[CmdletBinding()]
param([string]$Evidence = "proof/motion-desktop")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$receiptFile = Join-Path $Evidence "receipt.json"
if (!(Test-Path -LiteralPath $receiptFile -PathType Leaf)) { throw "Real WebView2 E2E receipt missing" }
$r = Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json -ErrorAction Stop
if ($r.ok -ne $true -or $r.driver -ne "tauri-driver" -or $r.window -ne "real-windows-webview2") {
    throw "Receipt does not prove a passing real Windows WebView2 desktop session"
}
if ($r.coldRestartVerified -ne $true -or $r.undoRedoVerified -ne $true) {
    throw "Missing actual desktop cold process restart or native Undo/Redo proof"
}
if (!$r.commitSha -or $r.commitSha -notmatch '^[0-9a-f]{40}$') {
    throw "E2E receipt missing exact 40-character source SHA"
}
$head = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $r.commitSha -or
    ($env:GITHUB_SHA -and $head -ne $env:GITHUB_SHA)) {
    throw "E2E receipt commit does not equal checked-out source or GitHub runner SHA"
}
$enginePin = "fa9cf47175834162806b6b03d83fb2f4bdaeeafa"
$pin = (git -C vendor/effectcraft rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $pin -ne $enginePin -or $r.nativeEffectCraftPin -ne $pin) {
    throw "E2E receipt does not prove pinned native EffectCraft engine"
}
if ($r.runnerOS -notin @("Windows","win32")) {
    throw "E2E receipt was not generated on a real Windows runner"
}
if ($r.exportSha256 -notmatch '^[0-9a-f]{64}$' -or
    $r.coldRestartSha256 -ne $r.exportSha256) {
    throw "Native PNG SHA256 changed across full process cold restart"
}
if ($r.projectBytes -le 100 -or $r.pngBytes -le 100) {
    throw "Native project or PNG export was empty"
}
if ($r.steps.Count -lt 9) { throw "Real GUI did not complete all required click-through steps" }
$expected = @(
    "m11_01-native-shape.png",
    "m11_02-effect-mask.png",
    "m11_03-cold-reopened-project.png",
    "motion-windows-webview2.png"
)
foreach ($name in $expected) {
    $path = Join-Path $Evidence $name
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "Real WebView2 screenshot missing: $name" }
    $metadata = Get-Item -LiteralPath $path
    if ($metadata.Length -lt 1024) { throw "Unusually small GUI screenshot: $name" }
    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $path).Path)
    $signature = [byte[]](0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)
    for ($i=0; $i -lt 8; $i++) {
        if ($bytes[$i] -ne $signature[$i]) { throw "Screenshot is not a PNG: $name" }
    }
}
if ($r.nativeScreenshot -ne "motion-windows-webview2.png") {
    throw "Final screenshot is not linked to the success receipt"
}
Write-Host "PASS: real Windows WebView2 UI clicks, native pixel proof, cold-restart, checksum, exact pinned source and all screenshot files verified"
