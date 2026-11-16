import type { ColorProfileInfo, IptcProperty } from "./types";

/* ------------------------------------------------------------------ */
/*  ICC profile header + 'desc' tag reader                             */
/* ------------------------------------------------------------------ */

const DEVICE_CLASSES: Record<string, string> = {
  scnr: "Input device (scanner / camera)",
  mntr: "Display device",
  prtr: "Output device (printer)",
  link: "DeviceLink",
  abst: "Abstract",
  nmcl: "Named colour space",
  spac: "Colour space conversion",
};

function readAscii(buf: Buffer, offset: number, length: number): string {
  return buf
    .toString("latin1", offset, Math.min(buf.length, offset + length))
    .replace(/\u0000+$/g, "")
    .trim();
}

export function parseIccProfile(buf: Buffer): ColorProfileInfo | undefined {
  if (!buf || buf.length < 132) return undefined;
  const headerSize = buf.readUInt32BE(0);
  if (headerSize < 128 || headerSize > buf.length) return undefined;

  const versionMajor = buf.readUInt8(8);
  const versionMinor = buf.readUInt8(9) >> 4;
  const info: ColorProfileInfo = {
    deviceClass: DEVICE_CLASSES[readAscii(buf, 12, 4)] ?? readAscii(buf, 12, 4),
    colorSpace: readAscii(buf, 16, 4),
    version: `${versionMajor}.${versionMinor}`,
    byteLength: buf.length,
  };

  const renderingIntent = buf.readUInt32BE(64);
  const INTENTS = [
    "Perceptual",
    "Media-relative colorimetric",
    "Saturation",
    "ICC-absolute colorimetric",
  ];
  info.renderingIntent = INTENTS[renderingIntent] ?? String(renderingIntent);

  const tagCount = buf.readUInt32BE(128);
  const maxTags = Math.min(tagCount, 200);
  for (let i = 0; i < maxTags; i++) {
    const entry = 132 + i * 12;
    if (entry + 12 > buf.length) break;
    const signature = readAscii(buf, entry, 4);
    const offset = buf.readUInt32BE(entry + 4);
    const size = buf.readUInt32BE(entry + 8);
    if (offset + size > buf.length || size < 8) continue;
    if (signature !== "desc" && signature !== "mluc" && signature !== "cprt") continue;

    const type = readAscii(buf, offset, 4);
    if (type === "mluc" && signature !== "cprt") {
      try {
        const count = buf.readUInt32BE(offset + 8);
        const recSize = buf.readUInt32BE(offset + 12);
        const rec = offset + 16;
        if (count > 0 && rec + recSize <= buf.length) {
          const len = buf.readUInt32BE(rec + 4);
          const strOffset = buf.readUInt32BE(rec + 8);
          const raw = buf.subarray(offset + strOffset, offset + strOffset + len);
          const text = new TextDecoder("utf-16be").decode(raw).replace(/\u0000+$/g, "").trim();
          if (text) info.description = text;
        }
      } catch {
        /* ignore malformed mluc */
      }
    } else if (type === "desc") {
      const asciiLen = buf.readUInt32BE(offset + 8);
      const text = readAscii(buf, offset + 12, Math.max(0, asciiLen - 1));
      if (text) info.description = text;
    }
  }

  return info;
}

/* ------------------------------------------------------------------ */
/*  IPTC-IIM dataset reader (Photoshop IRB / APP13 / TIFF 0x83BB)      */
/* ------------------------------------------------------------------ */

const IPTC_DATASETS: Record<string, string> = {
  "2:5": "ObjectName",
  "2:7": "EditStatus",
  "2:10": "Urgency",
  "2:15": "Category",
  "2:20": "SupplementalCategories",
  "2:25": "Keywords",
  "2:40": "SpecialInstructions",
  "2:55": "DateCreated",
  "2:60": "TimeCreated",
  "2:65": "OriginatingProgram",
  "2:70": "ProgramVersion",
  "2:80": "By-line",
  "2:85": "By-lineTitle",
  "2:90": "City",
  "2:92": "Sublocation",
  "2:95": "ProvinceState",
  "2:100": "CountryCode",
  "2:101": "CountryName",
  "2:103": "OriginalTransmissionReference",
  "2:105": "Headline",
  "2:110": "Credit",
  "2:115": "Source",
  "2:116": "CopyrightNotice",
  "2:118": "Contact",
  "2:120": "Caption",
  "2:122": "WriterEditor",
};

export function parseIptcIim(buf: Buffer): IptcProperty[] {
  const out: IptcProperty[] = [];
  let offset = 0;
  while (offset + 5 <= buf.length && out.length < 200) {
    if (buf[offset] !== 0x1c) {
      offset++;
      continue;
    }
    const record = buf[offset + 1];
    const dataset = buf[offset + 2];
    let length = buf.readUInt16BE(offset + 3);
    let headerSize = 5;
    if (length & 0x8000) {
      const sizeBytes = length & 0x7fff;
      if (sizeBytes <= 0 || sizeBytes > 4 || offset + 5 + sizeBytes > buf.length) break;
      length =
        sizeBytes === 1
          ? buf[offset + 5]
          : sizeBytes === 2
          ? buf.readUInt16BE(offset + 5)
          : sizeBytes === 3
          ? (buf[offset + 5] << 16) | buf.readUInt16BE(offset + 6)
          : buf.readUInt32BE(offset + 5);
      headerSize = 5 + sizeBytes;
    }
    const start = offset + headerSize;
    const end = start + length;
    if (length < 0 || end > buf.length) break;
    const raw = buf.subarray(start, end);
    const key = `${record}:${dataset}`;
    const name = IPTC_DATASETS[key] ?? `Dataset ${key}`;
    const value = /^\d+$/.test(key.split(":")[0])
      ? raw.toString("utf8").replace(/\u0000+$/g, "").trim()
      : raw.toString("utf8").trim();
    if (value) {
      out.push({ key: name, value, dataset: key });
    }
    offset = end;
  }
  return out;
}

/**
 * Photoshop image resource blocks can hide an IPTC-IIM payload (resource
 * 0x0404) inside a JPEG APP13 segment or a TIFF/PSD block.
 */
export function extractIptcFromIrb(irb: Buffer): IptcProperty[] {
  const out: IptcProperty[] = [];
  let offset = 0;
  if (irb.length < 14 || irb.toString("latin1", 0, 14) !== "Photoshop 3.0\u0000") {
    return parseIptcIim(irb);
  }
  offset = 14;
  while (offset + 12 <= irb.length && out.length < 200) {
    if (irb.toString("latin1", offset, offset + 4) !== "8BIM") break;
    const resourceId = irb.readUInt16BE(offset + 4);
    const nameLength = irb[offset + 6];
    const namePadded = nameLength + 1 + ((nameLength + 1) % 2);
    const sizeOffset = offset + 6 + namePadded;
    if (sizeOffset + 4 > irb.length) break;
    const size = irb.readUInt32BE(sizeOffset);
    const dataStart = sizeOffset + 4;
    const dataEnd = dataStart + size;
    if (dataEnd > irb.length) break;
    if (resourceId === 0x0404) {
      out.push(...parseIptcIim(irb.subarray(dataStart, dataEnd)));
    }
    offset = dataEnd + (size % 2);
  }
  return out;
}
