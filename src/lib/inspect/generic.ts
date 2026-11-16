import type { ContainerParseResult } from "./parser-types";
import { clipText, makeChunk } from "./util";
import type { MediaKind } from "./types";

const MAX_STRINGS = 300;
const MAX_TOTAL_CHARS = 80_000;
const MAX_SCAN_BYTES = 4 * 1024 * 1024;

/**
 * Last-resort reader for containers we have no dedicated parser for. It does
 * not invent metadata: it extracts the printable strings that are physically
 * present (which is how tool signatures, prompts and manifests leak out of
 * unknown formats) and scans those for provenance markers.
 */
export function parseGeneric(
  buf: Buffer,
  filename: string,
  mediaType: MediaKind
): ContainerParseResult {
  const strings: string[] = [];
  const limit = Math.min(buf.length, MAX_SCAN_BYTES);
  let total = 0;
  let current: number[] = [];

  const flush = () => {
    if (current.length >= 4) {
      const text = Buffer.from(current).toString("utf8").trim();
      if (text.length >= 4 && total < MAX_TOTAL_CHARS && strings.length < MAX_STRINGS) {
        strings.push(text);
        total += text.length;
      }
    }
    current = [];
  };

  for (let i = 0; i < limit; i++) {
    const byte = buf[i];
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte < 0x7f) || byte >= 0xc0) {
      current.push(byte);
    } else {
      flush();
    }
  }
  flush();

  const joined = strings.join("\n");
  const lower = joined.toLowerCase();
  const hasC2paBox =
    lower.includes("c2pa") || lower.includes("jumbf") || lower.includes("contentauth");

  const notes = [
    `No dedicated parser for this container — inspected ${clipText(
      `${Math.min(buf.length, MAX_SCAN_BYTES).toLocaleString()} bytes`,
      40
    )} of raw content and extracted ${strings.length} printable strings.`,
  ];

  const chunks = [
    makeChunk({
      id: "generic-header",
      marker: "bytes",
      label: `Raw container header (${filename.split(".").pop()?.toUpperCase() ?? "binary"})`,
      byteLength: Math.min(buf.length, 64),
      offset: 0,
      category: "ancillary-text",
      payload: buf.subarray(0, 64),
    }),
  ];

  if (strings.length > 0) {
    chunks.push({
      id: "generic-strings",
      marker: "strings",
      label: `${strings.length} readable strings — ${total.toLocaleString()} characters`,
      byteLength: total,
      offset: 0,
      category: hasC2paBox ? "ai-provenance" : "ancillary-text",
      preview: clipText(strings.slice(0, 12).join(" · "), 180),
    });
  }

  return {
    format: mediaType === "video" ? "VIDEO (generic)" : "BINARY",
    mimeType: mediaType === "video" ? "video/*" : "application/octet-stream",
    mediaType,
    chunks,
    tags: [],
    notes,
    parsedWith: ["string-scan"],
    textBlobs: [{ location: "Raw container strings", key: filename, text: joined }],
    hasC2paBox,
  };
}
