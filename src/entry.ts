/** Shuvi 2.0.5: mount exactly one frontend editing controller per WebView page.
 * Default classic mode preserves actual installed Video/Motion E2E.
 * Alternate unified route uses U03 native Tauri IPC but no second studio mount.
 * Provider/AI guarded editing is not authorized by selecting a UI mode.
 */
export {}; // Required for TypeScript ESNext top-level await module semantics.
const unified = new URLSearchParams(window.location.search).get("workspace") === "unified";
if (unified) {
  const navigation = document.createElement("nav");
  navigation.setAttribute("aria-label", "Workspace modes");
  navigation.style.cssText = "padding:8px 16px;display:flex;gap:16px;align-items:center";
  const classic = document.createElement("a");
  classic.id = "return-classic-studio";
  classic.href = window.location.pathname;
  classic.textContent = "← Standard Video / Motion Studio";
  classic.title = "Save your native project before changing workspaces";
  navigation.append(classic);
  const root = document.createElement("main");
  root.id = "native-unified-workspace";
  document.body.replaceChildren(navigation, root);
  const { mountUnifiedWorkspace } = await import("./desktop-ui/workspace");
  mountUnifiedWorkspace(root);
} else {
  // Identical original classic controls; imports execute in the original order.
  await import("./main");
  await import("./studios/motion/bootstrap");
  const target = document.querySelector<HTMLElement>(".top-right");
  if (target) {
    const link = document.createElement("a");
    link.id = "open-unified-workspace";
    link.href = "?workspace=unified";
    link.title = "Save your native project before switching. AI edits are not connected.";
    link.textContent = "Unified Workspace (native beta)";
    link.style.marginLeft = "16px";
    target.append(link);
  }
}
