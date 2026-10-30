import { invoke } from "@tauri-apps/api/core";

/** V03 FilmCraft IDs are durable per saved project, not global UUIDs. */
export type VideoImportedMedia = {
  itemId: number;
  projectPath: string;
  projectSha256: string;
  sourcePath: string;
  sourceBytes: number;
  container: string;
  durationTicks: number;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  fpsNumerator: number | null;
  fpsDenominator: number | null;
  audioStreams: number;
  projectRevision: number | null;
  projectReadback: unknown;
};

/** Invoke only for a user-selected local directory and media file. No AI auto-approval. */
export function importVideoMedia(
  selectedRoot: string,
  projectPath: string,
  sourcePath: string,
): Promise<VideoImportedMedia> {
  return invoke<VideoImportedMedia>("video_import_media", {
    selectedRoot, projectPath, sourcePath,
  });
}
