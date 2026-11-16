import type { BinaryChunkInfo } from "./types";

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g;

export function sanitizeText(input: string): string {
  return input.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

export function clipText(input: string, max = 180): string {
  const clean = sanitizeText(input);
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Build a short readable excerpt of a binary payload. Prefers printable text;
 * falls back to a hex snippet when the payload is binary.
 */
export function previewPayload(buf: Buffer, max = 160): string {
  if (buf.length === 0) return "";
  const slice = buf.subarray(0, Math.min(buf.length, max * 2));
  let printable = 0;
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    if (b === 9 || b === 10 || b === 13 || (b >= 0x20 && b < 0x7f)) printable++;
  }
  if (printable / slice.length > 0.75) {
    return clipText(buf.toString("utf8", 0, Math.min(buf.length, max)), max);
  }
  return `hex:${hexSnippet(buf, 24)}`;
}

export function hexSnippet(buf: Buffer, bytes = 16): string {
  return Array.from(buf.subarray(0, Math.min(buf.length, bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export function makeChunk(
  chunk: Omit<BinaryChunkInfo, "hexPreview" | "preview"> & {
    payload?: Buffer;
    preview?: string;
  }
): BinaryChunkInfo {
  const { payload, preview, ...rest } = chunk;
  return {
    ...rest,
    preview: preview ?? (payload ? previewPayload(payload) : undefined),
    hexPreview: payload ? hexSnippet(payload, 16) : undefined,
  };
}

/** Four-character box type → printable marker. */
export function boxType(buf: Buffer, offset: number): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    const b = buf[offset + i];
    out += b === undefined ? "" : b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·";
  }
  return out;
}

export function decodeFourCC(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "·");
}
