import crypto from "crypto";
import sharp from "sharp";
import { parseEbml } from "./ebml";
import { parseGeneric } from "./generic";
import { parseGif } from "./gif";
import { parseIsoBmff } from "./isobmff";
import { parseJpeg } from "./jpeg";
import { parseIccProfile, parseIptcIim } from "./metadata-blocks";
import type { ContainerParseResult } from "./parser-types";
import { parsePng } from "./png";
import { parseAvi } from "./riff-avi";
import { analyzeProvenance } from "./provenance";
import { parseTiffStream } from "./tiff";
import { clipText } from "./util";
import { parseWebp } from "./webp";
import { extractXmpPacket, parseXmpProperties } from "./xmp";
import type {
  ColorProfileInfo,
  ForensicReport,
  MediaKind,
  MetadataTagRow,
  XmpProperty,
} from "./types";

interface DetectedFormat {
  parser:
    | "jpeg"
    | "png"
    | "webp"
    | "gif"
    | "tiff"
    | "bmp"
    | "isobmff"
    | "avi"
    | "ebml"
    | "unknown";
  label: string;
}

export function sniffContainer(buf: Buffer, filename: string): DetectedFormat {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { parser: "jpeg", label: "JPEG" };
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") {
    return { parser: "png", label: "PNG" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  ) {
    return { parser: "webp", label: "WebP" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "AVI "
  ) {
    return { parser: "avi", label: "AVI" };
  }
  if (
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  ) {
    return { parser: "ebml", label: "Matroska" };
  }
  if (buf.length >= 6 && (buf.toString("latin1", 0, 6) === "GIF87a" || buf.toString("latin1", 0, 6) === "GIF89a")) {
    return { parser: "gif", label: "GIF" };
  }
  if (
    buf.length >= 4 &&
    ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a))
  ) {
    return { parser: "tiff", label: "TIFF" };
  }
  if (buf.length >= 2 && buf.toString("latin1", 0, 2) === "BM") {
    return { parser: "bmp", label: "BMP" };
  }
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp") {
    return { parser: "isobmff", label: "ISO-BMFF" };
  }
  const lower = filename.toLowerCase();
  if (/\.(tif|tiff)$/.test(lower)) return { parser: "tiff", label: "TIFF" };
  if (/\.(heic|heif|avif)$/.test(lower)) return { parser: "isobmff", label: "ISO-BMFF" };
  return { parser: "unknown", label: "BINARY" };
}

function emptyResult(format: string, note: string): ContainerParseResult {
  return {
    format,
    mimeType: "application/octet-stream",
    mediaType: "image",
    chunks: [],
    tags: [],
    notes: [note],
    parsedWith: [],
    textBlobs: [],
  };
}

function parseTiffContainer(buf: Buffer): ContainerParseResult {
  const parsed = parseTiffStream(buf);
  if (!parsed) return emptyResult("TIFF", "TIFF header present but the IFD chain could not be read.");
  const findNumeric = (tag: string): number | undefined => {
    const row = parsed.tags.find((t) => t.tag === tag);
    if (!row) return undefined;
    const value = Number(row.rawValue ?? row.value);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const chunks = parsed.tags
    .filter((t) => t.offset !== undefined)
    .slice(0, 60)
    .map((t) => ({
      id: `tiff-${t.offset}`,
      marker: t.hex ?? "IFD",
      label: `${t.group} · ${t.tag}`,
      byteLength: 12,
      offset: t.offset ?? 0,
      category:
        t.tag === "MakerNote"
          ? ("camera-exif" as const)
          : t.tag === "XMLPacket"
          ? ("xmp-iptc" as const)
          : ("camera-exif" as const),
      preview: clipText(t.value, 120),
    }));

  return {
    format: "TIFF",
    mimeType: "image/tiff",
    mediaType: "image",
    width: findNumeric("ImageWidth") ?? findNumeric("PixelXDimension"),
    height: findNumeric("ImageHeight") ?? findNumeric("PixelYDimension"),
    bitDepth: findNumeric("BitsPerSample"),
    chunks,
    tags: parsed.tags,
    exif: parsed,
    xmpPacket: parsed.xmpPacket,
    iccProfile: parsed.iccProfile,
    iptc: parsed.iptcBlock ? parseIptcIim(parsed.iptcBlock) : [],
    notes: parsed.notes,
    parsedWith: ["tiff-ifd", ...(parsed.xmpPacket ? ["xmp"] : [])],
    textBlobs: [],
  };
}

function parseBmpContainer(buf: Buffer): ContainerParseResult {
  const notes: string[] = ["BMP files cannot carry EXIF, XMP or C2PA metadata by design."];
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  if (buf.length >= 30) {
    width = buf.readInt32LE(18);
    height = Math.abs(buf.readInt32LE(22));
    bitDepth = buf.readUInt16LE(28);
  }
  return {
    format: "BMP",
    mimeType: "image/bmp",
    mediaType: "image",
    width,
    height,
    bitDepth,
    chunks: [
      {
        id: "bmp-header",
        marker: "BITMAPINFOHEADER",
        label: `Windows bitmap ${width ?? "?"}×${height ?? "?"} · ${bitDepth ?? "?"}-bit`,
        byteLength: 54,
        offset: 0,
        category: "image-stream",
      },
    ],
    tags: [],
    notes,
    parsedWith: ["bmp-header"],
    textBlobs: [],
  };
}

export interface InspectOptions {
  mimeType?: string;
  /** Force a media kind instead of inferring it from the container. */
  mediaType?: MediaKind;
}

export async function inspectBuffer(
  buf: Buffer,
  filename = "upload",
  options: InspectOptions = {}
): Promise<ForensicReport> {
  const startedAt = Date.now();
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const detected = sniffContainer(buf, filename);

  let result: ContainerParseResult;
  switch (detected.parser) {
    case "jpeg":
      result = parseJpeg(buf);
      break;
    case "png":
      result = parsePng(buf);
      break;
    case "webp":
      result = parseWebp(buf);
      break;
    case "gif":
      result = parseGif(buf);
      break;
    case "tiff":
      result = parseTiffContainer(buf);
      break;
    case "bmp":
      result = parseBmpContainer(buf);
      break;
    case "isobmff":
      result = parseIsoBmff(buf);
      break;
    case "avi":
      result = parseAvi(buf);
      break;
    case "ebml":
      result = parseEbml(buf);
      break;
    default: {
      const lower = filename.toLowerCase();
      const looksVideo = /\.(webm|mkv|avi|wmv|flv|m4v|mpg|mpeg|m2ts|ts|3gp|ogv)$/.test(lower);
      result = parseGeneric(buf, filename, looksVideo ? "video" : "image");
      break;
    }
  }

  // Fallback dimensions for containers we could not fully walk.
  if ((!result.width || !result.height) && detected.parser !== "unknown") {
    try {
      const meta = await sharp(buf, { failOn: "none" }).metadata();
      result.width = result.width ?? meta.width;
      result.height = result.height ?? meta.height;
      result.bitDepth = result.bitDepth ?? (typeof meta.depth === "number" ? meta.depth : undefined);
      if (!result.iccProfile && meta.icc) result.iccProfile = Buffer.from(meta.icc);
    } catch {
      result.notes.push("Dimensions could not be read by the decoder fallback.");
    }
  }

  const xmpPacket = result.xmpPacket
    ? extractXmpPacket(result.xmpPacket) ?? result.xmpPacket
    : undefined;
  const xmpProperties: XmpProperty[] = xmpPacket ? parseXmpProperties(xmpPacket) : [];
  const colorProfile: ColorProfileInfo | undefined = result.iccProfile
    ? parseIccProfile(result.iccProfile)
    : undefined;

  const tags: MetadataTagRow[] = [...result.tags];

  for (const prop of xmpProperties) {
    tags.push({
      group: "XMP",
      tag: prop.key,
      value: clipText(prop.value, 300),
    });
  }
  for (const prop of result.iptc ?? []) {
    tags.push({
      group: "IPTC-IIM",
      tag: prop.key,
      value: clipText(prop.value, 300),
    });
  }
  if (colorProfile) {
    const rows: Array<[string, string | undefined]> = [
      ["ProfileDescription", colorProfile.description],
      ["ColourSpace", colorProfile.colorSpace],
      ["DeviceClass", colorProfile.deviceClass],
      ["ProfileVersion", colorProfile.version],
      ["RenderingIntent", colorProfile.renderingIntent],
    ];
    for (const [tag, value] of rows) {
      if (value) tags.push({ group: "ICC", tag, value });
    }
  }

  const provenance = analyzeProvenance({
    filename,
    mediaType: result.mediaType,
    containerFormat: result.format,
    tags,
    xmpProperties,
    xmpPacket,
    iptc: result.iptc ?? [],
    exifSummary: result.exif?.summary ?? {},
    textBlobs: result.textBlobs ?? [],
    hasC2paBox: result.hasC2paBox,
    trailingBytes: result.trailingBytes,
    parsedWith: result.parsedWith,
  });

  const aiKeys = new Set(
    provenance.findings
      .filter((f) => f.severity !== "info")
      .map((f) => f.key.toLowerCase())
  );

  const annotatedTags = tags.map((tag) => ({
    ...tag,
    isAiFlag: aiKeys.has(tag.tag.toLowerCase()) || aiKeys.has(tag.tag.split(":").pop()?.toLowerCase() ?? ""),
  }));

  const notes = [...result.notes];
  if (tags.length === 0) {
    notes.push(
      `No EXIF, XMP, IPTC or container metadata could be extracted from this ${result.format} file.`
    );
  }
  if (!xmpPacket) notes.push("No XMP packet found in the container.");
  if (!(result.iptc ?? []).length) notes.push("No IPTC-IIM dataset found.");

  return {
    filename,
    mediaType: options.mediaType ?? result.mediaType,
    containerFormat: result.format,
    mimeType: options.mimeType ?? result.mimeType,
    byteSize: buf.length,
    sha256,
    width: result.width,
    height: result.height,
    bitDepth: result.bitDepth,
    durationSec: result.durationSec,
    authenticityStatus: provenance.authenticityStatus,
    aiRiskScore: provenance.aiRiskScore,
    detectedGenerators: provenance.generators,
    aiFindings: provenance.findings,
    chunks: result.chunks,
    exifSummary: result.exif?.summary ?? {},
    tags: annotatedTags,
    xmp: xmpPacket
      ? {
          present: true,
          packetBytes: Buffer.byteLength(xmpPacket, "utf8"),
          properties: xmpProperties,
        }
      : { present: false, packetBytes: 0, properties: [] },
    iptc: result.iptc ?? [],
    colorProfile,
    notes,
    parsedWith: Array.from(new Set(result.parsedWith)),
    trailingBytes: result.trailingBytes,
    hasC2paManifest: provenance.findings.some((f) => f.rule === "c2pa-manifest"),
    cameraVerified: provenance.authenticityStatus === "camera-verified",
    inspectedAt: new Date().toISOString(),
    scanMs: Date.now() - startedAt,
  };
}
