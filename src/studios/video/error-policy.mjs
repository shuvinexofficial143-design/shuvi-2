/**
 * Native commands can save a .fcproj before their UI readback fails.
 * A failed edit must trigger real project inspection, rather than retaining
 * stale clip IDs/selection/history from an older SHA.
 */
const potentiallyMutating = new Set([
  "open","import","sequence","place","split","trim","move",
  "delete","undo","redo","recover"
]);
export function shouldRefreshVideoProjectAfterActionError(action) {
  return potentiallyMutating.has(action);
}
