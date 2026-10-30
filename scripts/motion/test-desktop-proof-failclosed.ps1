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
# Fail closed if the UNMODIFIED real E2E receipt does not pass the same checker.
# This prevents every tampered copy from appearing to be rejected merely because
# the verifier cannot work on this runner (missing git context, syntax error, etc).
$baselineOutput = & pwsh -NoProfile -NonInteractive -File $verifier -Evidence $source 2>&1
$baselineExitCode = $LASTEXITCODE
if ($baselineExitCode -ne 0) {
    throw "Original real WebView2 receipt failed before tampering: $($baselineOutput | Out-String)"
}
$expectedReason = @{
    "receipt-not-successful" = "Receipt is not a successful real Tauri WebView2 session"
    "forged-source-commit" = "WebView2 receipt does not match the checkout and GitHub runner source"
    "forged-effectcraft-pin" = "Native EffectCraft Gitlink does not match the reviewed exact pin"
    "forged-sequence-checksum" = "First sequence PNG SHA-256 differs from independently exported native frame"
    "forged-cold-restart-checksum" = "Cold-reopened native EffectCraft PNG SHA-256 differs from export"
    "omitted-native-edit-step" = "WebView2 desktop receipt step count does not match the real E2E contract"
    "missing-actual-screenshot" = "Actual WebView2 screenshot missing"
    "non-png-screenshot" = "WebView2 evidence screenshot has no PNG signature"
}
$passed = New-Object System.Collections.Generic.List[string]
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
        $rejectionCode = $LASTEXITCODE
        $diagnostic = $output | Out-String
        if ($rejectionCode -eq 0) {
            throw "EVIDENCE GATE REGRESSION: accepted tampered real receipt ($case)"
        }
        # Reject the expected *specific field*, not a generic parser/startup failure.
        if ($rejectionCode -ne 1 -or !$diagnostic.Contains($expectedReason[$case])) {
            throw "Unexpected rejection for $case (exit $rejectionCode): $diagnostic"
        }
        $passed.Add($case)
        Write-Host "PASS: verifier rejected tampered real E2E evidence for expected reason: $case"
    } finally {
        Remove-Item -LiteralPath $copy -Recurse -Force -ErrorAction SilentlyContinue
    }
}
if ($passed.Count -ne $cases.Count) {
    throw "Evidence negative test did not complete all required forgery variants"
}
$receipt = Get-Content -LiteralPath (Join-Path $source "receipt.json") -Raw | ConvertFrom-Json
$report = [ordered]@{
    ok = $true
    proof = "real-webview2-evidence-forgery-negative-suite"
    exactSourceCommit = [string]$receipt.commitSha
    baselineRealReceiptVerified = $true
    tamperTests = @($passed.ToArray())
    allExpectedFailureReasonsVerified = $true
    originalEvidenceUntouched = $true
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $source "tamper-report.json") -Encoding utf8
Write-Host "PASS: all 8 real-evidence forgery attempts rejected for their exact expected reasons"
# Every negative child intentionally exits with code 1. Clear the inherited native
# process exit code so Windows GitHub Actions correctly reports this parent suite PASS.
$global:LASTEXITCODE = 0
exit 0
