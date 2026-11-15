// Client-safe media classification (no Node `Buffer` usage here so it can run
// in the browser). Server-side byte sniffing lives in document-inspector.ts.

export type MediaCategory = "image" | "video" | "document";

export const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "tif",
  "tiff",
  "gif",
  "bmp",
  "heic",
  "heif",
];

export const VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "m4v",
  "webm",
  "avi",
  "mkv",
  "wmv",
  "mpeg",
  "mpg",
  "m2ts",
  "ts",
];

// Documents the tool can ingest for metadata inspection + obfuscation.
export const DOCUMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "txt",
  "rtf",
  "epub",
  "odt",
  "ods",
  "odp",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "csv",
  "md",
  "html",
  "htm",
  "xml",
  "tex",
  "key",
  "pages",
  "json",
];

const DOCUMENT_MIME_PREFIXES = [
  "application/pdf",
  "application/rtf",
  "application/msword",
  "application/vnd.ms-word",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.oasis.opendocument",
  "application/epub+zip",
  "text/",
  "application/json",
];

export function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot > 0 ? lower.slice(dot + 1) : "";
}

/**
 * Classify an uploaded File into image / video / document based on its MIME
 * type and filename. Returns null when the file is not a supported type.
 */
export function classifyFileType(file: {
  type?: string;
  name?: string;
}): MediaCategory | null {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";

  if (DOCUMENT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return "document";
  }

  const ext = getExtension(file.name || "");
  if (DOCUMENT_EXTENSIONS.includes(ext)) return "document";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}
