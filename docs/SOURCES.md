# Source provenance and licensing

## Git submodule references, pinned on 2026-10-28

- Video editor source: https://github.com/storytold/filmcraft at c49efe070fab862df6c21d61a503605eb6f07105.
- Motion editor source: https://github.com/storytold/effectcraft at fa9cf47175834162806b6b03d83fb2f4bdaeeafa.

Both projects indicate MIT OR Apache-2.0 in their Rust workspace manifests, and ship LICENSE-MIT, LICENSE-APACHE, NOTICE, ATTRIBUTION. Review third-party dependencies and obligations before distributing modified binaries. Submodules preserve upstream Git history, notices, and attribution. Bundling/trademark rights are separate from software copyright licenses. No Adobe or ArtCraft trademarks are licensed.

## Selectively copied Shuvi 1 modules

Original repository: https://github.com/shuvinexofficial143-design/shuvi-agent, from branch feature/shuvi42-combined-runtime at 66d042f298485013bdde013957805fff97ffa39a.

- src/agent/task-runtime-budget.mjs ← src/task-runtime-budget.mjs (bounded per-task accounting).
- src-tauri/src/subtitles.rs ← src-tauri/src/premiere_subtitles.rs (validated SRT serializer/write helper).

The second file retains original source behavior even though only the pure serialize method is exposed to the new desktop shell.

No external Premiere UI automation is copied. Source modules and engine code remain separate until proven compatible with the new direct-command architecture.

## Checkout

    git clone --recurse-submodules https://github.com/shuvinexofficial143-design/shuvi-2.git

The GitHub file browser displays submodule commit references; the contents are downloaded when using --recurse-submodules. This does not install the upstream editors as separate programs.
