import type { ContainerParseResult } from "./parser-types";
import { clipText, makeChunk } from "./util";
import { extractXmpPacket } from "./xmp";
import type { BinaryChunkInfo } from "./types";

function readSubBlocks(buf: Buffer, start: number): { data: Buffer; next: number } {
  const parts: Buffer[] = [];
  let offset = start;
  while (offset < buf.length) {
    const size = buf[offset];
    offset++;
    if (size === 0) break;
    const end = Math.min(buf.length, offset + size);
    parts.push(buf.subarray(offset, end));
    offset = end;
  }
  return { data: Buffer.concat(parts), next: offset };
}

export function parseGif(buf: Buffer): ContainerParseResult {
  const version = buf.toString("latin1", 0, 6);
  const chunks: BinaryChunkInfo[] = [];
  const notes: string[] = [];
  const textBlobs: NonNullable<ContainerParseResult["textBlobs"]> = [];
  let width: number | undefined;
  let height: number | undefined;
  let xmpPacket: string | undefined;
  let frameCount = 0;

  if (buf.length < 13) {
    return {
      format: "GIF",
      mimeType: "image/gif",
      mediaType: "image",
      chunks,
      tags: [],
      notes: ["GIF header is truncated."],
      parsedWith: ["gif-blocks"],
    };
  }

  width = buf.readUInt16LE(6);
  height = buf.readUInt16LE(8);
  const packed = buf[10];
  const hasGlobalTable = Boolean(packed & 0x80);
  const globalTableSize = hasGlobalTable ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
  let offset = 13 + globalTableSize;
  let terminated = false;

  chunks.push(
    makeChunk({
      id: "gif-lsd",
      marker: "LSD",
      label: `${version} logical screen ${width}×${height}${
        hasGlobalTable ? ` · global palette (${2 ** ((packed & 0x07) + 1)} colours)` : ""
      }`,
      byteLength: 13 + globalTableSize,
      offset: 0,
      category: "image-stream",
      payload: buf.subarray(0, 13),
    })
  );

  while (offset < buf.length) {
    const block = buf[offset];
    if (block === 0x3b) {
      terminated = true;
      chunks.push(
        makeChunk({
          id: `gif-trailer-${offset}`,
          marker: "Trailer",
          label: "End of GIF stream",
          byteLength: 1,
          offset,
          category: "image-stream",
        })
      );
      offset++;
      break;
    }

    if (block === 0x2c) {
      if (offset + 10 > buf.length) break;
      const frameWidth = buf.readUInt16LE(offset + 5);
      const frameHeight = buf.readUInt16LE(offset + 7);
      const framePacked = buf[offset + 9];
      let cursor = offset + 10;
      if (framePacked & 0x80) cursor += 3 * 2 ** ((framePacked & 0x07) + 1);
      cursor++; // LZW minimum code size
      const { next } = readSubBlocks(buf, cursor);
      frameCount++;
      chunks.push(
        makeChunk({
          id: `gif-frame-${offset}`,
          marker: "Image",
          label: `Frame ${frameCount} — ${frameWidth}×${frameHeight} LZW data${
            framePacked & 0x40 ? " (interlaced)" : ""
          }`,
          byteLength: next - offset,
          offset,
          category: "image-stream",
          payload: buf.subarray(offset, offset + 16),
        })
      );
      offset = next;
      continue;
    }

    if (block === 0x21) {
      const label = buf[offset + 1];
      const dataStart = offset + 2;
      if (label === 0xf9) {
        const { next } = readSubBlocks(buf, dataStart);
        chunks.push(
          makeChunk({
            id: `gif-gce-${offset}`,
            marker: "Graphic Control",
            label: "Graphic control extension (delay / transparency)",
            byteLength: next - offset,
            offset,
            category: "image-stream",
            payload: buf.subarray(dataStart, next),
          })
        );
        offset = next;
        continue;
      }
      if (label === 0xfe) {
        const { data, next } = readSubBlocks(buf, dataStart);
        const comment = data.toString("utf8");
        textBlobs.push({ location: "GIF Comment", key: "Comment", text: comment });
        chunks.push(
          makeChunk({
            id: `gif-comment-${offset}`,
            marker: "Comment",
            label: "GIF comment extension",
            byteLength: next - offset,
            offset,
            category: "ancillary-text",
            preview: clipText(comment, 200),
            payload: data,
          })
        );
        offset = next;
        continue;
      }
      if (label === 0xff) {
        const size = buf[dataStart];
        const identifier = buf.toString("latin1", dataStart + 1, dataStart + 1 + size);
        const { data, next } = readSubBlocks(buf, dataStart + 1 + size);
        if (identifier.startsWith("XMP Data")) {
          const packet = extractXmpPacket(data);
          if (packet) {
            xmpPacket = packet;
            textBlobs.push({ location: "GIF XMP", key: "XMP packet", text: packet });
          }
          chunks.push(
            makeChunk({
              id: `gif-xmp-${offset}`,
              marker: "Application (XMP)",
              label: `XMP metadata packet — ${data.length.toLocaleString()} bytes`,
              byteLength: next - offset,
              offset,
              category: "xmp-iptc",
              preview: packet ? clipText(packet, 180) : undefined,
              payload: data,
            })
          );
        } else {
          chunks.push(
            makeChunk({
              id: `gif-app-${offset}`,
              marker: `Application (${identifier.trim() || "unknown"})`,
              label:
                identifier.startsWith("NETSCAPE")
                  ? "NETSCAPE 2.0 loop/animation extension"
                  : `Application extension · ${identifier.trim() || "unknown"}`,
              byteLength: next - offset,
              offset,
              category: "ancillary-text",
              payload: data,
            })
          );
        }
        offset = next;
        continue;
      }
      const { next } = readSubBlocks(buf, dataStart);
      chunks.push(
        makeChunk({
          id: `gif-ext-${offset}`,
          marker: `Extension 0x${label.toString(16)}`,
          label: `GIF extension 0x${label.toString(16).toUpperCase()}`,
          byteLength: next - offset,
          offset,
          category: "ancillary-text",
        })
      );
      offset = next;
      continue;
    }

    // Unknown byte — resync.
    notes.push(`Unexpected block 0x${block.toString(16)} at offset ${offset}.`);
    offset++;
  }

  if (!terminated) notes.push("No GIF trailer (0x3B) — the stream is truncated.");
  if (frameCount > 1) notes.push(`${frameCount} animation frames present.`);

  return {
    format: "GIF",
    mimeType: "image/gif",
    mediaType: "image",
    width,
    height,
    chunks,
    tags: [],
    xmpPacket,
    iptc: [],
    notes,
    parsedWith: ["gif-blocks", ...(xmpPacket ? ["xmp"] : [])],
    textBlobs,
    trailingBytes: Math.max(0, buf.length - offset),
  };
}
