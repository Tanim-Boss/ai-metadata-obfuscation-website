import zlib from "zlib";
import { parseIccProfile } from "./metadata-blocks";
import type { ContainerParseResult } from "./parser-types";
import { parseTiffStream } from "./tiff";
import { clipText, makeChunk, previewPayload } from "./util";
import { extractXmpPacket } from "./xmp";
import type { BinaryChunkInfo, MetadataTagRow } from "./types";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const COLOR_TYPES: Record<number, string> = {
  0: "Greyscale",
  2: "Truecolour (RGB)",
  3: "Indexed palette",
  4: "Greyscale + alpha",
  6: "Truecolour + alpha (RGBA)",
};

const CRC_NOTE = "crc mismatch";

export function parsePng(buf: Buffer): ContainerParseResult {
  const chunks: BinaryChunkInfo[] = [];
  const notes: string[] = [];
  const textBlobs: NonNullable<ContainerParseResult["textBlobs"]> = [];
  const textTags: MetadataTagRow[] = [];
  let xmpPacket: string | undefined;
  let iccBuffer: Buffer | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let exif: ContainerParseResult["exif"];
  let hasC2paBox = false;
  let offset = 8;
  let idatCount = 0;
  let idatBytes = 0;
  let idatFirst = 0;
  let sawIend = false;

  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = Math.min(buf.length, dataStart + length);
    const payload = buf.subarray(dataStart, dataEnd);
    const declaredCrc = dataEnd + 4 <= buf.length ? buf.readUInt32BE(dataEnd) : undefined;
    const crcOk = declaredCrc !== undefined && crc32(buf.subarray(offset + 4, dataEnd)) === declaredCrc;
    if (!crcOk && declaredCrc !== undefined) notes.push(`PNG chunk ${type} at ${offset} has a ${CRC_NOTE}.`);
    const base = {
      id: `png-${offset}`,
      offset,
      byteLength: length,
      note: crcOk ? undefined : CRC_NOTE,
    };

    switch (type) {
      case "IHDR": {
        if (payload.length >= 13) {
          width = payload.readUInt32BE(0);
          height = payload.readUInt32BE(4);
          bitDepth = payload[8];
          const colorType = payload[9];
          const interlace = payload[12];
          chunks.push(
            makeChunk({
              ...base,
              marker: "IHDR",
              label: `Image header — ${width}×${height}, ${bitDepth}-bit ${
                COLOR_TYPES[colorType] ?? `type ${colorType}`
              }${interlace ? ", Adam7 interlaced" : ""}`,
              category: "image-stream",
              payload,
            })
          );
        }
        break;
      }
      case "PLTE":
        chunks.push(
          makeChunk({
            ...base,
            marker: "PLTE",
            label: `Palette — ${Math.floor(length / 3)} colours`,
            category: "image-stream",
            payload,
          })
        );
        break;
      case "IDAT":
        if (idatCount === 0) idatFirst = offset;
        idatCount++;
        idatBytes += length;
        break;
      case "IEND":
        sawIend = true;
        chunks.push(
          makeChunk({
            ...base,
            marker: "IEND",
            label: "End of PNG stream",
            category: "image-stream",
          })
        );
        break;
      case "tEXt":
      case "zTXt":
      case "iTXt": {
        const parsed = parsePngText(type, payload);
        if (!parsed) {
          chunks.push(
            makeChunk({
              ...base,
              marker: type,
              label: `${type} chunk (unreadable)`,
              category: "ancillary-text",
              payload,
            })
          );
          break;
        }
        const { keyword, text, compressed } = parsed;
        if (keyword === "XML:com.adobe.xmp" || keyword.toLowerCase().includes("xmp")) {
          const packet = extractXmpPacket(text);
          if (packet) {
            xmpPacket = xmpPacket ? `${xmpPacket}\n${packet}` : packet;
            textBlobs.push({ location: `PNG ${type} XMP`, key: keyword, text: packet });
          }
        }
        textBlobs.push({ location: `PNG ${type}`, key: keyword, text });
        textTags.push({
          group: type === "tEXt" ? "PNG-tEXt" : type === "zTXt" ? "PNG-zTXt" : "PNG-iTXt",
          tag: keyword,
          value: clipText(text, 400),
        });
        chunks.push(
          makeChunk({
            ...base,
            marker: `${type} (${keyword})`,
            label: `PNG text chunk · ${keyword}${compressed ? " (deflated)" : ""} — ${text.length} chars`,
            category:
              keyword === "XML:com.adobe.xmp" || keyword.toLowerCase().includes("xmp")
                ? "xmp-iptc"
                : "ancillary-text",
            preview: clipText(text, 200),
            payload,
          })
        );
        break;
      }
      case "eXIf": {
        exif = parseTiffStream(payload.subarray(0, 4).toString("latin1") === "Exif" ? payload.subarray(6) : payload) ?? undefined;
        if (exif) for (const note of exif.notes) notes.push(note);
        chunks.push(
          makeChunk({
            ...base,
            marker: "eXIf",
            label: exif
              ? `EXIF / TIFF telemetry — ${exif.tags.length} tags in ${exif.rawIfdCount} IFD(s)`
              : "EXIF chunk (unreadable TIFF payload)",
            category: "camera-exif",
            payload,
          })
        );
        break;
      }
      case "iCCP": {
        const nul = payload.indexOf(0);
        const profileName = nul > 0 ? payload.toString("latin1", 0, nul) : "ICC profile";
        try {
          const compressed = payload.subarray(nul + 2);
          iccBuffer = zlib.inflateSync(compressed);
          const info = parseIccProfile(iccBuffer);
          notes.push(`Embedded ICC profile "${profileName}" (${iccBuffer.length.toLocaleString()} bytes)${info?.description ? ` — ${info.description}` : ""}`);
        } catch {
          notes.push(`iCCP chunk present but the profile could not be inflated.`);
        }
        chunks.push(
          makeChunk({
            ...base,
            marker: "iCCP",
            label: `Embedded ICC profile · ${profileName}`,
            category: "color-profile",
            payload,
          })
        );
        break;
      }
      case "caBX":
      case "jumb":
      case "c2pa":
      case "c2pm":
        hasC2paBox = true;
        textTags.push({
          group: "C2PA",
          tag: `${type} manifest`,
          value: `${length.toLocaleString()} bytes of JUMBF provenance data`,
          isAiFlag: true,
        });
        textBlobs.push({
          location: `PNG ${type}`,
          key: "C2PA / JUMBF manifest",
          text: payload.toString("latin1").slice(0, 20_000),
        });
        chunks.push(
          makeChunk({
            ...base,
            marker: type,
            label: `C2PA / JUMBF provenance store — ${length.toLocaleString()} bytes`,
            category: "ai-provenance",
            payload,
          })
        );
        break;
      case "tIME":
      case "pHYs":
      case "gAMA":
      case "cHRM":
      case "sRGB":
      case "sBIT":
      case "bKGD":
      case "tRNS":
      case "sPLT":
      case "hIST":
      case "acTL":
        chunks.push(
          makeChunk({
            ...base,
            marker: type,
            label: PNG_CHUNK_LABELS[type] ?? `PNG ${type} chunk`,
            category: type === "acTL" ? "image-stream" : "color-profile",
            payload,
          })
        );
        break;
      default:
        chunks.push(
          makeChunk({
            ...base,
            marker: type,
            label: `PNG chunk ${JSON.stringify(type)}`,
            category: "image-stream",
            payload,
            preview: previewPayload(payload, 80),
          })
        );
        break;
    }

    offset = dataEnd + 4;
    if (type === "IEND") break;
  }

  if (idatCount > 0) {
    chunks.push(
      makeChunk({
        id: "png-idat",
        marker: `IDAT ×${idatCount}`,
        label: "Deflate-compressed pixel bitstream",
        byteLength: idatBytes,
        offset: idatFirst,
        category: "image-stream",
      })
    );
  }
  if (!sawIend) notes.push("No IEND chunk — the PNG stream is truncated.");

  for (const blob of textBlobs) {
    if (blob.key.toLowerCase() === "software") notes.push(`PNG Software text: ${clipText(blob.text, 120)}`);
  }

  return {
    format: "PNG",
    mimeType: "image/png",
    mediaType: "image",
    width,
    height,
    bitDepth,
    chunks,
    tags: [...(exif?.tags ?? []), ...textTags],
    exif,
    xmpPacket,
    iccProfile: iccBuffer,
    iptc: [],
    notes,
    parsedWith: ["png-chunks", "crc32", ...(exif ? ["tiff-ifd"] : []), ...(xmpPacket ? ["xmp"] : [])],
    hasC2paBox,
    textBlobs,
    trailingBytes: Math.max(0, buf.length - offset),
  };
}

const PNG_CHUNK_LABELS: Record<string, string> = {
  gAMA: "Image gamma",
  cHRM: "Chromaticity coordinates",
  sRGB: "sRGB rendering intent",
  iCCP: "Embedded ICC profile",
  sBIT: "Significant bits",
  bKGD: "Background colour",
  tRNS: "Transparency",
  pHYs: "Physical pixel dimensions",
  sPLT: "Suggested palette",
  hIST: "Palette histogram",
  tIME: "Last modification time",
  acTL: "APNG animation control",
};

function decodeTextBytes(buf: Buffer): string {
  const utf8 = buf.toString("utf8").replace(/\u0000+$/g, "");
  if (!utf8.includes("\uFFFD")) return utf8;
  return buf.toString("latin1").replace(/\u0000+$/g, "");
}

function parsePngText(
  type: string,
  payload: Buffer
): { keyword: string; text: string; compressed: boolean } | null {
  if (payload.length < 2) return null;
  const nul = payload.indexOf(0);
  if (nul <= 0) return null;
  const keyword = payload.toString("latin1", 0, nul);

  if (type === "tEXt") {
    return {
      keyword,
      text: decodeTextBytes(payload.subarray(nul + 1)),
      compressed: false,
    };
  }

  if (type === "zTXt") {
    try {
      const inflated = zlib.inflateSync(payload.subarray(nul + 2));
      return { keyword, text: inflated.toString("utf8"), compressed: true };
    } catch {
      return { keyword, text: "", compressed: true };
    }
  }

  // iTXt: keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text
  if (nul + 2 >= payload.length) return null;
  const compressionFlag = payload[nul + 1];
  let cursor = nul + 3;
  const langEnd = payload.indexOf(0, cursor);
  if (langEnd >= 0) cursor = langEnd + 1;
  const translatedEnd = payload.indexOf(0, cursor);
  if (translatedEnd >= 0) cursor = translatedEnd + 1;
  const body = payload.subarray(cursor);
  if (compressionFlag === 1) {
    try {
      const inflated = zlib.inflateSync(body);
      return { keyword, text: inflated.toString("utf8"), compressed: true };
    } catch {
      return { keyword, text: body.toString("utf8"), compressed: true };
    }
  }
  return { keyword, text: body.toString("utf8").replace(/\u0000+$/g, ""), compressed: false };
}
