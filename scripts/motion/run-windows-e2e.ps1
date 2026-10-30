# Windows-only real WebView2 desktop E2E launcher; no browser-only mocks.
[CmdletBinding()]
param(
    [string]$Application = "src-tauri/target/release/shuvi2.exe",
    [string]$Artifacts = "proof/motion-desktop"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$project = (Get-Location).Path
$binary = (Resolve-Path $Application -ErrorAction Stop).Path
$proof = Join-Path $project $Artifacts
New-Item -ItemType Directory -Path $proof -Force | Out-Null
# Reject invalid JavaScript before downloading drivers or launching the Windows app.
& node --check tests/motion/desktop-e2e.mjs
if ($LASTEXITCODE -ne 0) { throw "Desktop WebDriver E2E JavaScript failed syntax preflight" }
$env:SHUVI_MOTION_EXE = $binary
$env:SHUVI_MOTION_E2E_ARTIFACTS = $proof
$pin = (git -C vendor/effectcraft rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $pin -ne "fa9cf47175834162806b6b03d83fb2f4bdaeeafa") {
    throw "Real desktop E2E requires the exact pinned EffectCraft native engine; actual $pin"
}
$env:SHUVI_EFFECTCRAFT_PIN = $pin
$env:SHUVI_MOTION_WEBDRIVER = "http://127.0.0.1:4444"
$tauri = Join-Path $HOME ".cargo/bin/tauri-driver.exe"
$edgetool = Join-Path $HOME ".cargo/bin/msedgedriver-tool.exe"
if (!(Test-Path $tauri)) {
    cargo install tauri-driver --locked
    if ($LASTEXITCODE -ne 0) { throw "tauri-driver installation failed" }
}
if (!(Test-Path $edgetool)) {
    cargo install --git https://github.com/chippers/msedgedriver-tool
    if ($LASTEXITCODE -ne 0) { throw "msedgedriver-tool installation failed" }
}
# Keep downloaded third-party EdgeDriver executable OUT of the real screenshot proof.
# Artifact upload should contain only app test receipts / screenshots / diagnostic logs.
$driverRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$driverDir = Join-Path $driverRoot "shuvi-motion-msedgedriver"
New-Item -ItemType Directory -Path $driverDir -Force | Out-Null
Push-Location $driverDir
try {
    & $edgetool
    if ($LASTEXITCODE -ne 0) { throw "Cannot find matching Windows Microsoft EdgeDriver" }
} finally {
    Pop-Location
}
$driver = Get-ChildItem $driverDir -Recurse -Filter "msedgedriver.exe" | Select-Object -First 1
if (!$driver) { throw "msedgedriver.exe was not downloaded" }
$env:PATH = $driver.DirectoryName + ";" + $env:PATH
$service = $null
try {
    $service = Start-Process -FilePath $tauri -ArgumentList @("--port", "4444") -PassThru -RedirectStandardOutput (Join-Path $proof "tauri-driver.stdout.log") -RedirectStandardError (Join-Path $proof "tauri-driver.stderr.log")
    $ready = $false
    for ($i=0; $i -lt 90; $i++) {
        if ($service.HasExited) { throw "tauri-driver exited before serving WebDriver" }
        try {
            $status = Invoke-RestMethod -Uri "http://127.0.0.1:4444/status" -TimeoutSec 2
            if ($null -ne $status) { $ready = $true; break }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw "Real tauri-driver WebDriver endpoint did not start" }
    node tests/motion/desktop-e2e.mjs
    if ($LASTEXITCODE -ne 0) { throw "Real Windows WebView2 native editing E2E FAILED" }
    Write-Host "PASS: real native WebView2 click-to-edit verified"
} finally {
    if ($service -and !$service.HasExited) { Stop-Process -Id $service.Id -Force -ErrorAction SilentlyContinue }
}
