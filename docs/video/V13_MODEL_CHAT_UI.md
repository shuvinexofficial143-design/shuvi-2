# V13 — Model-backed Chat integrated

Shuvi Video Studio has a per-project Chat Mode selector: Local typed commands or Real OpenAI model.
The optional API key is entered into a password input for the current desktop session, passed to the Rust native bridge, and is never persisted by the UI. A local OPENAI_API_KEY environment variable is also accepted by the bridge.
The model uses the fixed official OpenAI HTTPS endpoint and requests JSON Schema structured output. The key never goes into model messages.
Only numeric real FilmCraft clip/media IDs, kind, timing, selection and the user's text are sent to OpenAI. No file paths, media bytes, or project assets are provided.
The returned command is treated as untrusted: the deterministic allowlist parser validates it against the saved FilmCraft state. A visible Review card demands a separate approval click, after which native Rust checks SHA/path/scope again and reads back the saved project.
Switching to Motion Studio clears proposed edits and API key input. No hidden auto-execution. Model API calls use the user's key and may incur charges.
Full live model call is not performed in CI (no user API key). CI uses purely local Rust request/reply validation tests. Windows GUI E2E is separate.