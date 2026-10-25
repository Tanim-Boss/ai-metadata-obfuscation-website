import crypto from "crypto";
import sharp from "sharp";
import * as piexif from "piexifjs";
import {
  type TelemetryOptions,
  GPS_PRESETS,
  compute35mmEquivalent,
  exposureTimeToApex,
  fNumberToApex,
  floatToRational,
  formatExifDateTime,
  generateCameraFilename,
  generateSerialNumber,
  getCameraProfile,
  getLensForProfile,
  parseShutterSpeed,
} from "./camera-profiles";
import { type ForensicReport, inspectMediaBuffer } from "./metadata-inspector";

// Register EXIF 2.31+ timezone offset tags in piexifjs dictionary
piexif.TAGS.Exif[36880] = { name: "OffsetTime", type: "Ascii" };
piexif.TAGS.Exif[36881] = { name: "OffsetTimeOriginal", type: "Ascii" };
piexif.TAGS.Exif[36882] = { name: "OffsetTimeDigitized", type: "Ascii" };

// Precomputed CRC32 lookup table for PNG chunk synthesis
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function insertExifIntoPng(pngBuf: Buffer, tiffBuf: Buffer): Buffer {
  const type = Buffer.from("eXIf", "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(tiffBuf.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([type, tiffBuf])), 0);
  const exifChunk = Buffer.concat([len, type, tiffBuf, crcBuf]);

  let offset = 8;
  while (offset + 8 <= pngBuf.length) {
    const chunkLen = pngBuf.readUInt32BE(offset);
    const chunkType = pngBuf.toString("ascii", offset + 4, offset + 8);
    if (chunkType === "IDAT") {
      return Buffer.concat([
        pngBuf.subarray(0, offset),
        exifChunk,
        pngBuf.subarray(offset),
      ]);
    }
    offset += 12 + chunkLen;
  }
  return pngBuf;
}

function makeRiffChunk(fourcc: string, payload: Buffer): Buffer {
  const pad = payload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  const hdr = Buffer.alloc(8);
  hdr.write(fourcc, 0, 4, "ascii");
  hdr.writeUInt32LE(payload.length, 4);
  return Buffer.concat([hdr, payload, pad]);
}

function insertExifIntoWebp(
  webpBuf: Buffer,
  tiffBuf: Buffer,
  width: number,
  height: number,
  hasAlpha: boolean
): Buffer {
  const firstChunk = webpBuf.toString("ascii", 12, 16);
  let body: Buffer;

  if (firstChunk === "VP8X") {
    const copy = Buffer.from(webpBuf.subarray(12));
    copy[8] |= 0x08; // Bit 3 = EXIF present
    body = Buffer.concat([copy, makeRiffChunk("EXIF", tiffBuf)]);
  } else {
    const vp8xPayload = Buffer.alloc(10, 0);
    vp8xPayload[0] = 0x08 | (hasAlpha ? 0x10 : 0x00);
    vp8xPayload.writeUIntLE(Math.max(0, width - 1), 4, 3);
    vp8xPayload.writeUIntLE(Math.max(0, height - 1), 7, 3);
    body = Buffer.concat([
      makeRiffChunk("VP8X", vp8xPayload),
      webpBuf.subarray(12),
      makeRiffChunk("EXIF", tiffBuf),
    ]);
  }

  const riffHdr = Buffer.alloc(12);
  riffHdr.write("RIFF", 0, 4, "ascii");
  riffHdr.writeUInt32LE(4 + body.length, 4);
  riffHdr.write("WEBP", 8, 4, "ascii");
  return Buffer.concat([riffHdr, body]);
}

function applySubtleSensorGrain(
  pixels: Buffer,
  channels: number,
  iso: number
): void {
  // Subtle organic luminance micro-grain matching camera CMOS read noise (~0.8 - 1.8 LSB)
  const sigma = Math.min(2.2, Math.max(0.75, Math.sqrt(iso / 100) * 0.95));
  // Fast deterministic-ish PRNG (xorshift32 seeded randomly per render)
  let state = crypto.randomBytes(4).readUInt32LE(0) || 0x9e3779b9;
  const nextRand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  for (let i = 0; i < pixels.length; i += channels) {
    // Triangular approximation to Gaussian in [-2*sigma, +2*sigma] — ultra fast & zero outliers
    const n = (nextRand() + nextRand() - 1.0) * sigma * 1.6;
    const delta = Math.round(n);
    if (delta === 0) continue;
    const r = pixels[i] + delta;
    const g = pixels[i + 1] + delta;
    const b = pixels[i + 2] + delta;
    pixels[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    pixels[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    pixels[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
}

export interface ProcessedImageResult {
  outputBuffer: Buffer;
  outputFilename: string;
  mimeType: string;
  beforeReport: ForensicReport;
  afterReport: ForensicReport;
}

export async function processImageBuffer(
  inputBuffer: Buffer,
  originalFilename: string,
  options: TelemetryOptions
): Promise<ProcessedImageResult> {
  const beforeReport = await inspectMediaBuffer(inputBuffer, originalFilename);

  const profile = getCameraProfile(options.profileId);
  const lens = getLensForProfile(profile, options.lensId);

  // Resolve target container format
  let targetFormat: "jpeg" | "png" | "webp" = "jpeg";
  if (options.outputFormat === "png") {
    targetFormat = "png";
  } else if (options.outputFormat === "webp") {
    targetFormat = "webp";
  } else if (options.outputFormat === "keep") {
    if (beforeReport.containerFormat === "PNG") targetFormat = "png";
    else if (beforeReport.containerFormat === "WEBP") targetFormat = "webp";
    else targetFormat = "jpeg";
  }

  // 1. Decode to raw uncompressed pixel matrix — strips 100% of container metadata & ancillary chunks
  let pipeline = sharp(inputBuffer, { failOn: "none" })
    .rotate() // Bake orientation into pixels and reset Orientation=1
    .toColorspace("srgb");

  // Flatten alpha onto white if converting RGBA PNG/WebP to JPEG
  if (targetFormat === "jpeg") {
    pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  const { data: rawPixels, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });

  const iso =
    options.iso && options.iso > 0 ? Math.round(options.iso) : profile.baseIso;

  if (options.addSensorGrain) {
    applySubtleSensorGrain(rawPixels, info.channels, iso);
  }

  // 2. Compute internally coherent optical & exposure values
  const focalMm =
    options.focalLengthMm && options.focalLengthMm > 0
      ? options.focalLengthMm
      : lens.defaultFocalMm;
  const fNumber =
    options.fNumber && options.fNumber > 0
      ? options.fNumber
      : lens.defaultFNumber;
  const shutterStr =
    options.shutterSpeed ||
    profile.shutterPresets[
      Math.min(4, Math.max(0, profile.shutterPresets.length - 1))
    ] ||
    "1/250";
  const [expNum, expDen] = parseShutterSpeed(shutterStr);

  // Capture date/time & timezone offset
  let captureDate = new Date();
  if (options.captureTimestamp) {
    const parsed = new Date(options.captureTimestamp);
    if (!Number.isNaN(parsed.getTime())) {
      captureDate = parsed;
    }
  } else {
    // Subtract a realistic random offset (14 to 190 minutes ago) so capture timestamp isn't identical to upload second
    captureDate = new Date(
      Date.now() - Math.floor((14 + Math.random() * 176) * 60 * 1000)
    );
  }

  let tzOffset = options.timezoneOffset || "+00:00";
  if (options.gpsMode === "preset" && options.gpsPresetId) {
    const preset = GPS_PRESETS.find((g) => g.id === options.gpsPresetId);
    if (preset && !options.timezoneOffset) {
      tzOffset = preset.timezoneOffset;
    }
  }

  const exifDateStr = formatExifDateTime(captureDate);
  const subSec = Math.floor(100 + Math.random() * 899).toString();
  const focal35mm = compute35mmEquivalent(focalMm, profile);
  const shutterApex = exposureTimeToApex(expNum, expDen);
  const apertureApex = fNumberToApex(fNumber);
  const maxApertureApex = fNumberToApex(lens.minFNumberAtMin);
  const expSeconds = expNum / expDen;
  const evBrightness =
    Math.log2((fNumber * fNumber) / expSeconds) - Math.log2(iso / 100);
  const exposureBias = options.exposureBiasEv ?? 0;

  // Sensor focal plane resolution in pixels/cm (unit = 3)
  const fpXRes: [number, number] = [
    Math.round((info.width / (profile.sensorWidthMm / 10)) * 100),
    100,
  ];
  const fpYRes: [number, number] = [
    Math.round((info.height / (profile.sensorHeightMm / 10)) * 100),
    100,
  ];

  const includeSerials = options.includeSerialNumbers !== false;
  const bodySerial =
    options.customBodySerial?.trim() ||
    (includeSerials
      ? generateSerialNumber(profile.serialPrefix, profile.serialDigits)
      : "");
  const lensSerial =
    options.customLensSerial?.trim() ||
    (includeSerials ? generateSerialNumber(lens.serialPrefix, 4) : "");

  // 3. Build 0th IFD
  const zeroth: piexif.ExifTagMap = {
    [piexif.ImageIFD.Make]: profile.make,
    [piexif.ImageIFD.Model]: profile.model,
    [piexif.ImageIFD.Orientation]: 1,
    [piexif.ImageIFD.XResolution]: [profile.dpi, 1],
    [piexif.ImageIFD.YResolution]: [profile.dpi, 1],
    [piexif.ImageIFD.ResolutionUnit]: 2, // Inches
    [piexif.ImageIFD.Software]: profile.software,
    [piexif.ImageIFD.DateTime]: exifDateStr,
    [piexif.ImageIFD.YCbCrPositioning]: profile.ycbcrPositioning,
  };

  if (options.artist?.trim()) {
    zeroth[piexif.ImageIFD.Artist] = options.artist.trim();
  }
  if (options.copyright?.trim()) {
    zeroth[piexif.ImageIFD.Copyright] = options.copyright.trim();
  }

  // 4. Build Exif SubIFD
  const exifIfd: piexif.ExifTagMap = {
    [piexif.ExifIFD.ExposureTime]: [expNum, expDen],
    [piexif.ExifIFD.FNumber]: floatToRational(fNumber, 100),
    [piexif.ExifIFD.ExposureProgram]: options.exposureProgram ?? 3, // Aperture Priority AE
    [piexif.ExifIFD.ISOSpeedRatings]: iso,
    [piexif.ExifIFD.SensitivityType]: 2,
    [piexif.ExifIFD.RecommendedExposureIndex]: iso,
    [piexif.ExifIFD.ExifVersion]: "0232",
    [piexif.ExifIFD.DateTimeOriginal]: exifDateStr,
    [piexif.ExifIFD.DateTimeDigitized]: exifDateStr,
    36880: tzOffset, // OffsetTime
    36881: tzOffset, // OffsetTimeOriginal
    36882: tzOffset, // OffsetTimeDigitized
    [piexif.ExifIFD.ComponentsConfiguration]: "\x01\x02\x03\x00",
    [piexif.ExifIFD.ShutterSpeedValue]: shutterApex,
    [piexif.ExifIFD.ApertureValue]: apertureApex,
    [piexif.ExifIFD.BrightnessValue]: [Math.round(evBrightness * 100), 100],
    [piexif.ExifIFD.ExposureBiasValue]: [Math.round(exposureBias * 10), 10],
    [piexif.ExifIFD.MaxApertureValue]: maxApertureApex,
    [piexif.ExifIFD.MeteringMode]: options.meteringMode ?? 5,
    [piexif.ExifIFD.LightSource]: 0,
    [piexif.ExifIFD.Flash]: options.flash ?? 16,
    [piexif.ExifIFD.FocalLength]: floatToRational(focalMm, 1000),
    [piexif.ExifIFD.SubSecTime]: subSec,
    [piexif.ExifIFD.SubSecTimeOriginal]: subSec,
    [piexif.ExifIFD.SubSecTimeDigitized]: subSec,
    [piexif.ExifIFD.FlashpixVersion]: "0100",
    [piexif.ExifIFD.ColorSpace]: 1, // sRGB
    [piexif.ExifIFD.PixelXDimension]: info.width,
    [piexif.ExifIFD.PixelYDimension]: info.height,
    [piexif.ExifIFD.FocalPlaneXResolution]: fpXRes,
    [piexif.ExifIFD.FocalPlaneYResolution]: fpYRes,
    [piexif.ExifIFD.FocalPlaneResolutionUnit]: 3, // cm
    [piexif.ExifIFD.SensingMethod]: 2, // One-chip color area sensor
    [piexif.ExifIFD.FileSource]: "\x03", // Digital Still Camera
    [piexif.ExifIFD.SceneType]: "\x01", // Directly photographed image
    [piexif.ExifIFD.CustomRendered]: 0,
    [piexif.ExifIFD.ExposureMode]: options.exposureProgram === 1 ? 1 : 0,
    [piexif.ExifIFD.WhiteBalance]: options.whiteBalance ?? 0,
    [piexif.ExifIFD.FocalLengthIn35mmFilm]: focal35mm,
    [piexif.ExifIFD.SceneCaptureType]: 0,
    [piexif.ExifIFD.Contrast]: 0,
    [piexif.ExifIFD.Saturation]: 0,
    [piexif.ExifIFD.Sharpness]: 0,
    [piexif.ExifIFD.ImageUniqueID]: crypto.randomBytes(16).toString("hex"),
    [piexif.ExifIFD.LensSpecification]: [
      floatToRational(lens.minFocalMm, 1000),
      floatToRational(lens.maxFocalMm, 1000),
      floatToRational(lens.minFNumberAtMin, 100),
      floatToRational(lens.minFNumberAtMax, 100),
    ],
    [piexif.ExifIFD.LensMake]: lens.lensMake,
    [piexif.ExifIFD.LensModel]: lens.lensModel,
  };

  if (bodySerial) {
    exifIfd[piexif.ExifIFD.BodySerialNumber] = bodySerial;
  }
  if (lensSerial) {
    exifIfd[piexif.ExifIFD.LensSerialNumber] = lensSerial;
  }

  // 5. Build Optional GPS IFD
  const gpsIfd: piexif.ExifTagMap = {};
  let lat: number | undefined;
  let lng: number | undefined;
  let alt = 18.0;

  if (options.gpsMode === "preset" && options.gpsPresetId) {
    const preset = GPS_PRESETS.find((g) => g.id === options.gpsPresetId);
    if (preset) {
      // Add tiny realistic GPS jitter (~15 meters) so shots aren't identical down to the millimeter
      lat = preset.lat + (Math.random() - 0.5) * 0.0003;
      lng = preset.lng + (Math.random() - 0.5) * 0.0003;
      alt = preset.altitudeM + (Math.random() - 0.5) * 1.2;
    }
  } else if (
    options.gpsMode === "custom" &&
    typeof options.customLat === "number" &&
    typeof options.customLng === "number" &&
    Number.isFinite(options.customLat) &&
    Number.isFinite(options.customLng)
  ) {
    lat = Math.max(-90, Math.min(90, options.customLat));
    lng = Math.max(-180, Math.min(180, options.customLng));
    alt =
      typeof options.customAltitudeM === "number" &&
      Number.isFinite(options.customAltitudeM)
        ? options.customAltitudeM
        : 15.0;
  }

  if (lat !== undefined && lng !== undefined) {
    const pad = (n: number) => n.toString().padStart(2, "0");
    gpsIfd[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
    gpsIfd[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
    gpsIfd[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(
      Math.abs(lat)
    );
    gpsIfd[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
    gpsIfd[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(
      Math.abs(lng)
    );
    gpsIfd[piexif.GPSIFD.GPSAltitudeRef] = alt >= 0 ? 0 : 1;
    gpsIfd[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(alt) * 100), 100];
    gpsIfd[piexif.GPSIFD.GPSTimeStamp] = [
      [captureDate.getUTCHours(), 1],
      [captureDate.getUTCMinutes(), 1],
      [captureDate.getUTCSeconds(), 1],
    ];
    gpsIfd[piexif.GPSIFD.GPSDateStamp] = `${captureDate.getUTCFullYear()}:${pad(
      captureDate.getUTCMonth() + 1
    )}:${pad(captureDate.getUTCDate())}`;
    gpsIfd[piexif.GPSIFD.GPSMapDatum] = "WGS-84";
  }

  // 6. Dump binary EXIF
  const exifBinaryStr = piexif.dump({
    "0th": zeroth,
    Exif: exifIfd,
    GPS: gpsIfd,
    Interop: {
      [piexif.InteropIFD.InteroperabilityIndex]: "R98",
    },
  });
  const exifFullBuffer = Buffer.from(exifBinaryStr, "binary");
  const tiffOnlyBuffer = exifFullBuffer.subarray(6); // Strip "Exif\0\0" for PNG eXIf & WebP EXIF

  // 7. Encode clean image from raw pixel matrix & inject camera EXIF
  const rawSource = sharp(rawPixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  });

  const quality = Math.min(
    100,
    Math.max(80, Math.round(options.jpegQuality ?? 96))
  );

  let outputBuffer: Buffer;
  let mimeType: string;
  let ext: string;

  if (targetFormat === "png") {
    const cleanPng = await rawSource
      .png({ compressionLevel: 8 })
      .toBuffer();
    outputBuffer = insertExifIntoPng(cleanPng, tiffOnlyBuffer);
    mimeType = "image/png";
    ext = "PNG";
  } else if (targetFormat === "webp") {
    const cleanWebp = await rawSource
      .webp({ quality })
      .toBuffer();
    outputBuffer = insertExifIntoWebp(
      cleanWebp,
      tiffOnlyBuffer,
      info.width,
      info.height,
      info.channels === 4
    );
    mimeType = "image/webp";
    ext = "WEBP";
  } else {
    const cleanJpeg = await rawSource
      .jpeg({
        quality,
        chromaSubsampling: quality >= 95 ? "4:4:4" : "4:2:2",
        mozjpeg: false, // Standard camera baseline DCT Huffman tables rather than mozjpeg web tables!
      })
      .toBuffer();
    const inDataUri = `data:image/jpeg;base64,${cleanJpeg.toString("base64")}`;
    const outDataUri = piexif.insert(exifBinaryStr, inDataUri);
    outputBuffer = Buffer.from(outDataUri.split(",")[1], "base64");
    mimeType = "image/jpeg";
    ext = "JPG";
  }

  // 8. Generate camera-accurate filename or preserve cleaned stem
  let outputFilename: string;
  if (options.renameToCameraConvention !== false) {
    outputFilename = generateCameraFilename(profile, ext, false, captureDate);
  } else {
    const baseStem = originalFilename.replace(/\.[^.]+$/, "") || "photo";
    outputFilename = `${baseStem}_camera.${ext.toLowerCase()}`;
  }

  // 9. Re-verify output buffer with full forensic inspector
  const afterReport = await inspectMediaBuffer(outputBuffer, outputFilename);

  return {
    outputBuffer,
    outputFilename,
    mimeType,
    beforeReport,
    afterReport,
  };
}
