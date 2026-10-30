# V09 — Native Windows launch smoke evidence

In the Video-only GitHub Actions job, after real FilmCraft tests and Windows NSIS packaging, the script \`scripts/video/desktop-launch-smoke.ps1\` launches the actual release \`shuvi2.exe\` on the Windows runner.

Before launch it stages the same compiled FilmCraft engine beside the release binary and SHA-256 verifies the source and staged engine. It then watches the real Windows process for a nonzero main HWND and a title including "Shuvi 2", verifies the process survives two more seconds and closes it. A JSON artifact is uploaded beside the unsigned NSIS installer with window handle, process ID, title and SHA-256 evidence.

This is a strict CI gate. A headless/no-interactive-desktop runner can cause it to fail, which must not be mislabeled as a passing Windows UI test. It proves **launch and window existence**, not that the installed NSIS package has been exercised or that buttons/media import/preview/export work through pointer input.

The actual end-user UI-driven Windows E2E remains pending, including native dialogs, media editing and playback. Do not merge to main until separate install and interaction proof.
