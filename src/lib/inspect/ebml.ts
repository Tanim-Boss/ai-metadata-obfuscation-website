import type { ContainerParseResult } from "./parser-types";
import { clipText, makeChunk } from "./util";
import type { BinaryChunkInfo } from "./types";

/**
 * Minimal EBML (WebM / Matroska) reader. It walks the element tree far enough to
 * pull the documented string/float elements out of the EBML header, Segment
 * Info, Tracks and Tags — those are where muxing/encoding software and titles
 * are stored. Unknown elements are skipped by size, exactly like a real demuxer.
 */

const MASTER_ELEMENTS = new Set([
  0x18538067, // Segment
  0x1549a966, // Info
  0x1654ae6b, // Tracks
  0xae, // TrackEntry
  0x1254c367, // Tags
  0x7373, // Tag
  0x63c0, // Target
  0x67c8, // SimpleTag
  0x1f43b675, // Cluster
  0xe7, // Timestamp
]);

const STRING_ELEMENTS: Record<number, string> = {
  0x4282: "DocType",
  0x7ba9: "Title",
  0x4d80: "MuxingApp",
  0x5741: "WritingApp",
  0x4461: "DateUTC",
  0x45a3: "TagName",
  0x4487: "TagString",
  0x536e: "TrackName",
  0x22b59c: "Language",
  0x86: "CodecID",
};

const FLOAT_ELEMENTS: Record<number, string> = {
  0x4489: "Duration",
};

const UINT_ELEMENTS: Record<number, string> = {
  0x2ad7b1: "TimecodeScale",
  0x23e383: "DefaultDuration",
};

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

function readVint(buf: Buffer, offset: number, keepMarker: boolean): Vint | null {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  if (first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && !(first & mask)) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || offset + length > buf.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let unknown = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + buf[offset + i];
    if (buf[offset + i] !== 0xff) unknown = false;
  }
  return { value, length, unknown };
}

function readElementSize(buf: Buffer, offset: number): Vint | null {
  const vint = readVint(buf, offset, false);
  if (!vint) return null;
  return { ...vint, unknown: vint.unknown };
}

function decodeUtf8(buf: Buffer, start: number, length: number): string {
  return buf
    .subarray(start, Math.min(buf.length, start + length))
    .toString("utf8")
    .replace(/\u0000+$/g, "")
    .trim();
}

export function parseEbml(buf: Buffer): ContainerParseResult {
  const tags: ContainerParseResult["tags"] = [];
  const chunks: BinaryChunkInfo[] = [];
  const notes: string[] = [];
  const textBlobs: NonNullable<ContainerParseResult["textBlobs"]> = [];
  let docType = "WebM";
  let durationRaw: number | undefined;
  let timecodeScale = 1_000_000;
  let width: number | undefined;
  let height: number | undefined;
  let depth = 0;
  let sawSegment = false;

  const pendingTags = new Map<number, string>();

  function walk(start: number, end: number) {
    if (depth > 8) return;
    let offset = start;
    while (offset < end && offset < buf.length) {
      const id = readVint(buf, offset, true);
      if (!id) return;
      const size = readElementSize(buf, offset + id.length);
      if (!size) return;
      const dataStart = offset + id.length + size.length;
      const dataEnd = size.unknown ? end : Math.min(buf.length, dataStart + size.value);
      if (dataStart > buf.length) return;

      const stringLabel = STRING_ELEMENTS[id.value];
      if (stringLabel && !size.unknown) {
        const text = decodeUtf8(buf, dataStart, size.value);
        if (text) {
          if (id.value === 0x45a3) {
            pendingTags.set(1, text);
          } else if (id.value === 0x4487) {
            const name = pendingTags.get(1) ?? "TagString";
            tags.push({ group: "Matroska", tag: name, value: clipText(text, 300) });
            textBlobs.push({ location: "Matroska tag", key: name, text });
            chunks.push(
              makeChunk({
                id: `ebml-${offset}`,
                marker: "TagString",
                label: `${name} — ${clipText(text, 60)}`,
                byteLength: size.value,
                offset,
                category: "ancillary-text",
                payload: buf.subarray(dataStart, dataEnd),
              })
            );
            pendingTags.delete(1);
          } else {
            if (id.value === 0x4282) docType = text;
            tags.push({ group: "Matroska", tag: stringLabel, value: clipText(text, 300) });
            textBlobs.push({ location: "Matroska header", key: stringLabel, text });
            chunks.push(
              makeChunk({
                id: `ebml-${offset}`,
                marker: stringLabel,
                label: `${stringLabel} — ${clipText(text, 60)}`,
                byteLength: size.value,
                offset,
                category:
                  stringLabel === "MuxingApp" || stringLabel === "WritingApp"
                    ? "ancillary-text"
                    : "video-container",
                payload: buf.subarray(dataStart, dataEnd),
              })
            );
          }
        }
      } else if (FLOAT_ELEMENTS[id.value] && !size.unknown) {
        const len = size.value;
        const value =
          len === 4
            ? buf.readFloatBE(dataStart)
            : len === 8
            ? buf.readDoubleBE(dataStart)
            : undefined;
        if (value !== undefined) {
          durationRaw = value;
          tags.push({
            group: "Matroska",
            tag: FLOAT_ELEMENTS[id.value],
            value: String(value),
          });
        }
      } else if (UINT_ELEMENTS[id.value] && !size.unknown) {
        let value = 0;
        for (let i = 0; i < size.value && i < 8; i++) value = value * 256 + buf[dataStart + i];
        if (id.value === 0x2ad7b1 && value > 0) timecodeScale = value;
        tags.push({ group: "Matroska", tag: UINT_ELEMENTS[id.value], value: String(value) });
      } else if (id.value === 0xe0 && !size.unknown && size.value >= 4) {
        // Video element: PixelWidth 0xb0, PixelHeight 0xba are children.
        let inner = dataStart;
        while (inner < dataEnd) {
          const cid = readVint(buf, inner, true);
          if (!cid) break;
          const csize = readElementSize(buf, inner + cid.length);
          if (!csize) break;
          const cData = inner + cid.length + csize.length;
          if (cid.value === 0xb0 && csize.value <= 4) {
            let v = 0;
            for (let i = 0; i < csize.value; i++) v = v * 256 + buf[cData + i];
            width = width ?? v;
          }
          if (cid.value === 0xba && csize.value <= 4) {
            let v = 0;
            for (let i = 0; i < csize.value; i++) v = v * 256 + buf[cData + i];
            height = height ?? v;
          }
          inner = cData + csize.value;
        }
      }

      if (id.value === 0x18538067) sawSegment = true;

      if (MASTER_ELEMENTS.has(id.value)) {
        depth++;
        walk(dataStart, dataEnd);
        depth--;
      }

      if (size.unknown) return;
      if (size.value === 0 && dataStart === offset) return;
      offset = dataEnd;
    }
  }

  try {
    walk(0, buf.length);
  } catch {
    notes.push("EBML walk stopped early on a malformed element.");
  }

  // Cluster data usually dominates the file; summarise it rather than listing it.
  const sizeLabel =
    buf.length >= 1024 * 1024
      ? `${(buf.length / 1024 / 1024).toFixed(2)} MB`
      : `${(buf.length / 1024).toFixed(1)} KB`;
  chunks.unshift(
    makeChunk({
      id: "ebml-header",
      marker: "EBML",
      label: `${docType} container${sawSegment ? " · Segment present" : ""} — ${sizeLabel}`,
      byteLength: Math.min(buf.length, 4096),
      offset: 0,
      category: "video-container",
      payload: buf.subarray(0, 32),
    })
  );

  const durationSec =
    durationRaw !== undefined ? (durationRaw * timecodeScale) / 1_000_000_000 : undefined;

  if (tags.length === 0) notes.push("No Matroska string tags found (no title, muxer or writing app).");

  return {
    format: docType.toUpperCase() === "WEBM" ? "WebM" : docType || "Matroska",
    mimeType: docType.toLowerCase() === "webm" ? "video/webm" : "video/x-matroska",
    mediaType: "video",
    width,
    height,
    durationSec,
    chunks,
    tags,
    notes,
    parsedWith: ["ebml-elements"],
    textBlobs,
  };
}
