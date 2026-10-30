# V20.1 — Remove legacy M0 mock panels from the real Video mode

Visual inspection of successful V19 Windows screenshot showed that even though `setActive(true)` set `hidden` attributes on the old `.screen` and `.track` DOM nodes, author CSS `.screen{display:flex}` and `.track{display:grid}` overrode the browser's `hidden` styling. This left a fake preview and fake clip rows visible beside the real native editor.

New Video-only scoped CSS explicitly removes those legacy shell elements (`display:none!important`) and leaves the real `.v-editor` and `.v-lanes` present. Switching to Motion removes the `video-workspace` class and preserves the original Motion foundation shell.
Windows Playwright now fails if any old placeholder screen/mock timeline track is visible or the real Program Monitor is missing. It also checks that the Video header no longer calls itself M0 Foundation.

This fix is based on the actual prior real WebView2 screenshot, not a synthetic mock design. Full Windows exact-commit verification must still pass before calling this V20 finished.