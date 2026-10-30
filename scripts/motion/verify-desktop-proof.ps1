# Independent fail-closed Windows evidence gate. NEVER substitutes a successful GUI run.
[CmdletBinding()]
param([string]$Evidence = "proof/motion-desktop")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$receiptFile = Join-Path $Evidence "receipt.json"
if (!(Test-Path -LiteralPath $receiptFile -PathType Leaf)) {
    throw "Real Windows WebView2 receipt.json is missing"
}
$r = Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json -ErrorAction Stop
if ($r.ok -ne $true -or $r.driver -ne "tauri-driver" -or $r.window -ne "real-windows-webview2") {
    throw "Receipt is not a successful real Tauri WebView2 session"
}
if ($r.coldRestartVerified -ne $true -or $r.undoRedoVerified -ne $true) {
    throw "Native Undo/Redo and full-process cold restart were not both verified"
}
if ($r.sequenceVerified -ne $true -or $r.sequenceFrames -ne 3) {
    throw "Real 3-frame EffectCraft PNG sequence proof is missing"
}
if (!$r.commitSha -or $r.commitSha -notmatch '^[0-9a-f]{40}$') {
    throw "WebView2 receipt does not contain a valid exact commit SHA"
}
$head = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $r.commitSha -or
    ($env:GITHUB_SHA -and $head -ne $env:GITHUB_SHA)) {
    throw "WebView2 receipt does not match the checkout and GitHub runner source"
}
$enginePin = "fa9cf47175834162806b6b03d83fb2f4bdaeeafa"
$pin = (git -C vendor/effectcraft rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $pin -ne $enginePin -or $r.nativeEffectCraftPin -ne $pin) {
    throw "Native EffectCraft Gitlink does not match the reviewed exact pin"
}
if ($r.runnerOS -notin @("Windows","win32")) {
    throw "WebView2 receipt did not come from a real Windows runner"
}
if (!$r.exportSha256 -or $r.exportSha256 -notmatch '^[0-9a-f]{64}$') {
    throw "Native exported PNG SHA-256 is missing or invalid"
}
if ($r.coldRestartSha256 -ne $r.exportSha256) {
    throw "Cold-reopened native EffectCraft PNG SHA-256 differs from export"
}
if ($r.sequenceFirstSha256 -ne $r.exportSha256) {
    throw "First sequence PNG SHA-256 differs from independently exported native frame"
}
if ($r.projectBytes -le 100 -or $r.pngBytes -le 100) {
    throw "Native .ecproj or PNG export has no meaningful content"
}
$requiredSteps = @(
    "click Motion Studio tab",
    "create real native composition",
    "create real editable shape and verify PNG preview",
    "effect parameters and polygon mask visibly change real rendered PNG",
    "real native Undo and Redo restore exact rendered mask pixels",
    "save persistent .ecproj and export real PNG to owner temp workspace",
    "export owner-scoped real native 3-frame PNG sequence",
    "open saved native project from disk and restore effects and masks",
    "switch Video -> Motion and keep native state",
    "cold restart real Windows app and reopen persisted EffectCraft project",
    "native desktop screenshot"
)
if (@($r.steps).Count -ne $requiredSteps.Count) {
    throw "WebView2 desktop receipt step count does not match the real E2E contract"
}
for ($i=0; $i -lt $requiredSteps.Count; $i++) {
    if ($r.steps[$i] -ne $requiredSteps[$i]) {
        throw "Desktop click contract mismatch at step $i : $($r.steps[$i])"
    }
}
$expected = @(
    "m11_01-native-shape.png",
    "m11_02-effect-mask.png",
    "m11_03-cold-reopened-project.png",
    "motion-windows-webview2.png"
)
foreach ($name in $expected) {
    $path = Join-Path $Evidence $name
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Actual WebView2 screenshot missing: $name"
    }
    $file = Get-Item -LiteralPath $path
    if ($file.Length -lt 1024) { throw "WebView2 screenshot is unexpectedly small: $name" }
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $signature = [byte[]](0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)
    for ($i=0; $i -lt $signature.Length; $i++) {
        if ($bytes[$i] -ne $signature[$i]) {
            throw "WebView2 evidence screenshot has no PNG signature: $name"
        }
    }
}
if ($r.nativeScreenshot -ne "motion-windows-webview2.png") {
    throw "Final screenshot is not linked to the successful E2E receipt"
}
Write-Host "PASS: 11 real WebView2 clicks; Windows provenance; source pin; native .ecproj; PNG + sequence SHA-256; process cold restart; 4 screenshots"
