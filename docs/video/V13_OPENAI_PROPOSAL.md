# V13 — Real OpenAI model-assisted proposal bridge

The native Tauri command `video_ai_propose` calls fixed HTTPS endpoint `https://api.openai.com/v1/chat/completions` using `gpt-4o-mini` with JSON Schema structured outputs.
The API key is passed ephemerally by the user or loaded from the desktop environment variable `OPENAI_API_KEY`; it is never stored in code, telemetry, logs, or a project file.
The model receives only numeric clip/media IDs, kind/duration/start, the selected IDs and the user instruction; no source filenames, project paths, frames, .fcproj bytes or API key are included in prompt.
The Rust bridge has timeout, response-size limits and rejects redirects, invalid structured content and unknown provider outputs.
The generated `command` is **UNTRUSTED** and must be validated by the existing strict `parseVideoChat` allowlist against real current clip/media IDs, shown in an approval card, and explicitly approved. A fixed schema alone is not permission to edit.
No app model readiness is claimed without a real user-supplied key and a successful live API call. CI unit tests validate no credential in request body and malformed output rejection; no paid API call in CI.
Source: OpenAI Chat Completions Structured Outputs docs: https://developers.openai.com/api/docs/guides/structured-outputs