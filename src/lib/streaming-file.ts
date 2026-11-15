import "server-only";
import crypto from "node:crypto";
import { detectSignature } from "@/lib/file-formats";
import type { ForensicReport, AiFinding, BinaryChunkInfo, MetadataTagRow } from "@/lib/metadata-inspector";
import { findMarkerHits, MAX_NEEDLE_LENGTH, neutralizeProvenanceBytes } from "@/lib/provenance-markers";

// Keep a boundary window large enough for the longest textual marker, UTF-16
// encoding, and surrounding word-boundary context. This is constant memory,
// independent of the uploaded file's total size.
const WINDOW = Math.max(128, MAX_NEEDLE_LENGTH * 2 + 32);
const MAX_REPORT_FINDINGS = 500;

function findingId(offset: number, id: string) {
  return `${id}-${offset}`;
}

function formatByteSize(size: number): number {
  return size;
}

function reportFromScan(input: {
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
  prefix: Buffer;
  findings: AiFinding[];
  chunks: BinaryChunkInfo[];
  tags: MetadataTagRow[];
}): ForensicReport {
  const signature = detectSignature(input.prefix, input.filename, input.mimeType);
  const critical = input.findings.some((finding) => finding.severity === "critical");
  const warning = input.findings.some((finding) => finding.severity === "warning");
  return {
    filename: input.filename,
    mediaType: signature.kind,
    containerFormat: signature.format,
    byteSize: formatByteSize(input.size),
    sha256: input.sha256,
    authenticityStatus: critical ? "ai-detected" : warning ? "suspicious" : "stripped",
    aiRiskScore: critical ? 95 : warning ? 55 : 22,
    detectedGenerators: Array.from(new Set(input.findings.map((f) => f.generator))),
    aiFindings: input.findings,
    chunks: input.chunks,
    exifSummary: {},
    tags: input.tags,
  };
}

/** Inspect without buffering the upload: memory is bounded to one stream chunk. */
export async function inspectFileStream(
  stream: ReadableStream<Uint8Array>,
  filename: string,
  mimeType = "application/octet-stream"
): Promise<ForensicReport> {
  const reader = stream.getReader();
  const hash = crypto.createHash("sha256");
  let total = 0;
  let prefix = Buffer.alloc(0);
  let carry = Buffer.alloc(0);
  let scannedUntil = 0;
  const findings: AiFinding[] = [];
  const chunks: BinaryChunkInfo[] = [];
  const tags: MetadataTagRow[] = [];

  const scan = (block: Buffer, blockBase: number, final: boolean) => {
    const hits = findMarkerHits(block, { limitPerMarker: 50 });
    for (const hit of hits) {
      const absoluteOffset = blockBase + hit.offset;
      if (absoluteOffset < scannedUntil) continue;
      if (findings.length >= MAX_REPORT_FINDINGS) continue;
      const sig = `${hit.markerId}:${absoluteOffset}`;
      findings.push({
        id: findingId(absoluteOffset, hit.markerId),
        severity: hit.severity,
        generator: hit.generator,
        location: `Byte ${absoluteOffset}`,
        key: hit.label,
        snippet: hit.snippet,
        explanation: `Found ${hit.label} marker in the file payload.`,
      });
      chunks.push({
        id: sig,
        marker: hit.needle,
        label: hit.label,
        byteLength: hit.needle.length * (hit.encoding === "utf16le" ? 2 : 1),
        offset: absoluteOffset,
        category: "ai-provenance",
        preview: hit.snippet,
      });
      tags.push({ group: "Provenance marker", tag: hit.label, value: hit.snippet.slice(0, 240), isAiFlag: true });
    }
    const safeEnd = final ? blockBase + block.length : blockBase + Math.max(0, block.length - WINDOW);
    scannedUntil = Math.max(scannedUntil, safeEnd);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const current = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      total += current.length;
      hash.update(current);
      if (prefix.length < 8192) prefix = Buffer.concat([prefix, current.subarray(0, 8192 - prefix.length)]);
      const block = carry.length ? Buffer.concat([carry, current]) : Buffer.from(current);
      const blockBase = total - block.length;
      scan(block, blockBase, false);
      carry = Buffer.from(block.subarray(Math.max(0, block.length - WINDOW)));
    }
    if (carry.length) scan(carry, total - carry.length, true);
  } finally {
    reader.releaseLock();
  }

  return reportFromScan({ filename, mimeType, size: total, sha256: hash.digest("hex"), prefix, findings, chunks, tags });
}

/**
 * A streaming, size-preserving sanitizer. It neutralizes registered textual
 * provenance markers and C2PA/XMP UUIDs in a rolling window, then emits bytes
 * immediately. It neither loads the whole upload nor imposes a byte limit.
 */
export function sanitizeFileStream(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = input.getReader();
  let carry = Buffer.alloc(0);
  let finished = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (finished) {
          controller.close();
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          if (carry.length) {
            neutralizeProvenanceBytes(carry);
            controller.enqueue(new Uint8Array(carry));
            carry = Buffer.alloc(0);
          }
          finished = true;
          reader.releaseLock();
          controller.close();
          return;
        }

        const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        const block = carry.length ? Buffer.concat([carry, bytes]) : Buffer.from(bytes);
        if (block.length <= WINDOW) {
          carry = block;
          return;
        }
        const emitLength = block.length - WINDOW;
        // Mutating the complete block catches strings whose bytes straddle the
        // output boundary; the retained suffix is already in cleaned form.
        neutralizeProvenanceBytes(block);
        controller.enqueue(new Uint8Array(block.subarray(0, emitLength)));
        carry = Buffer.from(block.subarray(emitLength));
      } catch (error) {
        reader.releaseLock();
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}
