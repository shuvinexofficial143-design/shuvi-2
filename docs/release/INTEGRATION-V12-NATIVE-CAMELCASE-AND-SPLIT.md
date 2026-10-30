# Shuvi 2.0.5 V12 — Browser ↔ Native FilmCraft Action Names and Real Split Proof

Working branch `feature/shuvi2-release-integration` only; original FilmCraft/EffectCraft egui sources and A08 canonical owner ledger remain byte-identical to their previous Git trees. No automatic AI edits enabled.

## Verified before this source fix
- Windows original egui GUI `cargo check`: **both FilmCraft and EffectCraft PASS** at exact V11 HEAD `2cb199b31989938c9b434e87ab99115f857c14c2`, run [41065871197](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41065871197).
- Dev-only original FilmCraft Session + A08 `shared_owner_admission`: **12/12 PASS**, including guarded real `video.split`, manual/A07 owner lock, stale snapshot, panic poisoning, no duplicate mutation. No installed original GUI or human consent claim.
- Exact V11 installed custom Tauri Windows run [41065870992](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41065870992): actual unsigned NSIS built, original Tauri EXE launched, installed SHA matched, actual **Motion WebView2 E2E PASS** with disk PNG and reopen. Video failed on `video_timeline_apply` before media placement: **`missing field item_id`**; Unified correctly failed due to Video prerequisite. Release NOT READY.

## Root cause
`src/studios/video/timeline.ts` has typed JS action fields `itemId`, `clipId`, `deltaFrames`. Rust `TimelineAction` had `#[serde(tag="type",rename_all="camelCase")]`, which only renames **enum variant names**, not their contained struct fields. Thus JSON `itemId` wasn't mapped to Rust `item_id`. Because E2E had successfully created the real sequence, the failure occurred exactly at `place`.

## Corrective source and proof
1. Add `rename_all_fields="camelCase"` to the Rust typed enum, NOT a permissive alias or bypass. Keep native `checked_project` canonical path, expected SHA/revision, project backup and bounded editing operations.
2. Add a real Rust deserialization + `mapped_action` regression test for all EIGHT browser action types, exact native command ID, complete Tauri request and rejection of snake_case legacy inputs.
3. Expand installed Windows E2E to **actually click** a FilmCraft clip, issue `split` at 0.5 s, confirm 1→2 native timeline clips, verify the on-disk `.fcproj` SHA changes, take an authentic screenshot, and assert both real split clips persist after a cold-restart reopen. This tests **manual native split**, not yet AI owner-authorized editing.
4. Keep existing native Motion GUI, MP4 H264 export and hash/disk proof; do not accept Video/Unified success until exact V12 Windows release run finishes.
5. Increment independent Windows release concurrency so V11 run artifacts remain accessible.

## Remaining mandatory release requirements
Original editors still run as separately buildable egui crates, not yet two embedded original egui views in one installed Windows app. Production AI Chat cannot claim a real native `video.split` or `motion.editText` through the exact owner lock until an installed GUI with Windows modal approval, A08 journal/credential security, stop/no-replay/recovery and save/reopen tests passes. **RELEASE NOT READY.**
