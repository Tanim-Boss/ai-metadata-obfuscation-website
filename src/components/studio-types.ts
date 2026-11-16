import type { ForensicReport } from "@/lib/metadata-inspector";

export type StudioStep = 1 | 2 | 3;
export type UploadMode = "single" | "multiple";

export interface QueuedAsset {
  id: string;
  file: File;
  mediaType: "image" | "video" | "document";
  previewUrl: string;
  isInspecting: boolean;
  isCleaning: boolean;
  isInjecting: boolean;
  beforeReport: ForensicReport | null;
  cleanReport: ForensicReport | null;
  cleanBlob: Blob | null;
  cleanUrl: string | null;
  cleanFilename: string | null;
  injectedReport: ForensicReport | null;
  injectedBlob: Blob | null;
  injectedUrl: string | null;
  injectedFilename: string | null;
  error: string | null;
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
