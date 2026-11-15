/**
 * Provenance marker engine.
 *
 * Every modern generator (C2PA, ComfyUI, Stable Diffusion, Midjourney,
 * Firefly, ElevenLabs, Suno, …) leaves textual or binary fingerprints inside
 * the container it writes. This module keeps a single registry of those
 * fingerprints and powers three things:
 *
 *  1. Detection  — flag the marker inside any file, whatever its format.
 *  2. Neutralisation — overwrite the marker *in place* (same byte length) so
 *     binary containers keep their exact offsets and stay playable.
 *  3. UUID invalidation — C2PA / XMP manifest UUIDs are zeroed so parsers no
 *     longer recognise the provenance store.
 */

export type MarkerSeverity = "critical" | "warning" | "info";

export interface ProvenanceMarker {
  id: string;
  /** Short label used in the forensic tag table. */
  label: string;
  /** Human readable generator attribution. */
  generator: string;
  severity: MarkerSeverity;
  /** Lowercase ASCII needles. Short needles match on word boundaries. */
  needles: string[];
  explanation: string;
}

export const PROVENANCE_MARKERS: ProvenanceMarker[] = [
  {
    id: "c2pa",
    label: "C2PA / JUMBF Manifest",
    generator: "C2PA Content Credentials",
    severity: "critical",
    needles: ["c2pa", "jumbf", "contentcredentials"],
    explanation:
      "Cryptographic C2PA / JUMBF provenance manifest asserting synthetic AI generation.",
  },
  {
    id: "iptc-ai",
    label: "IPTC DigitalSourceType (AI)",
    generator: "IPTC AI DigitalSourceType",
    severity: "critical",
    needles: ["trainedalgorithmicmedia", "algorithmicmedia"],
    explanation:
      "Standardized IPTC/XMP DigitalSourceType URI explicitly declaring trained algorithmic media.",
  },
  {
    id: "comfyui",
    label: "ComfyUI Node Graph",
    generator: "ComfyUI Workflow Graph",
    severity: "critical",
    needles: [
      "comfyui",
      "class_type",
      "ckpt_name",
      "lora_name",
      "vae_name",
      "cliptextencode",
      "empty latent image",
      "empty latentimage",
      "saveimage",
    ],
    explanation:
      "Complete ComfyUI JSON node execution graph exposing checkpoints, LoRAs, seeds and prompts.",
  },
  {
    id: "stable-diffusion",
    label: "Diffusion Generation Parameters",
    generator: "Stable Diffusion / Diffusers Pipeline",
    severity: "critical",
    needles: [
      "negative prompt",
      "cfg scale",
      "sampler:",
      "steps:",
      "model hash",
      "a1111",
      "automatic1111",
      "stable diffusion",
      "stable-diffusion",
      "invokeai",
      "novelai",
      "fooocus",
      "swarmui",
      "diffusers",
    ],
    explanation:
      "Full diffusion generation parameters (prompt, sampler, CFG scale, seed, model hash) embedded in the file.",
  },
  {
    id: "midjourney",
    label: "Midjourney Prompt Metadata",
    generator: "Midjourney",
    severity: "critical",
    needles: ["midjourney", "job id:"],
    explanation:
      "Midjourney prompt parameters and job UUID signature embedded in descriptor fields.",
  },
  {
    id: "openai",
    label: "OpenAI Generation Signature",
    generator: "OpenAI DALL·E / GPT Image / Sora",
    severity: "critical",
    needles: ["dall-e", "dall·e", "openai", "chatgpt", "gpt-4o image", "sora"],
    explanation:
      "OpenAI image or video generation signature written into the exported container.",
  },
  {
    id: "adobe",
    label: "Adobe Generative Signature",
    generator: "Adobe Firefly / Generative Fill",
    severity: "critical",
    needles: ["firefly", "generative fill", "generative expand"],
    explanation:
      "Adobe Firefly or Generative Fill provenance marker.",
  },
  {
    id: "google",
    label: "Google SynthID / Imagen",
    generator: "Google Imagen / SynthID",
    severity: "critical",
    needles: ["synthid", "imagen", "made with google ai"],
    explanation:
      "Google SynthID invisible watermark marker or Imagen generation tag.",
  },
  {
    id: "runway",
    label: "Runway Generation Tag",
    generator: "Runway Gen-3",
    severity: "critical",
    needles: ["runwayml", "runway"],
    explanation: "Runway generative video platform metadata.",
  },
  {
    id: "kling",
    label: "Kling AI Tag",
    generator: "Kling AI Video",
    severity: "critical",
    needles: ["kling ai", "klingai"],
    explanation: "Kling AI generative video platform metadata.",
  },
  {
    id: "luma",
    label: "Luma Dream Machine Tag",
    generator: "Luma Dream Machine",
    severity: "critical",
    needles: ["luma dream machine", "lumalabs"],
    explanation: "Luma Dream Machine generative video platform metadata.",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs Voice Tag",
    generator: "ElevenLabs Voice Synthesis",
    severity: "critical",
    needles: ["elevenlabs", "eleven labs"],
    explanation: "ElevenLabs synthetic voice attribution embedded in the audio stream.",
  },
  {
    id: "suno",
    label: "Suno / Udio Music Tag",
    generator: "Suno / Udio AI Music",
    severity: "critical",
    needles: ["suno", "udio"],
    explanation: "AI music generation attribution embedded in the audio stream.",
  },
  {
    id: "made-with",
    label: "AI Attribution Banner",
    generator: "AI Generation Disclosure",
    severity: "warning",
    needles: ["made with", "generated by ai", "ai generated"],
    explanation:
      "Plain-text disclosure banner left by an AI generation pipeline.",
  },
  {
    id: "editor",
    label: "Generator / Editor Tool Tag",
    generator: "Automated Media Toolchain",
    severity: "info",
    needles: ["exiftool", "lavfi", "lavf", "ffmpeg"],
    explanation:
      "Software muxer / editor signature left by an automated media toolchain.",
  },
];

/** Binary UUIDs that identify C2PA and XMP provenance stores. */
export const PROVENANCE_UUIDS: Array<{
  id: string;
  label: string;
  bytes: number[];
}> = [
  {
    id: "c2pa-uuid",
    label: "C2PA JUMBF Provenance UUID",
    bytes: [
      0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28,
      0x87, 0x7e, 0xc4, 0x81,
    ],
  },
  {
    id: "xmp-uuid",
    label: "XMP Metadata UUID",
    bytes: [
      0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94,
      0x91, 0xe3, 0xaf, 0xac,
    ],
  },
];

export interface MarkerHit {
  markerId: string;
  label: string;
  generator: string;
  severity: MarkerSeverity;
  needle: string;
  /** Absolute offset inside the inspected payload. */
  offset: number;
  /** Surrounding printable context for the forensic report. */
  snippet: string;
  encoding: "ascii" | "utf16le";
}

function isWordChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

function needleNeedsBoundary(needle: string): boolean {
  return needle.length <= 4;
}

/**
 * Case-insensitive search for a needle. When the needle is short the match
 * must sit on word boundaries, which keeps needles such as "suno" or "veo"
 * from firing inside unrelated words.
 */
export function findNeedle(
  haystack: Buffer,
  needle: string,
  from = 0
): number {
  const lowerNeedle = needle.toLowerCase();
  const first = lowerNeedle.charCodeAt(0);
  const boundary = needleNeedsBoundary(lowerNeedle);

  for (let i = Math.max(0, from); i <= haystack.length - lowerNeedle.length; i++) {
    const c = haystack[i];
    const isMatch =
      c === first ||
      (c >= 65 && c <= 90 && c + 32 === first) ||
      (c >= 97 && c <= 122 && c - 32 === first);
    if (!isMatch) continue;

    let ok = true;
    for (let k = 1; k < lowerNeedle.length; k++) {
      let h = haystack[i + k];
      if (h >= 65 && h <= 90) h += 32;
      if (h !== lowerNeedle.charCodeAt(k)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    if (boundary) {
      const before = i > 0 ? haystack[i - 1] : 32;
      const afterIdx = i + lowerNeedle.length;
      const after = afterIdx < haystack.length ? haystack[afterIdx] : 32;
      if (isWordChar(before) || isWordChar(after)) continue;
    }
    return i;
  }
  return -1;
}

function utf16leNeedle(needle: string): Buffer {
  const out = Buffer.alloc(needle.length * 2);
  for (let i = 0; i < needle.length; i++) {
    out[i * 2] = needle.charCodeAt(i) & 0xff;
    out[i * 2 + 1] = 0;
  }
  return out;
}

function findUtf16Needle(haystack: Buffer, needle: Buffer, from = 0): number {
  const first = needle[0];
  const lowerFirst = first >= 65 && first <= 90 ? first + 32 : first;
  for (let i = Math.max(0, from); i <= haystack.length - needle.length; i++) {
    let h = haystack[i];
    if (h >= 65 && h <= 90) h += 32;
    if (h !== lowerFirst) continue;
    let ok = true;
    for (let k = 2; k < needle.length; k += 2) {
      let hc = haystack[i + k];
      if (hc >= 65 && hc <= 90) hc += 32;
      if (hc !== needle[k]) {
        ok = false;
        break;
      }
      if (haystack[i + k + 1] !== 0) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function printableSnippet(buf: Buffer, offset: number, needleLength: number): string {
  const start = Math.max(0, offset - 48);
  const end = Math.min(buf.length, offset + needleLength + 96);
  let out = "";
  for (let i = start; i < end; i++) {
    const b = buf[i];
    out += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
  }
  return out.replace(/\.{3,}/g, "…");
}

function printableUtf16Snippet(buf: Buffer, offset: number, needleLength: number): string {
  const start = Math.max(0, offset - 96) & ~1;
  const end = Math.min(buf.length, offset + needleLength * 2 + 192);
  return buf.subarray(start, end).toString("utf16le").replace(/[^\x20-\x7e\t\r\n]/g, ".");
}

/** Find every provenance marker occurrence inside a buffer. */
export function findMarkerHits(
  buf: Buffer,
  options: { limitPerMarker?: number } = {}
): MarkerHit[] {
  const hits: MarkerHit[] = [];
  const limit = options.limitPerMarker ?? 25;

  for (const marker of PROVENANCE_MARKERS) {
    let count = 0;
    for (const needle of marker.needles) {
      let offset = findNeedle(buf, needle);
      while (offset !== -1 && count < limit) {
        hits.push({
          markerId: marker.id,
          label: marker.label,
          generator: marker.generator,
          severity: marker.severity,
          needle,
          offset,
          snippet: printableSnippet(buf, offset, needle.length),
          encoding: "ascii",
        });
        count++;
        offset = findNeedle(buf, needle, offset + needle.length);
      }
      if (count >= limit) break;

      const utf16Needle = utf16leNeedle(needle);
      let utf16Offset = findUtf16Needle(buf, utf16Needle);
      while (utf16Offset !== -1 && count < limit) {
        hits.push({
          markerId: marker.id,
          label: marker.label,
          generator: marker.generator,
          severity: marker.severity,
          needle,
          offset: utf16Offset,
          snippet: printableUtf16Snippet(buf, utf16Offset, needle.length),
          encoding: "utf16le",
        });
        count++;
        utf16Offset = findUtf16Needle(buf, utf16Needle, utf16Offset + utf16Needle.length);
      }
      if (count >= limit) break;
    }
  }

  for (const uuid of PROVENANCE_UUIDS) {
    const needle = Buffer.from(uuid.bytes);
    let offset = buf.indexOf(needle);
    let count = 0;
    while (offset !== -1 && count < limit) {
      hits.push({
        markerId: uuid.id,
        label: uuid.label,
        generator: "C2PA Content Credentials",
        severity: "critical",
        needle: uuid.id,
        offset,
        snippet: printableSnippet(buf, offset, uuid.bytes.length),
        encoding: "ascii",
      });
      count++;
      offset = buf.indexOf(needle, offset + uuid.bytes.length);
    }
  }

  hits.sort((a, b) => a.offset - b.offset);
  return hits;
}

/** Detect markers inside decoded text (documents, JSON, XML, ...). */
export function findTextMarkerHits(text: string): MarkerHit[] {
  const lower = text.toLowerCase();
  const hits: MarkerHit[] = [];
  for (const marker of PROVENANCE_MARKERS) {
    for (const needle of marker.needles) {
      const idx = lower.indexOf(needle);
      if (idx === -1) continue;
      if (
        needleNeedsBoundary(needle) &&
        isWordChar(lower.charCodeAt(idx - 1) || 32) &&
        isWordChar(lower.charCodeAt(idx + needle.length) || 32)
      ) {
        continue;
      }
      hits.push({
        markerId: marker.id,
        label: marker.label,
        generator: marker.generator,
        severity: marker.severity,
        needle,
        offset: idx,
        snippet: text.slice(Math.max(0, idx - 60), idx + needle.length + 120),
        encoding: "ascii",
      });
    }
  }
  return hits;
}

export interface NeutralizeResult {
  /** Number of marker occurrences that were overwritten. */
  count: number;
  /** Distinct marker labels that were touched. */
  markers: string[];
  /** Labels of invalidated provenance UUIDs. */
  invalidatedUuids: string[];
}

/**
 * Overwrite every provenance marker inside `buf` **in place**. Each match is
 * replaced by spaces of identical length so byte offsets, chunk sizes and
 * checksums of the surrounding container stay valid.
 */
export function neutralizeProvenanceBytes(
  buf: Buffer,
  options: { invalidateUuids?: boolean } = {}
): NeutralizeResult {
  const result: NeutralizeResult = { count: 0, markers: [], invalidatedUuids: [] };
  const touched = new Set<string>();

  for (const marker of PROVENANCE_MARKERS) {
    for (const needle of marker.needles) {
      let offset = findNeedle(buf, needle);
      while (offset !== -1) {
        buf.fill(0x20, offset, offset + needle.length);
        result.count++;
        touched.add(marker.label);
        offset = findNeedle(buf, needle, offset + needle.length);
      }
      // UTF-16LE variant
      const u16 = utf16leNeedle(needle);
      let uOffset = findUtf16Needle(buf, u16);
      while (uOffset !== -1) {
        buf.fill(0x20, uOffset, uOffset + u16.length);
        result.count++;
        touched.add(marker.label);
        uOffset = findUtf16Needle(buf, u16, uOffset + u16.length);
      }
    }
  }

  if (options.invalidateUuids !== false) {
    for (const uuid of PROVENANCE_UUIDS) {
      const needle = Buffer.from(uuid.bytes);
      let offset = buf.indexOf(needle);
      while (offset !== -1) {
        buf.fill(0x00, offset, offset + uuid.bytes.length);
        result.invalidatedUuids.push(uuid.label);
        result.count++;
        offset = buf.indexOf(needle, offset + uuid.bytes.length);
      }
    }
  }

  result.markers = Array.from(touched);
  return result;
}

/** Maximum byte length of any needle (used to size streaming windows). */
export const MAX_NEEDLE_LENGTH = PROVENANCE_MARKERS.reduce(
  (max, marker) =>
    marker.needles.reduce((m, n) => Math.max(m, n.length), max),
  0
);
