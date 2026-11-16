import type {
  AiFinding,
  AuthenticityStatus,
  ExifSummary,
  IptcProperty,
  MediaKind,
  MetadataTagRow,
  Severity,
  XmpProperty,
} from "./types";

interface Evidence {
  location: string;
  key: string;
  text: string;
  /** Tag / property name is a software-like or provenance-bearing field. */
  strong: boolean;
}

export interface ProvenanceInput {
  filename: string;
  mediaType: MediaKind;
  containerFormat: string;
  tags: MetadataTagRow[];
  xmpProperties: XmpProperty[];
  xmpPacket?: string;
  iptc: IptcProperty[];
  exifSummary: ExifSummary;
  textBlobs: Array<{ location: string; key: string; text: string }>;
  hasC2paBox?: boolean;
  trailingBytes?: number;
  parsedWith: string[];
}

export interface ProvenanceResult {
  findings: AiFinding[];
  generators: string[];
  aiRiskScore: number;
  authenticityStatus: AuthenticityStatus;
}

const MAX_FINDINGS = 40;
const SNIPPET = 240;

const STRONG_KEY =
  /(software|creatortool|creator_tool|creator|encoder|originatingprogram|processingsoftware|writingapp|muxingapp|application|generator|tool|agent|history|parameters|prompt|workflow|usercomment|comment|description|keywords|digital\s*source|provenance|manifest|claim)/i;

const STRONG_LOCATION =
  /(C2PA|JUMBF|APP11|XMP|IPTC|QuickTime|Software|Comment|COM|UserComment)/i;

interface TokenRule {
  name: string;
  rule: string;
  regex: RegExp;
}

/**
 * Generator fingerprints. Every pattern is word-boundary anchored on purpose:
 * substring matching used to flag normal photos (e.g. "luminance" matching
 * "luma"), which produced bogus AI verdicts.
 */
const TOKEN_RULES: TokenRule[] = [
  { name: "OpenAI DALL·E", rule: "dalle", regex: /\bdall[·.\-]?e\b/i },
  { name: "OpenAI GPT-4o image generation", rule: "gpt4o", regex: /\bgpt-image-1\b|\bgpt-4o\b/i },
  { name: "OpenAI Sora", rule: "sora", regex: /\bsora\b|\bopenai\b[^\n]{0,40}\bvideo\b/i },
  { name: "Adobe Firefly", rule: "firefly", regex: /\badobe\s+firefly\b|\bfirefly\b[^\n]{0,40}\b(?:adobe|generat|model)\b/i },
  { name: "Google Imagen", rule: "imagen", regex: /\bgoogle\s+imagen\b|\bimagen\s*[234]\b/i },
  { name: "Google SynthID", rule: "synthid", regex: /\bsynthid\b/i },
  { name: "Midjourney", rule: "midjourney", regex: /\bmidjourney\b/i },
  { name: "Stable Diffusion", rule: "sd", regex: /\bstable[\s-]?diffusion\b|\bstability\s+ai\b|\bsdxl\b/i },
  { name: "ComfyUI", rule: "comfyui", regex: /\bcomfy\s?ui\b/i },
  { name: "FLUX", rule: "flux", regex: /\bflux[.\s-]?(?:1|dev|schnell|pro|kontext|redux)\b|\bflux1[-_]|\bflux[_-]dev\b/i },
  { name: "Fooocus", rule: "fooocus", regex: /\bfooocus\b/i },
  { name: "NovelAI", rule: "novelai", regex: /\bnovelai\b/i },
  { name: "InvokeAI", rule: "invokeai", regex: /\binvoke\s?ai\b/i },
  { name: "Leonardo.Ai", rule: "leonardo", regex: /\bleonardo\.?ai\b/i },
  { name: "Ideogram", rule: "ideogram", regex: /\bideogram\b/i },
  { name: "Runway", rule: "runway", regex: /\brunway\s*(?:gen|ml|act)[-\s]?\d?\b/i },
  { name: "Kling AI", rule: "kling", regex: /\bkling\s*(?:ai|video)\b/i },
  { name: "Luma Dream Machine", rule: "luma", regex: /\bluma\s+dream\s+machine\b|\bdream\s+machine\b/i },
  { name: "Pika", rule: "pika", regex: /\bpika\s*(?:labs|video|ai)\b/i },
  { name: "Playground AI", rule: "playground", regex: /\bplayground\s*(?:ai|v\d)\b/i },
  { name: "Bing Image Creator", rule: "bing", regex: /\bbing\s+image\s+creator\b/i },
  { name: "Microsoft Designer", rule: "designer", regex: /\bcopilot\s+designer\b|\bmicrosoft\s+designer\b/i },
  { name: "Recraft", rule: "recraft", regex: /\brecraft\b/i },
];

const GENERATED_PHRASE =
  /\b(?:generated|created|made|rendered|synthesi[sz]ed|produced|crafted)\s+(?:by|with|using)\b[^.]{0,80}?\b(dall[·.\-]?e|midjourney|stable\s?diffusion|firefly|comfy\s?ui|flux|imagen|synthid|novelai|invoke\s?ai|runway|kling|luma|sora|gpt-4o|gpt-image|ideogram|leonardo)/i;

const DIFFUSION_PARAMS =
  /\bsteps\s*:\s*\d+|\bsampler\s*:\s*\w|negative\s+prompt\s*:|cfg\s*scale\s*:\s*[\d.]+|\bseed\s*:\s*\d{4,}|"class_type"\s*:|\bmodel\s+hash\s*:\s*[0-9a-f]{8,}/i;

const C2PA_ACTION = /\bc2pa\.(?:created|opened|edited|converted|placed|resized|filtered|adjusted)\b/i;

function truncateEvidence(text: string, max = SNIPPET): string {
  const clean = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function buildEvidence(input: ProvenanceInput): Evidence[] {
  const evidence: Evidence[] = [];

  const push = (location: string, key: string, text: string) => {
    if (!text) return;
    evidence.push({
      location,
      key,
      text,
      strong: STRONG_KEY.test(key) || STRONG_LOCATION.test(location),
    });
  };

  for (const tag of input.tags) {
    push(
      tag.group === "XMP" ? `XMP ${tag.tag}` : `${tag.group} ${tag.tag}`,
      tag.tag,
      tag.value
    );
  }
  for (const prop of input.xmpProperties) {
    push("XMP", prop.key, prop.value);
  }
  for (const prop of input.iptc) {
    push("IPTC-IIM", prop.key, prop.value);
  }
  for (const blob of input.textBlobs) {
    push(blob.location, blob.key, blob.text);
  }
  if (input.xmpPacket) {
    push("XMP packet", "xmpmeta", input.xmpPacket);
  }
  // Software-ish summary fields are the highest-signal evidence.
  if (input.exifSummary.software) push("EXIF Software", "Software", input.exifSummary.software);
  if (input.exifSummary.userComment)
    push("EXIF UserComment", "UserComment", input.exifSummary.userComment);
  if (input.exifSummary.artist) push("EXIF Artist", "Artist", input.exifSummary.artist);
  if (input.exifSummary.copyright)
    push("EXIF Copyright", "Copyright", input.exifSummary.copyright);

  return evidence;
}

export function analyzeProvenance(input: ProvenanceInput): ProvenanceResult {
  const findings: AiFinding[] = [];
  const generators = new Set<string>();
  const seen = new Set<string>();

  /**
   * One finding per rule: the same manifest usually shows up in several tags
   * (XMP rows, the raw packet, a JUMBF blob...). Keeping the first — strongest
   * — occurrence avoids drowning the report in duplicates.
   */
  const addFinding = (finding: Omit<AiFinding, "id">) => {
    const signature = finding.rule ?? finding.generator;
    if (seen.has(signature)) return;
    seen.add(signature);
    if (findings.length >= MAX_FINDINGS) return;
    findings.push({ ...finding, id: `finding-${findings.length}` });
  };

  const evidence = buildEvidence(input);

  /* ---------------------------------------------------------------- */
  /* 1. Structural C2PA / JUMBF provenance                            */
  /* ---------------------------------------------------------------- */
  const c2paEvidence = evidence.find((item) =>
    /\bc2pa\b|\bjumbf?\b|contentauth|contentauthenticity/i.test(item.text)
  );

  if (input.hasC2paBox || c2paEvidence) {
    const snippet =
      c2paEvidence?.text ??
      `JUMBF provenance container present in ${input.containerFormat} structure`;
    generators.add("C2PA / Content Credentials");
    addFinding({
      severity: "critical",
      generator: "C2PA / Content Credentials",
      location: c2paEvidence?.location ?? `${input.containerFormat} container`,
      key: c2paEvidence?.key ?? "JUMBF manifest",
      snippet: truncateEvidence(snippet),
      explanation:
        "A cryptographically signed C2PA (JUMBF) manifest is embedded in the file. This is the strongest, most portable proof of AI generation or editing and survives re-saving in many tools.",
      rule: "c2pa-manifest",
    });
  }

  /* ---------------------------------------------------------------- */
  /* 2. IPTC / XMP machine-readable AI declarations                   */
  /* ---------------------------------------------------------------- */
  for (const item of evidence) {
    if (/trainedalgorithmicmedia|compositewithtrainedalgorithmicmedia|synthetic\s*media/i.test(item.text)) {
      generators.add("IPTC DigitalSourceType (AI declaration)");
      addFinding({
        severity: "critical",
        generator: "IPTC DigitalSourceType",
        location: item.location,
        key: item.key,
        snippet: truncateEvidence(item.text),
        explanation:
          "The IPTC DigitalSourceType property explicitly declares the content as trained algorithmic media — a machine-readable AI label honoured by news agencies and search engines.",
        rule: "iptc-source-type",
      });
    }
    if (C2PA_ACTION.test(item.text)) {
      const generationAction = /c2pa\.created/i.test(item.text);
      if (generationAction) {
        generators.add("C2PA action history");
        addFinding({
          severity: "critical",
          generator: "C2PA action history",
          location: item.location,
          key: item.key,
          snippet: truncateEvidence(item.text),
          explanation:
            "The XMP action history records a `c2pa.created` assertion, which is written by generative tools when a new asset is produced.",
          rule: "c2pa-action",
        });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 3. Diffusion parameter blocks (PNG tEXt, EXIF UserComment, XMP…) */
  /* ---------------------------------------------------------------- */
  for (const item of evidence) {
    if (item.text.length > 40 && DIFFUSION_PARAMS.test(item.text) && /\bsteps\b|\bprompt\b|\bsampler\b|class_type/i.test(item.text)) {
      const isComfy = /"class_type"|comfy/i.test(item.text);
      const generator = isComfy
        ? "ComfyUI node graph"
        : /flux/i.test(item.text)
        ? "FLUX / Stable Diffusion parameters"
        : "Stable Diffusion parameters";
      generators.add(generator);
      addFinding({
        severity: "critical",
        generator,
        location: item.location,
        key: item.key,
        snippet: truncateEvidence(item.text),
        explanation: isComfy
          ? "A ComfyUI execution graph is embedded in the file, exposing the checkpoint, LoRAs, sampler, seed and the full text prompt used to synthesise the image."
          : "Text-to-image generation parameters (prompt, sampler, steps, CFG scale, seed) are embedded in a metadata chunk written by the diffusion front-end.",
        rule: isComfy ? "comfy-graph" : "diffusion-params",
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* 4. Named generator fingerprints                                   */
  /* ---------------------------------------------------------------- */
  for (const item of evidence) {
    for (const token of TOKEN_RULES) {
      if (!token.regex.test(item.text)) continue;
      const generatedPhrase = GENERATED_PHRASE.test(item.text);
      // Bare "Sora" is only meaningful in a software-like field; in free text
      // require an explicit OpenAI reference.
      if (token.rule === "sora" && !item.strong && !generatedPhrase && !/openai/i.test(item.text)) {
        continue;
      }
      const severity: Severity = item.strong || generatedPhrase ? "critical" : "warning";
      generators.add(token.name);
      addFinding({
        severity,
        generator: token.name,
        location: item.location,
        key: item.key,
        snippet: truncateEvidence(item.text),
        explanation:
          severity === "critical"
            ? `The ${item.key} field names ${token.name} — a generative AI system. Tools and platforms read this field to label the file as synthetic.`
            : `${token.name} is mentioned in this field. It is not a signed provenance claim, but it is a strong hint that the asset is AI-generated.`,
        rule: `token-${token.rule}`,
      });
      break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 5. Filename conventions                                          */
  /* ---------------------------------------------------------------- */
  const lowerName = input.filename.toLowerCase();
  const filenamePatterns: Array<[RegExp, string]> = [
    [/\bcomfyui\b|\bcomfy_ui\b/, "ComfyUI"],
    [/\bmidjourney\b|\bmj_[a-z0-9]/, "Midjourney"],
    [/\bdall[-_]?e\b/, "OpenAI DALL·E"],
    [/\bsdxl\b|\bstable[-_]?diffusion\b|\bsd_[a-z0-9]/, "Stable Diffusion"],
    [/\bflux[-_]\b|\bflux1[-_]/, "FLUX"],
    [/\bgpt[-_]?4o\b|\bgpt[-_]image\b/, "OpenAI GPT-4o"],
    [/\bfirefly\b/, "Adobe Firefly"],
    [/\bsora[-_]\b/, "OpenAI Sora"],
  ];
  for (const [regex, name] of filenamePatterns) {
    if (!regex.test(lowerName)) continue;
    generators.add(name);
    addFinding({
      severity: "warning",
      generator: name,
      location: "Filename",
      key: "Original filename",
      snippet: input.filename,
      explanation:
        "The original filename follows a generative-tool naming convention instead of a camera roll pattern (IMG_4821.JPG, DSC03914.JPG, PXL_2024…).",
      rule: "filename-convention",
    });
  }

  /* ---------------------------------------------------------------- */
  /* 6. Container-level forensic heuristics                           */
  /* ---------------------------------------------------------------- */
  if (input.trailingBytes && input.trailingBytes > 16) {
    addFinding({
      severity: "warning",
      generator: "Appended data",
      location: `${input.containerFormat} container`,
      key: "Trailing bytes",
      snippet: `${input.trailingBytes.toLocaleString()} bytes present after the container's declared end`,
      explanation:
        "Data sits after the end of the declared container. This can be a second payload, a watermark, or a stripped manifest stub and is worth checking before publishing.",
      rule: "trailing-data",
    });
  }

  const hasCameraIdentity = Boolean(input.exifSummary.make && input.exifSummary.model);
  const hasOpticalTelemetry = Boolean(
    input.exifSummary.exposureTime ||
      input.exifSummary.fNumber ||
      input.exifSummary.iso ||
      input.exifSummary.focalLength ||
      input.exifSummary.makerNote
  );

  const containerWithoutExif =
    !hasCameraIdentity &&
    ["PNG", "WebP", "GIF", "AVIF", "HEIF", "HEIC", "BMP"].some((fmt) =>
      input.containerFormat.toUpperCase().startsWith(fmt)
    );
  if (containerWithoutExif && input.mediaType === "image") {
    addFinding({
      severity: "info",
      generator: "Container heuristic",
      location: `${input.containerFormat} header`,
      key: "No camera EXIF",
      snippet: `${input.containerFormat} container without Make / Model / exposure tags`,
      explanation: `Cameras write JPEG, HEIC or RAW. A ${input.containerFormat} export with no optical metadata is the usual signature of a screenshot, a web export, or a generative tool. This is a hint, not proof.`,
      rule: "container-heuristic",
    });
  }

  if (findings.length === 0) {
    addFinding({
      severity: "info",
      generator: "No provenance markers",
      location: input.containerFormat,
      key: "scan",
      snippet: "Parsed container bytes contain no C2PA manifest, AI declaration, diffusion parameters or generator identifier.",
      explanation:
        "Scanned the container structure, every EXIF/XMP/IPTC tag, embedded manifests and appended data. Nothing in the file claims AI generation.",
      rule: "clean",
    });
  }

  /* ---------------------------------------------------------------- */
  /* 7. Scoring                                                       */
  /* ---------------------------------------------------------------- */
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const cameraVerified = hasCameraIdentity && hasOpticalTelemetry;

  let aiRiskScore: number;
  let authenticityStatus: AuthenticityStatus;

  if (criticalCount > 0) {
    aiRiskScore = Math.min(100, 72 + criticalCount * 10 + warningCount * 4);
    authenticityStatus = "ai-detected";
  } else if (warningCount > 0) {
    aiRiskScore = Math.min(68, 28 + warningCount * 12);
    authenticityStatus = "suspicious";
  } else if (cameraVerified) {
    aiRiskScore = input.exifSummary.makerNote ? 3 : 6;
    authenticityStatus = "camera-verified";
  } else {
    aiRiskScore = input.tags.length > 0 ? 15 : 8;
    authenticityStatus = "stripped";
  }

  return {
    findings,
    generators: Array.from(generators),
    aiRiskScore,
    authenticityStatus,
  };
}
