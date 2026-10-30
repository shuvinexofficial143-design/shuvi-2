# Shuvi 2.0.5 — V07 Microsoft-matched WebView2 Driver

Parent integrated commit: `81d8f423c32dab0bffec123feca49080205a6782`. Work only on `feature/shuvi2-release-integration` (no main merge, no engine pin changes).

## Reason for this change
- The V04 real Windows 2025 hosted runner completed FilmCraft/EffectCraft tests, built a real unsigned NSIS, confirmed both installed binary hashes and launched a real Windows window, then failed to create a WebView2 WebDriver session with `DevToolsActivePort file doesn't exist`.
- V06 source pins `windows-2022`, an evidence-based workaround for a runner issue (https://github.com/actions/runner-images/issues/14738). Merely pinning the runner is not sufficient if the EdgeDriver binary does not match the WebView2 Runtime build.
- Microsoft official WebView2 WebDriver documentation requires driver version matched to the installed **WebView2 Runtime**: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver.
- The previous `msedgedriver-tool` selected the full Microsoft Edge browser release; a Windows image may have a separate WebView2 Runtime. An unverified mismatch must never be reported as an editing-test success.

## Actual source fix
1. Query trusted HKCU/HKLM EdgeUpdate WebView2 Runtime registry keys; require a valid four-part runtime version.
2. Download the matching Win64 EdgeDriver ZIP **only from Microsoft's official HTTPS domain**, for the actual WebView2 Runtime version. If Microsoft has no matching driver for that version, fail closed.
3. Verify downloaded EXE exists, is nonempty, has a valid Windows Authenticode signature, and identifies a four-part version whose **first three components match** the WebView2 Runtime build; never blindly trust the ZIP filename.
4. Publish diagnostic JSON: exact commit SHA, installed EXE path, OS image, WebView2 runtime, driver version, match status, signature, EdgeDriver file SHA-256 and official URI.
5. Preserve original `tauri-driver`, exact installed Windows application, all three native suite receipts, screenshot proof and mandatory release failure on any E2E error. Removed the extra unrelated `msedgedriver-tool` cargo install from Windows CI.
6. Increment the release CI concurrency group to v07 so in-flight V05 and V06 Windows workflows keep running to completion.

## Limitations
- This is code, not a claim that the Windows GUI has passed. V07 exact commit must pass the complete Windows 2022 NSIS hash verification and all three REAL installed WebView2 editing suites.
- If the Microsoft server does not offer the runtime's exact four-part version, the setup fails and requires a separately reviewed version resolver. Do not silently fall back to mismatched Edge browser drivers or a simulated browser.
- Provider-backed, owner-approved atomic native AI editing remains not integrated. Release **NOT READY**.
