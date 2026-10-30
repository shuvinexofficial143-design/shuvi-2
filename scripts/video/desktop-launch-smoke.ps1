#Requires -Version 7.0
<#
  Windows desktop launch smoke, NOT end-to-end editing automation.
  Run on the GitHub-hosted Windows runner after real FilmCraft CI and Tauri build.
  Launches the actual release executable with the bundled CLI beside it.
#>
[CmdletBinding()]
param(
  [string]$Executable = "",
  [string]$EngineSidecar = "",
  [int]$StartupTimeoutSeconds = 35
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (-not $IsWindows) { throw "Only a real Windows desktop runner can execute this smoke." }
if ($StartupTimeoutSeconds -lt 5 -or $StartupTimeoutSeconds -gt 90) { throw "Invalid startup limit." }
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
if (-not $Executable) { $Executable = Join-Path $repo "src-tauri/target/release/shuvi2.exe" }
if (-not $EngineSidecar) { $EngineSidecar = Join-Path $repo "src-tauri/binaries/filmcraft-cli-x86_64-pc-windows-msvc.exe" }
if (-not (Test-Path $Executable -PathType Leaf)) { throw "Real Shuvi Windows executable missing: $Executable" }
if (-not (Test-Path $EngineSidecar -PathType Leaf)) { throw "Real staged FilmCraft engine missing: $EngineSidecar" }
$source = (Resolve-Path $Executable).Path
$engine = (Resolve-Path $EngineSidecar).Path
$directory = Split-Path $source -Parent
$runtimeEngine = Join-Path $directory "filmcraft-cli.exe"
if (-not (Test-Path $runtimeEngine)) {
  Copy-Item -LiteralPath $engine -Destination $runtimeEngine -ErrorAction Stop
}
$hash1 = (Get-FileHash -Algorithm SHA256 -LiteralPath $engine).Hash
$hash2 = (Get-FileHash -Algorithm SHA256 -LiteralPath $runtimeEngine).Hash
if ($hash1 -ne $hash2) { throw "Desktop engine SHA mismatch" }
$reportPath = Join-Path $repo "src-tauri/target/video-desktop-launch-smoke.json"
$report = [ordered]@{
  engineSha256 = $hash1.ToLowerInvariant()
  executableSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
  test = "native-windows-main-window-launch"
  status = "running"
  processId = $null
  windowTitle = $null
  hwnd = $null
  error = $null
}
$process = $null
try {
  $process = Start-Process -FilePath $source -WorkingDirectory $directory -PassThru
  $report.processId = $process.Id
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 350
    $process.Refresh()
    if ($process.HasExited) { throw "Shuvi app exited before showing a desktop window: code $($process.ExitCode)" }
    if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
      $title = $process.MainWindowTitle
      if ($title -and $title.Contains("Shuvi 2")) {
        $ready = $true
        $report.windowTitle = $title
        $report.hwnd = $process.MainWindowHandle.ToInt64()
        break
      }
    }
  }
  if (-not $ready) { throw "No verified Shuvi 2 desktop window appeared before timeout" }
  Start-Sleep -Seconds 2
  $process.Refresh()
  if ($process.HasExited) { throw "Shuvi window crashed after opening" }
  $report.status = "pass"
  Write-Host "PASS: real Windows process $($report.processId), HWND $($report.hwnd), title $($report.windowTitle)"
  Write-Host "NOTE: desktop launch alone does NOT prove UI-driven import, preview or export."
}
catch {
  $report.status = "fail"
  $report.error = $_.Exception.Message
  Write-Error "Windows desktop launch smoke failed: $($report.error)"
  throw
}
finally {
  if ($process) {
    try { $process.Refresh(); if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } } catch {}
    $process.Dispose()
  }
  $report | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $reportPath -Encoding utf8
  Write-Host "Desktop launch report: $reportPath"
}
