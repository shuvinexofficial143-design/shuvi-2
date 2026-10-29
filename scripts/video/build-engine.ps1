#Requires -Version 7.0
<#
  Shuvi 2 Video Studio V02: reproducible pinned FilmCraft Windows build.
  Called from a trusted development/CI terminal only. No remote script downloads.
#>
[CmdletBinding()]
param(
  [ValidateSet("debug", "release")][string]$Profile = "debug",
  [switch]$SkipBuild
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$film = Join-Path $repo "vendor/filmcraft"
$commit = "c49efe070fab862df6c21d61a503605eb6f07105"
$expectedTriple = "x86_64-pc-windows-msvc"
if (-not $IsWindows) { throw "V02 bundling requires Windows; do not rename non-Windows binaries." }
Push-Location $repo
try {
  $triple = (& rustc --print host-tuple | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $triple -ne $expectedTriple) {
    throw "Unsupported target $triple. Expected $expectedTriple."
  }
  $rootPin = (& git ls-tree HEAD vendor/filmcraft | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Cannot read pinned submodule gitlink." }
  if ($rootPin -notmatch '^160000 commit ([0-9a-f]{40})\s+vendor/filmcraft$' -or $Matches[1] -ne $commit) {
    throw "FilmCraft gitlink mismatch: expected $commit; found $rootPin"
  }
  if (-not (Test-Path (Join-Path $film "Cargo.lock"))) {
    throw "FilmCraft submodule missing; run git submodule update --init --recursive"
  }
  $sourceHead = (& git -C $film rev-parse HEAD | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $sourceHead -ne $commit) {
    throw "FilmCraft checkout must match pin $commit; got $sourceHead"
  }
  if (-not $SkipBuild) {
    $flags = @("build", "--locked", "--manifest-path", (Join-Path $film "Cargo.toml"), "-p", "filmcraft-cli")
    if ($Profile -eq "release") { $flags += "--release" }
    & cargo @flags
    if ($LASTEXITCODE -ne 0) { throw "Pinned FilmCraft CLI compilation failed." }
  }
  $source = Join-Path $film "target/$Profile/filmcraft-cli.exe"
  if (-not (Test-Path $source -PathType Leaf)) { throw "Expected compiled binary missing: $source" }
  $destDir = Join-Path $repo "src-tauri/binaries"
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  $dest = Join-Path $destDir "filmcraft-cli-$expectedTriple.exe"
  Copy-Item -LiteralPath $source -Destination $dest -Force
  $srcHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
  $dstHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dest).Hash.ToLowerInvariant()
  if ($srcHash -ne $dstHash) { throw "Staged FilmCraft hash differs from compiled binary." }
  $version = (& $dest --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $version -notmatch '^filmcraft-cli 0\.13\.0$') {
    throw "Staged CLI reports unexpected version: $version"
  }
  $manifest = [ordered]@{
    source = "storytold/filmcraft"
    commit = $commit
    cargoLock = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $film "Cargo.lock")).Hash.ToLowerInvariant()
    executable = (Split-Path $dest -Leaf)
    sha256 = $dstHash
    bytes = (Get-Item -LiteralPath $dest).Length
    version = $version
    target = $triple
    profile = $Profile
  }
  $manifestPath = Join-Path $destDir "filmcraft-cli.build.json"
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8
  Write-Host "V02 STAGED: $dest"
  Write-Host "SHA256: $dstHash"
  Write-Host "Manifest: $manifestPath"
} finally {
  Pop-Location
}
