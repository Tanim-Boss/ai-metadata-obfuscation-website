import { parseIccProfile } from "./metadata-blocks";
import type { ContainerParseResult } from "./parser-types";
import { parseTiffStream } from "./tiff";
import { clipText, makeChunk } from "./util";
import { extractXmpPacket } from "./xmp";
import type { BinaryChunkInfo } from "./types";

const WEBP_LABELS: Record<string, string> = {
  VP8X: "Extended header (canvas + feature flags)",
  VP8: "Lossy VP8 bitstream",
  VP8L: "Lossless VP8L bitstream",
  ALPH: "Alpha plane",
  ANIM: "Animation parameters",
  ANMF: "Animation frame",
  ICCP: "Embedded ICC colour profile",
  EXIF: "EXIF / TIFF metadata",
  "XMP ": "XMP metadata packet",
  C2PA: "C2PA provenance chunk",
  JUMB: "JUMBF provenance chunk",
};

export function parseWebp(buf: Buffer): ContainerParseResult {
  const chunks: BinaryChunkInfo[] = [];
  const notes: string[] = [];
  const textBlobs: NonNullable<ContainerParseResult["textBlobs"]> = [];
  let width: number | undefined;
  let height: number | undefined;
  let xmpPacket: string | undefined;
  let iccBuffer: Buffer | undefined;
  let exif: ContainerParseResult["exif"];
  let hasC2paBox = false;
  let offset = 12;
  let alpha = false;

  const declaredSize = buf.readUInt32LE(4) + 8;
  if (declaredSize > buf.length) {
    notes.push(`RIFF declares ${declaredSize} bytes but the file is only ${buf.length} bytes.`);
  }

  while (offset + 8 <= buf.length) {
    const fourcc = buf.toString("latin1", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(buf.length, dataStart + size);
    const payload = buf.subarray(dataStart, dataEnd);
    const base = {
      id: `webp-${offset}`,
      offset,
      byteLength: size,
      note: dataEnd - dataStart < size ? "truncated" : undefined,
    };

    switch (fourcc) {
      case "VP8X": {
        if (payload.length >= 10) {
          const flags = payload[0];
          width = 1 + (payload[4] | (payload[5] << 8) | (payload[6] << 16));
          height = 1 + (payload[7] | (payload[8] << 8) | (payload[9] << 16));
          const features = [
            flags & 0x10 ? "alpha" : null,
            flags & 0x02 ? "animation" : null,
            flags & 0x08 ? "EXIF" : null,
            flags & 0x04 ? "XMP" : null,
            flags & 0x20 ? "ICC" : null,
          ].filter(Boolean);
          alpha = Boolean(flags & 0x10);
          chunks.push(
            makeChunk({
              ...base,
              marker: "VP8X",
              label: `Canvas ${width}×${height}${features.length ? ` · features: ${features.join(", ")}` : ""}`,
              category: "image-stream",
              payload,
            })
          );
        }
        break;
      }
      case "VP8": {
        // 3-byte frame tag, 3-byte start code, then 14-bit dimensions.
        if (payload.length >= 10 && payload[3] === 0x9d && payload[4] === 0x01) {
          const w = payload.readUInt16LE(6) & 0x3fff;
          const h = payload.readUInt16LE(8) & 0x3fff;
          if (!width) {
            width = w;
            height = h;
          }
        }
        chunks.push(
          makeChunk({
            ...base,
            marker: "VP8",
            label: `Lossy VP8 bitstream — ${size.toLocaleString()} bytes`,
            category: "image-stream",
            payload,
          })
        );
        break;
      }
      case "VP8L": {
        if (payload.length >= 5 && payload[0] === 0x2f) {
          const bits = payload.readUInt32LE(1);
          if (!width) {
            width = (bits & 0x3fff) + 1;
            height = ((bits >> 14) & 0x3fff) + 1;
          }
        }
        chunks.push(
          makeChunk({
            ...base,
            marker: "VP8L",
            label: `Lossless VP8L bitstream — ${size.toLocaleString()} bytes`,
            category: "image-stream",
            payload,
          })
        );
        break;
      }
      case "EXIF": {
        const tiffPayload =
          payload.subarray(0, 6).toString("latin1") === "Exif\u0000\u0000"
            ? payload.subarray(6)
            : payload;
        exif = parseTiffStream(tiffPayload) ?? undefined;
        if (exif) for (const note of exif.notes) notes.push(note);
        chunks.push(
          makeChunk({
            ...base,
            marker: "EXIF",
            label: exif
              ? `EXIF / TIFF telemetry — ${exif.tags.length} tags in ${exif.rawIfdCount} IFD(s)`
              : "EXIF chunk (unreadable TIFF payload)",
            category: "camera-exif",
            payload: tiffPayload,
          })
        );
        break;
      }
      case "ICCP": {
        iccBuffer = Buffer.from(payload);
        const info = parseIccProfile(payload);
        chunks.push(
          makeChunk({
            ...base,
            marker: "ICCP",
            label: `Embedded ICC profile${info?.description ? ` · ${info.description}` : ""}`,
            category: "color-profile",
            payload,
          })
        );
        break;
      }
      case "XMP ": {
        const packet = extractXmpPacket(payload);
        if (packet) {
          xmpPacket = packet;
          textBlobs.push({ location: "WebP XMP", key: "XMP packet", text: packet });
        }
        chunks.push(
          makeChunk({
            ...base,
            marker: "XMP ",
            label: `XMP metadata packet — ${size.toLocaleString()} bytes`,
            category: "xmp-iptc",
            preview: packet ? clipText(packet, 180) : undefined,
            payload,
          })
        );
        break;
      }
      case "C2PA":
      case "JUMB":
      case "C2PM": {
        hasC2paBox = true;
        textBlobs.push({
          location: `WebP ${fourcc}`,
          key: "C2PA / JUMBF manifest",
          text: payload.toString("latin1").slice(0, 20_000),
        });
        chunks.push(
          makeChunk({
            ...base,
            marker: fourcc,
            label: "C2PA / JUMBF provenance chunk",
            category: "ai-provenance",
            payload,
          })
        );
        break;
      }
      default:
        chunks.push(
          makeChunk({
            ...base,
            marker: fourcc,
            label: WEBP_LABELS[fourcc] ?? `RIFF chunk "${fourcc.replace(/[^\x20-\x7e]/g, "·")}"`,
            category: fourcc === "ANIM" || fourcc === "ANMF" || fourcc === "ALPH" ? "image-stream" : "ancillary-text",
            payload,
          })
        );
        break;
    }

    offset = dataEnd + (size % 2);
  }

  if (alpha) notes.push("Canvas carries an alpha channel.");

  return {
    format: "WebP",
    mimeType: "image/webp",
    mediaType: "image",
    width,
    height,
    chunks,
    tags: exif?.tags ?? [],
    exif,
    xmpPacket,
    iccProfile: iccBuffer,
    iptc: [],
    notes,
    parsedWith: ["riff-webp", ...(exif ? ["tiff-ifd"] : []), ...(xmpPacket ? ["xmp"] : [])],
    hasC2paBox,
    textBlobs,
    trailingBytes: Math.max(0, buf.length - offset),
  };
}
