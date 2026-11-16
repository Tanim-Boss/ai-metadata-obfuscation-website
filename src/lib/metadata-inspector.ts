/**
 * Metadata inspection entry point.
 *
 * The heavy lifting lives in `src/lib/inspect/*` — one byte-accurate parser per
 * container family (JPEG, PNG, WebP, GIF, TIFF, BMP, ISO-BMFF) plus real TIFF
 * IFD, XMP, IPTC-IIM and ICC readers. Nothing in this pipeline is simulated.
 */

export { inspectBuffer, inspectBuffer as inspectMediaBuffer, sniffContainer } from "./inspect";
export type { InspectOptions } from "./inspect";
export type {
  AiFinding,
  AuthenticityStatus,
  BinaryChunkInfo,
  ChunkCategory,
  ColorProfileInfo,
  ExifSummary,
  ForensicReport,
  InspectionReport,
  IptcProperty,
  MediaKind,
  MetadataTagRow,
  Severity,
  XmpInfo,
  XmpProperty,
} from "./inspect/types";
