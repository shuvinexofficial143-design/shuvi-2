# Install actual NSIS output and bind later GUI proof to exact installed bytes.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$receiptPath = 'src-tauri/target/release/installed-smoke.json'
$receipt = [ordered]@{ schemaVersion=1; ok=$false; checkpoint=$env:GITHUB_SHA; installedProcessLaunched=$false; installedWebViewInteractionVerified=$false }
$proc = $null
try {
    $head = (& git rev-parse HEAD | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -ne $env:GITHUB_SHA) { throw 'Checkout SHA does not match release commit' }
    $pins = @{}
    foreach ($engine in @('filmcraft','effectcraft')) {
        $entry = (& git ls-tree HEAD "vendor/$engine" | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $entry -notmatch '^160000 commit ([0-9a-f]{40})\s+') { throw "Missing $engine gitlink" }
        $pin = $Matches[1]
        $actual = (& git -C "vendor/$engine" rev-parse HEAD | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $actual -ne $pin) { throw "$engine checkout differs from gitlink" }
        $pins[$engine] = $pin
    }
    $receipt.enginePins = $pins
    $installer = @(Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter '*.exe' -File)
    if ($installer.Count -ne 1 -or $installer[0].Length -lt 100000) { throw 'Unique nonempty NSIS installer required' }
    $receipt.installerName = $installer[0].Name
    $receipt.installerPath = $installer[0].FullName
    $receipt.installerSha256 = (Get-FileHash $installer[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $receipt.installerBytes = $installer[0].Length
    $target = Join-Path $env:RUNNER_TEMP ('Shuvi2IntegrationInstall-' + [guid]::NewGuid().ToString('N'))
    if (Test-Path $target) { throw 'Installation target already exists' }
    $install = Start-Process -FilePath $installer[0].FullName -ArgumentList @('/S', "/D=$target") -PassThru
    if (-not $install.WaitForExit(120000)) {
        Stop-Process -Id $install.Id -Force -ErrorAction SilentlyContinue
        throw 'Installer timed out; installation UNVERIFIED'
    }
    $receipt.installExitCode = $install.ExitCode
    if ($install.ExitCode -ne 0) { throw "NSIS exit code $($install.ExitCode)" }
    $binary = @(Get-ChildItem $target -Recurse -File -Filter 'shuvi2.exe')
    $sidecar = @(Get-ChildItem $target -Recurse -File -Filter 'filmcraft-cli*.exe')
    if ($binary.Count -ne 1 -or $sidecar.Count -ne 1) { throw 'Unique installed app and FilmCraft sidecar required' }
    foreach ($file in @($binary[0],$sidecar[0])) { if ($file.Length -lt 100000) { throw 'Installed executable empty or too small' } }
    $receipt.installedBinaryPath = $binary[0].FullName
    $receipt.installedSidecarPath = $sidecar[0].FullName
    $receipt.installedBinarySha256 = (Get-FileHash $binary[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $receipt.installedSidecarSha256 = (Get-FileHash $sidecar[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $builtHash = (Get-FileHash 'src-tauri/target/release/shuvi2.exe' -Algorithm SHA256).Hash.ToLowerInvariant()
    $stagedHash = (Get-FileHash 'src-tauri/binaries/filmcraft-cli-x86_64-pc-windows-msvc.exe' -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($receipt.installedBinarySha256 -ne $builtHash -or $receipt.installedSidecarSha256 -ne $stagedHash) { throw 'Installed bytes differ from built app/sidecar' }
    $proc = Start-Process -FilePath $binary[0].FullName -WorkingDirectory $binary[0].DirectoryName -PassThru
    Start-Sleep -Seconds 5
    $proc.Refresh()
    if ($proc.HasExited) { throw "Installed app exited immediately: $($proc.ExitCode)" }
    Stop-Process -Id $proc.Id -Force -ErrorAction Stop
    $proc.WaitForExit()
    $receipt.installedProcessLaunched = $true
    $receipt.ok = $true
    Write-Host 'PASS: real NSIS install, exact binary hashes and installed process launch'
} catch {
    $receipt.error = $_.Exception.Message
    throw
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path (Split-Path $receiptPath) -Force | Out-Null
    $receipt | ConvertTo-Json -Depth 6 | Set-Content -Path $receiptPath -Encoding utf8
}
