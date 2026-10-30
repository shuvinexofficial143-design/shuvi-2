/**
 * A source-media path or MP4 export filename is not a different project.
 * The loaded .fcproj, SHA, history, selection and frame stay valid.
 * Project file/folder changes must invalidate all of them.
 */
export function shouldInvalidateVideoProjectOnFilePick(which) {
  if (["folder","project","newProject"].includes(which)) return true;
  if (["source","output"].includes(which)) return false;
  throw new RangeError("Unknown Video Studio picker action");
}
