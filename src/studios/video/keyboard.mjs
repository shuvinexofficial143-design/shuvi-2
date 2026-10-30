/**
 * Input-aware Video Studio keyboard commands. Never override typing, browser
 * text undo, IME composition, or any inactive Motion Studio window.
 */
export function videoKeyboardCommand(event, editing) {
  if (!event || editing || event.isComposing || event.altKey || event.metaKey) return null;
  const key = String(event.key ?? "").toLowerCase();
  if (event.ctrlKey) {
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y" && !event.shiftKey) return "redo";
    return null;
  }
  if (event.shiftKey) return null;
  if (key === "arrowleft") return "back";
  if (key === "arrowright") return "forward";
  return null;
}
