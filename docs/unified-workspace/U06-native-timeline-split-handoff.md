# SHUVI 2.0.4 — U06 FilmCraft Timeline Inspection & Native Split Reliability

## Baseline
Repository `shuvinexofficial143-design/shuvi-2`; owner branch `feature/shuvi2-unified-workspace`.
U05 HEAD `95de1aa0059f1dfd546e89ad1f46a793eb40ffa4`, Actions `41019572419` **completed/success** (Windows native+frontend jobs). Previous milestone 59 frontend tests passed at this exact SHA, plus TypeScript/Vite build.

## Native owner integration
* All work confined to owner paths `src/unified-workspace/**`, `src/desktop-ui/**`, `tests/unified-ui-*.test.mjs` and `docs/unified-workspace/**`.
* The source of clip metadata is `video_project_snapshot` via FilmCraft `sequence.inspect`, including clip ID/media item ID, timeline ticks, source start/duration frames, track index and lock flag. No external media generator or fake clip list.
* The real split contract is `TimelineAction::Split {clip_id,seconds}` and checked `video_timeline_apply` with expected SHA/revision. The new `splitVideoClip` validates an on-frame split with >=1 actual frame on each side, performs native mutation, reloads the real saved project and verifies that the same source media has left+right saved segments in the same native track.
* If native receipt advances but split readback fails, Video is quarantined: no claim of success, manual project refresh required. Native exceptions still follow the U05 uncertain-write guard.
* The UI shows selected clip metadata, *native* timeline times/source frames and track lock indicator without altering project state. Zoom 100–400% increases lane width (read-only view), keeping FilmCraft track addresses; browser scroll handles extended lanes.
* Clicking empty lane computes saved FPS-based playhead time and invokes **native FilmCraft preview**. No preview placeholder or synthetic frame is counted as success.
* S keyboard and Split button now use the verified split controller, not generic fire-and-forget `applyVideo`.

## Test expectations
`tests/unified-ui-u06.test.mjs` covers native clip readback and missing clips, lock guards, one-frame boundaries, split native mutation and fresh saved left/right proof, refused mutation when native response diverges, seek snap and zoom event wiring. Existing suites U01–U05 must remain green.

## Release integration status and handoff
The separate `feature/shuvi2-release-integration` branch still mounts `mountVideoStudio` rather than `mountUnifiedWorkspace` in `src/main.ts` on latest read-only inspection. Integration owner Chat 2.0.5 must perform the actual one-window Tauri mount and Windows hardware/WebView2 acceptance. The merged native binary and AI guarded editing are not proven by U06 unit tests. Original FilmCraft/EffectCraft sources and user files remain untouched.
