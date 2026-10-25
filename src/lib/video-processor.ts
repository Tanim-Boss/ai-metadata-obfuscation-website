import {
  type TelemetryOptions,
  GPS_PRESETS,
  generateCameraFilename,
  getCameraProfile,
} from "./camera-profiles";
import { type ForensicReport, inspectMediaBuffer } from "./metadata-inspector";

const MAC_EPOCH_OFFSET_SEC = 2082844800; // 1904-01-01 to 1970-01-01

interface RawBox {
  type: string;
  rawType: Buffer;
  offset: number;
  size: number;
  headerSize: number;
  payload: Buffer;
}

function readChildBoxes(buf: Buffer, start = 0, end = buf.length): RawBox[] {
  const boxes: RawBox[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const rawType = buf.subarray(pos + 4, pos + 8);
    const type = rawType.toString("latin1");
    let headerSize = 8;

    if (size === 1) {
      if (pos + 16 > end) break;
      size = Number(buf.readBigUInt64BE(pos + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }

    if (size < headerSize || pos + size > end) break;
    boxes.push({
      type,
      rawType: Buffer.from(rawType),
      offset: pos,
      size,
      headerSize,
      payload: buf.subarray(pos + headerSize, pos + size),
    });
    pos += size;
  }
  return boxes;
}

function makeBox(typeOrRaw: string | Buffer, payload: Buffer): Buffer {
  const total = 8 + payload.length;
  const out = Buffer.alloc(total);
  out.writeUInt32BE(total, 0);
  if (typeof typeOrRaw === "string") {
    out.write(typeOrRaw, 4, 4, "latin1");
  } else {
    typeOrRaw.copy(out, 4, 0, 4);
  }
  payload.copy(out, 8);
  return out;
}

function patchTimestampBox(payload: Buffer, macTimestampSec: number): Buffer {
  const copy = Buffer.from(payload);
  if (copy.length < 12) return copy;
  const version = copy[0];
  if (version === 0) {
    const clamped = macTimestampSec >>> 0;
    copy.writeUInt32BE(clamped, 4); // creation_time
    copy.writeUInt32BE(clamped, 8); // modification_time
  } else if (version === 1 && copy.length >= 20) {
    const big = BigInt(macTimestampSec);
    copy.writeBigUInt64BE(big, 4);
    copy.writeBigUInt64BE(big, 12);
  }
  return copy;
}

function rewriteHdlrPayload(
  payload: Buffer,
  videoHandlerName: string,
  audioHandlerName: string
): Buffer {
  if (payload.length < 24) return Buffer.from(payload);
  const handlerType = payload.toString("ascii", 8, 12);
  if (handlerType !== "vide" && handlerType !== "soun") {
    return Buffer.from(payload);
  }
  const targetName =
    handlerType === "vide" ? videoHandlerName : audioHandlerName;
  const prefix = Buffer.from(payload.subarray(0, 24));
  // Preserve QuickTime Pascal-string vs MP4 null-terminated convention:
  // Null-terminated UTF-8 string works cleanly in ISO-BMFF & FFprobe
  const nameBuf = Buffer.from(`${targetName}\0`, "utf8");
  return Buffer.concat([prefix, nameBuf]);
}

function buildDataAtom(utf8Value: string): Buffer {
  const strBytes = Buffer.from(utf8Value, "utf8");
  const header = Buffer.alloc(8, 0);
  header.writeUInt32BE(1, 0); // Type indicator 1 = UTF-8 text
  header.writeUInt32BE(0, 4); // Locale 0
  return makeBox("data", Buffer.concat([header, strBytes]));
}

function buildQuickTimeMdtaMetaBox(entries: Array<[string, string]>): Buffer {
  // hdlr box for 'mdta'
  const hdlrPayload = Buffer.alloc(25, 0);
  hdlrPayload.write("mdta", 8, 4, "ascii");
  const hdlrBox = makeBox("hdlr", hdlrPayload);

  // keys box (1-indexed)
  const keyAtoms = entries.map(([key]) =>
    makeBox("mdta", Buffer.from(key, "utf8"))
  );
  const keysHeader = Buffer.alloc(8, 0);
  keysHeader.writeUInt32BE(entries.length, 4);
  const keysBox = makeBox("keys", Buffer.concat([keysHeader, ...keyAtoms]));

  // ilst box with 1-indexed 4-byte big-endian item IDs
  const ilstItems = entries.map(([, val], idx) => {
    const idBuf = Buffer.alloc(4);
    idBuf.writeUInt32BE(idx + 1, 0);
    return makeBox(idBuf, buildDataAtom(val));
  });
  const ilstBox = makeBox("ilst", Buffer.concat(ilstItems));

  return makeBox("meta", Buffer.concat([hdlrBox, keysBox, ilstBox]));
}

function buildIsoUdtaBox(entries: Array<[Buffer, string]>): Buffer {
  // hdlr for 'mdir' / 'appl'
  const hdlrPayload = Buffer.alloc(25, 0);
  hdlrPayload.write("mdir", 8, 4, "ascii");
  hdlrPayload.write("appl", 12, 4, "ascii");
  const hdlrBox = makeBox("hdlr", hdlrPayload);

  const ilstItems = entries.map(([rawFourcc, val]) =>
    makeBox(rawFourcc, buildDataAtom(val))
  );
  const ilstBox = makeBox("ilst", Buffer.concat(ilstItems));

  const versionFlags = Buffer.alloc(4, 0);
  const metaBox = makeBox(
    "meta",
    Buffer.concat([versionFlags, hdlrBox, ilstBox])
  );
  return makeBox("udta", metaBox);
}

function formatIso6709(lat: number, lng: number, alt: number): string {
  const latStr = `${lat >= 0 ? "+" : "-"}${Math.abs(lat).toFixed(4).padStart(7, "0")}`;
  const lngStr = `${lng >= 0 ? "+" : "-"}${Math.abs(lng).toFixed(4).padStart(8, "0")}`;
  const altStr = `${alt >= 0 ? "+" : "-"}${Math.abs(alt).toFixed(1)}`;
  return `${latStr}${lngStr}${altStr}/`;
}

function sanitizeMdia(
  mdiaPayload: Buffer,
  macTs: number,
  videoHandler: string,
  audioHandler: string
): Buffer {
  const children = readChildBoxes(mdiaPayload);
  const out: Buffer[] = [];
  for (const child of children) {
    if (child.type === "udta" || child.type === "meta" || child.type === "uuid") {
      continue;
    }
    if (child.type === "mdhd") {
      out.push(makeBox("mdhd", patchTimestampBox(child.payload, macTs)));
    } else if (child.type === "hdlr") {
      out.push(
        makeBox(
          "hdlr",
          rewriteHdlrPayload(child.payload, videoHandler, audioHandler)
        )
      );
    } else {
      out.push(makeBox(child.rawType, child.payload));
    }
  }
  return Buffer.concat(out);
}

function sanitizeTrak(
  trakPayload: Buffer,
  macTs: number,
  videoHandler: string,
  audioHandler: string
): Buffer {
  const children = readChildBoxes(trakPayload);
  const out: Buffer[] = [];
  for (const child of children) {
    if (child.type === "udta" || child.type === "meta" || child.type === "uuid") {
      continue;
    }
    if (child.type === "tkhd") {
      out.push(makeBox("tkhd", patchTimestampBox(child.payload, macTs)));
    } else if (child.type === "mdia") {
      out.push(
        makeBox(
          "mdia",
          sanitizeMdia(child.payload, macTs, videoHandler, audioHandler)
        )
      );
    } else {
      out.push(makeBox(child.rawType, child.payload));
    }
  }
  return Buffer.concat(out);
}

function shiftChunkOffsetsInPlace(
  buf: Buffer,
  start: number,
  end: number,
  mdatShifts: Array<{ oldStart: number; oldEnd: number; delta: number }>
): void {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > end) break;
      size = Number(buf.readBigUInt64BE(pos + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) break;

    const payloadStart = pos + headerSize;
    const payloadEnd = pos + size;

    if (["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf"].includes(type)) {
      shiftChunkOffsetsInPlace(buf, payloadStart, payloadEnd, mdatShifts);
    } else if (type === "stco" && payloadEnd - payloadStart >= 8) {
      const count = buf.readUInt32BE(payloadStart + 4);
      for (let i = 0; i < count; i++) {
        const entryPos = payloadStart + 8 + i * 4;
        if (entryPos + 4 > payloadEnd) break;
        const origOffset = buf.readUInt32BE(entryPos);
        for (const m of mdatShifts) {
          if (origOffset >= m.oldStart && origOffset < m.oldEnd) {
            buf.writeUInt32BE((origOffset + m.delta) >>> 0, entryPos);
            break;
          }
        }
      }
    } else if (type === "co64" && payloadEnd - payloadStart >= 8) {
      const count = buf.readUInt32BE(payloadStart + 4);
      for (let i = 0; i < count; i++) {
        const entryPos = payloadStart + 8 + i * 8;
        if (entryPos + 8 > payloadEnd) break;
        const origOffset = Number(buf.readBigUInt64BE(entryPos));
        for (const m of mdatShifts) {
          if (origOffset >= m.oldStart && origOffset < m.oldEnd) {
            buf.writeBigUInt64BE(BigInt(origOffset + m.delta), entryPos);
            break;
          }
        }
      }
    }

    pos += size;
  }
}

export interface ProcessedVideoResult {
  outputBuffer: Buffer;
  outputFilename: string;
  mimeType: string;
  beforeReport: ForensicReport;
  afterReport: ForensicReport;
}

export async function processVideoBuffer(
  inputBuffer: Buffer,
  originalFilename: string,
  options: TelemetryOptions
): Promise<ProcessedVideoResult> {
  const beforeReport = await inspectMediaBuffer(inputBuffer, originalFilename);
  const profile = getCameraProfile(options.profileId);

  const topBoxes = readChildBoxes(inputBuffer);
  if (topBoxes.length === 0 || !topBoxes.some((b) => b.type === "moov")) {
    throw new Error(
      "Unsupported video container. Please upload a valid MP4 or QuickTime MOV file."
    );
  }

  let captureDate = new Date();
  if (options.captureTimestamp) {
    const parsed = new Date(options.captureTimestamp);
    if (!Number.isNaN(parsed.getTime())) captureDate = parsed;
  } else {
    captureDate = new Date(
      Date.now() - Math.floor((20 + Math.random() * 140) * 60 * 1000)
    );
  }

  let tzOffset = options.timezoneOffset || "+00:00";
  let iso6709Location: string | undefined;

  if (options.gpsMode === "preset" && options.gpsPresetId) {
    const preset = GPS_PRESETS.find((g) => g.id === options.gpsPresetId);
    if (preset) {
      if (!options.timezoneOffset) tzOffset = preset.timezoneOffset;
      iso6709Location = formatIso6709(preset.lat, preset.lng, preset.altitudeM);
    }
  } else if (
    options.gpsMode === "custom" &&
    typeof options.customLat === "number" &&
    typeof options.customLng === "number"
  ) {
    iso6709Location = formatIso6709(
      options.customLat,
      options.customLng,
      options.customAltitudeM ?? 15
    );
  }

  const macTimestampSec =
    Math.floor(captureDate.getTime() / 1000) + MAC_EPOCH_OFFSET_SEC;
  const isoCreationStr = captureDate
    .toISOString()
    .replace(/\.\d{3}Z$/, tzOffset);

  const mdtaEntries: Array<[string, string]> = [
    ["com.apple.quicktime.make", profile.make],
    ["com.apple.quicktime.model", profile.model],
    ["com.apple.quicktime.software", profile.software],
    ["com.apple.quicktime.creationdate", isoCreationStr],
  ];
  if (iso6709Location) {
    mdtaEntries.push(["com.apple.quicktime.location.ISO6709", iso6709Location]);
  }

  const udtaEntries: Array<[Buffer, string]> = [
    [Buffer.from([0xa9, 0x6d, 0x61, 0x6b]), profile.make], // ©mak
    [Buffer.from([0xa9, 0x6d, 0x6f, 0x64]), profile.model], // ©mod
    [Buffer.from([0xa9, 0x73, 0x77, 0x72]), profile.software], // ©swr
    [Buffer.from([0xa9, 0x64, 0x61, 0x79]), isoCreationStr], // ©day
  ];
  if (iso6709Location) {
    udtaEntries.push([
      Buffer.from([0xa9, 0x78, 0x79, 0x7a]), // ©xyz
      iso6709Location,
    ]);
  }

  // Reconstruct top-level container while tracking exact mdat byte shifts
  const outputChunks: Buffer[] = [];
  const mdatShifts: Array<{ oldStart: number; oldEnd: number; delta: number }> =
    [];
  let currentNewOffset = 0;

  for (const box of topBoxes) {
    // Strip top-level provenance / metadata / padding boxes
    if (
      ["uuid", "meta", "udta", "XMP_", "c2pa", "free", "skip", "wide"].includes(
        box.type
      )
    ) {
      continue;
    }

    if (box.type === "mdat") {
      // Preserve original mdat exact bytes (even if 64-bit extended size)
      const rawMdat = inputBuffer.subarray(box.offset, box.offset + box.size);
      mdatShifts.push({
        oldStart: box.offset,
        oldEnd: box.offset + box.size,
        delta: currentNewOffset - box.offset,
      });
      outputChunks.push(rawMdat);
      currentNewOffset += rawMdat.length;
    } else if (box.type === "moov") {
      const moovChildren = readChildBoxes(box.payload);
      const cleanMoovChildren: Buffer[] = [];

      for (const child of moovChildren) {
        if (
          ["udta", "meta", "uuid", "XMP_", "c2pa", "free"].includes(child.type)
        ) {
          continue;
        }
        if (child.type === "mvhd") {
          cleanMoovChildren.push(
            makeBox("mvhd", patchTimestampBox(child.payload, macTimestampSec))
          );
        } else if (child.type === "trak") {
          cleanMoovChildren.push(
            makeBox(
              "trak",
              sanitizeTrak(
                child.payload,
                macTimestampSec,
                profile.videoHandlerName,
                profile.audioHandlerName
              )
            )
          );
        } else {
          cleanMoovChildren.push(makeBox(child.rawType, child.payload));
        }
      }

      // Inject authentic QuickTime mdta + MP4 udta camera telemetry
      cleanMoovChildren.push(buildQuickTimeMdtaMetaBox(mdtaEntries));
      cleanMoovChildren.push(buildIsoUdtaBox(udtaEntries));

      const rebuiltMoov = makeBox("moov", Buffer.concat(cleanMoovChildren));
      outputChunks.push(rebuiltMoov);
      currentNewOffset += rebuiltMoov.length;
    } else {
      const rawOther = inputBuffer.subarray(box.offset, box.offset + box.size);
      outputChunks.push(rawOther);
      currentNewOffset += rawOther.length;
    }
  }

  const outputBuffer = Buffer.concat(outputChunks);

  // Patch all stco / co64 chunk offsets in-place by exact mdat byte delta
  if (mdatShifts.some((m) => m.delta !== 0)) {
    shiftChunkOffsetsInPlace(outputBuffer, 0, outputBuffer.length, mdatShifts);
  }

  const isMov =
    beforeReport.containerFormat === "MOV" ||
    originalFilename.toLowerCase().endsWith(".mov") ||
    profile.id === "iphone-16-pro";
  const ext = isMov && originalFilename.toLowerCase().endsWith(".mov") ? "MOV" : "MP4";
  const mimeType = ext === "MOV" ? "video/quicktime" : "video/mp4";

  let outputFilename: string;
  if (options.renameToCameraConvention !== false) {
    outputFilename = generateCameraFilename(profile, ext, true, captureDate);
  } else {
    const stem = originalFilename.replace(/\.[^.]+$/, "") || "video";
    outputFilename = `${stem}_camera.${ext.toLowerCase()}`;
  }

  const afterReport = await inspectMediaBuffer(outputBuffer, outputFilename);

  return {
    outputBuffer,
    outputFilename,
    mimeType,
    beforeReport,
    afterReport,
  };
}
