# Windows WebView2 E2E connection recovery

Windows CI independently proved the real Shuvi 2 main window opens (HWND obtained) and FilmCraft tests pass, but two UI-E2E runs stopped at `Real WebView2 did not expose debug session`. The app's functional import/export UI was not exercised. Evidence: GitHub runs 40998568110 and 40998526242.

Microsoft's WebView2 debug documentation supports both `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` and the per-executable Windows policy key `HKCU\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments\\shuvi2.exe`. The UI-E2E test uses **both** in an ephemeral GitHub Windows runner, chooses an unused localhost port, restores the registry value afterward and reports CDP process/port diagnostics if connection still fails.

Never install or ship the CI registry policy, do not apply it on customer machines, and do not mark the full WebView2 UI E2E PASS without all real import/sequence/preview/scrub/export steps completing. Source: Microsoft WebView2 "Debug with Visual Studio Code" guidance.

No application runtime debugging backdoor is introduced. The release installer is compiled from unmodified Tauri app configuration.
