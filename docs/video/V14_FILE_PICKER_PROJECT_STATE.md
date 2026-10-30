# V14.2 — Keep real FilmCraft project open through media/output picking

Found and fixed a user-visible bug in `view.ts`: every native Windows dialog selection used to erase project snapshot, media selection, history and preview even if the user only chose an MP4 output path.

Now only selecting a different folder, opening a different .fcproj, or choosing a new .fcproj path invalidates project state. Browsing a source-media file or choosing `Save MP4 As` preserves the verified current FilmCraft timeline, project SHA, undo/redo history, selected media, and rendered preview.

Export still refuses to overwrite existing files at the native Rust layer, and it uses the same project digest checked during readback.

Pure deterministic picker-policy tests are run by `npm test`. Real Windows dialogs and native export still need the latest WebView2 UI E2E gate; no completed user install is claimed.