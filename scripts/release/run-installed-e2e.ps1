$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$receipt = Get-Content 'src-tauri/target/release/installed-smoke.json' -Raw | ConvertFrom-Json
if (-not $receipt.ok -or -not $receipt.installedProcessLaunched -or $receipt.checkpoint -ne $env:GITHUB_SHA) {
    throw 'Exact-commit NSIS installation receipt required before GUI tests'
}
$application = (Resolve-Path $receipt.installedBinaryPath).Path
$hash = (Get-FileHash $application -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $receipt.installedBinarySha256) { throw 'Installed executable changed before E2E' }
# Both suites launch this exact installed production EXE through tauri-driver.
# No separate test binary, remote-debugging build, or sidecar copy into installation.
& ./scripts/motion/run-windows-e2e.ps1 -Application $application -VideoFirst
node scripts/release/verify-installed-proof.mjs
if ($LASTEXITCODE -ne 0) { throw 'Installed desktop proof did not satisfy release slice gate' }
