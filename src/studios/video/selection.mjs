/**
 * The native Windows canonical .fcproj path can legitimately expand 8.3
 * components (RUNNER~1 => runneradmin), whereas the selected input remains
 * unchanged. Trust only the exact project selection captured at successful
 * native inspection, NOT string equality with the canonical result.
 * Rust still validates canonical scope, SHA and native session revision.
 */
export function matchingVideoSelection(current,opened) {
  if(!current||!opened||typeof current.selectedRoot!=="string"||
    typeof current.projectPath!=="string"||
    typeof opened.selectedRoot!=="string"||typeof opened.projectPath!=="string")return false;
  const normalize=value=>value.replaceAll("/","\\").replace(/[\\]+$/,"").toLowerCase();
  return normalize(current.selectedRoot)===normalize(opened.selectedRoot) &&
    normalize(current.projectPath)===normalize(opened.projectPath);
}
