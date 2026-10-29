/** Pure Video Studio adapters over FilmCraft's real project.inspect/sequence.inspect. */
export const TICKS_PER_SECOND = 254_016_000_000;

/** @typedef {{itemId:number,name:string,type:string}} MediaListItem */
/** @typedef {{clipId:number,itemId:number,name:string,track:string,kind:"video"|"audio",start:number,duration:number,startFrame:number,durationFrames:number}} EditorClip */

/** @param {unknown} project @returns {MediaListItem[]} */
export function mediaItems(project) {
  const result = [];
  const visited = new Set();
  function visit(bin) {
    if (!bin || typeof bin !== "object" || !Array.isArray(bin.children)) return;
    for (const node of bin.children) {
      if (node && typeof node === "object" && typeof node.item === "number") {
        if (Number.isSafeInteger(node.item) && node.item > 0 && !visited.has(node.item)) {
          visited.add(node.item);
          const kind = String(node.type ?? "unknown");
          if (!/sequence/i.test(kind)) {
            result.push({ itemId: node.item, name: String(node.name ?? "Unnamed media"), type: kind });
          }
        }
      } else {
        visit(node);
      }
    }
  }
  visit(project && typeof project === "object" ? project.root : null);
  return result;
}

/** @param {unknown} sequence @returns {EditorClip[]} */
export function timelineClips(sequence) {
  const clips = [];
  if (!sequence || typeof sequence !== "object") return clips;
  for (const kind of ["video", "audio"]) {
    const tracks = sequence[kind];
    if (!Array.isArray(tracks)) continue;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (!track || !Array.isArray(track.items)) continue;
      const trackName = String(track.name ?? (kind === "video" ? "V" : "A") + (i + 1));
      for (const entry of track.items) {
        if (!entry || !Number.isSafeInteger(entry.clip) || !Number.isSafeInteger(entry.item)) continue;
        if (!Number.isFinite(entry.start) || !Number.isFinite(entry.duration) || entry.duration < 0) continue;
        clips.push({
          clipId: entry.clip, itemId: entry.item, name: String(entry.name ?? "Clip"),
          track: trackName, kind,
          start: entry.start / TICKS_PER_SECOND,
          duration: entry.duration / TICKS_PER_SECOND,
          startFrame: Number(entry.startFrame ?? 0), durationFrames: Number(entry.durationFrames ?? 0),
        });
      }
    }
  }
  return clips.sort((a, b) => a.start - b.start || a.track.localeCompare(b.track) || a.clipId - b.clipId);
}

/** @param {unknown} sequence */
export function sequenceDuration(sequence) {
  const ticks = sequence && typeof sequence === "object" ? sequence.duration : null;
  return Number.isFinite(ticks) && ticks >= 0 ? ticks / TICKS_PER_SECOND : 0;
}

/** @param {number} seconds */
export function formatTimecode(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return [h, m, s].map(x => String(x).padStart(2, "0")).join(":") + "." + String(ms % 1000).padStart(3, "0");
}

/** @param {string} value */
export function localWindowsPath(value) {
  const s = String(value).trim();
  return /^[a-zA-Z]:\\[^]*\S$/.test(s) || /^\\\\[^\\]+\\[^\\]+\\[^]*\S$/.test(s);
}

/** @param {unknown} value @param {number} min @param {number} max */
export function requireNumber(value, min, max) {
  const s=String(value).trim();
  const n=Number(s);
  if (!s || !Number.isFinite(n) || n < min || n > max) throw Error("Value must be a finite number from " + min + " to " + max);
  return n;
}
