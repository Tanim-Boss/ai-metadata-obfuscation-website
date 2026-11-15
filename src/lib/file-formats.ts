/**
 * Universal file format detection.
 *
 * The forge accepts *every* file — photos, videos, audio, documents, archives,
 * fonts, code and raw binaries. This module is the single source of truth for
 * "what kind of file is this?" and is deliberately isomorphic so it can run in
 * the browser (extension/MIME heuristics) and on the server (magic-byte
 * sniffing of the real payload).
 */

export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "font"
  | "text"
  | "data"
  | "binary";

export type SignatureSource = "magic" | "extension" | "mime" | "unknown";

export interface FileSignature {
  /** High level family used to pick a sanitization pipeline. */
  kind: FileKind;
  /** Concrete container/format label, e.g. "JPEG", "MP4", "PDF", "FLAC". */
  format: string;
  /** Canonical MIME type. */
  mimeType: string;
  /** Canonical extension without the leading dot. */
  extension: string;
  /** Human friendly family label, e.g. "Photo", "Audio", "Document". */
  label: string;
  /** How the signature was resolved. */
  source: SignatureSource;
}

export const KIND_LABELS: Record<FileKind, string> = {
  image: "Photo / Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
  archive: "Archive",
  font: "Font",
  text: "Text / Code",
  data: "Structured Data",
  binary: "Binary Blob",
};

export const KIND_ICONS: Record<FileKind, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  archive: "archive",
  font: "font",
  text: "text",
  data: "data",
  binary: "binary",
};

interface FormatDescriptor {
  kind: FileKind;
  format: string;
  mimeType: string;
  extension: string;
}

/**
 * Extension table. Used as a fallback when the payload has no distinctive
 * magic bytes (plain text, source code, CSV, ...) and to refine ambiguous
 * magic matches (a "PK" archive may be OOXML, EPUB or a plain ZIP).
 */
const EXTENSION_TABLE: Record<string, FormatDescriptor> = {
  // ---- Photos -----------------------------------------------------------
  jpg: { kind: "image", format: "JPEG", mimeType: "image/jpeg", extension: "jpg" },
  jpeg: { kind: "image", format: "JPEG", mimeType: "image/jpeg", extension: "jpg" },
  jpe: { kind: "image", format: "JPEG", mimeType: "image/jpeg", extension: "jpg" },
  jfif: { kind: "image", format: "JPEG", mimeType: "image/jpeg", extension: "jpg" },
  png: { kind: "image", format: "PNG", mimeType: "image/png", extension: "png" },
  apng: { kind: "image", format: "PNG", mimeType: "image/apng", extension: "png" },
  webp: { kind: "image", format: "WEBP", mimeType: "image/webp", extension: "webp" },
  avif: { kind: "image", format: "AVIF", mimeType: "image/avif", extension: "avif" },
  heic: { kind: "image", format: "HEIC", mimeType: "image/heic", extension: "heic" },
  heif: { kind: "image", format: "HEIF", mimeType: "image/heif", extension: "heif" },
  hif: { kind: "image", format: "HEIF", mimeType: "image/heif", extension: "heic" },
  tif: { kind: "image", format: "TIFF", mimeType: "image/tiff", extension: "tif" },
  tiff: { kind: "image", format: "TIFF", mimeType: "image/tiff", extension: "tif" },
  gif: { kind: "image", format: "GIF", mimeType: "image/gif", extension: "gif" },
  bmp: { kind: "image", format: "BMP", mimeType: "image/bmp", extension: "bmp" },
  dib: { kind: "image", format: "BMP", mimeType: "image/bmp", extension: "bmp" },
  ico: { kind: "image", format: "ICO", mimeType: "image/x-icon", extension: "ico" },
  cur: { kind: "image", format: "ICO", mimeType: "image/x-icon", extension: "ico" },
  svg: { kind: "image", format: "SVG", mimeType: "image/svg+xml", extension: "svg" },
  svgz: { kind: "image", format: "SVG", mimeType: "image/svg+xml", extension: "svg" },
  psd: { kind: "image", format: "PSD", mimeType: "image/vnd.adobe.photoshop", extension: "psd" },
  ai: { kind: "image", format: "PDF", mimeType: "application/pdf", extension: "pdf" },
  eps: { kind: "image", format: "EPS", mimeType: "application/postscript", extension: "eps" },
  ps: { kind: "image", format: "EPS", mimeType: "application/postscript", extension: "eps" },
  xcf: { kind: "image", format: "GIMP", mimeType: "image/x-xcf", extension: "xcf" },
  jxl: { kind: "image", format: "JPEG-XL", mimeType: "image/jxl", extension: "jxl" },
  jp2: { kind: "image", format: "JPEG 2000", mimeType: "image/jp2", extension: "jp2" },
  j2k: { kind: "image", format: "JPEG 2000", mimeType: "image/jp2", extension: "jp2" },
  // RAW camera formats (TIFF based)
  cr2: { kind: "image", format: "CR2", mimeType: "image/x-canon-cr2", extension: "cr2" },
  cr3: { kind: "image", format: "CR3", mimeType: "image/x-canon-cr3", extension: "cr3" },
  nef: { kind: "image", format: "NEF", mimeType: "image/x-nikon-nef", extension: "nef" },
  nrw: { kind: "image", format: "NEF", mimeType: "image/x-nikon-nef", extension: "nef" },
  arw: { kind: "image", format: "ARW", mimeType: "image/x-sony-arw", extension: "arw" },
  srf: { kind: "image", format: "SR2", mimeType: "image/x-sony-srf", extension: "sr2" },
  sr2: { kind: "image", format: "SR2", mimeType: "image/x-sony-srf", extension: "sr2" },
  dng: { kind: "image", format: "DNG", mimeType: "image/x-adobe-dng", extension: "dng" },
  orf: { kind: "image", format: "ORF", mimeType: "image/x-olympus-orf", extension: "orf" },
  rw2: { kind: "image", format: "RW2", mimeType: "image/x-panasonic-rw2", extension: "rw2" },
  raf: { kind: "image", format: "RAF", mimeType: "image/x-fuji-raf", extension: "raf" },
  srw: { kind: "image", format: "SRW", mimeType: "image/x-samsung-srw", extension: "srw" },
  pef: { kind: "image", format: "PEF", mimeType: "image/x-pentax-pef", extension: "pef" },
  "3fr": { kind: "image", format: "3FR", mimeType: "image/x-hasselblad-3fr", extension: "3fr" },
  iiq: { kind: "image", format: "IIQ", mimeType: "image/x-phaseone-iiq", extension: "iiq" },
  // ---- Video ------------------------------------------------------------
  mp4: { kind: "video", format: "MP4", mimeType: "video/mp4", extension: "mp4" },
  m4v: { kind: "video", format: "MP4", mimeType: "video/mp4", extension: "mp4" },
  mov: { kind: "video", format: "MOV", mimeType: "video/quicktime", extension: "mov" },
  qt: { kind: "video", format: "MOV", mimeType: "video/quicktime", extension: "mov" },
  mkv: { kind: "video", format: "MKV", mimeType: "video/x-matroska", extension: "mkv" },
  webm: { kind: "video", format: "WEBM", mimeType: "video/webm", extension: "webm" },
  avi: { kind: "video", format: "AVI", mimeType: "video/x-msvideo", extension: "avi" },
  flv: { kind: "video", format: "FLV", mimeType: "video/x-flv", extension: "flv" },
  wmv: { kind: "video", format: "WMV", mimeType: "video/x-ms-wmv", extension: "wmv" },
  asf: { kind: "video", format: "ASF", mimeType: "video/x-ms-asf", extension: "asf" },
  mpg: { kind: "video", format: "MPEG", mimeType: "video/mpeg", extension: "mpg" },
  mpeg: { kind: "video", format: "MPEG", mimeType: "video/mpeg", extension: "mpg" },
  m2ts: { kind: "video", format: "M2TS", mimeType: "video/mp2t", extension: "m2ts" },
  mts: { kind: "video", format: "M2TS", mimeType: "video/mp2t", extension: "m2ts" },
  "3gp": { kind: "video", format: "3GP", mimeType: "video/3gpp", extension: "3gp" },
  "3g2": { kind: "video", format: "3GP", mimeType: "video/3gpp", extension: "3gp" },
  ogv: { kind: "video", format: "OGV", mimeType: "video/ogg", extension: "ogv" },
  rmvb: { kind: "video", format: "RMVB", mimeType: "application/vnd.rn-realmedia-vbr", extension: "rmvb" },
  // ---- Audio ------------------------------------------------------------
  mp3: { kind: "audio", format: "MP3", mimeType: "audio/mpeg", extension: "mp3" },
  wav: { kind: "audio", format: "WAV", mimeType: "audio/wav", extension: "wav" },
  wave: { kind: "audio", format: "WAV", mimeType: "audio/wav", extension: "wav" },
  flac: { kind: "audio", format: "FLAC", mimeType: "audio/flac", extension: "flac" },
  m4a: { kind: "audio", format: "M4A", mimeType: "audio/mp4", extension: "m4a" },
  m4b: { kind: "audio", format: "M4B", mimeType: "audio/mp4", extension: "m4a" },
  aac: { kind: "audio", format: "AAC", mimeType: "audio/aac", extension: "aac" },
  ogg: { kind: "audio", format: "OGG", mimeType: "audio/ogg", extension: "ogg" },
  opus: { kind: "audio", format: "OPUS", mimeType: "audio/opus", extension: "opus" },
  wma: { kind: "audio", format: "WMA", mimeType: "audio/x-ms-wma", extension: "wma" },
  aiff: { kind: "audio", format: "AIFF", mimeType: "audio/aiff", extension: "aiff" },
  aif: { kind: "audio", format: "AIFF", mimeType: "audio/aiff", extension: "aiff" },
  aifc: { kind: "audio", format: "AIFF", mimeType: "audio/aiff", extension: "aiff" },
  mid: { kind: "audio", format: "MIDI", mimeType: "audio/midi", extension: "mid" },
  midi: { kind: "audio", format: "MIDI", mimeType: "audio/midi", extension: "mid" },
  amr: { kind: "audio", format: "AMR", mimeType: "audio/amr", extension: "amr" },
  caf: { kind: "audio", format: "CAF", mimeType: "audio/x-caf", extension: "caf" },
  au: { kind: "audio", format: "AU", mimeType: "audio/basic", extension: "au" },
  snd: { kind: "audio", format: "AU", mimeType: "audio/basic", extension: "au" },
  // ---- Documents --------------------------------------------------------
  pdf: { kind: "document", format: "PDF", mimeType: "application/pdf", extension: "pdf" },
  doc: { kind: "document", format: "DOC", mimeType: "application/msword", extension: "doc" },
  docx: { kind: "document", format: "DOCX", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" },
  dotx: { kind: "document", format: "DOCX", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.template", extension: "docx" },
  xls: { kind: "document", format: "XLS", mimeType: "application/vnd.ms-excel", extension: "xls" },
  xlsx: { kind: "document", format: "XLSX", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
  ppt: { kind: "document", format: "PPT", mimeType: "application/vnd.ms-powerpoint", extension: "ppt" },
  pptx: { kind: "document", format: "PPTX", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: "pptx" },
  odt: { kind: "document", format: "ODT", mimeType: "application/vnd.oasis.opendocument.text", extension: "odt" },
  ods: { kind: "document", format: "ODS", mimeType: "application/vnd.oasis.opendocument.spreadsheet", extension: "ods" },
  odp: { kind: "document", format: "ODP", mimeType: "application/vnd.oasis.opendocument.presentation", extension: "odp" },
  rtf: { kind: "document", format: "RTF", mimeType: "application/rtf", extension: "rtf" },
  epub: { kind: "document", format: "EPUB", mimeType: "application/epub+zip", extension: "epub" },
  pages: { kind: "document", format: "PAGES", mimeType: "application/vnd.apple.pages", extension: "pages" },
  key: { kind: "document", format: "KEYNOTE", mimeType: "application/vnd.apple.keynote", extension: "key" },
  numbers: { kind: "document", format: "NUMBERS", mimeType: "application/vnd.apple.numbers", extension: "numbers" },
  md: { kind: "text", format: "MARKDOWN", mimeType: "text/markdown", extension: "md" },
  markdown: { kind: "text", format: "MARKDOWN", mimeType: "text/markdown", extension: "md" },
  txt: { kind: "text", format: "TEXT", mimeType: "text/plain", extension: "txt" },
  log: { kind: "text", format: "TEXT", mimeType: "text/plain", extension: "log" },
  csv: { kind: "text", format: "CSV", mimeType: "text/csv", extension: "csv" },
  tsv: { kind: "text", format: "TSV", mimeType: "text/tab-separated-values", extension: "tsv" },
  json: { kind: "data", format: "JSON", mimeType: "application/json", extension: "json" },
  jsonl: { kind: "data", format: "JSONL", mimeType: "application/x-ndjson", extension: "jsonl" },
  xml: { kind: "data", format: "XML", mimeType: "application/xml", extension: "xml" },
  yaml: { kind: "data", format: "YAML", mimeType: "application/yaml", extension: "yaml" },
  yml: { kind: "data", format: "YAML", mimeType: "application/yaml", extension: "yaml" },
  toml: { kind: "data", format: "TOML", mimeType: "application/toml", extension: "toml" },
  html: { kind: "text", format: "HTML", mimeType: "text/html", extension: "html" },
  htm: { kind: "text", format: "HTML", mimeType: "text/html", extension: "html" },
  css: { kind: "text", format: "CSS", mimeType: "text/css", extension: "css" },
  js: { kind: "text", format: "JavaScript", mimeType: "text/javascript", extension: "js" },
  mjs: { kind: "text", format: "JavaScript", mimeType: "text/javascript", extension: "mjs" },
  ts: { kind: "text", format: "TypeScript", mimeType: "text/typescript", extension: "ts" },
  tsx: { kind: "text", format: "TypeScript", mimeType: "text/typescript", extension: "tsx" },
  jsx: { kind: "text", format: "JavaScript", mimeType: "text/javascript", extension: "jsx" },
  py: { kind: "text", format: "Python", mimeType: "text/x-python", extension: "py" },
  sh: { kind: "text", format: "Shell", mimeType: "application/x-sh", extension: "sh" },
  bat: { kind: "text", format: "Batch", mimeType: "application/x-bat", extension: "bat" },
  // ---- Archives ---------------------------------------------------------
  zip: { kind: "archive", format: "ZIP", mimeType: "application/zip", extension: "zip" },
  jar: { kind: "archive", format: "JAR", mimeType: "application/java-archive", extension: "jar" },
  war: { kind: "archive", format: "JAR", mimeType: "application/java-archive", extension: "jar" },
  "7z": { kind: "archive", format: "7Z", mimeType: "application/x-7z-compressed", extension: "7z" },
  rar: { kind: "archive", format: "RAR", mimeType: "application/vnd.rar", extension: "rar" },
  gz: { kind: "archive", format: "GZIP", mimeType: "application/gzip", extension: "gz" },
  tgz: { kind: "archive", format: "GZIP", mimeType: "application/gzip", extension: "gz" },
  bz2: { kind: "archive", format: "BZIP2", mimeType: "application/x-bzip2", extension: "bz2" },
  xz: { kind: "archive", format: "XZ", mimeType: "application/x-xz", extension: "xz" },
  zst: { kind: "archive", format: "ZSTD", mimeType: "application/zstd", extension: "zst" },
  tar: { kind: "archive", format: "TAR", mimeType: "application/x-tar", extension: "tar" },
  iso: { kind: "archive", format: "ISO", mimeType: "application/x-iso9660-image", extension: "iso" },
  // ---- Fonts ------------------------------------------------------------
  ttf: { kind: "font", format: "TTF", mimeType: "font/ttf", extension: "ttf" },
  otf: { kind: "font", format: "OTF", mimeType: "font/otf", extension: "otf" },
  woff: { kind: "font", format: "WOFF", mimeType: "font/woff", extension: "woff" },
  woff2: { kind: "font", format: "WOFF2", mimeType: "font/woff2", extension: "woff2" },
  eot: { kind: "font", format: "EOT", mimeType: "application/vnd.ms-fontobject", extension: "eot" },
  // ---- Data / executables ----------------------------------------------
  db: { kind: "data", format: "SQLite", mimeType: "application/vnd.sqlite3", extension: "db" },
  sqlite: { kind: "data", format: "SQLite", mimeType: "application/vnd.sqlite3", extension: "db" },
  parquet: { kind: "data", format: "PARQUET", mimeType: "application/vnd.apache.parquet", extension: "parquet" },
  exe: { kind: "binary", format: "EXECUTABLE", mimeType: "application/x-msdownload", extension: "exe" },
  dll: { kind: "binary", format: "EXECUTABLE", mimeType: "application/x-msdownload", extension: "dll" },
  so: { kind: "binary", format: "ELF", mimeType: "application/x-elf", extension: "so" },
  bin: { kind: "binary", format: "BINARY", mimeType: "application/octet-stream", extension: "bin" },
  dat: { kind: "binary", format: "BINARY", mimeType: "application/octet-stream", extension: "dat" },
};

/** MIME type -> descriptor fallback when neither magic bytes nor extension help. */
const MIME_TABLE: Record<string, FormatDescriptor> = {
  "image/jpeg": EXTENSION_TABLE.jpg,
  "image/png": EXTENSION_TABLE.png,
  "image/webp": EXTENSION_TABLE.webp,
  "image/avif": EXTENSION_TABLE.avif,
  "image/heic": EXTENSION_TABLE.heic,
  "image/heif": EXTENSION_TABLE.heif,
  "image/tiff": EXTENSION_TABLE.tif,
  "image/gif": EXTENSION_TABLE.gif,
  "image/bmp": EXTENSION_TABLE.bmp,
  "image/svg+xml": EXTENSION_TABLE.svg,
  "image/x-icon": EXTENSION_TABLE.ico,
  "video/mp4": EXTENSION_TABLE.mp4,
  "video/quicktime": EXTENSION_TABLE.mov,
  "video/x-matroska": EXTENSION_TABLE.mkv,
  "video/webm": EXTENSION_TABLE.webm,
  "video/x-msvideo": EXTENSION_TABLE.avi,
  "video/x-flv": EXTENSION_TABLE.flv,
  "video/x-ms-wmv": EXTENSION_TABLE.wmv,
  "video/x-ms-asf": EXTENSION_TABLE.asf,
  "video/mpeg": EXTENSION_TABLE.mpg,
  "video/3gpp": EXTENSION_TABLE["3gp"],
  "video/mp2t": EXTENSION_TABLE.mts,
  "video/ogg": EXTENSION_TABLE.ogv,
  "audio/mpeg": EXTENSION_TABLE.mp3,
  "audio/mp3": EXTENSION_TABLE.mp3,
  "audio/wav": EXTENSION_TABLE.wav,
  "audio/x-wav": EXTENSION_TABLE.wav,
  "audio/flac": EXTENSION_TABLE.flac,
  "audio/mp4": EXTENSION_TABLE.m4a,
  "audio/aac": EXTENSION_TABLE.aac,
  "audio/ogg": EXTENSION_TABLE.ogg,
  "audio/opus": EXTENSION_TABLE.opus,
  "audio/x-ms-wma": EXTENSION_TABLE.wma,
  "audio/aiff": EXTENSION_TABLE.aiff,
  "audio/midi": EXTENSION_TABLE.mid,
  "application/pdf": EXTENSION_TABLE.pdf,
  "application/msword": EXTENSION_TABLE.doc,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": EXTENSION_TABLE.docx,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": EXTENSION_TABLE.xlsx,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": EXTENSION_TABLE.pptx,
  "application/vnd.oasis.opendocument.text": EXTENSION_TABLE.odt,
  "application/rtf": EXTENSION_TABLE.rtf,
  "application/epub+zip": EXTENSION_TABLE.epub,
  "application/zip": EXTENSION_TABLE.zip,
  "application/x-7z-compressed": EXTENSION_TABLE["7z"],
  "application/vnd.rar": EXTENSION_TABLE.rar,
  "application/gzip": EXTENSION_TABLE.gz,
  "application/x-tar": EXTENSION_TABLE.tar,
  "application/json": EXTENSION_TABLE.json,
  "application/xml": EXTENSION_TABLE.xml,
  "text/xml": EXTENSION_TABLE.xml,
  "text/plain": EXTENSION_TABLE.txt,
  "text/markdown": EXTENSION_TABLE.md,
  "text/csv": EXTENSION_TABLE.csv,
  "text/html": EXTENSION_TABLE.html,
  "font/ttf": EXTENSION_TABLE.ttf,
  "font/otf": EXTENSION_TABLE.otf,
  "font/woff": EXTENSION_TABLE.woff,
  "font/woff2": EXTENSION_TABLE.woff2,
  "application/vnd.sqlite3": EXTENSION_TABLE.db,
};

export function getExtension(filename?: string): string {
  if (!filename) return "";
  const base = filename.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

function descriptorToSignature(
  desc: FormatDescriptor,
  source: SignatureSource
): FileSignature {
  return {
    kind: desc.kind,
    format: desc.format,
    mimeType: desc.mimeType,
    extension: desc.extension,
    label: KIND_LABELS[desc.kind],
    source,
  };
}

function asciiAt(buf: Buffer, start: number, length: number): string {
  if (start >= buf.length) return "";
  return buf.toString("latin1", start, Math.min(buf.length, start + length));
}

function startsWithBytes(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * Collect the entry names of a ZIP container by walking local file headers.
 * This is how OOXML / EPUB / ODT payloads are told apart from plain ZIPs.
 */
export function listZipEntryNames(buf: Buffer, limit = 64): string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset + 30 <= buf.length && names.length < limit) {
    if (
      buf[offset] !== 0x50 ||
      buf[offset + 1] !== 0x4b ||
      buf[offset + 2] !== 0x03 ||
      buf[offset + 3] !== 0x04
    ) {
      break;
    }
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    if (nameStart + nameLen > buf.length) break;
    names.push(buf.toString("utf8", nameStart, nameStart + nameLen));
    offset = nameStart + nameLen + extraLen + compressedSize;
  }
  return names;
}

function detectZipFlavour(buf: Buffer): FormatDescriptor | null {
  const names = listZipEntryNames(buf).map((n) => n.toLowerCase());
  if (names.length === 0) return null;
  const has = (needle: string) => names.some((n) => n === needle || n.startsWith(needle));
  if (has("word/")) return EXTENSION_TABLE.docx;
  if (has("xl/")) return EXTENSION_TABLE.xlsx;
  if (has("ppt/")) return EXTENSION_TABLE.pptx;
  if (has("mimetype") && names.includes("mimetype")) {
    // EPUB / ODT both use a `mimetype` entry — inspect it when present.
    const idx = buf.indexOf("mimetype");
    if (idx >= 0) {
      const declared = buf.toString("latin1", idx + 8, idx + 8 + 64).trim();
      if (declared.includes("epub")) return EXTENSION_TABLE.epub;
      if (declared.includes("opendocument.text")) return EXTENSION_TABLE.odt;
      if (declared.includes("opendocument.spreadsheet")) return EXTENSION_TABLE.ods;
      if (declared.includes("opendocument.presentation")) return EXTENSION_TABLE.odp;
    }
    return EXTENSION_TABLE.epub;
  }
  if (names.some((n) => n.startsWith("content.xml") || n.startsWith("meta.xml"))) {
    return EXTENSION_TABLE.odt;
  }
  if (has("maven/") || has("meta-inf/manifest.mf")) return EXTENSION_TABLE.jar;
  return EXTENSION_TABLE.zip;
}

function detectIsoBmffBrand(buf: Buffer): FormatDescriptor {
  const brand = asciiAt(buf, 8, 4).trim().toLowerCase();
  switch (brand) {
    case "qt  ":
    case "qt":
      return EXTENSION_TABLE.mov;
    case "heic":
    case "heix":
    case "hevc":
    case "hevx":
    case "heim":
    case "heis":
    case "hevm":
    case "hevs":
      return EXTENSION_TABLE.heic;
    case "avif":
    case "avis":
      return EXTENSION_TABLE.avif;
    case "mif1":
    case "msf1":
      return EXTENSION_TABLE.heif;
    case "3gp4":
    case "3gp5":
    case "3gp6":
    case "3g2a":
      return EXTENSION_TABLE["3gp"];
    case "m4a ":
    case "m4b ":
    case "m4p ":
      return EXTENSION_TABLE.m4a;
    case "crx ":
      return EXTENSION_TABLE.cr3;
    default:
      return EXTENSION_TABLE.mp4;
  }
}

/**
 * Magic-byte sniffing. Returns `null` when the payload carries no recognisable
 * signature so the caller can fall back to extension/MIME heuristics.
 */
export function detectMagicSignature(buf: Buffer): FileSignature | null {
  if (!buf || buf.length === 0) return null;

  // --- Images ------------------------------------------------------------
  if (startsWithBytes(buf, [0xff, 0xd8, 0xff])) {
    return descriptorToSignature(EXTENSION_TABLE.jpg, "magic");
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return descriptorToSignature(EXTENSION_TABLE.png, "magic");
  }
  if (asciiAt(buf, 0, 6) === "GIF87a" || asciiAt(buf, 0, 6) === "GIF89a") {
    return descriptorToSignature(EXTENSION_TABLE.gif, "magic");
  }
  if (asciiAt(buf, 0, 2) === "BM") {
    return descriptorToSignature(EXTENSION_TABLE.bmp, "magic");
  }
  if (asciiAt(buf, 0, 4) === "8BPS") {
    return descriptorToSignature(EXTENSION_TABLE.psd, "magic");
  }
  if (
    startsWithBytes(buf, [0x00, 0x00, 0x01, 0x00]) ||
    startsWithBytes(buf, [0x00, 0x00, 0x02, 0x00])
  ) {
    return descriptorToSignature(EXTENSION_TABLE.ico, "magic");
  }
  // TIFF / RAW family
  const tiffHeader = asciiAt(buf, 0, 4);
  if (tiffHeader === "II*\u0000" || tiffHeader === "MM\u0000*") {
    const maker = asciiAt(buf, 8, 6);
    if (maker.startsWith("CR")) {
      return descriptorToSignature(EXTENSION_TABLE.cr2, "magic");
    }
    return descriptorToSignature(EXTENSION_TABLE.tif, "magic");
  }
  if (tiffHeader === "II+\u0000" || tiffHeader === "MM\u0000+") {
    return descriptorToSignature(EXTENSION_TABLE.tif, "magic");
  }
  if (asciiAt(buf, 0, 4) === "FUJI") {
    return descriptorToSignature(EXTENSION_TABLE.raf, "magic");
  }
  if (["IIRO", "IIRS", "MMOR"].includes(asciiAt(buf, 0, 4))) {
    return descriptorToSignature(EXTENSION_TABLE.orf, "magic");
  }
  if (asciiAt(buf, 0, 4) === "IIU\u0000") {
    return descriptorToSignature(EXTENSION_TABLE.rw2, "magic");
  }
  if (asciiAt(buf, 0, 16) === "FUJIFILMCCD-RAW") {
    return descriptorToSignature(EXTENSION_TABLE.raf, "magic");
  }

  // --- RIFF family (WebP / WAV / AVI) ------------------------------------
  if (asciiAt(buf, 0, 4) === "RIFF") {
    const riffType = asciiAt(buf, 8, 4);
    if (riffType === "WEBP") {
      return descriptorToSignature(EXTENSION_TABLE.webp, "magic");
    }
    if (riffType === "WAVE") {
      return descriptorToSignature(EXTENSION_TABLE.wav, "magic");
    }
    if (riffType === "AVI ") {
      return descriptorToSignature(EXTENSION_TABLE.avi, "magic");
    }
  }

  // --- ISO base media (MP4 / MOV / M4A / 3GP / HEIF) ----------------------
  if (asciiAt(buf, 4, 4) === "ftyp") {
    return descriptorToSignature(detectIsoBmffBrand(buf), "magic");
  }

  // --- Matroska ----------------------------------------------------------
  if (
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  ) {
    const head = buf.toString("latin1", 0, Math.min(buf.length, 256));
    return descriptorToSignature(
      head.includes("webm") ? EXTENSION_TABLE.webm : EXTENSION_TABLE.mkv,
      "magic"
    );
  }

  // --- Audio -------------------------------------------------------------
  if (asciiAt(buf, 0, 3) === "ID3") {
    return descriptorToSignature(EXTENSION_TABLE.mp3, "magic");
  }
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return descriptorToSignature(EXTENSION_TABLE.mp3, "magic");
  }
  if (asciiAt(buf, 0, 4) === "fLaC") {
    return descriptorToSignature(EXTENSION_TABLE.flac, "magic");
  }
  if (asciiAt(buf, 0, 4) === "OggS") {
    return descriptorToSignature(EXTENSION_TABLE.ogg, "magic");
  }
  if (asciiAt(buf, 0, 4) === "FORM") {
    const formType = asciiAt(buf, 8, 4);
    if (formType === "AIFF" || formType === "AIFC") {
      return descriptorToSignature(EXTENSION_TABLE.aiff, "magic");
    }
  }
  if (asciiAt(buf, 0, 4) === "MThd") {
    return descriptorToSignature(EXTENSION_TABLE.mid, "magic");
  }

  // --- Documents ---------------------------------------------------------
  if (asciiAt(buf, 0, 5) === "%PDF-") {
    return descriptorToSignature(EXTENSION_TABLE.pdf, "magic");
  }
  if (asciiAt(buf, 0, 5) === "{\\rtf") {
    return descriptorToSignature(EXTENSION_TABLE.rtf, "magic");
  }
  if (
    startsWithBytes(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    return descriptorToSignature(EXTENSION_TABLE.doc, "magic");
  }

  // --- Archives ----------------------------------------------------------
  if (
    startsWithBytes(buf, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(buf, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(buf, [0x50, 0x4b, 0x07, 0x08])
  ) {
    const flavour = detectZipFlavour(buf);
    return descriptorToSignature(flavour ?? EXTENSION_TABLE.zip, "magic");
  }
  if (startsWithBytes(buf, [0x1f, 0x8b])) {
    return descriptorToSignature(EXTENSION_TABLE.gz, "magic");
  }
  if (asciiAt(buf, 0, 6) === "7z\u00bc\u00af\u001c") {
    return descriptorToSignature(EXTENSION_TABLE["7z"], "magic");
  }
  if (asciiAt(buf, 0, 4) === "Rar!") {
    return descriptorToSignature(EXTENSION_TABLE.rar, "magic");
  }
  if (buf.length > 262 && asciiAt(buf, 257, 5) === "ustar") {
    return descriptorToSignature(EXTENSION_TABLE.tar, "magic");
  }

  // --- Fonts -------------------------------------------------------------
  if (asciiAt(buf, 0, 4) === "OTTO") {
    return descriptorToSignature(EXTENSION_TABLE.otf, "magic");
  }
  if (asciiAt(buf, 0, 4) === "wOFF") {
    return descriptorToSignature(EXTENSION_TABLE.woff, "magic");
  }
  if (asciiAt(buf, 0, 4) === "wOF2") {
    return descriptorToSignature(EXTENSION_TABLE.woff2, "magic");
  }
  if (asciiAt(buf, 0, 4) === "\u0000\u0001\u0000\u0000") {
    return descriptorToSignature(EXTENSION_TABLE.ttf, "magic");
  }

  // --- Data / executables ------------------------------------------------
  if (asciiAt(buf, 0, 15) === "SQLite format 3") {
    return descriptorToSignature(EXTENSION_TABLE.db, "magic");
  }
  if (startsWithBytes(buf, [0x7f, 0x45, 0x4c, 0x46])) {
    return descriptorToSignature(EXTENSION_TABLE.so, "magic");
  }
  if (asciiAt(buf, 0, 2) === "MZ") {
    return descriptorToSignature(EXTENSION_TABLE.exe, "magic");
  }

  // --- Text-ish payloads -------------------------------------------------
  const head = buf.subarray(0, Math.min(buf.length, 512));
  const printableRatio = countPrintable(head) / Math.max(1, head.length);
  if (printableRatio > 0.9) {
    const text = head.toString("utf8").trimStart();
    if (text.startsWith("{") || text.startsWith("[")) {
      return descriptorToSignature(EXTENSION_TABLE.json, "magic");
    }
    if (text.startsWith("<?xml")) {
      return descriptorToSignature(EXTENSION_TABLE.xml, "magic");
    }
    if (text.startsWith("<svg") || text.startsWith("<!DOCTYPE svg")) {
      return descriptorToSignature(EXTENSION_TABLE.svg, "magic");
    }
    if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
      return descriptorToSignature(EXTENSION_TABLE.html, "magic");
    }
  }
  return null;
}

function countPrintable(buf: Buffer): number {
  let count = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126)) count++;
  }
  return count;
}

/**
 * Full detection: magic bytes first (authoritative), then the filename
 * extension, then the browser supplied MIME type, then a neutral fallback.
 */
export function detectSignature(
  buf: Buffer | null,
  filename?: string,
  mimeType?: string
): FileSignature {
  const magic = buf ? detectMagicSignature(buf) : null;
  if (magic) return magic;

  const ext = getExtension(filename);
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase();
  // .ts is shared by TypeScript source and MPEG transport streams; MIME breaks the tie.
  if (ext === "ts" && mime === "video/mp2t") {
    return descriptorToSignature(EXTENSION_TABLE.mts, "mime");
  }
  const byExt = ext ? EXTENSION_TABLE[ext] : undefined;
  if (byExt) {
    return descriptorToSignature(byExt, "extension");
  }

  const byMime = mime ? MIME_TABLE[mime] : undefined;
  if (byMime) {
    return descriptorToSignature(byMime, "mime");
  }

  return {
    kind: "binary",
    format: "UNKNOWN",
    mimeType: mime || "application/octet-stream",
    extension: ext || "bin",
    label: KIND_LABELS.binary,
    source: "unknown",
  };
}

/**
 * Lightweight, synchronous signature resolution used by the browser before the
 * server has answered. Only extension + MIME are available there.
 */
export function detectSignatureFromName(
  filename?: string,
  mimeType?: string
): FileSignature {
  return detectSignature(null, filename, mimeType);
}

/** Every extension the forge claims support for. */
export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TABLE).sort();

/** `accept` attribute value used by the file picker — intentionally broad. */
export const FILE_INPUT_ACCEPT = [
  "image/*",
  "video/*",
  "audio/*",
  "text/*",
  "application/pdf",
  "application/zip",
  "application/*",
  "*/*",
].join(",");

export function isImageKind(kind: FileKind): boolean {
  return kind === "image";
}

export function isPlayableKind(kind: FileKind): boolean {
  return kind === "video" || kind === "audio";
}
