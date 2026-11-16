import { parseIccProfile } from "./metadata-blocks";
import type { ContainerParseResult } from "./parser-types";
import { parseTiffStream } from "./tiff";
import { clipText, makeChunk } from "./util";
import { extractXmpPacket } from "./xmp";
import type { BinaryChunkInfo, MetadataTagRow } from "./types";

interface Box {
  type: string;
  start: number;
  headerSize: number;
  size: number;
  payloadStart: number;
  payloadEnd: number;
  path: string;
}

const CONTAINER_BOXES = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "edts",
  "dinf",
  "udta",
  "ilst",
  "iprp",
  "ipco",
  "iinf",
  "moof",
  "traf",
  "mvex",
  "mfra",
  "meta",
  "stsd",
  "sinf",
  "schi",
]);

const IMAGE_BRANDS: Record<string, { format: string; mimeType: string }> = {
  avif: { format: "AVIF", mimeType: "image/avif" },
  avis: { format: "AVIF (image sequence)", mimeType: "image/avif" },
  heic: { format: "HEIC", mimeType: "image/heic" },
  heix: { format: "HEIC", mimeType: "image/heic" },
  heim: { format: "HEIC", mimeType: "image/heic" },
  heis: { format: "HEIC", mimeType: "image/heic" },
  hevc: { format: "HEIC", mimeType: "image/heic" },
  mif1: { format: "HEIF", mimeType: "image/heif" },
  msf1: { format: "HEIF", mimeType: "image/heif" },
  crx: { format: "Canon CR3", mimeType: "image/x-canon-cr3" },
};

const BRAND_LABELS: Record<string, string> = {
  isom: "MP4 (isom)",
  iso2: "MP4 (iso2)",
  iso4: "MP4 (iso4)",
  iso5: "MP4 (iso5)",
  iso6: "MP4 (iso6)",
  mp41: "MP4 v1",
  mp42: "MP4 v2",
  qt: "QuickTime MOV",
  M4V: "M4V",
  M4A: "M4A",
  dash: "MPEG-DASH",
  avc1: "MP4 (AVC)",
  hvc1: "MP4 (HEVC)",
  hev1: "MP4 (HEVC)",
};

const C2PA_UUID = "d8fec3d61b0e483c92975828877ec481";
const XMP_UUID = "be7acfcb97a942e89c71999491e3afac";

const ILST_NAMES: Record<string, string> = {
  "©nam": "Title",
  "©ART": "Artist",
  "©alb": "Album",
  "©day": "Date",
  "©too": "Encoder / Software",
  "©cmt": "Comment",
  "©gen": "Genre",
  "©cpy": "Copyright",
  "©des": "Description",
  "©wrt": "Composer",
  "©grp": "Grouping",
  "©xyz": "GPS location (ISO 6709)",
  "©mak": "Camera make",
  "©mod": "Camera model",
  "©swr": "Software",
  aART: "Album artist",
  trkn: "Track number",
  disk: "Disc number",
  covr: "Cover art",
  "----": "Custom (iTunes mean/name/data)",
};

function looksLikeBox(buf: Buffer, pos: number, end: number): boolean {
  if (pos + 8 > end) return false;
  const size = buf.readUInt32BE(pos);
  const type = buf.toString("latin1", pos + 4, pos + 8);
  if (size < 8 || pos + size > end) return false;
  return /^[\x20-\x7e]{4}$/.test(type);
}

function readBoxes(buf: Buffer, start: number, end: number, path = "", depth = 0): Box[] {
  const boxes: Box[] = [];
  if (depth > 8) return boxes;
  let offset = start;
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const big = buf.readBigUInt64BE(offset + 8);
      if (big > BigInt(end - offset)) break;
      size = Number(big);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) break;
    const box: Box = {
      type,
      start: offset,
      headerSize,
      size,
      payloadStart: offset + headerSize,
      payloadEnd: offset + size,
      path: path ? `${path}.${type}` : type,
    };
    boxes.push(box);
    if (CONTAINER_BOXES.has(type)) {
      let childStart = box.payloadStart;
      if (type === "meta") {
        // ISO 'meta' is a FullBox (4 bytes of version/flags) while QuickTime's
        // 'meta' starts straight with child boxes — detect which one this is.
        childStart = looksLikeBox(buf, box.payloadStart, box.payloadEnd)
          ? box.payloadStart
          : box.payloadStart + 4;
      }
      if (type === "stsd") {
        // FullBox + entry_count before the sample entries.
        childStart = box.payloadStart + 8;
      } else if (type === "iinf") {
        // FullBox + entry_count (2 bytes for v0, 4 bytes for v1+).
        const version = buf[box.payloadStart];
        childStart = box.payloadStart + 4 + (version === 0 ? 2 : 4);
      }
      const children = readBoxes(buf, childStart, box.payloadEnd, box.path, depth + 1);
      boxes.push(...children);
    }
    offset += size;
  }
  return boxes;
}

function readUIntVariable(buf: Buffer, offset: number, size: number): { value: number; next: number } {
  let value = 0;
  for (let i = 0; i < size; i++) {
    value = value * 256 + (buf[offset + i] ?? 0);
  }
  return { value, next: offset + size };
}

function decodeLanguage(language: number): string {
  const chars = [
    ((language >> 10) & 0x1f) + 0x60,
    ((language >> 5) & 0x1f) + 0x60,
    (language & 0x1f) + 0x60,
  ];
  return String.fromCharCode(...chars).replace(/[^a-z]/g, "");
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseIlocItems(buf: Buffer, box: Box): Map<number, Array<{ offset: number; length: number; method: number }>> {
  const items = new Map<number, Array<{ offset: number; length: number; method: number }>>();
  const version = buf[box.payloadStart];
  let offset = box.payloadStart + 4;
  if (offset + 2 > box.payloadEnd) return items;
  const first = buf[offset];
  const second = buf[offset + 1];
  const offsetSize = first >> 4;
  const lengthSize = first & 0x0f;
  const baseOffsetSize = second >> 4;
  const indexSize = version === 1 || version === 2 ? second & 0x0f : 0;
  offset += 2;
  const countRead = readUIntVariable(buf, offset, version < 2 ? 2 : 4);
  offset = countRead.next;
  for (let i = 0; i < countRead.value; i++) {
    const idRead = readUIntVariable(buf, offset, version < 2 ? 2 : 4);
    const itemId = idRead.value;
    offset = idRead.next;
    let method = 0;
    if (version === 1 || version === 2) {
      const methodRead = readUIntVariable(buf, offset, 2);
      method = methodRead.value & 0x0f;
      offset = methodRead.next;
    }
    const dataRef = readUIntVariable(buf, offset, 2);
    offset = dataRef.next;
    const baseRead = readUIntVariable(buf, offset, baseOffsetSize);
    offset = baseRead.next;
    const extentCountRead = readUIntVariable(buf, offset, 2);
    offset = extentCountRead.next;
    const extents: Array<{ offset: number; length: number; method: number }> = [];
    for (let e = 0; e < extentCountRead.value; e++) {
      if (indexSize > 0) {
        const indexRead = readUIntVariable(buf, offset, indexSize);
        offset = indexRead.next;
      }
      const extentOffsetRead = readUIntVariable(buf, offset, offsetSize);
      offset = extentOffsetRead.next;
      const extentLengthRead = readUIntVariable(buf, offset, lengthSize);
      offset = extentLengthRead.next;
      extents.push({
        offset: baseRead.value + extentOffsetRead.value,
        length: extentLengthRead.value,
        method,
      });
    }
    items.set(itemId, extents);
  }
  return items;
}

export function parseIsoBmff(buf: Buffer): ContainerParseResult {
  const chunks: BinaryChunkInfo[] = [];
  const tags: MetadataTagRow[] = [];
  const notes: string[] = [];
  const textBlobs: NonNullable<ContainerParseResult["textBlobs"]> = [];
  let xmpPacket: string | undefined;
  let iccBuffer: Buffer | undefined;
  let exif: ContainerParseResult["exif"];
  let hasC2paBox = false;
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let durationSec: number | undefined;
  let majorBrand = "";
  const compatibleBrands: string[] = [];
  const handlerTypes: string[] = [];

  const boxes = readBoxes(buf, 0, buf.length);
  const topLevel = boxes.filter((b) => !b.path.includes("."));

  for (const box of topLevel) {
    const payload = buf.subarray(box.payloadStart, Math.min(box.payloadEnd, box.payloadStart + 512));
    let cat: BinaryChunkInfo["category"] = "video-container";
    let label = `ISO-BMFF "${box.type}" box`;

    switch (box.type) {
      case "ftyp": {
        majorBrand = buf.toString("latin1", box.payloadStart, box.payloadStart + 4);
        const minorVersion = buf.readUInt32BE(box.payloadStart + 4);
        for (let p = box.payloadStart + 8; p + 4 <= box.payloadEnd; p += 4) {
          compatibleBrands.push(buf.toString("latin1", p, p + 4));
        }
        label = `File type · ${BRAND_LABELS[majorBrand] ?? majorBrand} (minor ${minorVersion})`;
        if (compatibleBrands.length) {
          label += ` · compatible: ${compatibleBrands.join(", ")}`;
        }
        tags.push({
          group: "ISOBMFF",
          tag: "MajorBrand",
          value: BRAND_LABELS[majorBrand] ?? majorBrand,
        });
        if (compatibleBrands.length) {
          tags.push({ group: "ISOBMFF", tag: "CompatibleBrands", value: compatibleBrands.join(", ") });
        }
        break;
      }
      case "mdat":
        cat = "image-stream";
        label = `Media data — ${box.size < 1048576 ? `${(box.size / 1024).toFixed(1)} KB` : `${(box.size / 1048576).toFixed(2)} MB`} of coded samples`;
        break;
      case "moov":
        label = "Movie header container";
        break;
      case "free":
      case "skip":
      case "wide":
        cat = "ancillary-text";
        label = `${box.type} padding box`;
        break;
      case "uuid": {
        const uuidHex = buf.subarray(box.payloadStart, box.payloadStart + 16).toString("hex");
        const typeName =
          uuidHex === C2PA_UUID
            ? "C2PA JUMBF provenance"
            : uuidHex === XMP_UUID
            ? "XMP metadata"
            : "vendor extension";
        if (uuidHex === C2PA_UUID) {
          hasC2paBox = true;
          cat = "ai-provenance";
          tags.push({
            group: "C2PA",
            tag: "UUID JUMBF box",
            hex: "uuid:d8fec3d6",
            value: `${box.payloadEnd - box.payloadStart - 16} bytes of C2PA provenance data`,
          });
        } else if (uuidHex === XMP_UUID) {
          cat = "xmp-iptc";
          const packet = extractXmpPacket(buf.subarray(box.payloadStart + 16, box.payloadEnd));
          if (packet) {
            xmpPacket = packet;
            textBlobs.push({ location: "MP4 uuid (XMP)", key: "XMP packet", text: packet });
          }
        }
        if (uuidHex === C2PA_UUID) {
          textBlobs.push({
            location: "MP4 uuid (C2PA)",
            key: "JUMBF manifest",
            text: buf.toString("latin1", box.payloadStart + 16, box.payloadEnd).slice(0, 20_000),
          });
        }
        label = `${typeName} UUID box (${uuidHex.slice(0, 8)}…)`;
        break;
      }
      default:
        if (box.type !== "ftyp" && box.type !== "moov" && box.type !== "mdat") {
          cat = "video-container";
        }
        break;
    }

    chunks.push(
      makeChunk({
        id: `box-${box.start}`,
        marker: box.type,
        label,
        byteLength: box.size,
        offset: box.start,
        category: cat,
        payload,
      })
    );
  }

  // Track header / movie header details.
  for (const box of boxes) {
    const version = buf[box.payloadStart];
    try {
      if (box.type === "mvhd") {
        if (version === 1) {
          const timescale = buf.readUInt32BE(box.payloadStart + 20);
          const duration = Number(buf.readBigUInt64BE(box.payloadStart + 24));
          if (timescale > 0) durationSec = duration / timescale;
        } else {
          const timescale = buf.readUInt32BE(box.payloadStart + 12);
          const duration = buf.readUInt32BE(box.payloadStart + 16);
          if (timescale > 0) durationSec = duration / timescale;
        }
        tags.push({
          group: "MP4",
          tag: "Duration",
          value: durationSec !== undefined ? formatDuration(durationSec) : "unknown",
        });
      } else if (box.type === "tkhd") {
        // version/flags + times + reserved(8) + layer/alt/volume/reserved(8) + matrix(36)
        const matrixEnd = version === 1 ? 88 : 76;
        if (box.payloadStart + matrixEnd + 8 <= box.payloadEnd) {
          const w = buf.readUInt32BE(box.payloadStart + matrixEnd) / 65536;
          const h = buf.readUInt32BE(box.payloadStart + matrixEnd + 4) / 65536;
          if (w > 0 && h > 0) {
            width = Math.round(w);
            height = Math.round(h);
          }
        }
      } else if (box.type === "mdhd") {
        const langOffset = version === 1 ? 28 : 16;
        if (box.payloadStart + langOffset + 2 <= box.payloadEnd) {
          const language = decodeLanguage(buf.readUInt16BE(box.payloadStart + langOffset));
          if (language) tags.push({ group: "MP4", tag: "TrackLanguage", value: language });
        }
      } else if (box.type === "hdlr") {
        const handler = buf.toString("latin1", box.payloadStart + 8, box.payloadStart + 12);
        if (handler) {
          handlerTypes.push(handler);
          tags.push({ group: "MP4", tag: "HandlerType", value: handler });
        }
      } else if (box.type === "ispe") {
        if (box.payloadStart + 12 <= box.payloadEnd) {
          width = width ?? buf.readUInt32BE(box.payloadStart + 4);
          height = height ?? buf.readUInt32BE(box.payloadStart + 8);
          tags.push({
            group: "HEIF",
            tag: "ImageSpatialExtents",
            value: `${buf.readUInt32BE(box.payloadStart + 4)} × ${buf.readUInt32BE(box.payloadStart + 8)} px`,
          });
        }
      } else if (box.type === "pixi") {
        if (box.payloadStart + 9 <= box.payloadEnd) {
          bitDepth = buf[box.payloadStart + 8];
          tags.push({ group: "HEIF", tag: "ChannelBits", value: `${bitDepth} bits/channel` });
        }
      } else if (box.type === "colr") {
        const colourType = buf.toString("latin1", box.payloadStart, box.payloadStart + 4);
        if (colourType === "nclx" && box.payloadStart + 11 <= box.payloadEnd) {
          const primaries = buf.readUInt16BE(box.payloadStart + 4);
          const transfer = buf.readUInt16BE(box.payloadStart + 6);
          const matrix = buf.readUInt16BE(box.payloadStart + 8);
          tags.push({
            group: "HEIF",
            tag: "ColourInfo (nclx)",
            value: `primaries ${primaries} · transfer ${transfer} · matrix ${matrix}`,
          });
        } else if (colourType === "prof" || colourType === "rICC") {
          iccBuffer = Buffer.from(buf.subarray(box.payloadStart + 4, box.payloadEnd));
          tags.push({ group: "HEIF", tag: "ColourInfo", value: `embedded ICC profile (${iccBuffer.length} bytes)` });
        }
      } else if (box.type === "data" && box.path.includes("ilst")) {
        // handled with the parent item below
      } else if (box.type === "©xyz" || box.type.startsWith("©")) {
        const text = buf
          .subarray(box.payloadStart + 4, box.payloadEnd)
          .toString("utf8")
          .replace(/[\u0000-\u001f]+/g, "")
          .trim();
        if (text) {
          const label = ILST_NAMES[box.type] ?? `Metadata "${box.type}"`;
          tags.push({ group: "QuickTime", tag: label, value: clipText(text, 200) });
          textBlobs.push({ location: "QuickTime udta", key: label, text });
        }
      }
    } catch {
      /* Skip malformed header fields. */
    }
  }

  // ilst / data metadata (iTunes-style tags).
  for (const box of boxes) {
    if (!box.path.includes("ilst")) continue;
    if (box.path.endsWith(".data") || box.type === "data") continue;
    if (box.type.length !== 4) continue;
    const dataBox = boxes.find(
      (child) => child.type === "data" && child.path === `${box.path}.data`
    );
    if (!dataBox) continue;
    const dataType = buf.readUInt32BE(dataBox.payloadStart) & 0x00ffffff;
    let text: string;
    const raw = buf.subarray(dataBox.payloadStart + 8, dataBox.payloadEnd);
    if (dataType === 1) text = raw.toString("utf16le").replace(/\u0000+$/g, "");
    else if (dataType === 2) text = new TextDecoder("utf-16be").decode(raw).replace(/\u0000+$/g, "");
    else text = raw.toString("utf8");
    if (!text.trim()) continue;
    const label = ILST_NAMES[box.type] ?? `Metadata "${box.type}"`;
    tags.push({ group: "QuickTime", tag: label, value: clipText(text, 220) });
    textBlobs.push({ location: "QuickTime ilst", key: label, text });
    chunks.push(
      makeChunk({
        id: `ilst-${box.start}`,
        marker: box.type,
        label: `QuickTime metadata · ${label}`,
        byteLength: box.size,
        offset: box.start,
        category: "ancillary-text",
        preview: clipText(text, 160),
      })
    );
  }

  // HEIF / AVIF item metadata: iinf (item info) + iloc (item locations).
  const iinfBox = boxes.find((b) => b.type === "iinf");
  const ilocBox = boxes.find((b) => b.type === "iloc");
  const idatBox = boxes.find((b) => b.type === "idat");
  const itemTypes = new Map<number, { type: string; name: string; contentEncoding?: string }>();

  if (iinfBox) {
    const version = buf[iinfBox.payloadStart];
    let offset = iinfBox.payloadStart + 4;
    if (version === 0) offset += 2;
    else offset += 4;
    for (const infe of boxes.filter((b) => b.type === "infe" && b.start >= iinfBox.payloadStart && b.start < iinfBox.payloadEnd)) {
      const infeVersion = buf[infe.payloadStart];
      let cursor = infe.payloadStart + 4;
      try {
        let itemId = 0;
        if (infeVersion >= 3) {
          itemId = buf.readUInt32BE(cursor);
          cursor += 4 + 2;
        } else {
          itemId = buf.readUInt16BE(cursor);
          cursor += 2 + 2;
        }
        let itemType = "";
        let name = "";
        if (infeVersion >= 2) {
          itemType = buf.toString("latin1", cursor, cursor + 4);
          cursor += 4;
          const nameEnd = buf.indexOf(0, cursor);
          name = nameEnd > cursor ? buf.toString("utf8", cursor, Math.min(nameEnd, infe.payloadEnd)) : "";
          cursor = nameEnd > 0 ? nameEnd + 1 : cursor;
          let contentEncoding: string | undefined;
          if (itemType === "mime") {
            const typeEnd = buf.indexOf(0, cursor);
            cursor = typeEnd > 0 ? typeEnd + 1 : cursor;
            const encEnd = buf.indexOf(0, cursor);
            contentEncoding = encEnd > cursor ? buf.toString("utf8", cursor, encEnd) : undefined;
          }
          itemTypes.set(itemId, { type: itemType, name, contentEncoding });
        } else {
          const nameEnd = buf.indexOf(0, cursor);
          name = nameEnd > cursor ? buf.toString("utf8", cursor, Math.min(nameEnd, infe.payloadEnd)) : "";
          itemTypes.set(itemId, { type: "legacy", name });
        }
        chunks.push(
          makeChunk({
            id: `infe-${infe.start}`,
            marker: "infe",
            label: `Item ${itemId} · type "${itemType || "n/a"}"${name ? ` · ${clipText(name, 40)}` : ""}`,
            byteLength: infe.size,
            offset: infe.start,
            category: "ancillary-text",
          })
        );
      } catch {
        /* skip malformed infe */
      }
    }
  }

  if (ilocBox && itemTypes.size > 0) {
    const locations = parseIlocItems(buf, ilocBox);
    for (const [itemId, extents] of locations) {
      const info = itemTypes.get(itemId);
      for (const extent of extents) {
        let payload: Buffer | undefined;
        if (extent.method === 1 && idatBox) {
          const start = idatBox.payloadStart + extent.offset;
          payload = buf.subarray(start, Math.min(buf.length, start + extent.length));
        } else if (extent.method === 0) {
          payload = buf.subarray(extent.offset, Math.min(buf.length, extent.offset + extent.length));
        }
        if (!payload || payload.length === 0) continue;
        const isExifItem =
          info?.type === "Exif" || info?.name.includes("Exif") || payload.includes(Buffer.from("Exif\u0000\u0000"));
        const looksXmp = payload.includes(Buffer.from("<x:xmpmeta")) || payload.includes(Buffer.from("<?xpacket"));
        const looksC2pa =
          payload.includes(Buffer.from("c2pa")) || payload.includes(Buffer.from("jumb"));

        if (looksC2pa) {
          hasC2paBox = true;
          textBlobs.push({
            location: "ISOBMFF item",
            key: `Item ${itemId} (C2PA)`,
            text: payload.toString("latin1").slice(0, 20_000),
          });
        }

        if (looksXmp) {
          const packet = extractXmpPacket(payload);
          if (packet) {
            xmpPacket = xmpPacket ? `${xmpPacket}\n${packet}` : packet;
            textBlobs.push({ location: "ISOBMFF item XMP", key: `Item ${itemId}`, text: packet });
          }
        }

        if (isExifItem) {
          const parsed = parseTiffStream(sliceTiffPayload(payload));
          if (parsed) {
            exif = parsed;
            tags.push(...parsed.tags);
            for (const note of parsed.notes) notes.push(note);
          }
        }

        chunks.push(
          makeChunk({
            id: `item-${itemId}-${extent.offset}`,
            marker: `Item ${itemId}`,
            label: `${info?.type === "Exif" ? "EXIF metadata" : looksXmp ? "XMP metadata" : looksC2pa ? "C2PA manifest" : info?.type || "Item"} payload — ${payload.length.toLocaleString()} bytes`,
            byteLength: extent.length,
            offset: extent.method === 1 && idatBox ? idatBox.payloadStart + extent.offset : extent.offset,
            category: looksC2pa ? "ai-provenance" : looksXmp ? "xmp-iptc" : "camera-exif",
            payload,
          })
        );
      }
    }
  }

  if (majorBrand && IMAGE_BRANDS[majorBrand]) {
    const imageBrand = IMAGE_BRANDS[majorBrand];
    if (!width || !height) {
      const ispe = boxes.find((b) => b.type === "ispe");
      if (ispe && ispe.payloadStart + 12 <= ispe.payloadEnd) {
        width = buf.readUInt32BE(ispe.payloadStart + 4);
        height = buf.readUInt32BE(ispe.payloadStart + 8);
      }
    }
    return {
      format: imageBrand.format,
      mimeType: imageBrand.mimeType,
      mediaType: "image",
      width,
      height,
      bitDepth,
      chunks,
      tags,
      exif,
      xmpPacket,
      iccProfile: iccBuffer,
      iptc: [],
      notes,
      parsedWith: ["isobmff-boxes", "heif-items", ...(exif ? ["tiff-ifd"] : []), ...(xmpPacket ? ["xmp"] : [])],
      hasC2paBox,
      textBlobs,
      trailingBytes: Math.max(0, buf.length - (topLevel.at(-1)?.payloadEnd ?? buf.length)),
    };
  }

  return {
    format: BRAND_LABELS[majorBrand] ?? (majorBrand ? majorBrand.toUpperCase() : "MP4"),
    mimeType: majorBrand === "qt" ? "video/quicktime" : "video/mp4",
    mediaType: "video",
    width,
    height,
    bitDepth,
    durationSec,
    chunks,
    tags,
    exif,
    xmpPacket,
    iccProfile: iccBuffer,
    iptc: [],
    notes,
    parsedWith: ["isobmff-boxes", ...(xmpPacket ? ["xmp"] : [])],
    hasC2paBox,
    textBlobs,
    trailingBytes: Math.max(0, buf.length - (topLevel.at(-1)?.payloadEnd ?? buf.length)),
  };
}

/** HEIF Exif items prefix the TIFF header with a 4-byte offset. */
function sliceTiffPayload(payload: Buffer): Buffer {
  const tiffStart = payload.indexOf(Buffer.from("II*\u0000", "latin1"));
  const tiffStartBE = payload.indexOf(Buffer.from("MM\u0000*", "latin1"));
  const candidates = [tiffStart, tiffStartBE].filter((n) => n >= 0);
  if (candidates.length === 0) {
    if (payload.length > 4) {
      const offset = payload.readUInt32BE(0);
      const start = 4 + offset;
      if (start < payload.length) return payload.subarray(start);
    }
    return payload;
  }
  return payload.subarray(Math.min(...candidates));
}
