import crypto from "crypto";
import zlib from "zlib";
import JSZip from "jszip";
import type {
  AiFinding,
  BinaryChunkInfo,
  ForensicReport,
  MetadataTagRow,
} from "./metadata-inspector";
import { getExtension } from "./media-classify";

/* ------------------------------------------------------------------ */
/*  Byte-level classification (server only)                           */
/* ------------------------------------------------------------------ */

const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function isDocumentBuffer(buf: Buffer, filename: string): boolean {
  const head = buf.subarray(0, 8).toString("latin1");
  if (head.startsWith("%PDF-")) return true;
  if (buf.subarray(0, 4).toString("latin1") === "PK\u0003\u0004") return true;
  if (buf.length >= 8 && buf.subarray(0, 8).equals(OLE2_MAGIC)) return true;
  if (head.startsWith("{\\rtf")) return true;
  // Fallback: trust the file extension when the magic bytes are inconclusive.
  const ext = getExtension(filename);
  return [
    "pdf",
    "doc",
    "docx",
    "txt",
    "rtf",
    "epub",
    "odt",
    "ods",
    "odp",
    "ppt",
    "pptx",
    "xls",
    "xlsx",
    "csv",
    "md",
    "html",
    "htm",
    "xml",
    "tex",
    "key",
    "pages",
    "json",
  ].includes(ext);
}

/* ------------------------------------------------------------------ */
/*  Small XML / PDF helpers                                            */
/* ------------------------------------------------------------------ */

function decodePdfLiteral(raw: string): string {
  let s = raw.trim();
  // Strip surrounding brackets if still present.
  if (s.startsWith("<") && s.endsWith(">") && !s.startsWith("<<")) {
    s = s.slice(1, -1);
  } else if (s.startsWith("(") && s.endsWith(")")) {
    s = s.slice(1, -1);
  }

  // Hex string form: FEFF0041... (often UTF-16BE, e.g. pdf-lib output)
  const isHex = /^[0-9A-Fa-f]+$/.test(s) && s.length % 2 === 0 && s.length >= 4;
  if (isHex) {
    const buf = Buffer.from(s, "hex");
    try {
      const decoded = new TextDecoder("utf-16be").decode(buf).trim();
      if (decoded && !decoded.includes("\uFFFD")) return decoded;
    } catch {
      /* fall through to byte decode */
    }
    let out = "";
    const start = buf[0] === 0xfe && buf[1] === 0xff ? 2 : 0;
    for (let i = start; i + 1 < buf.length; i += 2) {
      out += String.fromCharCode(buf[i + 1]);
    }
    return out.trim();
  }

  return s
    .replace(/\\([\\()])/g, "$1")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, code) =>
      String.fromCharCode(parseInt(code, 8) || 32)
    )
    .trim();
}

// PDF metadata (Info dict, XMP) is frequently stored inside FlateDecode
// streams, so inflate every compressed stream and append it to a single
// searchable blob used by the parsers below.
function getPdfSearchableText(buf: Buffer): string {
  const text = buf.toString("latin1");
  let result = text;
  const marker = "/FlateDecode";
  let idx = text.indexOf(marker);
  while (idx >= 0) {
    const streamStart = text.indexOf("stream", idx);
    if (streamStart < 0) break;
    let dataStart = streamStart + 6;
    if (text[dataStart] === "\r") dataStart++;
    if (text[dataStart] === "\n") dataStart++;
    const end = text.indexOf("endstream", dataStart);
    if (end < 0) break;
    try {
      const inflated = zlib.inflateSync(buf.subarray(dataStart, end));
      result += "\n" + inflated.toString("latin1");
    } catch {
      // Skip streams that fail to inflate (not all FlateDecode are metadata).
    }
    idx = text.indexOf(marker, idx + marker.length);
  }
  return result;
}

function xmlTags(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const value = (m[1] || "").replace(/\s+/g, " ").trim();
    if (value) out.push(value);
  }
  return out;
}

function xmlAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*\\b${attr}="([^"]*)"`, "gi");
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function pushTag(
  tags: MetadataTagRow[],
  group: string,
  tag: string,
  value: string | null | undefined
): void {
  if (!value) return;
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return;
  if (tags.some((t) => t.tag === tag && t.value === v)) return;
  tags.push({ group, tag, value: v.length > 400 ? `${v.slice(0, 400)}…` : v });
}

/* ------------------------------------------------------------------ */
/*  PDF metadata extraction                                           */
/* ------------------------------------------------------------------ */

function parsePdfInfo(buf: Buffer): Record<string, string> {
  const text = getPdfSearchableText(buf);
  const result: Record<string, string> = {};
  const keys = [
    "Title",
    "Author",
    "Subject",
    "Keywords",
    "Creator",
    "Producer",
    "CreationDate",
    "ModDate",
  ];
  for (const k of keys) {
    const re = new RegExp(
      `/${k}\\s*(\\((?:[^()\\\\]|\\\\.)*\\)|<[0-9A-Fa-f]+>)`,
      "s"
    );
    const m = text.match(re);
    if (m) {
      let inner = m[1];
      if (inner.startsWith("(")) inner = inner.slice(1, -1);
      else if (inner.startsWith("<")) inner = inner.slice(1, -1);
      result[k] = decodePdfLiteral(inner);
    }
  }
  return result;
}

function parsePdfXmp(buf: Buffer): Record<string, string> {
  const text = getPdfSearchableText(buf);
  const start = text.indexOf("<?xpacket");
  let region: string;
  if (start < 0) {
    // Some PDFs embed XMP without the xpacket wrapper.
    const alt = text.indexOf("<x:xmpmeta");
    if (alt < 0) return {};
    region = text.slice(alt);
  } else {
    const end = text.indexOf("</x:xmpmeta>", start);
    region = end > start ? text.slice(start, end + "</x:xmpmeta>".length) : "";
  }
  const result: Record<string, string> = {};
  const nsKeys: Record<string, string> = {
    "dc:title": "Title",
    "dc:creator": "Creator",
    "dc:description": "Description",
    "dc:subject": "Subject",
    "dc:format": "Format",
    "xmp:CreatorTool": "CreatorTool",
    "xmp:CreateDate": "CreateDate",
    "xmp:ModifyDate": "ModifyDate",
    "xmp:MetadataDate": "MetadataDate",
    "pdf:Producer": "Producer",
    "pdf:Keywords": "Keywords",
    "photoshop:DateCreated": "DateCreated",
  };
  for (const [ns, friendly] of Object.entries(nsKeys)) {
    const tag = ns.split(":")[1];
    const values = xmlTags(region, tag);
    if (values.length) result[friendly] = values.join(", ");
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  ZIP-based document metadata (Office, EPUB, ODF)                   */
/* ------------------------------------------------------------------ */

async function findZipEntry(
  zip: JSZip,
  name: string
): Promise<JSZip.JSZipObject | null> {
  const lower = name.toLowerCase();
  const file = zip.file(name);
  if (file) return file;
  for (const path of Object.keys(zip.files)) {
    if (path.toLowerCase() === lower) return zip.file(path) ?? null;
  }
  return null;
}

async function findZipEntryBySuffix(
  zip: JSZip,
  suffix: string
): Promise<JSZip.JSZipObject | null> {
  const lower = suffix.toLowerCase();
  for (const path of Object.keys(zip.files)) {
    if (path.toLowerCase().endsWith(lower)) return zip.file(path) ?? null;
  }
  return null;
}

async function extractZipProperties(
  buf: Buffer,
  tags: MetadataTagRow[],
  raw: string[]
): Promise<string[]> {
  const sources: string[] = [];
  const zip = await JSZip.loadAsync(buf);

  // Office Open XML — core properties
  const core = await findZipEntry(zip, "docProps/core.xml");
  if (core) {
    const xml = await core.async("string");
    raw.push(xml);
    pushTag(tags, "OOXML Core", "Title", xmlTags(xml, "title")[0]);
    pushTag(tags, "OOXML Core", "Author", xmlTags(xml, "creator")[0]);
    pushTag(tags, "OOXML Core", "Last Modified By", xmlTags(xml, "lastModifiedBy")[0]);
    pushTag(tags, "OOXML Core", "Description", xmlTags(xml, "description")[0]);
    pushTag(tags, "OOXML Core", "Subject", xmlTags(xml, "subject")[0]);
    pushTag(tags, "OOXML Core", "Keywords", xmlTags(xml, "keywords")[0]);
    pushTag(tags, "OOXML Core", "Language", xmlTags(xml, "language")[0]);
    pushTag(tags, "OOXML Core", "Created", xmlTags(xml, "created")[0]);
    pushTag(tags, "OOXML Core", "Modified", xmlTags(xml, "modified")[0]);
    pushTag(tags, "OOXML Core", "Revision", xmlTags(xml, "revision")[0]);
    sources.push("docProps/core.xml");
  }

  // Office Open XML — extended app properties
  const app = await findZipEntry(zip, "docProps/app.xml");
  if (app) {
    const xml = await app.async("string");
    raw.push(xml);
    pushTag(tags, "OOXML App", "Application", xmlTags(xml, "Application")[0]);
    pushTag(tags, "OOXML App", "Company", xmlTags(xml, "Company")[0]);
    pushTag(tags, "OOXML App", "App Version", xmlTags(xml, "AppVersion")[0]);
    sources.push("docProps/app.xml");
  }

  // EPUB — OPF metadata
  const opf = await findZipEntryBySuffix(zip, "content.opf");
  if (opf) {
    const xml = await opf.async("string");
    raw.push(xml);
    pushTag(tags, "EPUB OPF", "Title", xmlTags(xml, "title")[0]);
    pushTag(tags, "EPUB OPF", "Creator", xmlTags(xml, "creator")[0]);
    pushTag(tags, "EPUB OPF", "Contributor", xmlTags(xml, "contributor")[0]);
    pushTag(tags, "EPUB OPF", "Publisher", xmlTags(xml, "publisher")[0]);
    pushTag(tags, "EPUB OPF", "Date", xmlTags(xml, "date")[0]);
    pushTag(tags, "EPUB OPF", "Identifier", xmlTags(xml, "identifier")[0]);
    pushTag(tags, "EPUB OPF", "Language", xmlTags(xml, "language")[0]);
    pushTag(tags, "EPUB OPF", "Subject", xmlTags(xml, "subject")[0]);
    pushTag(tags, "EPUB OPF", "Rights", xmlTags(xml, "rights")[0]);
    const metas = xml.match(/<meta\b[^>]*\/?>/gi) || [];
    for (const m of metas) {
      const prop = xmlAttr(m, "meta", "property");
      const content = xmlAttr(m, "meta", "content");
      if (prop && content) pushTag(tags, "EPUB OPF", `meta:${prop}`, content);
    }
    sources.push("OEBPS/content.opf");
  }

  // OpenDocument — meta.xml
  const odf = await findZipEntry(zip, "meta.xml");
  if (odf) {
    const xml = await odf.async("string");
    raw.push(xml);
    pushTag(tags, "ODF Meta", "Title", xmlTags(xml, "title")[0]);
    pushTag(tags, "ODF Meta", "Creator", xmlTags(xml, "creator")[0]);
    pushTag(tags, "ODF Meta", "Initial Creator", xmlTags(xml, "initial-creator")[0]);
    pushTag(tags, "ODF Meta", "Description", xmlTags(xml, "description")[0]);
    pushTag(tags, "ODF Meta", "Subject", xmlTags(xml, "subject")[0]);
    pushTag(tags, "ODF Meta", "Creation Date", xmlTags(xml, "creation-date")[0]);
    pushTag(tags, "ODF Meta", "Date", xmlTags(xml, "date")[0]);
    pushTag(tags, "ODF Meta", "Generator", xmlTags(xml, "generator")[0]);
    sources.push("meta.xml");
  }

  return sources;
}

/* ------------------------------------------------------------------ */
/*  AI generator pattern matching                                     */
/* ------------------------------------------------------------------ */

interface AiPattern {
  re: RegExp;
  generator: string;
  severity: "critical" | "warning";
}

const AI_PATTERNS: AiPattern[] = [
  { re: /midjourney/i, generator: "Midjourney", severity: "critical" },
  { re: /dall[- ]?e|dall·e/i, generator: "OpenAI DALL·E", severity: "critical" },
  { re: /chatgpt|gpt-?\d|openai/i, generator: "OpenAI / ChatGPT", severity: "critical" },
  { re: /sora\b/i, generator: "OpenAI Sora", severity: "critical" },
  { re: /stable\s*diffusion|comfyui|automatic1111|a1111|forg(ui|e)/i, generator: "Stable Diffusion Pipeline", severity: "critical" },
  { re: /firefly|adobe\s*express/i, generator: "Adobe Firefly", severity: "critical" },
  {
    re: /imagen|synthid|gemini|bard\b/i,
    generator: "Google Imagen / SynthID",
    severity: "critical",
  },
  { re: /canva/i, generator: "Canva AI", severity: "warning" },
  { re: /gamma\s*app|gamma\.app/i, generator: "Gamma AI", severity: "warning" },
  { re: /runway/i, generator: "Runway AI", severity: "critical" },
  { re: /synthesia|heygen|descript|pictory|pika\s* labs?|luma\s* labs?|krea|leonardo\.ai|ideogram|playground\s*ai|novelai/i, generator: "AI Media Generator", severity: "critical" },
  { re: /elevenlabs/i, generator: "ElevenLabs", severity: "warning" },
  { re: /claude|anthropic/i, generator: "Anthropic Claude", severity: "warning" },
  { re: /notion\s*ai|quillbot|grammarly|jasper|copy\.ai|sudowrite|writer\.com/i, generator: "AI Writing Assistant", severity: "warning" },
  { re: /\b(ai|artificial intelligence)\s+(generated|created|written|assisted)\b/i, generator: "Self-Declared AI Generation", severity: "warning" },
];

function scanDocumentAi(
  text: string,
  findings: AiFinding[],
  generators: Set<string>
): void {
  for (const pattern of AI_PATTERNS) {
    if (pattern.re.test(text)) {
      generators.add(pattern.generator);
      findings.push({
        id: `doc-ai-${findings.length}`,
        severity: pattern.severity,
        generator: pattern.generator,
        location: "Document Text / Metadata",
        key: "AI Generator Signature",
        snippet: truncate(text.match(pattern.re)?.[0] ?? pattern.generator, 200),
        explanation: `The document references ${pattern.generator}, indicating AI-assisted generation or editing that may leave identifiable provenance.`,
      });
    }
  }
}

function truncate(str: string, max = 220): string {
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, " ").trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max)}…`;
}

/* ------------------------------------------------------------------ */
/*  Format detection                                                  */
/* ------------------------------------------------------------------ */

async function detectDocumentFormat(
  buf: Buffer,
  filename: string
): Promise<{ format: string; kind: "pdf" | "zip" | "ole2" | "rtf" | "text" }> {
  const head = buf.subarray(0, 8).toString("latin1");
  const ext = getExtension(filename);

  if (head.startsWith("%PDF-")) return { format: "PDF", kind: "pdf" };
  if (buf.subarray(0, 4).toString("latin1") === "PK\u0003\u0004") {
    try {
      const zip = await JSZip.loadAsync(buf);
      const names = Object.keys(zip.files).map((n) => n.toLowerCase());
      const has = (s: string) => names.some((n) => n === s || n.startsWith(s));
      if (has("meta-inf/container.xml") && names.some((n) => n.endsWith("content.opf")))
        return { format: "EPUB", kind: "zip" };
      if (has("docprops/core.xml") || has("word/document.xml"))
        return { format: "DOCX", kind: "zip" };
      if (has("xl/workbook.xml")) return { format: "XLSX", kind: "zip" };
      if (has("ppt/presentation.xml")) return { format: "PPTX", kind: "zip" };
      if (has("content.xml") && has("meta.xml")) {
        if (ext === "ods") return { format: "ODS", kind: "zip" };
        if (ext === "odp") return { format: "ODP", kind: "zip" };
        return { format: "ODT", kind: "zip" };
      }
      return { format: "ZIP", kind: "zip" };
    } catch {
      return { format: "ZIP", kind: "zip" };
    }
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(OLE2_MAGIC))
    return { format: "DOC", kind: "ole2" };
  if (head.startsWith("{\\rtf")) return { format: "RTF", kind: "rtf" };

  const textFormats: Record<string, string> = {
    txt: "TXT",
    csv: "CSV",
    md: "MD",
    markdown: "MD",
    html: "HTML",
    htm: "HTML",
    xml: "XML",
    json: "JSON",
    tex: "TEX",
  };
  return { format: textFormats[ext] || "TXT", kind: "text" };
}

/* ------------------------------------------------------------------ */
/*  Public: inspect a document buffer                                 */
/* ------------------------------------------------------------------ */

export async function inspectDocumentBuffer(
  buf: Buffer,
  filename = "document"
): Promise<ForensicReport> {
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const { format, kind } = await detectDocumentFormat(buf, filename);

  const tags: MetadataTagRow[] = [];
  const rawParts: string[] = [];
  const sources: string[] = [];

  if (kind === "pdf") {
    const info = parsePdfInfo(buf);
    const xmp = parsePdfXmp(buf);
    const merged = { ...info, ...xmp };
    const labelMap: Record<string, [string, string]> = {
      Title: ["PDF Info", "Title"],
      Author: ["PDF Info", "Author"],
      Subject: ["PDF Info", "Subject"],
      Keywords: ["PDF Info", "Keywords"],
      Creator: ["PDF Info", "Creator"],
      Producer: ["PDF Info", "Producer"],
      CreationDate: ["PDF Info", "Creation Date"],
      ModDate: ["PDF Info", "Modified Date"],
      CreatorTool: ["PDF XMP", "Creator Tool"],
      CreateDate: ["PDF XMP", "Create Date"],
      ModifyDate: ["PDF XMP", "Modify Date"],
      Description: ["PDF XMP", "Description"],
      Format: ["PDF XMP", "Format"],
      MetadataDate: ["PDF XMP", "Metadata Date"],
      DateCreated: ["PDF XMP", "Date Created"],
    };
    for (const [key, value] of Object.entries(merged)) {
      const mapped = labelMap[key];
      if (mapped) pushTag(tags, mapped[0], mapped[1], value);
    }
    if (Object.keys(info).length) sources.push("Info Dictionary");
    if (Object.keys(xmp).length) sources.push("XMP");
    rawParts.push(JSON.stringify(merged));
  } else if (kind === "zip") {
    const zipSources = await extractZipProperties(buf, tags, rawParts);
    sources.push(...zipSources);
  } else if (kind === "ole2") {
    const text = buf.toString("latin1");
    rawParts.push(text.slice(0, 200_000));
  } else if (kind === "rtf") {
    const text = buf.toString("latin1");
    rawParts.push(text.slice(0, 200_000));
    for (const field of [
      "author",
      "creatim",
      "revtim",
      "operator",
      "manager",
      "company",
    ]) {
      const m = text.match(new RegExp(`\\\\${field}\\s+([^;\\\\{}]+)`));
      if (m) pushTag(tags, "RTF Info", field, m[1].trim());
    }
    sources.push("RTF Info");
  } else {
    rawParts.push(buf.toString("latin1").slice(0, 200_000));
  }

  const findings: AiFinding[] = [];
  const generators = new Set<string>();
  const allText =
    rawParts.join(" ") + " " + tags.map((t) => `${t.tag} ${t.value}`).join(" ");

  scanDocumentAi(allText, findings, generators);

  // Metadata leakage (identity / organization)
  const identityTags = tags.filter((t) =>
    [
      "Author",
      "Creator",
      "Company",
      "Last Modified By",
      "Initial Creator",
      "Producer",
      "Manager",
      "Operator",
      "Contributor",
      "Publisher",
    ].includes(t.tag)
  );
  if (identityTags.length > 0) {
    findings.push({
      id: `doc-leak-${findings.length}`,
      severity: "warning",
      generator: "Embedded Document Identity",
      location: "Document Properties",
      key: identityTags.map((t) => t.tag).join(", "),
      snippet: identityTags.map((t) => `${t.tag}: ${t.value}`).join(" · "),
      explanation:
        "Document properties expose author, organization, or account identity that can deanonymize the file even after AI signatures are removed.",
    });
  }

  // Embedded email address
  const emailMatch = allText.match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
  );
  if (emailMatch) {
    findings.push({
      id: `doc-email-${findings.length}`,
      severity: "warning",
      generator: "Embedded Email Address",
      location: "Document Properties / Text",
      key: "email",
      snippet: emailMatch[0],
      explanation:
        "An email address in metadata or text can tie the document to a specific person or organization.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "doc-clean-0",
      severity: "info",
      generator: "No Embedded Metadata",
      location: "Document",
      key: "metadata",
      snippet: `${format} carries no extractable authoring metadata.`,
      explanation:
        "No document-level author, creator, or provenance metadata was found to obfuscate.",
    });
  }

  // Deduplicate findings
  const seen = new Set<string>();
  const uniqueFindings = findings.filter((f) => {
    const sig = `${f.generator}|${f.location}|${f.key}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  const criticalCount = uniqueFindings.filter((f) => f.severity === "critical").length;
  const warningCount = uniqueFindings.filter((f) => f.severity === "warning").length;

  let aiRiskScore = 0;
  let authenticityStatus: ForensicReport["authenticityStatus"] = "stripped";
  if (criticalCount > 0) {
    aiRiskScore = Math.min(100, 75 + criticalCount * 10 + warningCount * 5);
    authenticityStatus = "ai-detected";
  } else if (warningCount > 0) {
    aiRiskScore = Math.min(70, 38 + warningCount * 14);
    authenticityStatus = "suspicious";
  } else {
    aiRiskScore = tags.length > 0 ? 12 : 6;
    authenticityStatus = "stripped";
  }

  const chunks: BinaryChunkInfo[] = [];
  if (sources.length) {
    chunks.push({
      id: "doc-meta",
      marker: format,
      label: `Document metadata (${sources.join(", ")})`,
      byteLength: 0,
      offset: 0,
      category: "xmp-iptc",
    });
  }

  return {
    filename,
    mediaType: "document",
    containerFormat: format,
    byteSize: buf.length,
    sha256,
    authenticityStatus,
    aiRiskScore,
    detectedGenerators: Array.from(generators),
    aiFindings: uniqueFindings,
    chunks,
    exifSummary: {},
    tags,
  };
}
