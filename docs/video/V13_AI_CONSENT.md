# V13.2 — Explicit external AI sharing consent

OpenAI mode is opt-in. Sending any prompt to the provider requires the user to select `OpenAI real model` and check a separate per-session disclosure checkbox. The disclosure explicitly says user's instruction and numeric clip/timeline metadata are sent to OpenAI; API charges may apply.
An absent key fails in native Rust without any request. All media files and project paths are excluded from the separately constructed model context. The user instruction itself is sent unchanged and can contain user-entered names; do not paste secrets into the instruction text.
No API call occurs in Local English/हिंदी mode, with unchecked consent, empty prompts, oversized prompts or malformed Unicode nul instructions.
Switching to Motion resets OpenAI mode to Local, revokes consent and clears the ephemeral password input. Returning to Video requires explicit opt-in again.
The native Rust bridge remains the authority for HTTP endpoint/model and input constraints; frontend consent is an additional UI safeguard. No API credentials are committed or placed into tests.