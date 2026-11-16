import {
  COLOR_SPACE_NAMES,
  CONTRAST_NAMES,
  CUSTOM_RENDERED_NAMES,
  EXPOSURE_MODE_NAMES,
  EXPOSURE_PROGRAM_NAMES,
  FILE_SOURCE_NAMES,
  GAIN_CONTROL_NAMES,
  GPS_TAG_NAMES,
  IFD_TAG_NAMES,
  INTEROP_INDEX_NAMES,
  INTEROP_TAG_NAMES,
  LIGHT_SOURCE_NAMES,
  METERING_MODE_NAMES,
  ORIENTATION_NAMES,
  RESOLUTION_UNIT_NAMES,
  SATURATION_NAMES,
  SCENE_CAPTURE_NAMES,
  SCENE_TYPE_NAMES,
  SENSING_METHOD_NAMES,
  SENSITIVITY_TYPE_NAMES,
  SHARPNESS_NAMES,
  SUBJECT_DISTANCE_RANGE_NAMES,
  TIFF_TYPE_NAMES,
  TIFF_TYPE_SIZES,
  WHITE_BALANCE_NAMES,
  decodeFlash,
} from "./exif-tags";
import type { ExifSummary, MetadataTagRow } from "./types";

export interface TiffParseResult {
  tags: MetadataTagRow[];
  summary: ExifSummary;
  xmpPacket?: string;
  iccProfile?: Buffer;
  iptcBlock?: Buffer;
  byteOrder: "little" | "big";
  ifdOffsets: Record<string, number>;
  hasMakerNote: boolean;
  makerNoteBytes?: number;
  notes: string[];
  thumbnail?: { offset: number; length: number };
  rawIfdCount: number;
}

const MAX_ENTRIES_PER_IFD = 1024;
const MAX_IFD_DEPTH = 4;
const MAX_STRING = 800;

function cleanText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function clip(input: string, max = MAX_STRING): string {
  const clean = cleanText(input);
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function printableRatio(buf: Buffer): number {
  if (buf.length === 0) return 0;
  let printable = 0;
  const limit = Math.min(buf.length, 4096);
  for (let i = 0; i < limit; i++) {
    const b = buf[i];
    if (b === 9 || b === 10 || b === 13 || (b >= 0x20 && b < 0x7f)) printable++;
  }
  return printable / limit;
}

function decodeUtf16Le(buf: Buffer): string {
  let out = "";
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const code = buf[i] | (buf[i + 1] << 8);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function decodeUserComment(raw: Buffer): string {
  if (raw.length < 8) return cleanText(raw.toString("latin1"));
  const charset = raw.subarray(0, 8).toString("latin1");
  const body = raw.subarray(8);
  if (charset.startsWith("UNICODE")) {
    try {
      return new TextDecoder("utf-16").decode(body).replace(/\u0000+$/g, "");
    } catch {
      return cleanText(body.toString("latin1"));
    }
  }
  if (charset.startsWith("JIS")) {
    return cleanText(body.toString("latin1"));
  }
  return body.toString("latin1").replace(/\u0000+$/g, "");
}

interface Rational {
  num: number;
  den: number;
}

function fmtRational(r: Rational): string {
  if (r.den === 0) return `${r.num}/0`;
  const value = r.num / r.den;
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) < 0.0001) return value.toExponential(3);
  return value.toFixed(value < 1 ? 4 : 3).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatGpsCoordinate(
  values: Rational[],
  ref?: string
): { pretty: string; decimal?: number } {
  if (values.length < 3) return { pretty: values.map(fmtRational).join(" ") };
  const d = values[0].den ? values[0].num / values[0].den : 0;
  const m = values[1] && values[1].den ? values[1].num / values[1].den : 0;
  const s = values[2] && values[2].den ? values[2].num / values[2].den : 0;
  let decimal = d + m / 60 + s / 3600;
  if (ref && /^[SW]$/i.test(ref)) decimal = -decimal;
  const pretty = `${d}° ${m}' ${Number(s.toFixed(2))}"${ref ? ` ${ref}` : ""}`;
  return { pretty, decimal };
}

export function parseTiffStream(stream: Buffer): TiffParseResult | null {
  if (!stream || stream.length < 8) return null;
  const order = stream.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const little = order === "II";
  const u16 = (offset: number) =>
    little ? stream.readUInt16LE(offset) : stream.readUInt16BE(offset);
  const u32 = (offset: number) =>
    little ? stream.readUInt32LE(offset) : stream.readUInt32BE(offset);

  try {
    if (u16(2) !== 42) return null;
  } catch {
    return null;
  }

  const tags: MetadataTagRow[] = [];
  const summary: Partial<ExifSummary> = {};
  const notes: string[] = [];
  const ifdOffsets: Record<string, number> = {};
  let xmpPacket: string | undefined;
  let iccProfile: Buffer | undefined;
  let iptcBlock: Buffer | undefined;
  let makerNoteBytes: number | undefined;
  let thumbnail: { offset: number; length: number } | undefined;
  let rawIfdCount = 0;

  const gpsRefs: { lat?: string; lon?: string; latVal?: Rational[]; lonVal?: Rational[]; alt?: number; altRef?: number } = {};
  const seenIfds = new Set<number>();


  function readEntry(tagId: number, type: number, count: number, valueFieldOffset: number) {
    const typeSize = TIFF_TYPE_SIZES[type] ?? 0;
    if (!typeSize) return null;
    const total = typeSize * count;
    if (total < 0) return null;
    let raw: Buffer;
    if (total <= 4) {
      raw = stream.subarray(valueFieldOffset, Math.min(stream.length, valueFieldOffset + total));
    } else {
      const dataOffset = u32(valueFieldOffset);
      if (dataOffset <= 0 || dataOffset + total > stream.length) {
        const available = Math.max(0, stream.length - dataOffset);
        if (dataOffset >= stream.length || available <= 0) return null;
        raw = stream.subarray(dataOffset, dataOffset + Math.min(total, available));
        notes.push(
          `Tag 0x${tagId.toString(16)} declares ${total} bytes at ${dataOffset} but only ${raw.length} are present.`
        );
      } else {
        raw = stream.subarray(dataOffset, dataOffset + total);
      }
    }
    return { raw, total };
  }

  function numberArray(raw: Buffer, type: number, count: number): number[] {
    const out: number[] = [];
    const safeCount = Math.min(count, Math.floor(raw.length / (TIFF_TYPE_SIZES[type] || 1)));
    for (let i = 0; i < safeCount; i++) {
      const at = i * (TIFF_TYPE_SIZES[type] || 1);
      switch (type) {
        case 1:
        case 7:
          out.push(raw[at]);
          break;
        case 6:
          out.push(raw.readInt8(at));
          break;
        case 3:
          out.push(little ? raw.readUInt16LE(at) : raw.readUInt16BE(at));
          break;
        case 8:
          out.push(little ? raw.readInt16LE(at) : raw.readInt16BE(at));
          break;
        case 4:
        case 13:
          out.push(little ? raw.readUInt32LE(at) : raw.readUInt32BE(at));
          break;
        case 9:
          out.push(little ? raw.readInt32LE(at) : raw.readInt32BE(at));
          break;
        case 11:
          out.push(little ? raw.readFloatLE(at) : raw.readFloatBE(at));
          break;
        case 12:
          out.push(little ? raw.readDoubleLE(at) : raw.readDoubleBE(at));
          break;
        default:
          break;
      }
    }
    return out;
  }

  function rationalArray(raw: Buffer, count: number, signed = false): Rational[] {
    const out: Rational[] = [];
    const safeCount = Math.min(count, Math.floor(raw.length / 8));
    for (let i = 0; i < safeCount; i++) {
      const at = i * 8;
      const num = signed
        ? little
          ? raw.readInt32LE(at)
          : raw.readInt32BE(at)
        : little
        ? raw.readUInt32LE(at)
        : raw.readUInt32BE(at);
      const den = signed
        ? little
          ? raw.readInt32LE(at + 4)
          : raw.readInt32BE(at + 4)
        : little
        ? raw.readUInt32LE(at + 4)
        : raw.readUInt32BE(at + 4);
      out.push({ num, den });
    }
    return out;
  }

  function tagNameFor(group: string, tagId: number): string {
    if (group === "GPS") return GPS_TAG_NAMES[tagId] ?? `GPSUnknown_0x${tagId.toString(16)}`;
    if (group === "Interop")
      return INTEROP_TAG_NAMES[tagId] ?? `InteropUnknown_0x${tagId.toString(16)}`;
    return IFD_TAG_NAMES[tagId] ?? `Unknown_0x${tagId.toString(16)}`;
  }

  function prettify(
    group: string,
    tagName: string,
    type: number,
    count: number,
    raw: Buffer
  ): { pretty: string; raw: string } {
    const hex = raw.toString("hex");
    const nums = numberArray(raw, type, count);

    if (type === 2) {
      const text = raw.toString("latin1").replace(/\u0000+$/g, "");
      return { pretty: clip(text), raw: clip(text) };
    }

    if (type === 5 || type === 10) {
      const rats = rationalArray(raw, count, type === 10);
      if (group === "GPS" && (tagName === "GPSLatitude" || tagName === "GPSLongitude")) {
        const ref =
          tagName === "GPSLatitude" ? gpsRefs.lat : gpsRefs.lon;
        const { pretty } = formatGpsCoordinate(rats, ref);
        return { pretty, raw: rats.map((r) => `${r.num}/${r.den}`).join(" ") };
      }
      if (group === "GPS" && tagName === "GPSTimeStamp") {
        const parts = rats.map(fmtRational);
        return {
          pretty: `${parts.join(":")} UTC`,
          raw: rats.map((r) => `${r.num}/${r.den}`).join(" "),
        };
      }
      if (tagName === "ExposureTime") {
        const value = rats[0] && rats[0].den ? rats[0].num / rats[0].den : 0;
        const pretty =
          value > 0 && value < 1
            ? `1/${Math.round(1 / value)} s (${value.toFixed(4)} s)`
            : `${fmtRational(rats[0])} s`;
        return { pretty, raw: `${rats[0]?.num ?? 0}/${rats[0]?.den ?? 0}` };
      }
      if (tagName === "FNumber") {
        const value = rats[0] && rats[0].den ? rats[0].num / rats[0].den : 0;
        return {
          pretty: `f/${Number(value.toFixed(2))}`,
          raw: `${rats[0]?.num ?? 0}/${rats[0]?.den ?? 0}`,
        };
      }
      if (
        tagName === "FocalLength" ||
        tagName === "FocalPlaneXResolution" ||
        tagName === "FocalPlaneYResolution" ||
        tagName === "SubjectDistance"
      ) {
        const value = rats[0] && rats[0].den ? rats[0].num / rats[0].den : 0;
        return {
          pretty: tagName.startsWith("FocalLength")
            ? `${Number(value.toFixed(2))} mm`
            : Number(value.toFixed(3)).toString(),
          raw: `${rats[0]?.num ?? 0}/${rats[0]?.den ?? 0}`,
        };
      }
      if (tagName === "LensSpecification") {
        return {
          pretty: rats.map((r) => `${Number(fmtRational(r))}`).join(" – "),
          raw: rats.map((r) => `${r.num}/${r.den}`).join(" "),
        };
      }
      if (tagName === "GPSAltitude" || tagName === "GPSHPositioningError") {
        const value = rats[0] && rats[0].den ? rats[0].num / rats[0].den : 0;
        return { pretty: `${Number(value.toFixed(2))} m`, raw: `${rats[0]?.num}/${rats[0]?.den}` };
      }
      if (tagName === "ExposureCompensation" || tagName === "BrightnessValue" || tagName === "ShutterSpeedValue" || tagName === "ApertureValue" || tagName === "MaxApertureValue") {
        return { pretty: rats.map(fmtRational).join(", "), raw: rats.map((r) => `${r.num}/${r.den}`).join(" ") };
      }
      return {
        pretty: rats.map(fmtRational).join(", "),
        raw: rats.map((r) => `${r.num}/${r.den}`).join(" "),
      };
    }

    if (type === 7 || type === 1) {
      if (tagName === "ExifVersion" || tagName === "FlashpixVersion") {
        // Stored as four ASCII digits: "0232" -> 2.32, "0100" -> 1.00
        const text = raw.toString("latin1").replace(/\u0000+$/g, "");
        const major = text[0] === "0" ? text[1] : text[0];
        const minor = text[0] === "0" ? text.slice(2) : text.slice(1);
        return {
          pretty: minor ? `${major}.${minor}` : major,
          raw: text,
        };
      }
      if (tagName === "ComponentsConfiguration") {
        const names = ["", "Y", "Cb", "Cr", "R", "G", "B"];
        return {
          pretty: Array.from(raw)
            .map((b) => names[b] ?? String(b))
            .join(" "),
          raw: hex,
        };
      }
      if (tagName === "FileSource") {
        return { pretty: FILE_SOURCE_NAMES[raw[0]] ?? String(raw[0]), raw: hex };
      }
      if (tagName === "SceneType") {
        return { pretty: SCENE_TYPE_NAMES[raw[0]] ?? String(raw[0]), raw: hex };
      }
      if (tagName === "GPSVersionID") {
        return { pretty: Array.from(raw).join("."), raw: hex };
      }
      if (tagName === "GPSAltitudeRef") {
        return {
          pretty: raw[0] === 1 ? "Below sea level" : "Above sea level",
          raw: String(raw[0]),
        };
      }
      if (tagName === "GPSDifferential") {
        return {
          pretty: raw[0] === 1 ? "Differential correction applied" : "No correction",
          raw: String(raw[0]),
        };
      }
      if (tagName === "GPSProcessingMethod" || tagName === "GPSAreaInformation") {
        const text = raw.subarray(8).toString("latin1").replace(/\u0000+$/g, "");
        return { pretty: clip(cleanText(text) || "(binary)"), raw: hex };
      }
      if (tagName === "MakerNote") {
        const ascii = raw.toString("latin1");
        const readable = printableRatio(raw) > 0.85;
        return {
          pretty: readable
            ? clip(cleanText(ascii))
            : `Proprietary maker note — ${raw.length.toLocaleString()} bytes of vendor data`,
          raw: hex.slice(0, 64),
        };
      }
      if (tagName === "UserComment") {
        const text = decodeUserComment(raw);
        return { pretty: clip(cleanText(text)) || "(empty)", raw: hex.slice(0, 64) };
      }
      if (tagName === "XMLPacket") {
        return { pretty: `XMP packet — ${raw.length.toLocaleString()} bytes`, raw: hex.slice(0, 48) };
      }
      if (tagName === "ICCProfile") {
        return { pretty: `ICC profile — ${raw.length.toLocaleString()} bytes`, raw: hex.slice(0, 48) };
      }
      if (tagName === "IPTC-NAA") {
        return { pretty: `IPTC-IIM block — ${raw.length.toLocaleString()} bytes`, raw: hex.slice(0, 48) };
      }
      if (printableRatio(raw) > 0.9 && raw.length <= 128) {
        return { pretty: clip(cleanText(raw.toString("latin1"))), raw: hex };
      }
      return {
        pretty:
          raw.length <= 16
            ? Array.from(raw)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ")
            : `[${raw.length} bytes] ${hex.slice(0, 48)}…`,
        raw: hex.slice(0, 96),
      };
    }

    if (/^XP/.test(tagName)) {
      return { pretty: clip(decodeUtf16Le(raw)), raw: hex };
    }

    const first = nums[0];
    switch (tagName) {
      case "Orientation":
        return { pretty: ORIENTATION_NAMES[first] ?? String(first), raw: String(first) };
      case "ResolutionUnit":
        return { pretty: RESOLUTION_UNIT_NAMES[first] ?? String(first), raw: String(first) };
      case "ExposureProgram":
        return { pretty: EXPOSURE_PROGRAM_NAMES[first] ?? String(first), raw: String(first) };
      case "MeteringMode":
        return { pretty: METERING_MODE_NAMES[first] ?? String(first), raw: String(first) };
      case "WhiteBalance":
        return { pretty: WHITE_BALANCE_NAMES[first] ?? String(first), raw: String(first) };
      case "ExposureMode":
        return { pretty: EXPOSURE_MODE_NAMES[first] ?? String(first), raw: String(first) };
      case "SceneCaptureType":
        return { pretty: SCENE_CAPTURE_NAMES[first] ?? String(first), raw: String(first) };
      case "ColorSpace":
        return { pretty: COLOR_SPACE_NAMES[first] ?? String(first), raw: String(first) };
      case "SensitivityType":
        return { pretty: SENSITIVITY_TYPE_NAMES[first] ?? String(first), raw: String(first) };
      case "SensingMethod":
        return { pretty: SENSING_METHOD_NAMES[first] ?? String(first), raw: String(first) };
      case "CustomRendered":
        return { pretty: CUSTOM_RENDERED_NAMES[first] ?? String(first), raw: String(first) };
      case "GainControl":
        return { pretty: GAIN_CONTROL_NAMES[first] ?? String(first), raw: String(first) };
      case "Contrast":
        return { pretty: CONTRAST_NAMES[first] ?? String(first), raw: String(first) };
      case "Saturation":
        return { pretty: SATURATION_NAMES[first] ?? String(first), raw: String(first) };
      case "Sharpness":
        return { pretty: SHARPNESS_NAMES[first] ?? String(first), raw: String(first) };
      case "SubjectDistanceRange":
        return { pretty: SUBJECT_DISTANCE_RANGE_NAMES[first] ?? String(first), raw: String(first) };
      case "LightSource":
        return { pretty: LIGHT_SOURCE_NAMES[first] ?? String(first), raw: String(first) };
      case "Flash":
        return { pretty: decodeFlash(first), raw: String(first) };
      case "GPSAltitudeRef":
        return {
          pretty: first === 1 ? "Below sea level" : "Above sea level",
          raw: String(first),
        };
      case "GPSDifferential":
        return {
          pretty: first === 1 ? "Differential correction applied" : "No correction",
          raw: String(first),
        };
      case "GPSLatitudeRef":
      case "GPSLongitudeRef":
        return { pretty: raw.toString("latin1").trim(), raw: raw.toString("latin1") };
      case "InteropIndex": {
        const text = raw.toString("latin1").replace(/\u0000+$/g, "");
        return { pretty: INTEROP_INDEX_NAMES[text] ?? text, raw: text };
      }
      case "FocalLengthIn35mmFilm":
        return { pretty: `${first} mm`, raw: String(first) };
      case "PixelXDimension":
      case "PixelYDimension":
      case "ImageWidth":
      case "ImageHeight":
      case "RelatedImageWidth":
      case "RelatedImageLength":
        return { pretty: String(first), raw: String(first) };
      default:
        break;
    }

    if (type === 3 || type === 4 || type === 8 || type === 9 || type === 11 || type === 12) {
      const pretty = nums.map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(3))).join(", ");
      return { pretty: clip(pretty), raw: clip(nums.join(" ")) };
    }

    return { pretty: clip(hex), raw: hex.slice(0, 96) };
  }

  function parseIfd(offset: number, group: string, depth: number) {
    if (depth > MAX_IFD_DEPTH || offset <= 0 || offset + 2 > stream.length) return;
    if (seenIfds.has(offset)) return;
    seenIfds.add(offset);
    ifdOffsets[group.toLowerCase()] = offset;
    rawIfdCount++;

    let count = u16(offset);
    if (count > MAX_ENTRIES_PER_IFD) {
      notes.push(`${group} declares ${count} entries; reading the first ${MAX_ENTRIES_PER_IFD}.`);
      count = MAX_ENTRIES_PER_IFD;
    }

    const exifPointer: number[] = [];
    const gpsPointer: number[] = [];
    const interopPointer: number[] = [];
    const thumbOffsets: number[] = [];
    const thumbLengths: number[] = [];

    for (let i = 0; i < count; i++) {
      const entryOffset = offset + 2 + i * 12;
      if (entryOffset + 12 > stream.length) break;
      const tagId = u16(entryOffset);
      const type = u16(entryOffset + 2);
      const valueCount = u32(entryOffset + 4);
      const valueFieldOffset = entryOffset + 8;
      if (valueCount <= 0 || valueCount > 100_000_000) continue;

      const entry = readEntry(tagId, type, valueCount, valueFieldOffset);
      if (!entry) continue;

      const tagName = tagNameFor(group, tagId);
      const { pretty, raw } = prettify(group, tagName, type, valueCount, entry.raw);

      if (tagId === 0x8769) exifPointer.push(u32(valueFieldOffset));
      if (tagId === 0x8825) gpsPointer.push(u32(valueFieldOffset));
      if (tagId === 0xa005) interopPointer.push(u32(valueFieldOffset));
      if (tagId === 0x0201) thumbOffsets.push(u32(valueFieldOffset));
      if (tagId === 0x0202) thumbLengths.push(u32(valueFieldOffset));

      if (tagName === "XMLPacket") {
        const xml = entry.raw.toString("utf8");
        if (xml.includes("<x:xmpmeta") || xml.includes("<rdf:RDF")) xmpPacket = xml;
      }
      if (tagName === "ICCProfile") iccProfile = Buffer.from(entry.raw);
      if (tagName === "IPTC-NAA") iptcBlock = Buffer.from(entry.raw);
      if (tagName === "MakerNote") makerNoteBytes = entry.raw.length;

      if (group === "GPS") {
        if (tagName === "GPSLatitudeRef") gpsRefs.lat = raw.trim();
        if (tagName === "GPSLongitudeRef") gpsRefs.lon = raw.trim();
        if (tagName === "GPSLatitude") gpsRefs.latVal = rationalArray(entry.raw, valueCount);
        if (tagName === "GPSLongitude") gpsRefs.lonVal = rationalArray(entry.raw, valueCount);
        if (tagName === "GPSAltitudeRef") gpsRefs.altRef = entry.raw[0];
        if (tagName === "GPSAltitude") {
          const rats = rationalArray(entry.raw, valueCount);
          if (rats[0]?.den) gpsRefs.alt = rats[0].num / rats[0].den;
        }
      }

      tags.push({
        group,
        tag: tagName,
        hex: `0x${tagId.toString(16).toUpperCase().padStart(4, "0")}`,
        value: pretty,
        rawValue: raw,
        type: TIFF_TYPE_NAMES[type],
        offset: entryOffset,
      });

      switch (tagName) {
        case "Make":
          summary.make = pretty;
          break;
        case "Model":
          summary.model = pretty;
          break;
        case "Software":
          summary.software = pretty;
          break;
        case "Artist":
          summary.artist = pretty;
          break;
        case "Copyright":
          summary.copyright = pretty;
          break;
        case "ImageDescription":
          summary.imageDescription = pretty;
          break;
        case "LensMake":
          summary.lensMake = pretty;
          break;
        case "LensModel":
          summary.lensModel = pretty;
          break;
        case "ExposureTime":
          summary.exposureTime = pretty.replace(/\s*\(.*\)$/, "");
          break;
        case "FNumber":
          summary.fNumber = pretty;
          break;
        case "ISO":
          summary.iso = `ISO ${pretty}`;
          break;
        case "FocalLength":
          summary.focalLength = pretty;
          break;
        case "FocalLengthIn35mmFilm":
          summary.focalLength35mm = pretty;
          break;
        case "DateTimeOriginal":
          summary.dateTimeOriginal = pretty;
          break;
        case "OffsetTimeOriginal":
          summary.offsetTime = pretty;
          break;
        case "SubSecTimeOriginal":
          summary.subSecTime = pretty;
          break;
        case "ExposureProgram":
          summary.exposureProgram = pretty;
          break;
        case "MeteringMode":
          summary.meteringMode = pretty;
          break;
        case "Flash":
          summary.flash = pretty;
          break;
        case "WhiteBalance":
          summary.whiteBalance = pretty;
          break;
        case "ColorSpace":
          summary.colorSpace = pretty;
          break;
        case "BodySerialNumber":
          summary.bodySerial = pretty;
          break;
        case "CameraSerialNumber":
          summary.bodySerial = summary.bodySerial ?? pretty;
          break;
        case "LensSerialNumber":
          summary.lensSerial = pretty;
          break;
        case "Orientation":
          summary.orientation = pretty;
          break;
        case "UserComment":
          summary.userComment = pretty;
          break;
        case "CameraOwnerName":
          summary.cameraOwner = pretty;
          break;
        case "MakerNote":
          summary.makerNote = `Vendor maker note (${entry.raw.length.toLocaleString()} bytes)`;
          break;
        default:
          break;
      }
    }

    const nextIfdOffsetPos = offset + 2 + count * 12;
    const nextIfd = nextIfdOffsetPos + 4 <= stream.length ? u32(nextIfdOffsetPos) : 0;

    if (group === "IFD0") {
      for (const pointer of exifPointer) parseIfd(pointer, "ExifIFD", depth + 1);
      for (const pointer of gpsPointer) parseIfd(pointer, "GPS", depth + 1);
      if (thumbOffsets.length && thumbLengths.length) {
        thumbnail = { offset: thumbOffsets[0], length: thumbLengths[0] };
      }
      if (nextIfd > 0) parseIfd(nextIfd, "IFD1", depth + 1);
    } else if (group === "ExifIFD") {
      for (const pointer of interopPointer) parseIfd(pointer, "Interop", depth + 1);
    }
  }

  try {
    const firstIfd = u32(4);
    if (firstIfd <= 0 || firstIfd >= stream.length) return null;
    parseIfd(firstIfd, "IFD0", 0);
  } catch (err) {
    notes.push(
      `EXIF directory walk stopped early: ${err instanceof Error ? err.message : "malformed IFD"}`
    );
  }

  if (gpsRefs.latVal && gpsRefs.lonVal) {
    const lat = formatGpsCoordinate(gpsRefs.latVal, gpsRefs.lat);
    const lon = formatGpsCoordinate(gpsRefs.lonVal, gpsRefs.lon);
    if (lat.decimal !== undefined && lon.decimal !== undefined) {
      summary.latitude = Number(lat.decimal.toFixed(6));
      summary.longitude = Number(lon.decimal.toFixed(6));
      const alt =
        gpsRefs.alt !== undefined
          ? ` · ${Number((gpsRefs.altRef === 1 ? -gpsRefs.alt : gpsRefs.alt).toFixed(1))} m`
          : "";
      summary.gps = `${lat.pretty}, ${lon.pretty}${alt}`;
    }
  }

  if (rawIfdCount === 0) return null;

  return {
    tags,
    summary: summary as ExifSummary,
    xmpPacket,
    iccProfile,
    iptcBlock,
    byteOrder: little ? "little" : "big",
    ifdOffsets,
    hasMakerNote: makerNoteBytes !== undefined,
    makerNoteBytes,
    notes,
    thumbnail,
    rawIfdCount,
  };
}
