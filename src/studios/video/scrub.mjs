/**
 * Video-owned preview request coordinator.
 *
 * IMPORTANT: This throttles real FilmCraft rendering; it does NOT pretend
 * to cancel an already running native process. Latest-request wins, one in-flight
 * request maximum, pending requests coalesced.
 *
 * The caller must pass full Video PreviewRequest with saved project SHA.
 * "pauseAndDrain" waits for the current render before mutating the project,
 * avoiding lock errors and stale frames after edits.
 */
export function createPreviewCoordinator(render, onFrame, onError, options = {}) {
  if (typeof render !== "function" || typeof onFrame !== "function" || typeof onError !== "function") {
    throw new TypeError("Renderer and callbacks are required");
  }
  const delay = options.debounceMs ?? 160;
  if (!Number.isFinite(delay) || delay < 0) throw new RangeError("Invalid debounce interval");
  const schedule = options.schedule ?? ((cb, ms) => setTimeout(cb, ms));
  const cancel = options.cancel ?? (handle => clearTimeout(handle));
  let pending = null;
  let running = false;
  let timer = null;
  let generation = 0;
  let disposed = false;
  let paused = false;
  const idleWaiters = [];

  function flush() {
    if (timer !== null) { cancel(timer); timer = null; }
    if (disposed || paused || running || pending === null) return;
    const job = pending;
    pending = null;
    running = true;
    // A rejected native request is handled only when it is the latest request.
    Promise.resolve().then(() => render(job.request)).then(
      result => {
        if (!disposed && !paused && job.ticket === generation &&
            result && result.projectSha256 === job.request.expectedProjectSha256 &&
            result.seconds === job.request.seconds) onFrame(result);
      },
      error => {
        if (!disposed && !paused && job.ticket === generation) onError(error);
      },
    ).finally(() => {
      running = false;
      while (idleWaiters.length > 0) idleWaiters.shift()();
      if (!paused && !disposed && pending !== null) queueFlush(delay);
    });
  }
  function queueFlush(ms) {
    if (timer !== null) cancel(timer);
    timer = schedule(flush, ms);
  }
  function request(frameRequest, immediate = false) {
    if (disposed || paused) return false;
    if (!frameRequest || !Number.isFinite(frameRequest.seconds) ||
        !Number.isFinite(frameRequest.scale) ||
        typeof frameRequest.expectedProjectSha256 !== "string" ||
        frameRequest.expectedProjectSha256.length !== 64) throw new TypeError("Invalid preview request");
    const ticket = ++generation;
    pending = {ticket, request: frameRequest};
    if (!running) queueFlush(immediate ? 0 : delay);
    return true;
  }
  function invalidate() {
    generation++;
    pending = null;
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function pauseAndDrain() {
    paused = true;
    invalidate();
    if (!running) return Promise.resolve();
    return new Promise(resolve => idleWaiters.push(resolve));
  }
  function resume() {
    if (!disposed) paused = false;
  }
  function dispose() {
    disposed = true;
    paused = true;
    invalidate();
  }
  return Object.freeze({request,invalidate,pauseAndDrain,resume,dispose});
}
