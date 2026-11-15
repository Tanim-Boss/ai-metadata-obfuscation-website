import crypto from "crypto";
import zlib from "zlib";
import sharp from "sharp";
import exifr from "exifr";

export type ChunkCategory =
  | "ai-provenance"
  | "camera-exif"
  | "xmp-iptc"
  | "ancillary-text"
  | "color-profile"
  | "image-stream"
  | "video-container";

export interface BinaryChunkInfo {
  id: string;
  marker: string;
  label: string;
  byteLength: number;
  offset: number;
  category: ChunkCategory;
  preview?: string;
}

export interface AiFinding {
  id: string;
  severity: "critical" | "warning" | "info";
  generator: string;
  location: string;
  key: string;
  snippet: string;
  explanation: string;
}

export interface MetadataTagRow {
  group: string;
  tag: string;
  hex?: string;
  value: string;
  isAiFlag?: boolean;
  isCameraCore?: boolean;
}

export interface ExifSummary {
  make?: string;
  model?: string;
  lensMake?: string;
  lensModel?: string;
  software?: string;
  exposureTime?: string;
  fNumber?: string;
  iso?: string;
  focalLength?: string;
  focalLength35mm?: string;
  dateTimeOriginal?: string;
  offsetTime?: string;
  subSecTime?: string;
  exposureProgram?: string;
  meteringMode?: string;
  flash?: string;
  whiteBalance?: string;
  colorSpace?: string;
  bodySerial?: string;
  lensSerial?: string;
  artist?: string;
  copyright?: string;
  gps?: string;
}

export interface ForensicReport {
  filename: string;
  mediaType: "image" | "video";
  containerFormat: string;
  byteSize: number;
  sha256: string;
  width?: number;
  height?: number;
  durationSec?: number;
  authenticityStatus: "ai-detected" | "suspicious" | "camera-verified" | "stripped";
  aiRiskScore: number; // 0 (authentic camera) to 100 (confirmed AI provenance)
  detectedGenerators: string[];
  aiFindings: AiFinding[];
  chunks: BinaryChunkInfo[];
  exifSummary: ExifSummary;
  tags: MetadataTagRow[];
}

const C2PA_UUID_HEX = "d8fec3d61b0e483c92975828877ec481";
const XMP_UUID_HEX = "be7acfcb97a942e89c71999491e3afac";
const MAC_EPOCH_OFFSET_SEC = 2082844800; // Seconds between 1904-01-01 and 1970-01-01

const EXIF_TAG_HEX_MAP: Record<string, string> = {
  Make: "0x010F",
  Model: "0x0110",
  Orientation: "0x0112",
  XResolution: "0x011A",
  YResolution: "0x011B",
  ResolutionUnit: "0x0128",
  Software: "0x0131",
  ModifyDate: "0x0132",
  DateTime: "0x0132",
  Artist: "0x013B",
  YCbCrPositioning: "0x0213",
  Copyright: "0x8298",
  ExposureTime: "0x829A",
  FNumber: "0x829D",
  ExposureProgram: "0x8822",
  ISO: "0x8827",
  ISOSpeedRatings: "0x8827",
  SensitivityType: "0x8830",
  RecommendedExposureIndex: "0x8832",
  ExifVersion: "0x9000",
  DateTimeOriginal: "0x9003",
  CreateDate: "0x9004",
  DateTimeDigitized: "0x9004",
  OffsetTime: "0x9010",
  OffsetTimeOriginal: "0x9011",
  OffsetTimeDigitized: "0x9012",
  ShutterSpeedValue: "0x9201",
  ApertureValue: "0x9202",
  BrightnessValue: "0x9203",
  ExposureCompensation: "0x9204",
  ExposureBiasValue: "0x9204",
  MaxApertureValue: "0x9205",
  MeteringMode: "0x9207",
  LightSource: "0x9208",
  Flash: "0x9209",
  FocalLength: "0x920A",
  UserComment: "0x9286",
  SubSecTime: "0x9290",
  SubSecTimeOriginal: "0x9291",
  SubSecTimeDigitized: "0x9292",
  ColorSpace: "0xA001",
  ExifImageWidth: "0xA002",
  PixelXDimension: "0xA002",
  ExifImageHeight: "0xA003",
  PixelYDimension: "0xA003",
  FocalPlaneXResolution: "0xA20E",
  FocalPlaneYResolution: "0xA20F",
  FocalPlaneResolutionUnit: "0xA210",
  SensingMethod: "0xA217",
  FileSource: "0xA300",
  SceneType: "0xA301",
  CustomRendered: "0xA401",
  ExposureMode: "0xA402",
  WhiteBalance: "0xA403",
  FocalLengthIn35mmFormat: "0xA405",
  FocalLengthIn35mmFilm: "0xA405",
  SceneCaptureType: "0xA406",
  Contrast: "0xA408",
  Saturation: "0xA409",
  Sharpness: "0xA40A",
  SerialNumber: "0xA431",
  BodySerialNumber: "0xA431",
  LensInfo: "0xA432",
  LensSpecification: "0xA432",
  LensMake: "0xA433",
  LensModel: "0xA434",
  LensSerialNumber: "0xA435",
  InteropIndex: "0x0001",
  GPSLatitude: "0x0002",
  GPSLongitude: "0x0004",
  GPSAltitude: "0x0006",
};

function truncate(str: string, max = 220): string {
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

function formatExposureTimeDisplay(val: unknown): string | undefined {
  if (typeof val !== "number" || !Number.isFinite(val) || val <= 0)
    return undefined;
  if (val >= 1) return `${val.toFixed(1)}s`;
  const denom = Math.round(1 / val);
  return `1/${denom}s`;
}

function detectContainerFormat(buf: Buffer, filename: string): {
  mediaType: "image" | "video";
  format: string;
} {
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { mediaType: "image", format: "PNG" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mediaType: "image", format: "JPEG" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mediaType: "image", format: "WEBP" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12).trim();
    if (["avif", "avis", "heic", "heix", "mif1"].includes(brand)) {
      return { mediaType: "image", format: brand.toUpperCase() };
    }
    if (brand === "qt") {
      return { mediaType: "video", format: "MOV" };
    }
    return { mediaType: "video", format: "MP4" };
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".m4v")) {
    return {
      mediaType: "video",
      format: lower.endsWith(".mov") ? "MOV" : "MP4",
    };
  }
  return { mediaType: "image", format: "IMAGE" };
}

function scanTextForAiPatterns(
  location: string,
  key: string,
  text: string,
  findings: AiFinding[],
  generators: Set<string>
) {
  const lower = text.toLowerCase();

  if (
    lower.includes("c2pa") ||
    lower.includes("jumbf") ||
    lower.includes("contentauthenticity") ||
    lower.includes("c2pa.actions")
  ) {
    let gen = "C2PA Content Credentials";
    if (lower.includes("openai") || lower.includes("dall-e") || lower.includes("sora") || lower.includes("chatgpt")) {
      gen = "OpenAI C2PA Manifest (DALL·E / GPT-4o / Sora)";
    } else if (lower.includes("firefly") || lower.includes("adobe")) {
      gen = "Adobe Firefly C2PA Content Credentials";
    } else if (lower.includes("google") || lower.includes("imagen") || lower.includes("synthid")) {
      gen = "Google Imagen / SynthID C2PA Manifest";
    }
    generators.add(gen);
    findings.push({
      id: `c2pa-${findings.length}`,
      severity: "critical",
      generator: gen,
      location,
      key,
      snippet: truncate(text),
      explanation:
        "Cryptographic C2PA / JUMBF provenance manifest asserting synthetic AI generation.",
    });
  }

  if (
    lower.includes("trainedalgorithmicmedia") ||
    lower.includes("compositewithtrainedalgorithmicmedia") ||
    lower.includes("algorithmicmedia")
  ) {
    generators.add("IPTC DigitalSourceType (AI Declaration)");
    findings.push({
      id: `iptc-ai-${findings.length}`,
      severity: "critical",
      generator: "IPTC AI DigitalSourceType",
      location,
      key,
      snippet: truncate(text),
      explanation:
        "Standardized IPTC/XMP DigitalSourceType URI explicitly declaring trained algorithmic media.",
    });
  }

  if (
    (lower.includes("steps:") && lower.includes("sampler:")) ||
    lower.includes("cfg scale:") ||
    lower.includes("negative prompt:") ||
    key.toLowerCase() === "parameters"
  ) {
    const gen = lower.includes("flux")
      ? "Stable Diffusion / Flux (WebUI Forge / A1111)"
      : "Stable Diffusion (Automatic1111 / Forge)";
    generators.add(gen);
    findings.push({
      id: `sd-${findings.length}`,
      severity: "critical",
      generator: gen,
      location,
      key,
      snippet: truncate(text),
      explanation:
        "Full diffusion generation parameters (prompt, sampler, CFG scale, seed, model hash) embedded in image chunk.",
    });
  }

  if (
    key.toLowerCase() === "workflow" ||
    (key.toLowerCase() === "prompt" &&
      (lower.includes("class_type") || lower.includes("ksampler") || lower.includes("cliptextencode")))
  ) {
    generators.add("ComfyUI Node Graph");
    findings.push({
      id: `comfy-${findings.length}`,
      severity: "critical",
      generator: "ComfyUI Workflow Graph",
      location,
      key,
      snippet: truncate(text),
      explanation:
        "Complete ComfyUI JSON node execution graph exposing checkpoints, LoRAs, seeds, and text prompts.",
    });
  }

  if (
    lower.includes("midjourney") ||
    (lower.includes("--v ") && lower.includes("job id"))
  ) {
    generators.add("Midjourney");
    findings.push({
      id: `mj-${findings.length}`,
      severity: "critical",
      generator: "Midjourney",
      location,
      key,
      snippet: truncate(text),
      explanation:
        "Midjourney prompt parameters and Job UUID signature embedded in descriptor fields.",
    });
  }

  const namedGenerators: Array<{ match: string; name: string }> = [
    { match: "dall-e", name: "OpenAI DALL·E" },
    { match: "dall·e", name: "OpenAI DALL·E" },
    { match: "adobe firefly", name: "Adobe Firefly" },
    { match: "made with google ai", name: "Google AI / Imagen" },
    { match: "synthid", name: "Google SynthID Tag" },
    { match: "novelai", name: "NovelAI Diffusion" },
    { match: "invokeai", name: "InvokeAI" },
    { match: "sui_image_params", name: "SwarmUI" },
    { match: "fooocus", name: "Fooocus" },
    { match: "runway", name: "Runway Gen-3" },
    { match: "kling", name: "Kling AI Video" },
    { match: "luma", name: "Luma Dream Machine" },
    { match: "sora", name: "OpenAI Sora" },
  ];

  for (const item of namedGenerators) {
    if (lower.includes(item.match) || key.toLowerCase().includes(item.match)) {
      if (!generators.has(item.name)) {
        generators.add(item.name);
        findings.push({
          id: `gen-${findings.length}`,
          severity: "critical",
          generator: item.name,
          location,
          key,
          snippet: truncate(text),
          explanation: `Generator identifier matching ${item.name} detected in ${location}.`,
        });
      }
    }
  }
}

function parsePngChunks(
  buf: Buffer,
  chunks: BinaryChunkInfo[],
  tags: MetadataTagRow[],
  findings: AiFinding[],
  generators: Set<string>
): { exifPayload?: Buffer; xmpText?: string } {
  let offset = 8;
  let idatCount = 0;
  let idatBytes = 0;
  let idatFirstOffset = 0;
  let exifPayload: Buffer | undefined;
  let xmpText: string | undefined;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = Math.min(buf.length, dataStart + length);
    const payload = buf.subarray(dataStart, dataEnd);

    if (type === "IDAT") {
      if (idatCount === 0) idatFirstOffset = offset;
      idatCount++;
      idatBytes += length;
    } else if (type === "tEXt") {
      const nulIdx = payload.indexOf(0);
      const key =
        nulIdx >= 0
          ? payload.toString("latin1", 0, nulIdx)
          : "tEXt";
      const val =
        nulIdx >= 0
          ? payload.toString("utf8", nulIdx + 1)
          : payload.toString("utf8");
      scanTextForAiPatterns("PNG tEXt", key, val, findings, generators);
      const isAi =
        findings.some((f) => f.key === key && f.location === "PNG tEXt") ||
        ["parameters", "prompt", "workflow", "sd-metadata", "Comment"].includes(
          key
        );
      chunks.push({
        id: `png-${offset}`,
        marker: `tEXt (${key})`,
        label: `PNG Text Chunk · ${key}`,
        byteLength: length,
        offset,
        category: isAi ? "ai-provenance" : "ancillary-text",
        preview: truncate(val, 140),
      });
      tags.push({
        group: "PNG-tEXt",
        tag: key,
        value: truncate(val, 300),
        isAiFlag: isAi,
      });
    } else if (type === "zTXt") {
      const nulIdx = payload.indexOf(0);
      const key =
        nulIdx >= 0 ? payload.toString("latin1", 0, nulIdx) : "zTXt";
      let val = "";
      try {
        if (nulIdx >= 0 && nulIdx + 2 < payload.length) {
          val = zlib.inflateSync(payload.subarray(nulIdx + 2)).toString("utf8");
        }
      } catch {
        val = "[Compressed binary text]";
      }
      scanTextForAiPatterns("PNG zTXt", key, val, findings, generators);
      chunks.push({
        id: `png-${offset}`,
        marker: `zTXt (${key})`,
        label: `PNG Compressed Text · ${key}`,
        byteLength: length,
        offset,
        category: "ai-provenance",
        preview: truncate(val, 140),
      });
      tags.push({
        group: "PNG-zTXt",
        tag: key,
        value: truncate(val, 300),
        isAiFlag: true,
      });
    } else if (type === "iTXt") {
      const nul1 = payload.indexOf(0);
      const key =
        nul1 >= 0 ? payload.toString("utf8", 0, nul1) : "iTXt";
      let textVal = "";
      if (nul1 >= 0 && nul1 + 3 <= payload.length) {
        const compFlag = payload[nul1 + 1];
        let cursor = nul1 + 3;
        const nul2 = payload.indexOf(0, cursor);
        if (nul2 >= 0) cursor = nul2 + 1;
        const nul3 = payload.indexOf(0, cursor);
        if (nul3 >= 0) cursor = nul3 + 1;
        const rest = payload.subarray(cursor);
        try {
          textVal =
            compFlag === 1
              ? zlib.inflateSync(rest).toString("utf8")
              : rest.toString("utf8");
        } catch {
          textVal = rest.toString("utf8");
        }
      }
      if (key.includes("com.adobe.xmp")) {
        xmpText = textVal;
      }
      scanTextForAiPatterns("PNG iTXt", key, textVal, findings, generators);
      const isXmp = key.includes("xmp");
      chunks.push({
        id: `png-${offset}`,
        marker: `iTXt (${key})`,
        label: isXmp ? "Embedded XMP Packet" : `PNG International Text · ${key}`,
        byteLength: length,
        offset,
        category:
          findings.some((f) => f.key === key) ? "ai-provenance" : isXmp ? "xmp-iptc" : "ancillary-text",
        preview: truncate(textVal, 140),
      });
      tags.push({
        group: "PNG-iTXt",
        tag: key,
        value: truncate(textVal, 300),
        isAiFlag: findings.some((f) => f.key === key),
      });
    } else if (type === "caBX" || type === "jumb" || type === "c2pa") {
      const previewStr = payload.toString("latin1");
      scanTextForAiPatterns(
        `PNG ${type}`,
        "C2PA JUMBF Manifest",
        previewStr + " c2pa jumbf",
        findings,
        generators
      );
      chunks.push({
        id: `png-${offset}`,
        marker: type,
        label: "C2PA / JUMBF Provenance Store",
        byteLength: length,
        offset,
        category: "ai-provenance",
        preview: truncate(previewStr, 120),
      });
      tags.push({
        group: "C2PA",
        tag: `${type} Manifest`,
        value: `${length} bytes cryptographic JUMBF manifest`,
        isAiFlag: true,
      });
    } else if (type === "eXIf") {
      exifPayload = payload;
      chunks.push({
        id: `png-${offset}`,
        marker: "eXIf",
        label: "EXIF Telemetry Segment",
        byteLength: length,
        offset,
        category: "camera-exif",
      });
    } else if (type === "iCCP" || type === "sRGB" || type === "gAMA" || type === "cHRM") {
      chunks.push({
        id: `png-${offset}`,
        marker: type,
        label: `Color Space Segment (${type})`,
        byteLength: length,
        offset,
        category: "color-profile",
      });
    } else if (type !== "IEND") {
      chunks.push({
        id: `png-${offset}`,
        marker: type,
        label: type === "IHDR" ? "PNG Image Header" : `PNG ${type} Chunk`,
        byteLength: length,
        offset,
        category: "image-stream",
      });
    }

    offset += 12 + length;
    if (type === "IEND") break;
  }

  if (idatCount > 0) {
    chunks.push({
      id: `png-idat`,
      marker: `IDAT ×${idatCount}`,
      label: "Compressed Pixel Bitstream",
      byteLength: idatBytes,
      offset: idatFirstOffset,
      category: "image-stream",
    });
  }

  return { exifPayload, xmpText };
}

function parseJpegSegments(
  buf: Buffer,
  chunks: BinaryChunkInfo[],
  tags: MetadataTagRow[],
  findings: AiFinding[],
  generators: Set<string>
): { xmpText?: string } {
  let offset = 2; // Skip 0xFFD8 SOI
  let xmpText: string | undefined;

  while (offset + 4 <= buf.length && buf[offset] === 0xff) {
    let markerByte = buf[offset + 1];
    while (markerByte === 0xff && offset + 2 < buf.length) {
      offset++;
      markerByte = buf[offset + 1];
    }
    if (markerByte === 0xd9) break; // EOI
    if (markerByte === 0xda) {
      // SOS -> compressed scan data to EOI
      chunks.push({
        id: `jpg-sos-${offset}`,
        marker: "SOS (0xFFDA)",
        label: "JPEG Entropy-Coded Scan Bitstream",
        byteLength: buf.length - offset,
        offset,
        category: "image-stream",
      });
      break;
    }

    if (
      markerByte === 0xd8 ||
      (markerByte >= 0xd0 && markerByte <= 0xd7) ||
      markerByte === 0x01
    ) {
      offset += 2;
      continue;
    }

    if (offset + 4 > buf.length) break;
    const segLen = buf.readUInt16BE(offset + 2);
    if (segLen < 2 || offset + 2 + segLen > buf.length) break;
    const payload = buf.subarray(offset + 4, offset + 2 + segLen);

    if (markerByte === 0xe0) {
      chunks.push({
        id: `jpg-${offset}`,
        marker: "APP0 (JFIF)",
        label: "JFIF Density Header",
        byteLength: segLen - 2,
        offset,
        category: "image-stream",
      });
    } else if (markerByte === 0xe1) {
      const headerAscii = payload.subarray(0, 32).toString("ascii");
      if (headerAscii.startsWith("Exif\0\0")) {
        chunks.push({
          id: `jpg-${offset}`,
          marker: "APP1 (EXIF)",
          label: "EXIF / TIFF Camera Telemetry IFD",
          byteLength: segLen - 2,
          offset,
          category: "camera-exif",
        });
      } else if (headerAscii.includes("http://ns.adobe.com/xap")) {
        const xmlStart = payload.indexOf(0) + 1;
        const xml = payload.subarray(xmlStart).toString("utf8");
        xmpText = (xmpText || "") + xml;
        scanTextForAiPatterns("JPEG APP1 XMP", "XMP Packet", xml, findings, generators);
        chunks.push({
          id: `jpg-${offset}`,
          marker: "APP1 (XMP)",
          label: "Adobe XMP Metadata Packet",
          byteLength: segLen - 2,
          offset,
          category: findings.some((f) => f.location === "JPEG APP1 XMP")
            ? "ai-provenance"
            : "xmp-iptc",
          preview: truncate(xml, 140),
        });
      } else {
        chunks.push({
          id: `jpg-${offset}`,
          marker: "APP1",
          label: "Application Segment 1",
          byteLength: segLen - 2,
          offset,
          category: "ancillary-text",
        });
      }
    } else if (markerByte === 0xe2) {
      chunks.push({
        id: `jpg-${offset}`,
        marker: "APP2 (ICC)",
        label: "ICC Color Profile",
        byteLength: segLen - 2,
        offset,
        category: "color-profile",
      });
    } else if (markerByte === 0xeb) {
      // APP11 = JPEG XT / JUMBF / C2PA Content Credentials!
      const rawLatin = payload.toString("latin1");
      scanTextForAiPatterns(
        "JPEG APP11 (JUMBF)",
        "C2PA Manifest",
        rawLatin + " c2pa jumbf",
        findings,
        generators
      );
      chunks.push({
        id: `jpg-${offset}`,
        marker: "APP11 (JUMBF/C2PA)",
        label: "C2PA Content Credentials Manifest",
        byteLength: segLen - 2,
        offset,
        category: "ai-provenance",
        preview: truncate(rawLatin, 120),
      });
      tags.push({
        group: "C2PA",
        tag: "APP11 JUMBF",
        hex: "0xFFEB",
        value: `${segLen - 2} bytes C2PA provenance segment`,
        isAiFlag: true,
      });
    } else if (markerByte === 0xed) {
      const rawStr = payload.toString("latin1");
      scanTextForAiPatterns("JPEG APP13 (IPTC)", "Photoshop IRB", rawStr, findings, generators);
      chunks.push({
        id: `jpg-${offset}`,
        marker: "APP13 (IPTC)",
        label: "Photoshop IRB / IPTC-IIM Metadata",
        byteLength: segLen - 2,
        offset,
        category: "xmp-iptc",
      });
    } else if (markerByte === 0xfe) {
      const comment = payload.toString("utf8");
      scanTextForAiPatterns("JPEG COM", "Comment", comment, findings, generators);
      chunks.push({
        id: `jpg-${offset}`,
        marker: "COM (0xFFFE)",
        label: "JPEG Comment Segment",
        byteLength: segLen - 2,
        offset,
        category: findings.some((f) => f.location === "JPEG COM")
          ? "ai-provenance"
          : "ancillary-text",
        preview: truncate(comment, 120),
      });
      tags.push({
        group: "JPEG",
        tag: "Comment",
        hex: "0xFFFE",
        value: truncate(comment, 240),
        isAiFlag: findings.some((f) => f.location === "JPEG COM"),
      });
    } else if (markerByte >= 0xe0 && markerByte <= 0xef) {
      chunks.push({
        id: `jpg-${offset}`,
        marker: `APP${markerByte - 0xe0}`,
        label: `JPEG Application Segment ${markerByte - 0xe0}`,
        byteLength: segLen - 2,
        offset,
        category: "ancillary-text",
      });
    }

    offset += 2 + segLen;
  }

  return { xmpText };
}

function parseWebpChunks(
  buf: Buffer,
  chunks: BinaryChunkInfo[],
  tags: MetadataTagRow[],
  findings: AiFinding[],
  generators: Set<string>
): { exifPayload?: Buffer; xmpText?: string } {
  let offset = 12;
  let exifPayload: Buffer | undefined;
  let xmpText: string | undefined;

  while (offset + 8 <= buf.length) {
    const fourcc = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const payload = buf.subarray(offset + 8, Math.min(buf.length, offset + 8 + size));

    if (fourcc === "EXIF") {
      exifPayload =
        payload.subarray(0, 6).toString("ascii") === "Exif\0\0"
          ? payload.subarray(6)
          : payload;
      chunks.push({
        id: `webp-${offset}`,
        marker: "EXIF",
        label: "WebP EXIF Telemetry Chunk",
        byteLength: size,
        offset,
        category: "camera-exif",
      });
    } else if (fourcc === "XMP ") {
      xmpText = payload.toString("utf8");
      scanTextForAiPatterns("WebP XMP", "XMP", xmpText, findings, generators);
      chunks.push({
        id: `webp-${offset}`,
        marker: "XMP ",
        label: "WebP XMP Metadata Packet",
        byteLength: size,
        offset,
        category: findings.some((f) => f.location === "WebP XMP")
          ? "ai-provenance"
          : "xmp-iptc",
        preview: truncate(xmpText, 140),
      });
    } else if (fourcc === "JUMB" || fourcc === "C2PA" || fourcc === "C2PM") {
      const rawStr = payload.toString("latin1");
      scanTextForAiPatterns(
        `WebP ${fourcc}`,
        "C2PA JUMBF",
        rawStr + " c2pa jumbf",
        findings,
        generators
      );
      chunks.push({
        id: `webp-${offset}`,
        marker: fourcc,
        label: "C2PA Content Credentials Chunk",
        byteLength: size,
        offset,
        category: "ai-provenance",
      });
      tags.push({
        group: "C2PA",
        tag: `RIFF ${fourcc}`,
        value: `${size} bytes C2PA provenance chunk`,
        isAiFlag: true,
      });
    } else if (fourcc === "ICCP") {
      chunks.push({
        id: `webp-${offset}`,
        marker: "ICCP",
        label: "ICC Color Profile",
        byteLength: size,
        offset,
        category: "color-profile",
      });
    } else {
      chunks.push({
        id: `webp-${offset}`,
        marker: fourcc,
        label:
          fourcc === "VP8X"
            ? "WebP Extended Header"
            : `WebP ${fourcc.trim()} Image Bitstream`,
        byteLength: size,
        offset,
        category: "image-stream",
      });
    }

    offset += 8 + size + (size % 2);
  }

  return { exifPayload, xmpText };
}

function parseMp4Container(
  buf: Buffer,
  chunks: BinaryChunkInfo[],
  tags: MetadataTagRow[],
  findings: AiFinding[],
  generators: Set<string>,
  exifSummary: ExifSummary
): { width?: number; height?: number; durationSec?: number } {
  let width: number | undefined;
  let height: number | undefined;
  let durationSec: number | undefined;

  function readBoxes(start: number, end: number, pathPrefix: string) {
    let pos = start;
    while (pos + 8 <= end) {
      let boxSize = buf.readUInt32BE(pos);
      const boxType = buf.toString("latin1", pos + 4, pos + 8);
      let headerSize = 8;

      if (boxSize === 1) {
        if (pos + 16 > end) break;
        const bigSize = Number(buf.readBigUInt64BE(pos + 8));
        boxSize = bigSize;
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = end - pos;
      }

      if (boxSize < headerSize || pos + boxSize > end) break;
      const payloadStart = pos + headerSize;
      const payloadEnd = pos + boxSize;
      const payload = buf.subarray(payloadStart, payloadEnd);
      const fullPath = pathPrefix ? `${pathPrefix}.${boxType}` : boxType;

      if (pathPrefix === "") {
        let cat: ChunkCategory = "video-container";
        let label = `ISO-BMFF ${boxType} Atom`;
        if (boxType === "ftyp") {
          const major = payload.toString("ascii", 0, Math.min(4, payload.length)).trim();
          label = `File Type Box (${major})`;
          tags.push({ group: "MP4", tag: "MajorBrand", value: major });
        } else if (boxType === "mdat") {
          label = "Media Data Bitstream (Audio/Video Samples)";
          cat = "image-stream";
        } else if (boxType === "moov") {
          label = "Movie Header & Track Container (moov)";
        } else if (boxType === "uuid" && payload.length >= 16) {
          const uuidHex = payload.subarray(0, 16).toString("hex");
          const bodyStr = payload.subarray(16).toString("latin1");
          if (uuidHex === C2PA_UUID_HEX || bodyStr.toLowerCase().includes("c2pa")) {
            cat = "ai-provenance";
            label = "C2PA JUMBF Provenance UUID Box";
            scanTextForAiPatterns(
              "MP4 uuid (C2PA)",
              "JUMBF Manifest",
              bodyStr + " c2pa jumbf",
              findings,
              generators
            );
            tags.push({
              group: "C2PA",
              tag: "UUID JUMBF",
              hex: "0xd8fec3d6",
              value: `${payload.length - 16} bytes C2PA video provenance manifest`,
              isAiFlag: true,
            });
          } else if (uuidHex === XMP_UUID_HEX) {
            const xmpStr = payload.subarray(16).toString("utf8");
            scanTextForAiPatterns("MP4 uuid (XMP)", "XMP", xmpStr, findings, generators);
            cat = findings.some((f) => f.location === "MP4 uuid (XMP)")
              ? "ai-provenance"
              : "xmp-iptc";
            label = "Adobe XMP UUID Box";
          }
        }

        chunks.push({
          id: `mp4-${pos}`,
          marker: boxType,
          label,
          byteLength: boxSize,
          offset: pos,
          category: cat,
        });
      }

      if (boxType === "moov" || boxType === "trak" || boxType === "mdia" || boxType === "minf") {
        readBoxes(payloadStart, payloadEnd, fullPath);
      } else if (boxType === "mvhd" && payload.length >= 20) {
        const version = payload[0];
        let createTime = 0;
        let timescale = 1;
        let duration = 0;
        if (version === 0) {
          createTime = payload.readUInt32BE(4);
          timescale = payload.readUInt32BE(12) || 1;
          duration = payload.readUInt32BE(16);
        } else if (version === 1 && payload.length >= 32) {
          createTime = Number(payload.readBigUInt64BE(4));
          timescale = payload.readUInt32BE(20) || 1;
          duration = Number(payload.readBigUInt64BE(24));
        }
        durationSec = Math.round((duration / timescale) * 10) / 10;

        if (createTime === 0) {
          tags.push({
            group: "QuickTime",
            tag: "CreationTime",
            value: "0 (1904-01-01 00:00:00 UTC — Synthetic Muxer Zero-Epoch)",
            isAiFlag: true,
          });
          findings.push({
            id: `mp4-zero-epoch-${findings.length}`,
            severity: "warning",
            generator: "Synthetic Video Muxer",
            location: "moov.mvhd",
            key: "CreationTime",
            snippet: "creation_time = 0 (1904-01-01T00:00:00Z)",
            explanation:
              "Real cameras write hardware RTC capture timestamps into mvhd/tkhd/mdhd. A zero-epoch (1904) timestamp indicates programmatic/AI container muxing.",
          });
        } else if (createTime > MAC_EPOCH_OFFSET_SEC) {
          const iso = new Date((createTime - MAC_EPOCH_OFFSET_SEC) * 1000).toISOString();
          exifSummary.dateTimeOriginal = exifSummary.dateTimeOriginal || iso;
          tags.push({
            group: "QuickTime",
            tag: "CreateDate",
            value: iso,
            isCameraCore: true,
          });
        }
      } else if (boxType === "tkhd" && payload.length >= 84) {
        const version = payload[0];
        const wOffset = version === 1 ? 88 : 76;
        if (payload.length >= wOffset + 8) {
          const w = payload.readUInt32BE(wOffset) >>> 16;
          const h = payload.readUInt32BE(wOffset + 4) >>> 16;
          if (w > 0 && h > 0) {
            width = w;
            height = h;
          }
        }
      } else if (boxType === "hdlr" && payload.length >= 24) {
        const handlerType = payload.toString("ascii", 8, 12);
        const handlerName = payload
          .subarray(24)
          .toString("utf8")
          .replace(/\0+$/g, "")
          .trim();
        if (handlerName && (handlerType === "vide" || handlerType === "soun")) {
          const isLavf =
            handlerName.toLowerCase().includes("lavf") ||
            handlerName.toLowerCase().includes("ffmpeg");
          scanTextForAiPatterns("moov.trak.mdia.hdlr", "HandlerName", handlerName, findings, generators);
          tags.push({
            group: "TrackHandler",
            tag: handlerType === "vide" ? "VideoHandler" : "AudioHandler",
            value: handlerName,
            isAiFlag: isLavf,
            isCameraCore: !isLavf,
          });
        }
      } else if (boxType === "udta") {
        chunks.push({
          id: `mp4-udta-${pos}`,
          marker: "moov.udta",
          label: "User Data & Camera Atom Container",
          byteLength: boxSize,
          offset: pos,
          category: "camera-exif",
        });
        parseMp4UdtaOrMeta(payload, fullPath, tags, findings, generators, exifSummary);
      } else if (boxType === "meta") {
        chunks.push({
          id: `mp4-meta-${pos}`,
          marker: fullPath,
          label: "QuickTime Metadata Dictionary (meta)",
          byteLength: boxSize,
          offset: pos,
          category: "camera-exif",
        });
        parseMp4MetaBox(payload, fullPath, tags, findings, generators, exifSummary);
      }

      pos += boxSize;
    }
  }

  readBoxes(0, buf.length, "");
  return { width, height, durationSec };
}

function parseMp4UdtaOrMeta(
  payload: Buffer,
  pathPrefix: string,
  tags: MetadataTagRow[],
  findings: AiFinding[],
  generators: Set<string>,
  exifSummary: ExifSummary
) {
  let pos = 0;
  while (pos + 8 <= payload.length) {
    const size = payload.readUInt32BE(pos);
    if (size < 8 || pos + size > payload.length) break;
    const rawType = payload.subarray(pos + 4, pos + 8);
    const typeAscii = rawType.toString("latin1");
    const inner = payload.subarray(pos + 8, pos + size);

    if (typeAscii === "meta") {
      // udta.meta usually has 4-byte version/flags header before hdlr/ilst
      const sub = inner[0] === 0 ? inner.subarray(4) : inner;
      parseMp4IlstContainer(sub, `${pathPrefix}.meta`, tags, findings, generators, exifSummary);
    } else if (typeAscii === "c2pa" || typeAscii === "XMP_") {
      const str = inner.toString("utf8");
      scanTextForAiPatterns(pathPrefix, typeAscii, str + " c2pa", findings, generators);
      tags.push({
        group: "MP4-udta",
        tag: typeAscii,
        value: truncate(str, 200),
        isAiFlag: true,
      });
    } else if (rawType[0] === 0xa9) {
      // QuickTime ©xyz, ©mak, ©mod, ©swr, ©too, ©cmt text atom
      const keyName = `©${rawType.subarray(1).toString("ascii")}`;
      const textVal =
        inner.length > 4 && inner.readUInt16BE(0) < inner.length
          ? inner.subarray(4).toString("utf8")
          : inner.toString("utf8");
      applyVideoAtomTag(keyName, textVal, tags, findings, generators, exifSummary);
    }

    pos += size;
  }
}

function parseMp4IlstContainer(
  buf: Buffer,
  pathPrefix: string,
  tags: MetadataTagRow[],
  findings: AiFinding[],
  generators: Set<string>,
  exifSummary: ExifSummary
) {
  let pos = 0;
  while (pos + 8 <= buf.length) {
    const size = buf.readUInt32BE(pos);
    if (size < 8 || pos + size > buf.length) break;
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const inner = buf.subarray(pos + 8, pos + size);

    if (type === "ilst") {
      let ipos = 0;
      while (ipos + 8 <= inner.length) {
        const isize = inner.readUInt32BE(ipos);
        if (isize < 8 || ipos + isize > inner.length) break;
        const rawKey = inner.subarray(ipos + 4, ipos + 8);
        const keyLabel =
          rawKey[0] === 0xa9
            ? `©${rawKey.subarray(1).toString("ascii")}`
            : rawKey.toString("ascii");
        const itemBody = inner.subarray(ipos + 8, ipos + isize);
        // Find nested 'data' atom
        if (itemBody.length >= 16 && itemBody.toString("ascii", 4, 8) === "data") {
          const dsize = itemBody.readUInt32BE(0);
          const val = itemBody.subarray(16, Math.min(itemBody.length, dsize)).toString("utf8");
          applyVideoAtomTag(keyLabel, val, tags, findings, generators, exifSummary);
        }
        ipos += isize;
      }
    }
    pos += size;
  }
}

function parseMp4MetaBox(
  payload: Buffer,
  pathPrefix: string,
  tags: MetadataTagRow[],
  findings: AiFinding[],
  generators: Set<string>,
  exifSummary: ExifSummary
) {
  // QuickTime 'mdta' keys + ilst (1-indexed keys) or standard 4-byte versioned meta
  const startOffset =
    payload.length >= 12 && payload.toString("ascii", 4, 8) === "hdlr" ? 0 : 4;
  const sub = payload.subarray(startOffset);
  const keyNames: string[] = [];

  let pos = 0;
  while (pos + 8 <= sub.length) {
    const size = sub.readUInt32BE(pos);
    if (size < 8 || pos + size > sub.length) break;
    const type = sub.toString("latin1", pos + 4, pos + 8);
    const inner = sub.subarray(pos + 8, pos + size);

    if (type === "keys" && inner.length >= 8) {
      const count = inner.readUInt32BE(4);
      let kpos = 8;
      for (let i = 0; i < count && kpos + 8 <= inner.length; i++) {
        const ksize = inner.readUInt32BE(kpos);
        if (ksize < 8 || kpos + ksize > inner.length) break;
        const kname = inner.subarray(kpos + 8, kpos + ksize).toString("utf8");
        keyNames.push(kname);
        kpos += ksize;
      }
    } else if (type === "ilst") {
      if (keyNames.length > 0) {
        let ipos = 0;
        while (ipos + 8 <= inner.length) {
          const isize = inner.readUInt32BE(ipos);
          if (isize < 8 || ipos + isize > inner.length) break;
          const keyIdx = inner.readUInt32BE(ipos + 4) - 1;
          const keyName = keyNames[keyIdx] || `key[${keyIdx + 1}]`;
          const itemBody = inner.subarray(ipos + 8, ipos + isize);
          if (itemBody.length >= 16 && itemBody.toString("ascii", 4, 8) === "data") {
            const dsize = itemBody.readUInt32BE(0);
            const val = itemBody
              .subarray(16, Math.min(itemBody.length, dsize))
              .toString("utf8");
            applyVideoAtomTag(keyName, val, tags, findings, generators, exifSummary);
          }
          ipos += isize;
        }
      } else {
        parseMp4IlstContainer(sub, pathPrefix, tags, findings, generators, exifSummary);
      }
    }
    pos += size;
  }
}

function applyVideoAtomTag(
  key: string,
  value: string,
  tags: MetadataTagRow[],
  findings: AiFinding[],
  generators: Set<string>,
  exifSummary: ExifSummary
) {
  const cleanVal = truncate(value, 240);
  scanTextForAiPatterns("MP4 Metadata", key, cleanVal, findings, generators);

  const isLavf =
    (key === "©too" || key.toLowerCase().includes("encoder") || key.toLowerCase().includes("software")) &&
    (cleanVal.toLowerCase().includes("lavf") || cleanVal.toLowerCase().includes("ffmpeg"));

  if (isLavf) {
    findings.push({
      id: `mp4-lavf-${findings.length}`,
      severity: "warning",
      generator: "FFmpeg / Lavf Encoder Signature",
      location: "moov.udta",
      key,
      snippet: cleanVal,
      explanation:
        "Software muxer signature (Lavf/FFmpeg) commonly left by cloud AI video render pipelines instead of camera firmware.",
    });
  }

  if (key === "©mak" || key === "com.apple.quicktime.make") {
    exifSummary.make = cleanVal;
  } else if (key === "©mod" || key === "com.apple.quicktime.model") {
    exifSummary.model = cleanVal;
  } else if (key === "©swr" || key === "com.apple.quicktime.software") {
    exifSummary.software = cleanVal;
  } else if (key === "©day" || key === "com.apple.quicktime.creationdate") {
    exifSummary.dateTimeOriginal = cleanVal;
  } else if (key === "©xyz" || key === "com.apple.quicktime.location.ISO6709") {
    exifSummary.gps = cleanVal;
  }

  tags.push({
    group: key.startsWith("com.apple") ? "QuickTime-mdta" : "MP4-ilst",
    tag: key,
    value: cleanVal,
    isAiFlag: isLavf || findings.some((f) => f.key === key),
    isCameraCore: [
      "©mak",
      "©mod",
      "©swr",
      "©day",
      "com.apple.quicktime.make",
      "com.apple.quicktime.model",
      "com.apple.quicktime.software",
      "com.apple.quicktime.creationdate",
    ].includes(key),
  });
}

export async function inspectMediaBuffer(
  buf: Buffer,
  filename = "upload"
): Promise<ForensicReport> {
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const { mediaType, format } = detectContainerFormat(buf, filename);

  const chunks: BinaryChunkInfo[] = [];
  const tags: MetadataTagRow[] = [];
  const findings: AiFinding[] = [];
  const generators = new Set<string>();
  const exifSummary: ExifSummary = {};

  let width: number | undefined;
  let height: number | undefined;
  let durationSec: number | undefined;

  if (mediaType === "video") {
    const mp4Info = parseMp4Container(
      buf,
      chunks,
      tags,
      findings,
      generators,
      exifSummary
    );
    width = mp4Info.width;
    height = mp4Info.height;
    durationSec = mp4Info.durationSec;
  } else {
    let extractedExifPayload: Buffer | undefined;
    let extractedXmpText: string | undefined;

    if (format === "PNG") {
      const res = parsePngChunks(buf, chunks, tags, findings, generators);
      extractedExifPayload = res.exifPayload;
      extractedXmpText = res.xmpText;
    } else if (format === "JPEG") {
      const res = parseJpegSegments(buf, chunks, tags, findings, generators);
      extractedXmpText = res.xmpText;
    } else if (format === "WEBP") {
      const res = parseWebpChunks(buf, chunks, tags, findings, generators);
      extractedExifPayload = res.exifPayload;
      extractedXmpText = res.xmpText;
    }

    // Read image dimensions cleanly via sharp
    try {
      const sMeta = await sharp(buf).metadata();
      width = sMeta.width;
      height = sMeta.height;
      if (!extractedExifPayload && sMeta.exif) {
        extractedExifPayload =
          sMeta.exif.subarray(0, 6).toString("ascii") === "Exif\0\0"
            ? sMeta.exif.subarray(6)
            : sMeta.exif;
      }
      if (!extractedXmpText && sMeta.xmp) {
        extractedXmpText = sMeta.xmp.toString("utf8");
        scanTextForAiPatterns("XMP", "XMP Packet", extractedXmpText, findings, generators);
      }
    } catch {
      // Ignore dimension read failure on malformed inputs
    }

    // Parse EXIF / TIFF / GPS / IPTC / XMP via exifr
    try {
      const parseTarget =
        format === "WEBP" && extractedExifPayload ? extractedExifPayload : buf;
      const parsed =
        format === "WEBP" && !extractedExifPayload
          ? null
          : await exifr.parse(parseTarget, {
              tiff: true,
              exif: true,
              gps: true,
              interop: true,
              iptc: true,
              xmp: true,
              mergeOutput: false,
            });

      if (parsed && typeof parsed === "object") {
        const groupOrder: Array<[string, Record<string, unknown> | undefined]> = [
          ["IFD0", parsed.ifd0],
          ["ExifIFD", parsed.exif],
          ["GPS", parsed.gps],
          ["Interop", parsed.interop],
          ["IPTC", parsed.iptc],
          ["XMP", parsed.xmp],
        ];

        for (const [groupName, groupObj] of groupOrder) {
          if (!groupObj || typeof groupObj !== "object") continue;
          for (const [k, rawV] of Object.entries(groupObj)) {
            if (rawV === undefined || rawV === null) continue;
            let formattedVal = "";
            if (rawV instanceof Date) {
              formattedVal = rawV.toISOString().replace(".000Z", " UTC");
            } else if (rawV instanceof Uint8Array || Buffer.isBuffer(rawV)) {
              const asUtf = Buffer.from(rawV).toString("utf8");
              formattedVal = /^[\x20-\x7E\s]+$/.test(asUtf)
                ? asUtf.trim()
                : `0x${Buffer.from(rawV).toString("hex").slice(0, 32)}`;
            } else if (Array.isArray(rawV)) {
              formattedVal = rawV.join(", ");
            } else if (typeof rawV === "object") {
              formattedVal = JSON.stringify(rawV);
            } else {
              formattedVal = String(rawV);
            }

            scanTextForAiPatterns(groupName, k, formattedVal, findings, generators);

            const isCameraCore = [
              "Make",
              "Model",
              "LensMake",
              "LensModel",
              "ExposureTime",
              "FNumber",
              "ISO",
              "ISOSpeedRatings",
              "FocalLength",
              "FocalLengthIn35mmFormat",
              "DateTimeOriginal",
              "ShutterSpeedValue",
              "ApertureValue",
              "Software",
            ].includes(k);

            tags.push({
              group: groupName,
              tag: k,
              hex: EXIF_TAG_HEX_MAP[k],
              value: truncate(formattedVal, 240),
              isAiFlag: findings.some((f) => f.key === k),
              isCameraCore,
            });
          }
        }

        const ifd0 = parsed.ifd0 || {};
        const exif = parsed.exif || {};
        const gps = parsed.gps || {};

        exifSummary.make = ifd0.Make ? String(ifd0.Make) : undefined;
        exifSummary.model = ifd0.Model ? String(ifd0.Model) : undefined;
        exifSummary.software = ifd0.Software ? String(ifd0.Software) : undefined;
        exifSummary.artist = ifd0.Artist ? String(ifd0.Artist) : undefined;
        exifSummary.copyright = ifd0.Copyright ? String(ifd0.Copyright) : undefined;

        exifSummary.lensMake = exif.LensMake ? String(exif.LensMake) : undefined;
        exifSummary.lensModel = exif.LensModel ? String(exif.LensModel) : undefined;
        exifSummary.exposureTime = formatExposureTimeDisplay(exif.ExposureTime);
        exifSummary.fNumber =
          typeof exif.FNumber === "number" ? `f/${exif.FNumber}` : undefined;
        exifSummary.iso =
          exif.ISO !== undefined
            ? `ISO ${exif.ISO}`
            : exif.ISOSpeedRatings !== undefined
            ? `ISO ${exif.ISOSpeedRatings}`
            : undefined;
        exifSummary.focalLength =
          typeof exif.FocalLength === "number"
            ? `${Number(exif.FocalLength.toFixed(2))} mm`
            : undefined;
        const fl35 = exif.FocalLengthIn35mmFormat ?? exif.FocalLengthIn35mmFilm;
        exifSummary.focalLength35mm =
          typeof fl35 === "number" ? `${fl35} mm` : undefined;
        exifSummary.dateTimeOriginal =
          exif.DateTimeOriginal instanceof Date
            ? exif.DateTimeOriginal.toISOString().replace("T", " ").slice(0, 19)
            : exif.DateTimeOriginal
            ? String(exif.DateTimeOriginal)
            : undefined;
        exifSummary.offsetTime = exif.OffsetTimeOriginal
          ? String(exif.OffsetTimeOriginal)
          : undefined;
        exifSummary.subSecTime = exif.SubSecTimeOriginal
          ? String(exif.SubSecTimeOriginal)
          : undefined;
        exifSummary.exposureProgram = exif.ExposureProgram
          ? String(exif.ExposureProgram)
          : undefined;
        exifSummary.meteringMode = exif.MeteringMode
          ? String(exif.MeteringMode)
          : undefined;
        exifSummary.flash = exif.Flash !== undefined ? String(exif.Flash) : undefined;
        exifSummary.whiteBalance =
          exif.WhiteBalance !== undefined ? String(exif.WhiteBalance) : undefined;
        exifSummary.colorSpace =
          exif.ColorSpace === 1 || exif.ColorSpace === "sRGB"
            ? "sRGB"
            : exif.ColorSpace
            ? String(exif.ColorSpace)
            : undefined;
        exifSummary.bodySerial =
          exif.SerialNumber || exif.BodySerialNumber
            ? String(exif.SerialNumber || exif.BodySerialNumber)
            : undefined;
        exifSummary.lensSerial = exif.LensSerialNumber
          ? String(exif.LensSerialNumber)
          : undefined;

        if (
          typeof gps.latitude === "number" &&
          typeof gps.longitude === "number"
        ) {
          exifSummary.gps = `${gps.latitude.toFixed(5)}°, ${gps.longitude.toFixed(5)}°`;
        }
      }
    } catch {
      // Ignore EXIF parse errors on corrupted segments
    }

    // Check filename heuristics as informational signal
    const lowerName = filename.toLowerCase();
    if (
      lowerName.includes("comfyui") ||
      lowerName.includes("midjourney") ||
      lowerName.includes("dall-e") ||
      lowerName.includes("dalle") ||
      lowerName.includes("firefly") ||
      lowerName.includes("chatgpt")
    ) {
      findings.push({
        id: `filename-ai-${findings.length}`,
        severity: "warning",
        generator: "AI Filename Convention",
        location: "Filename",
        key: "Original Filename",
        snippet: filename,
        explanation:
          "Filename follows a known AI generator naming convention instead of a DCIM camera roll pattern (e.g. IMG_4821.JPG / DSC03914.JPG).",
      });
    }

    // Check container anomaly: PNG/WebP without camera Make/Model
    if ((format === "PNG" || format === "WEBP") && !exifSummary.make) {
      findings.push({
        id: `container-hint-${findings.length}`,
        severity: "info",
        generator: "Non-Camera Container",
        location: `${format} Header`,
        key: "Container Format",
        snippet: `${format} without camera EXIF`,
        explanation: `Digital cameras record photos in JPEG, HEIC, or RAW—whereas AI tools predominantly export ${format} files without optical EXIF.`,
      });
    }
  }

  // Deduplicate findings by location+key+generator
  const seenFindingKeys = new Set<string>();
  const uniqueFindings = findings.filter((f) => {
    const sig = `${f.generator}|${f.location}|${f.key}`;
    if (seenFindingKeys.has(sig)) return false;
    seenFindingKeys.add(sig);
    return true;
  });

  // Compute authenticity status & AI risk score
  const criticalCount = uniqueFindings.filter((f) => f.severity === "critical").length;
  const warningCount = uniqueFindings.filter((f) => f.severity === "warning").length;
  const hasCameraMakeAndModel = Boolean(exifSummary.make && exifSummary.model);
  const hasOpticalTelemetry = Boolean(
    exifSummary.exposureTime || exifSummary.fNumber || exifSummary.iso || mediaType === "video"
  );

  let aiRiskScore = 0;
  let authenticityStatus: ForensicReport["authenticityStatus"] = "stripped";

  if (criticalCount > 0) {
    aiRiskScore = Math.min(100, 75 + criticalCount * 10 + warningCount * 5);
    authenticityStatus = "ai-detected";
  } else if (warningCount > 0) {
    aiRiskScore = Math.min(70, 35 + warningCount * 15);
    authenticityStatus = "suspicious";
  } else if (hasCameraMakeAndModel && hasOpticalTelemetry) {
    aiRiskScore = 4;
    authenticityStatus = "camera-verified";
  } else {
    aiRiskScore = 22;
    authenticityStatus = "stripped";
  }

  return {
    filename,
    mediaType,
    containerFormat: format,
    byteSize: buf.length,
    sha256,
    width,
    height,
    durationSec,
    authenticityStatus,
    aiRiskScore,
    detectedGenerators: Array.from(generators),
    aiFindings: uniqueFindings,
    chunks,
    exifSummary,
    tags,
  };
}
