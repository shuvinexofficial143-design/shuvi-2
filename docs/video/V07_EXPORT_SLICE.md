# V07 early slice — Native FilmCraft MP4 Export

This batch implements the **actual** `filmcraft-cli export` path from a verified, persisted FilmCraft project. It does not generate synthetic MP4 output. The command is exposed as `video_export_mp4` and typed `exportVideoMp4`.

## Safety and validation
- Canonical owner-selected project root and project path, optimistic project revision equality, shared per-project import/edit/export lock.
- Output must be an unused absolute `.mp4` path inside the selected root; never silently overwrite files.
- Output is first rendered to a unique staging file, then checked: nonempty ISO BMFF `ftyp`, correct duration, video dimensions and H.264 codec using **FilmCraft's own actual** media probe.
- Staging is removed on failure. Successful publishing uses an exclusive filesystem hard link; source staging is then cleaned up.
- Rendering timeout is 5 minutes. Pilot output cap 2 GiB; larger videos, task cancellation and progress events need future work.

## Verification
- Routine native tests check destination scope and overwrite safety.
- Explicit real integration test imports a genuine 64×64 / 12fps H.264 MP4, creates and places footage in FilmCraft, performs real H.264 export, checks saved MP4's bytes/container/dimensions/codec and refuses a second export onto the same destination.
- The Windows video CI job runs it after media/timeline/PNG tests and before unsigned installer construction.

This is not a complete editing experience. It has no integrated export button, live render-progress UI, cancel button, audio mix validation, long-video QA, GPU hardware baseline, or locally verified Windows playback yet. Do **not** mark the full V07 milestone complete merely because this integration test passes.
