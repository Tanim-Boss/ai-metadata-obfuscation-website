import type { BinaryChunkInfo, MediaKind, MetadataTagRow } from "./types";
import type { TiffParseResult } from "./tiff";
import type { IptcProperty } from "./types";

export interface ContainerParseResult {
  format: string;
  mimeType: string;
  mediaType: MediaKind;
  width?: number;
  height?: number;
  bitDepth?: number;
  durationSec?: number;
  chunks: BinaryChunkInfo[];
  tags: MetadataTagRow[];
  exif?: TiffParseResult;
  xmpPacket?: string;
  iccProfile?: Buffer;
  iptc?: IptcProperty[];
  notes: string[];
  parsedWith: string[];
  trailingBytes?: number;
  /** C2PA / JUMBF provenance boxes were structurally present. */
  hasC2paBox?: boolean;
  /** Raw text blobs worth scanning for provenance markers. */
  textBlobs?: Array<{ location: string; key: string; text: string }>;
  /** Extra evidence gathered from container-level fields. */
  extraFindingsText?: string[];
}
