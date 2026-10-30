import type { PreviewRequest, PreviewReceipt } from "./preview";
export type PreviewCoordinator = {
  request(request: PreviewRequest, immediate?: boolean): boolean;
  invalidate(): void;
  pauseAndDrain(): Promise<void>;
  resume(): void;
  dispose(): void;
};
export declare function createPreviewCoordinator(
  render: (request: PreviewRequest) => Promise<PreviewReceipt>,
  onFrame: (result: PreviewReceipt) => void,
  onError: (error: unknown) => void,
  options?: {
    debounceMs?: number;
    schedule?: (cb: () => void, delay: number) => unknown;
    cancel?: (handle: unknown) => void;
  },
): PreviewCoordinator;
