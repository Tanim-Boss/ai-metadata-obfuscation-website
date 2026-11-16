import type { ContainerParseResult } from "./parser-types";
import { clipText, makeChunk } from "./util";
import type { BinaryChunkInfo } from "./types";

const INFO_TAGS: Record<string, string> = {
  INAM: "Title",
  IART: "Artist",
  ICMT: "Comment",
  ICRD: "Creation date",
  ISFT: "Software / encoder",
  ICOP: "Copyright",
  ICMS: "Commissioned by",
  IGNR: "Genre",
  IKEY: "Keywords",
  ISBJ: "Subject",
  IENG: "Engineer",
  ITCH: "Technician",
  ISRC: "Source",
  IPRO: "Producer",
  ISRF: "Source form",
};

function readInfoList(
  buf: Buffer,
  start: number,
  end: number,
  tags: ContainerParseResult["tags"],
  chunks: BinaryChunkInfo[],
  textBlobs: NonNullable<ContainerParseResult["textBlobs"]>
) {
  let offset = start;
  while (offset + 8 <= end) {
    const id = buf.toString("latin1", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(buf.length, dataStart + size);
    if (dataEnd < dataStart) break;
    const raw = buf.subarray(dataStart, dataEnd);
    const value = raw.toString("utf8").replace(/\u0000+$/g, "").trim();
    const label = INFO_TAGS[id];
    if (label && value) {
      tags.push({ group: "RIFF INFO", tag: label, hex: id, value: clipText(value, 300) });
      textBlobs.push({ location: "AVI INFO chunk", key: label, text: value });
      chunks.push(
        makeChunk({
          id: `avi-info-${offset}`,
          marker: id,
          label: `${label} — ${clipText(value, 60)}`,
          byteLength: size,
          offset,
          category: "ancillary-text",
          payload: raw,
        })
      );
    }
    offset = dataEnd + (size % 2);
  }
}

export function parseAvi(buf: Buffer): ContainerParseResult {
  const chunks: BinaryChunkInfo[] = [];
  const tags: ContainerParseResult["tags"] = [];
  const notes: string[] = [];
  const textBlobs: NonNullable<ContainerParseResult["textBlobs"]> = [];
  let width: number | undefined;
  let height: number | undefined;
  let frameCount: number | undefined;
  let durationSec: number | undefined;
  let depth = 0;

  function walk(start: number, end: number) {
    if (depth > 6) return;
    let offset = start;
    while (offset + 8 <= Math.min(end, buf.length)) {
      const fourcc = buf.toString("latin1", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      const dataStart = offset + 8;
      const dataEnd = Math.min(Math.min(end, buf.length), dataStart + size);
      if (dataEnd < dataStart) break;
      const payload = buf.subarray(dataStart, dataEnd);

      if (fourcc === "LIST") {
        const listType = buf.toString("latin1", dataStart, dataStart + 4);
        if (listType === "INFO") {
          readInfoList(buf, dataStart + 4, dataEnd, tags, chunks, textBlobs);
          chunks.push(
            makeChunk({
              id: `avi-info-list-${offset}`,
              marker: "LIST INFO",
              label: "RIFF INFO text metadata (title, artist, software…)",
              byteLength: size,
              offset,
              category: "xmp-iptc",
              payload: payload.subarray(0, 48),
            })
          );
        } else if (listType === "movi") {
          chunks.push(
            makeChunk({
              id: `avi-movi-${offset}`,
              marker: "LIST movi",
              label: `AVI media stream — ${
                size >= 1024 * 1024
                  ? `${(size / 1024 / 1024).toFixed(1)} MB`
                  : `${(size / 1024).toFixed(1)} KB`
              }`,
              byteLength: size,
              offset,
              category: "video-container",
              payload: payload.subarray(0, 32),
            })
          );
        } else {
          chunks.push(
            makeChunk({
              id: `avi-list-${offset}`,
              marker: `LIST ${listType}`,
              label: `AVI ${listType || "unknown"} list`,
              byteLength: size,
              offset,
              category: "video-container",
              payload: payload.subarray(0, 32),
            })
          );
          depth++;
          walk(dataStart + 4, dataEnd);
          depth--;
        }
      } else if (fourcc === "avih" && size >= 40) {
        const microsecondsPerFrame = buf.readUInt32LE(dataStart);
        const totalFrames = buf.readUInt32LE(dataStart + 16);
        width = width ?? buf.readUInt32LE(dataStart + 32);
        height = height ?? buf.readUInt32LE(dataStart + 36);
        if (microsecondsPerFrame > 0 && totalFrames > 0) {
          durationSec = durationSec ?? (microsecondsPerFrame * totalFrames) / 1_000_000;
        }
        chunks.push(
          makeChunk({
            id: `avi-avih-${offset}`,
            marker: "avih",
            label: `AVI main header — ${totalFrames} frames, ${width ?? "?"}×${height ?? "?"}`,
            byteLength: size,
            offset,
            category: "video-container",
            payload,
          })
        );
      } else if (fourcc === "strh" && size >= 36) {
        const streamType = buf.toString("latin1", dataStart, dataStart + 4);
        const scale = buf.readUInt32LE(dataStart + 20);
        const rate = buf.readUInt32LE(dataStart + 24);
        const length = buf.readUInt32LE(dataStart + 32);
        if (streamType === "vids" && scale > 0 && rate > 0 && length > 0) {
          frameCount = frameCount ?? length;
          durationSec = durationSec ?? length / (rate / scale);
        }
        tags.push({
          group: "AVI",
          tag: "StreamType",
          value: `${streamType || "?"} · ${length} units · ${scale}/${rate} timebase`,
        });
        chunks.push(
          makeChunk({
            id: `avi-strh-${offset}`,
            marker: "strh",
            label: `Stream header — ${streamType || "unknown"} stream`,
            byteLength: size,
            offset,
            category: "video-container",
            payload,
          })
        );
      } else if (fourcc === "strf" && size >= 20) {
        const headerSize = buf.readUInt32LE(dataStart);
        if (headerSize >= 40 && size >= 20) {
          width = width ?? buf.readInt32LE(dataStart + 4);
          height = height ?? Math.abs(buf.readInt32LE(dataStart + 8));
        }
        chunks.push(
          makeChunk({
            id: `avi-strf-${offset}`,
            marker: "strf",
            label: "Stream format (bitmap info header)",
            byteLength: size,
            offset,
            category: "video-container",
            payload,
          })
        );
      } else if (fourcc === "idx1") {
        chunks.push(
          makeChunk({
            id: `avi-idx-${offset}`,
            marker: "idx1",
            label: "Legacy AVI index",
            byteLength: size,
            offset,
            category: "video-container",
            payload: payload.subarray(0, 32),
          })
        );
      } else if (fourcc === "JUNK" || fourcc === "PAD ") {
        chunks.push(
          makeChunk({
            id: `avi-junk-${offset}`,
            marker: fourcc.trim(),
            label: "Alignment padding block",
            byteLength: size,
            offset,
            category: "video-container",
            payload: payload.subarray(0, 32),
          })
        );
      } else {
        chunks.push(
          makeChunk({
            id: `avi-chunk-${offset}`,
            marker: fourcc,
            label: `RIFF chunk "${fourcc.replace(/[^\x20-\x7e]/g, "·")}"`,
            byteLength: size,
            offset,
            category: "video-container",
            payload: payload.subarray(0, 32),
          })
        );
      }

      offset = dataEnd + (size % 2);
    }
  }

  // Skip the 12-byte RIFF/FOURCC preamble.
  walk(12, buf.length);

  if (frameCount) notes.push(`${frameCount} video frames indexed.`);
  if (tags.length === 0) notes.push("No RIFF INFO text metadata present.");

  return {
    format: "AVI",
    mimeType: "video/x-msvideo",
    mediaType: "video",
    width,
    height,
    durationSec,
    chunks,
    tags,
    notes,
    parsedWith: ["riff-avi"],
    textBlobs,
    trailingBytes: 0,
  };
}
