import { invoke } from "@tauri-apps/api/core";

/** V01: real opt-in smoke; source-pinned does not imply runtime-ready. */
export type VideoEngineProbe = {
  engine: "filmcraft-cli";
  command: string;
  savedProjectBytes: number;
  createResult: unknown;
  sequenceReadback: Record<string, unknown>;
};

/** Creates, saves and reloads a temp FilmCraft sequence through native CLI. */
export function probeVideoEngine(): Promise<VideoEngineProbe> {
  return invoke<VideoEngineProbe>("video_engine_probe");
}
