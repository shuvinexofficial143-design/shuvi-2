// A01: strict model-facing action contract; no arbitrary IPC, paths or shell.
const ACTIONS = Object.freeze({
  "video.place": ["itemId", "track", "seconds", "video", "audio"],
  "video.split": ["clipId", "seconds"],
  "video.trim": ["clipId", "edge", "ripple", "deltaFrames"],
  "video.move": ["clipId", "track", "seconds", "insert"],
  "video.delete": ["clipId", "ripple"],
  "motion.createComposition": ["name", "width", "height", "fps", "durationSeconds"],
  "motion.addText": ["compId", "name", "text", "x", "y", "size"],
  "motion.editText": ["compId", "layerId", "text"],
  "motion.addShape": ["compId", "name", "kind", "x", "y", "width", "height", "fill"],
  "motion.setTransform": ["compId", "layerId", "kind", "x", "y", "value"],
  "motion.addEffect": ["compId", "layerId", "effect"],
  "motion.setMaskProperty": ["compId", "layerId", "uid", "property", "value"]
});
export const allowedActions = Object.freeze(Object.keys(ACTIONS));
const MAX_STEPS = 12;
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + ": expected object");
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(label + ": invalid prototype");
  if (Object.keys(value).some(k => ["__proto__", "constructor", "prototype"].includes(k))) throw new Error(label + ": forbidden key");
  return value;
}
function exact(value, keys, label) {
  record(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) throw new Error(label + ": unexpected key " + key);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error(label + ": missing key " + key);
}
function text(value, label, max = 120) {
  if (typeof value !== "string" || !value || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(label + ": invalid text");
  }
}
function number(value, label, min, max, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new Error(label + ": invalid number");
  }
}
function choice(value, label, options) {
  if (!options.includes(value)) throw new Error(label + ": unapproved value");
}
function bool(value, label) { if (typeof value !== "boolean") throw new Error(label + ": boolean required"); }
function id(value, label) { number(value, label, 1, Number.MAX_SAFE_INTEGER, true); }
function coord(value, label) { number(value, label, -100000, 100000); }
function duration(value, label) { number(value, label, 0, 21600); }
function validateAction(action, engine) {
  record(action, "action");
  const type = action.type;
  if (!Object.hasOwn(ACTIONS, type)) throw new Error("unapproved editing action");
  if (!type.startsWith(engine + ".")) throw new Error("action/editor mismatch");
  exact(action, ["type", ...ACTIONS[type]], type);
  for (const field of ["compId", "layerId", "clipId", "itemId", "uid"]) if (field in action) id(action[field], field);
  for (const field of ["name", "track"]) if (field in action) text(action[field], field, 120);
  for (const field of ["video", "audio", "ripple", "insert"]) if (field in action) bool(action[field], field);
  for (const field of ["x", "y"]) if (field in action) coord(action[field], field);
  for (const field of ["seconds", "time"]) if (field in action) duration(action[field], field);
  for (const field of ["width", "height"]) if (field in action) number(action[field], field, 1, 8192, true);
  if ("fps" in action) number(action.fps, "fps", 1, 120);
  if ("durationSeconds" in action) number(action.durationSeconds, "durationSeconds", 1 / action.fps, 600);
  if ("size" in action) number(action.size, "size", 1, 1000);
  if ("text" in action) text(action.text, "text", 2000);
  if ("deltaFrames" in action) number(action.deltaFrames, "deltaFrames", -100000, 100000, true);
  if ("edge" in action) choice(action.edge, "edge", ["in", "out"]);
  if (type === "video.place" && !action.video && !action.audio) throw new Error("place requires audio or video");
  if ("kind" in action) choice(action.kind, "kind", type === "motion.addShape" ? ["rect", "ellipse", "rounded", "star", "polygon"] : ["position", "scale", "rotation", "opacity"]);
  if ("fill" in action && (typeof action.fill !== "string" || !/^#[0-9a-fA-F]{6}$/.test(action.fill))) throw new Error("fill: six-digit RGB required");
  if ("effect" in action) choice(action.effect, "effect", ["gaussianBlur", "brightnessContrast"]);
  if ("property" in action) choice(action.property, "property", ["feather", "expansion", "opacity"]);
  if ("value" in action) number(action.value, "value", -100000, 100000);
  if (type === "motion.setTransform") {
    if (["position", "scale"].includes(action.kind)) {
      if (action.value !== null) throw new Error("vector transform requires null scalar value");
    } else {
      if (action.x !== null || action.y !== null) throw new Error("scalar transform requires null coordinates");
      if (action.kind === "opacity") number(action.value, "opacity", 0, 100);
    }
  }
  return JSON.parse(JSON.stringify(action));
}
export function validateSnapshot(input) {
  exact(input, ["engine", "projectId", "version", "sessionId"], "snapshot");
  choice(input.engine, "engine", ["video", "motion"]);
  text(input.projectId, "projectId", 1024);
  text(input.sessionId, "sessionId", 128);
  if (input.engine === "video") {
    if (typeof input.version !== "string" || !/^[0-9a-f]{64}$/.test(input.version)) throw new Error("video requires exact disk SHA-256 version");
  } else {
    number(input.version, "motion revision", 0, Number.MAX_SAFE_INTEGER, true);
  }
  return Object.freeze({ ...input });
}
export function sameSnapshot(a, b) {
  return a.engine === b.engine && a.projectId === b.projectId &&
    a.sessionId === b.sessionId && a.version === b.version;
}
export function advancedSnapshot(before, after) {
  return before.engine === after.engine && before.projectId === after.projectId &&
    before.sessionId === after.sessionId && before.version !== after.version &&
    (before.engine !== "motion" || after.version > before.version);
}
export function validateDraft({ taskId, instruction, snapshot, actions }) {
  if (typeof taskId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(taskId)) throw new Error("invalid task id");
  text(instruction, "instruction", 2000);
  const snap = validateSnapshot(snapshot);
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > MAX_STEPS) throw new Error("plan must contain 1-12 actions");
  const steps = actions.map(a => validateAction(a, snap.engine));
  const canonical = { taskId, instruction, snapshot: snap, actions: steps };
  if (JSON.stringify(canonical).length > 24000) throw new Error("plan too large");
  return deepFreeze(canonical);
}
export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
export function safeClone(value) { return JSON.parse(JSON.stringify(value)); }
