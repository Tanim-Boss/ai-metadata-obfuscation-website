/**
 * Shared types for the forensic metadata inspection engine.
 *
 * Every field here is produced from actual bytes read out of the uploaded
 * container — there is no simulated or templated metadata anywhere in the
 * inspection pipeline.
 */

export type MediaKind = "image" | "video" | "document";

export type ChunkCategory =
  | "ai-provenance"
  | "camera-exif"
  | "xmp-iptc"
  | "ancillary-text"
  | "color-profile"
  | "image-stream"
  | "video-container"
  | "document-structure";

export type Severity = "critical" | "warning" | "info";

export type AuthenticityStatus =
  | "ai-detected"
  | "suspicious"
  | "camera-verified"
  | "stripped";

/** One physical segment / chunk / box / atom inside the file container. */
export interface BinaryChunkInfo {
  id: string;
  /** Short container marker, e.g. `APP1 (Exif)`, `tEXt`, `moov.udta`. */
  marker: string;
  /** Human readable description of what the chunk holds. */
  label: string;
  byteLength: number;
  /** Byte offset of the chunk header inside the file. */
  offset: number;
  category: ChunkCategory;
  /** Short readable excerpt of the chunk payload. */
  preview?: string;
  /** First bytes of the payload as hex, for the binary map inspector. */
  hexPreview?: string;
  /** Extra forensic note, e.g. `crc mismatch`, `truncated`. */
  note?: string;
}

export interface AiFinding {
  id: string;
  severity: Severity;
  /** Tool / standard that the marker belongs to. */
  generator: string;
  /** Where in the file the evidence was read from. */
  location: string;
  /** Tag / property name that carried the evidence. */
  key: string;
  /** Verbatim excerpt (truncated) of the evidence. */
  snippet: string;
  explanation: string;
  /** Regex / rule id that produced this finding, for transparency. */
  rule?: string;
}

export interface MetadataTagRow {
  /** IFD / container group, e.g. `IFD0`, `ExifIFD`, `GPS`, `XMP`, `IPTC`. */
  group: string;
  tag: string;
  /** Numeric tag id rendered as hex, e.g. `0x010F`. */
  hex?: string;
  /** Pretty printed value. */
  value: string;
  /** Untranslated value as stored in the file. */
  rawValue?: string;
  /** TIFF field type name, e.g. `ASCII`, `RATIONAL`. */
  type?: string;
  /** Byte offset inside the metadata stream, when known. */
  offset?: number;
  isAiFlag?: boolean;
  isCameraCore?: boolean;
}

export interface ExifSummary {
  make?: string;
  model?: string;
  lensMake?: string;
  lensModel?: string;
  software?: string;
  exposureTime?: string;
  fNumber?: string;
  iso?: string;
  focalLength?: string;
  focalLength35mm?: string;
  dateTimeOriginal?: string;
  offsetTime?: string;
  subSecTime?: string;
  exposureProgram?: string;
  meteringMode?: string;
  flash?: string;
  whiteBalance?: string;
  colorSpace?: string;
  bodySerial?: string;
  lensSerial?: string;
  artist?: string;
  copyright?: string;
  gps?: string;
  orientation?: string;
  imageDescription?: string;
  userComment?: string;
  cameraOwner?: string;
  /** Present when vendor MakerNotes were found (optical fingerprint). */
  makerNote?: string;
  /** Decimal GPS coordinates when a position is embedded. */
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface XmpProperty {
  key: string;
  value: string;
  namespace?: string;
  isAiFlag?: boolean;
}

export interface IptcProperty {
  key: string;
  value: string;
  dataset?: string;
}

export interface ColorProfileInfo {
  description?: string;
  colorSpace?: string;
  deviceClass?: string;
  version?: string;
  renderingIntent?: string;
  byteLength?: number;
}

export interface XmpInfo {
  present: boolean;
  packetBytes: number;
  properties: XmpProperty[];
}

export interface ForensicReport {
  filename: string;
  mediaType: MediaKind;
  containerFormat: string;
  mimeType?: string;
  byteSize: number;
  sha256: string;
  width?: number;
  height?: number;
  bitDepth?: number;
  durationSec?: number;
  authenticityStatus: AuthenticityStatus;
  /** 0 = indistinguishable from a camera original, 100 = confirmed AI provenance. */
  aiRiskScore: number;
  detectedGenerators: string[];
  aiFindings: AiFinding[];
  chunks: BinaryChunkInfo[];
  exifSummary: ExifSummary;
  tags: MetadataTagRow[];
  xmp?: XmpInfo;
  iptc?: IptcProperty[];
  colorProfile?: ColorProfileInfo;
  /** Human readable parser notes, e.g. "no Exif segment found". */
  notes: string[];
  /** Parsers that actually ran against this container. */
  parsedWith: string[];
  /** Bytes present after the container's declared end (appended payloads). */
  trailingBytes?: number;
  /** A structural C2PA / JUMBF provenance box was found in the container. */
  hasC2paManifest?: boolean;
  /** Camera Make + Model + optical telemetry were all present. */
  cameraVerified?: boolean;
  inspectedAt: string;
  scanMs: number;
}

/** Alias kept for the UI layer. */
export type InspectionReport = ForensicReport;
