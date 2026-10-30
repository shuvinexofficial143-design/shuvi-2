# NEGATIVE TESTS ONLY: copy REAL successful WebView2 evidence, tamper the COPY,
# and require independent GUI proof verification to refuse every forgery.
# This never manufactures a successful evidence receipt or changes the original.
[CmdletBinding()]
param([string]$Evidence = "proof/motion-desktop")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$verifier = (Resolve-Path "scripts/motion/verify-desktop-proof.ps1").Path
$source = (Resolve-Path $Evidence).Path
$required = @("receipt.json","m11_01-native-shape.png","m11_02-effect-mask.png",
              "m11_03-cold-reopened-project.png","motion-windows-webview2.png")
foreach ($name in $required) {
    if (!(Test-Path -LiteralPath (Join-Path $source $name) -PathType Leaf)) {
        throw "Cannot run negative verification without actual successful WebView2 evidence: $name"
    }
}
$cases = @(
    "receipt-not-successful",
    "forged-source-commit",
    "forged-effectcraft-pin",
    "forged-sequence-checksum",
    "forged-cold-restart-checksum",
    "omitted-native-edit-step",
    "missing-actual-screenshot",
    "non-png-screenshot"
)
foreach ($case in $cases) {
    $copy = Join-Path ([System.IO.Path]::GetTempPath()) ("shuvi-motion-forgery-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $copy -ErrorAction Stop | Out-Null
    try {
        foreach ($name in $required) {
            Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $copy $name) -ErrorAction Stop
        }
        $receiptFile = Join-Path $copy "receipt.json"
        $receipt = Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json -ErrorAction Stop
        switch ($case) {
            "receipt-not-successful" { $receipt.ok = $false }
            "forged-source-commit" { $receipt.commitSha = "0000000000000000000000000000000000000000" }
            "forged-effectcraft-pin" { $receipt.nativeEffectCraftPin = "0000000000000000000000000000000000000000" }
            "forged-sequence-checksum" { $receipt.sequenceFirstSha256 = ("0" * 64) }
            "forged-cold-restart-checksum" { $receipt.coldRestartSha256 = ("0" * 64) }
            "omitted-native-edit-step" { $receipt.steps = @($receipt.steps | Where-Object { $_ -ne "real native Undo and Redo restore exact rendered mask pixels" }) }
            "missing-actual-screenshot" { Remove-Item -LiteralPath (Join-Path $copy "motion-windows-webview2.png") }
            "non-png-screenshot" {
                $img = Join-Path $copy "m11_01-native-shape.png"
                $bytes = [System.IO.File]::ReadAllBytes($img)
                $bytes[0] = 0
                [System.IO.File]::WriteAllBytes($img,$bytes)
            }
        }
        $receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptFile -Encoding utf8
        $output = & pwsh -NoProfile -NonInteractive -File $verifier -Evidence $copy 2>&1
        if ($LASTEXITCODE -eq 0) {
            throw "EVIDENCE GATE REGRESSION: accepted tampered real receipt ($case)"
        }
        Write-Host "PASS: verifier rejected tampered real E2E evidence: $case"
    } finally {
        Remove-Item -LiteralPath $copy -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "PASS: all 8 real-evidence forgery attempts rejected (no faked successful receipt)"
