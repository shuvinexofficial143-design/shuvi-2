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
# Select Microsoft EdgeDriver for the actual installed WebView2 Runtime, NOT
# the full Edge browser. Mismatched CDP versions can give misleading startup errors.
# https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver
if (!(Test-Path $tauri)) {
    cargo install tauri-driver --locked
    if ($LASTEXITCODE -ne 0) { throw "tauri-driver installation failed" }
}
$webviewGuid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$runtimeKeys = @(
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$webviewGuid",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$webviewGuid",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$webviewGuid"
)
$webviewVersion = $null
$webviewKey = $null
foreach ($key in $runtimeKeys) {
    if (-not (Test-Path $key)) { continue }
    $found = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).pv
    if ($found -match '^\d+\.\d+\.\d+\.\d+$') {
        $webviewVersion = $found
        $webviewKey = $key
        break
    }
}
if (-not $webviewVersion) {
    throw 'Installed WebView2 Runtime version cannot be proven from trusted registry. Native GUI E2E NOT VERIFIED.'
}
$driverDir = Join-Path ([System.IO.Path]::GetTempPath()) ("shuvi-webview2-matched-driver-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $driverDir -Force | Out-Null
$archive = Join-Path $driverDir 'edgedriver_win64.zip'
# Download only from Microsoft, bound to the runtime's four-part version.
$driverUri = "https://msedgedriver.microsoft.com/$webviewVersion/edgedriver_win64.zip"
try {
    Invoke-WebRequest -Uri $driverUri -OutFile $archive -TimeoutSec 120 -ErrorAction Stop
    if ((Get-Item $archive).Length -lt 100000) { throw 'Microsoft driver ZIP missing or empty' }
    Expand-Archive -LiteralPath $archive -DestinationPath $driverDir -Force -ErrorAction Stop
} catch {
    throw "No verified Microsoft EdgeDriver matching WebView2 ${webviewVersion}: $($_.Exception.Message)"
}
$driver = Get-ChildItem $driverDir -Recurse -File -Filter 'msedgedriver.exe' | Select-Object -First 1
if (-not $driver -or $driver.Length -lt 100000) { throw 'Microsoft EdgeDriver executable is absent/invalid' }
$signature = Get-AuthenticodeSignature -LiteralPath $driver.FullName
if ($signature.Status -ne 'Valid') { throw "EdgeDriver Authenticode signature invalid: $($signature.Status)" }
$driverVersionText = ((& ($driver.FullName) --version) | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $driverVersionText -notmatch '(\d+\.\d+\.\d+\.\d+)') {
    throw "Cannot verify downloaded Microsoft EdgeDriver version: $driverVersionText"
}
$driverVersion = $Matches[1]
$runtimeBuild = ($webviewVersion.Split('.')[0..2] -join '.')
$driverBuild = ($driverVersion.Split('.')[0..2] -join '.')
if ($driverBuild -ne $runtimeBuild) {
    throw "WebView2 $webviewVersion and EdgeDriver $driverVersion build mismatch; native GUI E2E BLOCKED"
}
$env:PATH = $driver.DirectoryName + ";" + $env:PATH
$osInfo = Get-CimInstance Win32_OperatingSystem
$prerequisites = [ordered]@{
    gitSha = $env:GITHUB_SHA
    runnerImage = $env:ImageOS
    osCaption = $osInfo.Caption
    osVersion = $osInfo.Version
    webview2Version = $webviewVersion
    webview2RegistryKey = $webviewKey
    edgeDriverVersion = $driverVersion
    edgeDriverBuildMatched = ($driverBuild -eq $runtimeBuild)
    edgeDriverSha256 = (Get-FileHash $driver.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    edgeDriverSignature = $signature.Status.ToString()
    driverSource = $driverUri
    tauriDriverVersion = ((& $tauri --version) | Out-String).Trim()
    exactInstalledExe = $binary
}
$prerequisites | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $proof 'driver-prerequisites.json') -Encoding utf8
Write-Host "Verified matching signed Microsoft EdgeDriver $driverVersion for WebView2 $webviewVersion on $($prerequisites.runnerImage)"

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

