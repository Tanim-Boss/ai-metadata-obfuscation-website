import { extractIptcFromIrb } from "./metadata-blocks";
import type { ContainerParseResult } from "./parser-types";
import type { MetadataTagRow } from "./types";
import { parseTiffStream } from "./tiff";
import { clipText, makeChunk } from "./util";
import { extractXmpPacket } from "./xmp";

const MARKER_NAMES: Record<number, string> = {
  0xc0: "SOF0 (Baseline)",
  0xc1: "SOF1 (Extended sequential)",
  0xc2: "SOF2 (Progressive)",
  0xc3: "SOF3 (Lossless)",
  0xc4: "DHT (Huffman tables)",
  0xc5: "SOF5",
  0xc6: "SOF6",
  0xc7: "SOF7",
  0xc8: "JPG",
  0xc9: "SOF9 (Arithmetic)",
  0xca: "SOF10 (Progressive arithmetic)",
  0xcb: "SOF11",
  0xcc: "DAC (Arithmetic conditioning)",
  0xcd: "SOF13",
  0xce: "SOF14",
  0xcf: "SOF15",
  0xda: "SOS (Scan)",
  0xdb: "DQT (Quantization table)",
  0xdc: "DNL",
  0xdd: "DRI (Restart interval)",
  0xde: "DHP",
  0xdf: "EXP",
  0xfe: "COM (Comment)",
};

const APP_NAMES: Record<number, string> = {
  0xe0: "APP0 (JFIF)",
  0xe1: "APP1",
  0xe2: "APP2 (ICC profile)",
  0xe3: "APP3",
  0xe4: "APP4",
  0xe5: "APP5",
  0xe6: "APP6",
  0xe7: "APP7",
  0xe8: "APP8",
  0xe9: "APP9",
  0xea: "APP10",
  0xeb: "APP11 (JPEG XT / JUMBF)",
  0xec: "APP12 (Ducky)",
  0xed: "APP13 (Photoshop IRB)",
  0xee: "APP14 (Adobe)",
  0xef: "APP15",
};

function findEoi(buf: Buffer, from: number): number {
  // Walk the entropy-coded scan honouring byte stuffing (FF00) and RST markers.
  let i = from;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const next = buf[i + 1];
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      i += 2;
      continue;
    }
    if (next === 0xff) {
      i++;
      continue;
    }
    if (next === 0xd9) return i;
    // Another marker inside the scan (e.g. multi-scan progressive) — stop here.
    return -1;
  }
  return -1;
}

export function parseJpeg(buf: Buffer): ContainerParseResult {
  const chunks = [];
  const notes: string[] = [];
  const textBlobs: ContainerParseResult["textBlobs"] = [];
  let xmpPacket: string | undefined;
  let iccBuffer: Buffer | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let exif: ContainerParseResult["exif"];
  const iptc = [];
  const commentTags: MetadataTagRow[] = [];
  const iccParts: Buffer[] = [];
  const extendedXmp = new Map<string, { total: number; parts: Map<number, Buffer> }>();
  let hasC2paBox = false;
  let offset = 2;
  let scanFound = false;
  let eoiOffset: number | undefined;
  let mpuSeen = false;

  while (offset + 1 < buf.length) {
    if (buf[offset] !== 0xff) {
      notes.push(`Unexpected byte 0x${buf[offset].toString(16)} at offset ${offset}; resyncing.`);
      offset++;
      continue;
    }
    let markerOffset = offset;
    let marker = buf[offset + 1];
    while (marker === 0xff && markerOffset + 2 < buf.length) {
      markerOffset++;
      marker = buf[markerOffset + 1];
    }

    if (marker === 0xd9) {
      chunks.push(
        makeChunk({
          id: `jpg-eoi-${markerOffset}`,
          marker: "EOI (0xFFD9)",
          label: "End of image",
          byteLength: 2,
          offset: markerOffset,
          category: "image-stream",
        })
      );
      eoiOffset = markerOffset + 2;
      break;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8) {
      offset = markerOffset + 2;
      continue;
    }

    const lengthOffset = markerOffset + 2;
    if (lengthOffset + 2 > buf.length) break;
    const segmentLength = buf.readUInt16BE(lengthOffset);
    if (segmentLength < 2) {
      notes.push(`Invalid segment length at offset ${markerOffset}; stopping walk.`);
      break;
    }
    const payloadStart = lengthOffset + 2;
    const declaredEnd = lengthOffset + segmentLength;
    const payloadEnd = Math.min(buf.length, declaredEnd);
    const payload = buf.subarray(payloadStart, payloadEnd);
    if (declaredEnd > buf.length) {
      notes.push(`Segment ${MARKER_NAMES[marker] ?? `0x${marker.toString(16)}`} is truncated.`);
    }
    offset = declaredEnd;

    if (marker === 0xda) {
      const scanStart = payloadStart;
      const eoi = findEoi(buf, scanStart);
      const scanEnd = eoi >= 0 ? eoi : buf.length;
      chunks.push(
        makeChunk({
          id: `jpg-sos-${markerOffset}`,
          marker: "SOS (0xFFDA)",
          label: "Entropy-coded image scan",
          byteLength: scanEnd - markerOffset,
          offset: markerOffset,
          category: "image-stream",
          payload: buf.subarray(scanStart, Math.min(scanEnd, scanStart + 64)),
        })
      );
      scanFound = true;
      if (eoi >= 0) {
        eoiOffset = eoi + 2;
        offset = eoi + 2;
        chunks.push(
          makeChunk({
            id: `jpg-eoi-${eoi}`,
            marker: "EOI (0xFFD9)",
            label: "End of image",
            byteLength: 2,
            offset: eoi,
            category: "image-stream",
          })
        );
      }
      break;
    }

    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (payload.length >= 6) {
        bitDepth = payload[0];
        height = payload.readUInt16BE(1);
        width = payload.readUInt16BE(3);
        const components = payload[5];
        chunks.push(
          makeChunk({
            id: `jpg-sof-${markerOffset}`,
            marker: MARKER_NAMES[marker] ?? "SOF",
            label: `Frame header — ${width}×${height}, ${bitDepth}-bit, ${components} component(s)`,
            byteLength: segmentLength - 2,
            offset: markerOffset,
            category: "image-stream",
            payload,
          })
        );
      }
      continue;
    }

    if (marker === 0xe0) {
      const identifier = payload.toString("latin1", 0, 5);
      let label = "JFIF application segment";
      if (identifier === "JFIF\u0000" && payload.length >= 12) {
        const version = `${payload[5]}.${payload[6]}`;
        const units = payload[7];
        const xDensity = payload.readUInt16BE(8);
        const yDensity = payload.readUInt16BE(10);
        const unitLabel = units === 1 ? "dpi" : units === 2 ? "dots/cm" : "aspect only";
        label = `JFIF ${version} · ${xDensity}×${yDensity} ${unitLabel}`;
        notes.push(`JFIF header version ${version}, density ${xDensity}×${yDensity}`);
      }
      chunks.push(
        makeChunk({
          id: `jpg-app0-${markerOffset}`,
          marker: "APP0 (JFIF)",
          label,
          byteLength: segmentLength - 2,
          offset: markerOffset,
          category: "image-stream",
          payload,
        })
      );
      continue;
    }

    if (marker === 0xe1) {
      const isExif = payload.subarray(0, 5).toString("latin1") === "Exif\u0000";
      const headerText = payload.subarray(0, 40).toString("latin1");

      if (isExif) {
        const tiffPayload = payload.subarray(6);
        exif = parseTiffStream(tiffPayload) ?? undefined;
        if (exif) {
          for (const note of exif.notes) notes.push(note);
          if (exif.xmpPacket && !xmpPacket) xmpPacket = exif.xmpPacket;
          if (exif.iccProfile && !iccBuffer) iccBuffer = exif.iccProfile;
          if (exif.iptcBlock) iptc.push(...extractIptcFromIrb(exif.iptcBlock));
        }
        chunks.push(
          makeChunk({
            id: `jpg-app1-exif-${markerOffset}`,
            marker: "APP1 (Exif)",
            label: exif
              ? `EXIF / TIFF metadata — ${exif.tags.length} tags in ${exif.rawIfdCount} IFD(s), ${exif.byteOrder}-endian`
              : "EXIF segment (unreadable TIFF payload)",
            byteLength: segmentLength - 2,
            offset: markerOffset,
            category: "camera-exif",
            payload: tiffPayload,
          })
        );
        continue;
      }

      if (headerText.startsWith("http://ns.adobe.com/xap/1.0/\u0000")) {
        const packet = extractXmpPacket(payload.subarray(29));
        if (packet) {
          xmpPacket = xmpPacket ? `${xmpPacket}\n${packet}` : packet;
          textBlobs?.push({ location: "JPEG APP1 XMP", key: "XMP packet", text: packet });
        }
        chunks.push(
          makeChunk({
            id: `jpg-app1-xmp-${markerOffset}`,
            marker: "APP1 (XMP)",
            label: `Adobe XMP packet — ${packet?.length ?? 0} bytes of XML`,
            byteLength: segmentLength - 2,
            offset: markerOffset,
            category: "xmp-iptc",
            preview: packet ? clipText(packet, 160) : undefined,
            payload: payload.subarray(0, 48),
          })
        );
        continue;
      }

      if (headerText.startsWith("http://ns.adobe.com/xmp/extension/\u0000")) {
        // Extended XMP: 35-byte namespace, 32-byte GUID, 4-byte full length, 4-byte offset.
        const guid = payload.toString("latin1", 35, 67);
        const total = payload.readUInt32BE(67);
        const chunkOffset = payload.readUInt32BE(71);
        const body = payload.subarray(75);
        const entry = extendedXmp.get(guid) ?? { total, parts: new Map<number, Buffer>() };
        entry.parts.set(chunkOffset, Buffer.from(body));
        extendedXmp.set(guid, entry);
        chunks.push(
          makeChunk({
            id: `jpg-app1-xmp-ext-${markerOffset}`,
            marker: "APP1 (Extended XMP)",
            label: `Extended XMP fragment ${chunkOffset}/${total} bytes (GUID ${guid.slice(0, 8)}…)`,
            byteLength: segmentLength - 2,
            offset: markerOffset,
            category: "xmp-iptc",
            payload: body,
          })
        );
        continue;
      }

      if (headerText.includes("MPF\u0000")) {
        mpuSeen = true;
        chunks.push(
          makeChunk({
            id: `jpg-app1-mpf-${markerOffset}`,
            marker: "APP1 (MPF)",
            label: "Multi-Picture Format index (secondary images)",
            byteLength: segmentLength - 2,
            offset: markerOffset,
            category: "image-stream",
            payload,
          })
        );
        continue;
      }

      chunks.push(
        makeChunk({
          id: `jpg-app1-${markerOffset}`,
          marker: "APP1",
          label: `Application segment 1 — ${clipText(headerText, 40) || "unknown"}`,
          byteLength: segmentLength - 2,
          offset: markerOffset,
          category: "ancillary-text",
          payload,
        })
      );
      continue;
    }

    if (marker === 0xe2) {
      const identifier = payload.toString("latin1", 0, 12);
      if (identifier.startsWith("ICC_PROFILE\u0000")) {
        const sequence = payload[12];
        const count = payload[13];
        iccParts.push(Buffer.from(payload.subarray(14)));
        chunks.push(
          makeChunk({
            id: `jpg-app2-icc-${markerOffset}`,
            marker: "APP2 (ICC)",
            label: `ICC colour profile part ${sequence} of ${count}`,
            byteLength: segmentLength - 2,
            offset: markerOffset,
            category: "color-profile",
            payload: payload.subarray(14),
          })
        );
      } else {
        chunks.push(
          makeChunk({
            id: `jpg-app2-${markerOffset}`,
            marker: "APP2",
            label: "Application segment 2",
            byteLength: segmentLength - 2,
            offset: markerOffset,
            category: "ancillary-text",
            payload,
          })
        );
      }
      continue;
    }

    if (marker === 0xeb) {
      const latin = payload.toString("latin1");
      const lower = latin.toLowerCase();
      const looksC2pa =
        lower.includes("c2pa") ||
        lower.includes("jumb") ||
        lower.includes("contentauthenticity") ||
        payload.subarray(0, 2).toString("latin1") === "JP";
      if (looksC2pa) {
        hasC2paBox = true;
        commentTags.push({
          group: "C2PA",
          tag: "APP11 JUMBF manifest",
          hex: "0xFFEB",
          value: `${segmentLength - 2} bytes of C2PA provenance data`,
        });
      }
      textBlobs?.push({
        location: "JPEG APP11",
        key: "JUMBF / C2PA payload",
        text: latin.slice(0, 20_000),
      });
      chunks.push(
        makeChunk({
          id: `jpg-app11-${markerOffset}`,
          marker: "APP11 (JUMBF)",
          label: looksC2pa
            ? `C2PA / JUMBF provenance container — ${segmentLength - 2} bytes`
            : "JPEG XT / JUMBF application segment",
          byteLength: segmentLength - 2,
          offset: markerOffset,
          category: looksC2pa ? "ai-provenance" : "ancillary-text",
          payload,
        })
      );
      continue;
    }

    if (marker === 0xed) {
      const irb = Buffer.from(payload);
      const parsedIptc = extractIptcFromIrb(irb);
      iptc.push(...parsedIptc);
      for (const prop of parsedIptc) {
        textBlobs?.push({
          location: "JPEG APP13 IPTC",
          key: prop.key,
          text: prop.value,
        });
      }
      chunks.push(
        makeChunk({
          id: `jpg-app13-${markerOffset}`,
          marker: "APP13 (IPTC)",
          label: parsedIptc.length
            ? `Photoshop IRB with ${parsedIptc.length} IPTC-IIM dataset(s)`
            : "Photoshop image resource block",
          byteLength: segmentLength - 2,
          offset: markerOffset,
          category: "xmp-iptc",
          payload,
        })
      );
      continue;
    }

    if (marker === 0xfe) {
      const comment = payload.toString("utf8").replace(/\u0000+$/g, "");
      textBlobs?.push({ location: "JPEG COM", key: "Comment", text: comment });
      commentTags.push({
        group: "JPEG",
        tag: "Comment",
        hex: "0xFFFE",
        value: clipText(comment, 400),
      });
      chunks.push(
        makeChunk({
          id: `jpg-com-${markerOffset}`,
          marker: "COM (0xFFFE)",
          label: "JPEG comment segment",
          byteLength: segmentLength - 2,
          offset: markerOffset,
          category: "ancillary-text",
          payload,
        })
      );
      continue;
    }

    if (marker >= 0xe0 && marker <= 0xef) {
      const name = APP_NAMES[marker] ?? "APPn";
      const ascii = payload.subarray(0, 60).toString("latin1");
      if (ascii.includes("c2pa") || ascii.includes("jumb")) hasC2paBox = true;
      chunks.push(
        makeChunk({
          id: `jpg-app-${markerOffset}`,
          marker: name,
          label: `Application segment ${marker - 0xe0} — ${clipText(ascii, 40) || "binary payload"}`,
          byteLength: segmentLength - 2,
          offset: markerOffset,
          category: "ancillary-text",
          payload,
        })
      );
      continue;
    }

    if (marker === 0xdb || marker === 0xc4 || marker === 0xdd || marker === 0xdc || marker === 0xcc) {
      const name = MARKER_NAMES[marker] ?? `0x${marker.toString(16)}`;
      chunks.push(
        makeChunk({
          id: `jpg-tbl-${markerOffset}`,
          marker: name.split(" ")[0],
          label: name,
          byteLength: segmentLength - 2,
          offset: markerOffset,
          category: "image-stream",
          payload,
        })
      );
      continue;
    }

    chunks.push(
      makeChunk({
        id: `jpg-seg-${markerOffset}`,
        marker: MARKER_NAMES[marker] ?? `0xFF${marker.toString(16).toUpperCase()}`,
        label: `JPEG segment 0x${marker.toString(16).toUpperCase()}`,
        byteLength: segmentLength - 2,
        offset: markerOffset,
        category: "image-stream",
        payload,
      })
    );
  }

  if (extendedXmp.size > 0) {
    for (const [, entry] of extendedXmp) {
      const ordered = Array.from(entry.parts.entries()).sort((a, b) => a[0] - b[0]);
      const assembled = Buffer.concat(ordered.map(([, part]) => part)).subarray(0, entry.total);
      const packet = extractXmpPacket(assembled.toString("utf8"));
      if (packet) {
        xmpPacket = xmpPacket ? `${xmpPacket}\n${packet}` : packet;
        textBlobs?.push({ location: "JPEG Extended XMP", key: "XMP packet", text: packet });
        notes.push(`Reassembled ${entry.parts.size} extended-XMP fragment(s) into one packet.`);
      }
    }
  }

  if (iccParts.length > 0) iccBuffer = Buffer.concat(iccParts);

  if (!scanFound) notes.push("No SOS scan marker found — the JPEG stream may be truncated.");
  if (mpuSeen) notes.push("MPF index present: the file holds secondary/embedded images.");

  const trailingBytes = eoiOffset !== undefined ? Math.max(0, buf.length - eoiOffset) : undefined;
  if (trailingBytes && trailingBytes > 0) {
    notes.push(`${trailingBytes.toLocaleString()} bytes of data are appended after the EOI marker.`);
  }

  const tags: MetadataTagRow[] = [...(exif?.tags ?? []), ...commentTags];

  return {
    format: "JPEG",
    mimeType: "image/jpeg",
    mediaType: "image",
    width,
    height,
    bitDepth,
    chunks,
    tags,
    exif,
    xmpPacket,
    iccProfile: iccBuffer,
    iptc,
    notes,
    parsedWith: [
      "jpeg-segments",
      ...(exif ? ["tiff-ifd"] : []),
      ...(xmpPacket ? ["xmp"] : []),
      ...(iccBuffer ? ["icc"] : []),
    ],
    trailingBytes,
    hasC2paBox,
    textBlobs,
  };
}
