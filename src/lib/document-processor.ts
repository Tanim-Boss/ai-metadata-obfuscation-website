import { PDFDocument, PDFName } from "pdf-lib";
import JSZip from "jszip";
import type { ForensicReport } from "./metadata-inspector";
import type { DocumentMetadataOptions, TelemetryOptions } from "./camera-profiles";
import { inspectDocumentBuffer } from "./document-inspector";
import { getExtension } from "./media-classify";

export interface ProcessedDocumentResult {
  outputBuffer: Buffer;
  outputFilename: string;
  mimeType: string;
  beforeReport: ForensicReport;
  afterReport: ForensicReport;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  epub: "application/epub+zip",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  json: "application/json",
  tex: "application/x-tex",
};

function mimeFromExt(ext: string): string {
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function baseName(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return stem.replace(/[^\w.-]+/g, "_").slice(0, 80) || "document";
}

/* ----------------------------- PDF ------------------------------- */

async function stripPdf(
  buf: Buffer,
  docMeta?: DocumentMetadataOptions
): Promise<Buffer> {
  try {
    const pdf = await PDFDocument.load(buf, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    pdf.setTitle(docMeta?.title?.trim() || "");
    pdf.setAuthor(docMeta?.author?.trim() || "");
    pdf.setSubject(docMeta?.subject?.trim() || "");
    const kw = docMeta?.keywords
      ? docMeta.keywords
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    pdf.setKeywords(kw);
    pdf.setCreator(docMeta?.creator?.trim() || "");
    pdf.setProducer("");
    // Neutralize timestamps so the real authoring date is not leaked.
    const neutralDate = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
    pdf.setCreationDate(neutralDate);
    pdf.setModificationDate(neutralDate);
    const catalog = pdf.catalog;
    catalog.delete(PDFName.of("Metadata"));
    const raw = await pdf.save();
    return Buffer.from(raw);
  } catch {
    return stripPdfLightweight(buf);
  }
}

// In-place same-length blanking so the xref offsets stay valid.
function stripPdfLightweight(buf: Buffer): Buffer {
  let text = buf.toString("latin1");
  const lenBefore = text.length;

  // Blank Info dictionary string values.
  const infoKeys = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"];
  for (const k of infoKeys) {
    const re = new RegExp(`(/${k})(\\s*\\()((?:[^()\\\\]|\\\\.)*)(\\))`, "gs");
    text = text.replace(re, (_full, open, sp, inner, close) => {
      const blanked = inner.replace(/[^\n\r]/g, " ");
      return `${open}${sp}${blanked}${close}`;
    });
  }

  // Blank the XMP packet region (preserving byte length).
  const xmpStart = text.indexOf("<?xpacket");
  if (xmpStart >= 0) {
    let xmpEnd = text.indexOf("</x:xmpmeta>", xmpStart);
    if (xmpEnd >= 0) xmpEnd += "</x:xmpmeta>".length;
    else {
      xmpEnd = text.indexOf("<?xpacket end", xmpStart);
      if (xmpEnd >= 0) xmpEnd += "<?xpacket end".length;
    }
    if (xmpEnd > xmpStart) {
      const blanked = " ".repeat(xmpEnd - xmpStart);
      text = text.slice(0, xmpStart) + blanked + text.slice(xmpEnd);
    }
  }

  if (text.length !== lenBefore) {
    // Safety: if length drifted, return the original buffer untouched.
    return buf;
  }
  return Buffer.from(text, "latin1");
}

/* ----------------------------- ZIP ------------------------------- */

function blankEpubMetadata(opf: string): string {
  const tagsToBlank = [
    "dc:creator",
    "dc:contributor",
    "dc:publisher",
    "dc:date",
    "dc:identifier",
    "dc:rights",
    "dc:source",
  ];
  let s = opf;
  for (const t of tagsToBlank) {
    const re = new RegExp(`(<${t}\\b[^>]*>)[\\s\\S]*?(</${t}>)`, "gi");
    s = s.replace(re, (_full, open, close) => `${open}${close}`);
  }
  // Blank identity-related <meta property="..."> content attributes.
  s = s.replace(
    /<meta\b[^>]*\bproperty="([^"]*(creator|contributor|publisher|date|identifier)[^"]*)"[^>]*\/?>/gi,
    (m) => m.replace(/content="[^"]*"/i, 'content=""')
  );
  return s;
}

async function stripZip(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const toRemove: string[] = [];

  zip.forEach((path) => {
    const p = path.toLowerCase();
    if (
      p === "docprops/core.xml" ||
      p === "docprops/app.xml" ||
      p === "docprops/custom.xml" ||
      p.startsWith("customxml") ||
      p.startsWith("docprops/custom.") ||
      p === "meta-inf/metadata.xml" ||
      p === "meta.xml" ||
      p === "word/people.xml" ||
      p === "word/comments.xml" ||
      p === "word/commentsext.xml" ||
      p === "ppt/comments.xml" ||
      p === "xl/comments1.xml"
    ) {
      toRemove.push(path);
    }
  });

  // EPUB: blank identity fields inside content.opf (keeps the file valid).
  for (const path of Object.keys(zip.files)) {
    if (path.toLowerCase().endsWith("content.opf")) {
      const file = zip.file(path);
      if (file) {
        const opf = await file.async("string");
        zip.file(path, blankEpubMetadata(opf));
      }
    }
  }

  for (const p of toRemove) zip.remove(p);

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return Buffer.from(out);
}

/* --------------------------- Public ------------------------------ */

export async function processDocumentBuffer(
  inputBuffer: Buffer,
  originalFilename: string,
  options?: Partial<TelemetryOptions>
): Promise<ProcessedDocumentResult> {
  const beforeReport = await inspectDocumentBuffer(inputBuffer, originalFilename);
  const isCleanOnly = options?.mode === "clean";
  const docMeta = isCleanOnly ? undefined : options?.documentMetadata;

  const ext = getExtension(originalFilename) || "bin";
  const mimeType = mimeFromExt(ext);

  const head = inputBuffer.subarray(0, 8).toString("latin1");
  let outputBuffer: Buffer;

  if (head.startsWith("%PDF-")) {
    outputBuffer = await stripPdf(inputBuffer, docMeta);
  } else if (inputBuffer.subarray(0, 4).toString("latin1") === "PK\u0003\u0004") {
    outputBuffer = await stripZip(inputBuffer);
  } else {
    // Plain text / RTF / legacy OLE2 — no structured, removable metadata
    // container exists, so we pass the bytes through untouched.
    outputBuffer = inputBuffer;
  }

  const prefix = isCleanOnly ? "clean" : "sanitized";
  const outputFilename = `${prefix}_${baseName(originalFilename)}.${ext}`;
  const afterReport = await inspectDocumentBuffer(outputBuffer, outputFilename);

  return {
    outputBuffer,
    outputFilename,
    mimeType,
    beforeReport,
    afterReport,
  };
}
