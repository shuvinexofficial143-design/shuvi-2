import { invoke } from "@tauri-apps/api/core";
export type PreviewRequest = {
  selectedRoot: string;
  projectPath: string;
  expectedRevision: number;
  seconds: number;
  scale: number;
};
export type PreviewReceipt = {
  projectPath: string;
  projectRevision: number;
  seconds: number;
  width: number;
  height: number;
  pngBytes: number[];
};
export async function renderVideoPreview(request: PreviewRequest): Promise<PreviewReceipt> {
  return invoke<PreviewReceipt>("video_preview_frame", { request });
}
/** Attach real PNG returned by native engine to a DOM image within Shuvi's Tauri window. */
export function applyPreviewToImage(image: HTMLImageElement, frame: PreviewReceipt): () => void {
  const url=URL.createObjectURL(new Blob([new Uint8Array(frame.pngBytes)],{type:"image/png"}));
  const previous=image.src;
  image.src=url;
  return () => {
    if(image.src===url){image.src=previous;}
    URL.revokeObjectURL(url);
  };
}
