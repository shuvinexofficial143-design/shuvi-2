import { invoke } from "@tauri-apps/api/core";

export type TimelineAction =
  | { type: "createSequence"; name: string; width: number; height: number; fps: number }
  | { type: "place"; itemId: number; track: string; seconds: number; video: boolean; audio: boolean }
  | { type: "split"; clipId: number; seconds: number }
  | { type: "trim"; clipId: number; edge: "in" | "out"; ripple: boolean; deltaFrames: number }
  | { type: "move"; clipId: number; track: string; seconds: number; insert: boolean }
  | { type: "delete"; clipId: number; ripple: boolean }
  | { type: "undo" }
  | { type: "redo" };

export type TimelineRequest = {
  selectedRoot: string;
  projectPath: string;
  expectedRevision: number;
  actions: TimelineAction[];
};

export type TimelineReceipt = {
  projectPath: string;
  beforeRevision: number;
  afterRevision: number;
  commands: { id: string; ok: boolean; result?: unknown }[];
  sequenceReadback: unknown;
  projectReadback: unknown;
  backupPath: string;
};

/** Real FilmCraft CLI timeline modifications; caller must own the project scope. */
export function editVideoTimeline(request: TimelineRequest): Promise<TimelineReceipt> {
  return invoke<TimelineReceipt>("video_timeline_apply", { request });
}
