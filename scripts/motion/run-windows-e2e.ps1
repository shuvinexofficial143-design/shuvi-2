# Windows-only real WebView2 desktop E2E launcher; no browser-only mocks.
[CmdletBinding()]
param(
    [string]$Application = "src-tauri/target/debug/shuvi2.exe",
    [string]$Artifacts = "proof/motion-desktop",
    [switch]$VideoFirst
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$project = (Get-Location).Path
node --check tests/motion/desktop-e2e.mjs
if ($LASTEXITCODE -ne 0) { throw 'Motion E2E syntax invalid; no native build/driver work allowed' }
if ($VideoFirst) {
    node --check scripts/release/video-installed-e2e.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Video E2E syntax invalid' }
}
$binary = (Resolve-Path $Application -ErrorAction Stop).Path
$proof = Join-Path $project $Artifacts
New-Item -ItemType Directory -Path $proof -Force | Out-Null
$env:SHUVI_MOTION_EXE = $binary
$env:SHUVI_MOTION_E2E_ARTIFACTS = $proof
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
$driverDir = Join-Path ([System.IO.Path]::GetTempPath()) ("shuvi-edgedriver-" + [guid]::NewGuid().ToString('N'))
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
# Read-only Windows WebView2 diagnostics. Keep genuine installed app/driver.
$webviewRegistry = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$webviewVersion = $null
if (Test-Path $webviewRegistry) {
    $webviewVersion = (Get-ItemProperty $webviewRegistry -ErrorAction SilentlyContinue).pv
}
$osInfo = Get-CimInstance Win32_OperatingSystem
$prerequisites = [ordered]@{
    gitSha = $env:GITHUB_SHA
    runnerImage = $env:ImageOS
    osCaption = $osInfo.Caption
    osVersion = $osInfo.Version
    webview2Version = $webviewVersion
    edgeDriverVersion = ((& ($driver.FullName) --version) | Out-String).Trim()
    tauriDriverVersion = ((& $tauri --version) | Out-String).Trim()
    exactInstalledExe = $binary
}
$prerequisites | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $proof 'driver-prerequisites.json') -Encoding utf8
Write-Host "Native WebView2 driver diagnostic saved; image=$($prerequisites.runnerImage), runtime=$($prerequisites.webview2Version)"

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
    $videoExit = 0
    if ($VideoFirst) {
        node scripts/release/video-installed-e2e.mjs
        $videoExit = $LASTEXITCODE
    }
    node tests/motion/desktop-e2e.mjs
    $motionExit = $LASTEXITCODE
    if ($VideoFirst) {
        node --check scripts/release/unified-installed-e2e.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Unified installed desktop script has syntax errors' }
        node scripts/release/unified-installed-e2e.mjs
        $unifiedExit = $LASTEXITCODE
    } else { $unifiedExit = 0 }
    # Preserve all three independent receipts even if one genuine GUI path fails.
    if ($videoExit -ne 0 -or $motionExit -ne 0 -or $unifiedExit -ne 0) {
        throw "Installed WebView2 suite failure: Video=$videoExit Motion=$motionExit Unified=$unifiedExit (all genuine receipts retained)"
    }
    Write-Host "PASS: installed classic Video, Motion and native Unified WebView2 E2E"
} finally {
    if ($service -and !$service.HasExited) { Stop-Process -Id $service.Id -Force -ErrorAction SilentlyContinue }
}

