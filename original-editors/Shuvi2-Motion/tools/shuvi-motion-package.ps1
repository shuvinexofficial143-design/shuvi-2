# M-AI11: package and independently verify the REAL original EffectCraft Windows build.
# Read-only verification never executes the GUI, enables AI edits, or downloads unsigned binaries.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Package', 'Verify')]
    [string]$Mode,
    [string]$ZipPath = 'Shuvi2-Motion-MAI11-Win64.zip'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$origin = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$working = (Get-Location).Path
$zip = [System.IO.Path]::GetFullPath((Join-Path $working $ZipPath))
$sourceExe = Join-Path $origin 'target/release/effectcraft.exe'
$packDir = Join-Path $working 'own-motion'
$legal = @('LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md', 'SHUVI_SOURCE_ORIGIN.txt')
$members = @('Shuvi2-Motion.exe', 'build-provenance.json') + $legal
$expectedGit = $env:GITHUB_SHA

function Assert-NativePe([string]$file) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing native Windows executable: $file" }
    $info = Get-Item -LiteralPath $file
    if ($info.Length -lt 1000000) { throw 'Native Windows executable implausibly small' }
    $stream = [System.IO.File]::OpenRead($file)
    try {
        if ($stream.ReadByte() -ne 0x4D -or $stream.ReadByte() -ne 0x5A) {
            throw 'Native executable missing expected MZ header'
        }
    } finally {
        $stream.Dispose()
    }
}
function Hash256([string]$file) {
    return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Assert-Same([string]$left, [string]$right, [string]$reason) {
    if ($left -cne $right) { throw "Artifact mismatch: $reason" }
}

if ($Mode -eq 'Package') {
    Assert-NativePe $sourceExe
    foreach ($file in $legal) {
        if (!(Test-Path -LiteralPath (Join-Path $origin $file) -PathType Leaf)) {
            throw "Mandatory original attribution missing: $file"
        }
    }
    if (Test-Path -LiteralPath $packDir) { Remove-Item -LiteralPath $packDir -Recurse -Force }
    New-Item -ItemType Directory -Path $packDir -Force | Out-Null
    Copy-Item -LiteralPath $sourceExe -Destination (Join-Path $packDir 'Shuvi2-Motion.exe')
    foreach ($file in $legal) {
        Copy-Item -LiteralPath (Join-Path $origin $file) -Destination (Join-Path $packDir $file)
    }
    if ([string]::IsNullOrWhiteSpace($expectedGit)) {
        throw 'GITHUB_SHA missing: build provenance cannot be attested'
    }
    $exe = Join-Path $packDir 'Shuvi2-Motion.exe'
    $provenance = [ordered]@{
        schemaVersion = 1
        project = 'Shuvi 2.0.2 Original Motion'
        sourceCommit = $expectedGit
        buildTarget = 'windows-x64'
        originalEngine = 'EffectCraft v0.18.0'
        artifactKind = 'native-original-editor'
        aiEditingEnabled = $false
        nativeSQLiteBridgeBundled = $false
        guiOwnerConsentIntegrated = $false
        executableName = 'Shuvi2-Motion.exe'
        executableBytes = (Get-Item -LiteralPath $exe).Length
        executableSha256 = (Hash256 $exe)
        legalFiles = $legal
    }
    ($provenance | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath (Join-Path $packDir 'build-provenance.json') -Encoding utf8
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -Path (Join-Path $packDir '*') -DestinationPath $zip -CompressionLevel Optimal -Force
}
if (!(Test-Path -LiteralPath $zip -PathType Leaf)) { throw "Native ZIP not found: $zip" }
if ((Get-Item -LiteralPath $zip).Length -lt 5000000) { throw 'Native ZIP implausibly small' }

# Independently verify the archive instead of trusting Compress-Archive success.
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
    $actual = @($archive.Entries | Where-Object { -not [string]::IsNullOrEmpty($_.Name) } | ForEach-Object { $_.FullName })
    foreach ($name in $actual) {
        if ($name.Contains('/') -or $name.Contains('\') -or $name -eq '..') {
            throw "Unexpected nested or traversal ZIP member: $name"
        }
    }
    if (@($actual | Select-Object -Unique).Count -ne $actual.Count) {
        throw 'Duplicate ZIP entry names'
    }
    if ($actual.Count -ne $members.Count) {
        throw "ZIP member count mismatch: expected $($members.Count), got $($actual.Count)"
    }
    foreach ($file in $members) {
        if ($file -cnotin $actual) { throw "Missing ZIP member: $file" }
    }
} finally {
    $archive.Dispose()
}
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('shuvi-motion-verify-' + [guid]::NewGuid().ToString('N'))
try {
    Expand-Archive -LiteralPath $zip -DestinationPath $temporary -Force
    $unpacked = Join-Path $temporary 'Shuvi2-Motion.exe'
    Assert-NativePe $unpacked
    $metadata = Get-Content -LiteralPath (Join-Path $temporary 'build-provenance.json') -Raw | ConvertFrom-Json
    if ($metadata.schemaVersion -ne 1 -or $metadata.buildTarget -cne 'windows-x64' -or
        $metadata.artifactKind -cne 'native-original-editor' -or
        $metadata.originalEngine -cne 'EffectCraft v0.18.0' -or
        $metadata.executableName -cne 'Shuvi2-Motion.exe') {
        throw 'Malformed build provenance'
    }
    if ($metadata.aiEditingEnabled -ne $false -or
        $metadata.nativeSQLiteBridgeBundled -ne $false -or
        $metadata.guiOwnerConsentIntegrated -ne $false) {
        throw 'Unverified production AI functionality is incorrectly claimed enabled'
    }
    Assert-Same (Hash256 $unpacked) $metadata.executableSha256 'EXE SHA-256'
    if ((Get-Item -LiteralPath $unpacked).Length -ne $metadata.executableBytes) {
        throw 'EXE byte length mismatch'
    }
    if ([string]::IsNullOrWhiteSpace($expectedGit)) { throw 'Expected source commit unavailable' }
    Assert-Same $metadata.sourceCommit $expectedGit 'source commit'
    foreach ($file in $legal) {
        $original = Join-Path $origin $file
        $copy = Join-Path $temporary $file
        if (!(Test-Path -LiteralPath $copy -PathType Leaf)) { throw "Unpacked legal file missing: $file" }
        Assert-Same (Hash256 $original) (Hash256 $copy) "original notice/attribution: $file"
    }
    Write-Host "VERIFIED: exact native Windows PE, SHA-256, $($members.Count) ZIP entries, original legal notices and source $expectedGit"
    Write-Host "ARTIFACT_SHA256=$(Hash256 $zip)"
    Write-Host 'PRODUCTION_AI_EDITING=DISABLED'
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
