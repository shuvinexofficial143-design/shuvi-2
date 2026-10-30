# Fail closed if this exact NSIS installer cannot be installed and launched.
# This checks installation and executable liveness; separate WebView GUI E2E remains necessary.
$ErrorActionPreference = 'Stop'
$installer = @(Get-ChildItem "src-tauri/target/release/bundle/nsis" -Filter "*.exe" -File)
if ($installer.Count -ne 1 -or $installer[0].Length -lt 100000) {
    throw "A unique nonempty integrated NSIS installer was not built"
}
$target = Join-Path $env:RUNNER_TEMP "Shuvi2IntegrationInstall"
if (Test-Path $target) { throw "Installation test path already exists; refusing overwrite" }
$receiptPath = "src-tauri/target/release/installed-smoke.json"
$install = Start-Process -FilePath $installer[0].FullName -ArgumentList @("/S", "/D=$target") -PassThru
if (-not $install.WaitForExit(120000)) {
    Stop-Process -Id $install.Id -Force -ErrorAction SilentlyContinue
    throw "NSIS installer exceeded timeout; installed status UNVERIFIED"
}
if ($install.ExitCode -ne 0) { throw "NSIS installer exit code $($install.ExitCode)" }
if (-not (Test-Path $target -PathType Container)) { throw "NSIS target installation directory missing" }
$binary = Get-ChildItem $target -Recurse -File -Filter "shuvi2.exe" | Select-Object -First 1
if (-not $binary) { throw "Installed real Shuvi2.exe missing" }
$sidecar = Get-ChildItem $target -Recurse -File -Filter "filmcraft-cli*.exe" | Select-Object -First 1
if (-not $sidecar -or $sidecar.Length -lt 100000) { throw "Installed FilmCraft sidecar missing/empty" }
$proc = Start-Process -FilePath $binary.FullName -WorkingDirectory $binary.DirectoryName -PassThru
Start-Sleep -Seconds 5
$proc.Refresh()
if ($proc.HasExited) { throw "Installed Shuvi2 process exited immediately: $($proc.ExitCode)" }
Stop-Process -Id $proc.Id -Force -ErrorAction Stop
[pscustomobject]@{
  checkpoint = $env:GITHUB_SHA
  installerName = $installer[0].Name
  installerBytes = $installer[0].Length
  installedBinaryBytes = $binary.Length
  installedSidecarBytes = $sidecar.Length
  installExitCode = $install.ExitCode
  installedProcessLaunched = $true
  installedWebViewInteractionVerified = $false
  note = "Installed executable launched; mouse-click UI evidence remains separate"
} | ConvertTo-Json -Depth 5 | Set-Content -Path $receiptPath -Encoding utf8
Write-Host "PASS: actual silent NSIS installation, sidecar, and installed Windows process launch"
