import type {
  AuthenticityStatus,
  ChunkCategory,
  ForensicReport,
  MetadataTagRow,
  Severity,
} from "@/lib/metadata-inspector";

export const STATUS_META: Record<
  AuthenticityStatus,
  {
    label: string;
    short: string;
    tone: "danger" | "warning" | "success" | "muted";
    ring: string;
    text: string;
    bar: string;
    blurb: (report: ForensicReport) => string;
  }
> = {
  "ai-detected": {
    label: "AI provenance detected",
    short: "AI DETECTED",
    tone: "danger",
    ring: "border-red-500/45 bg-red-500/10",
    text: "text-red-300",
    bar: "bg-red-500",
    blurb: (r) =>
      r.detectedGenerators.length > 0
        ? `Signed or declared provenance for ${r.detectedGenerators.join(", ")} is embedded in this file.`
        : "At least one machine-readable AI provenance marker is embedded in this file.",
  },
  suspicious: {
    label: "Suspicious signals",
    short: "SUSPICIOUS",
    tone: "warning",
    ring: "border-amber-500/45 bg-amber-500/10",
    text: "text-amber-300",
    bar: "bg-amber-400",
    blurb: () =>
      "No signed AI claim was found, but weak signals (naming, missing camera telemetry or generator mentions) are present.",
  },
  "camera-verified": {
    label: "Camera telemetry verified",
    short: "CAMERA TAG",
    tone: "success",
    ring: "border-emerald-500/45 bg-emerald-500/10",
    text: "text-emerald-300",
    bar: "bg-emerald-400",
    blurb: (r) =>
      `${[r.exifSummary.make, r.exifSummary.model].filter(Boolean).join(" ")} optical EXIF with exposure telemetry is present and no AI provenance marker was found.`,
  },
  stripped: {
    label: "No provenance metadata",
    short: "STRIPPED",
    tone: "muted",
    ring: "border-zinc-600/50 bg-zinc-700/25",
    text: "text-zinc-300",
    bar: "bg-zinc-500",
    blurb: () =>
      "The file carries no AI provenance marker and no camera identity telemetry — metadata has probably been stripped or never written.",
  },
};

export const SEVERITY_META: Record<
  Severity,
  { label: string; badge: string; panel: string }
> = {
  critical: {
    label: "critical",
    badge: "bg-red-500/20 text-red-200 border border-red-500/40",
    panel: "border-red-500/35 bg-red-500/[0.06]",
  },
  warning: {
    label: "warning",
    badge: "bg-amber-500/20 text-amber-200 border border-amber-500/40",
    panel: "border-amber-500/35 bg-amber-500/[0.06]",
  },
  info: {
    label: "info",
    badge: "bg-sky-500/15 text-sky-200 border border-sky-500/35",
    panel: "border-[#262c3a] bg-[#151821]",
  },
};

export const CATEGORY_META: Record<
  ChunkCategory,
  { label: string; chip: string; dot: string }
> = {
  "ai-provenance": {
    label: "AI provenance",
    chip: "bg-red-500/15 text-red-300 border-red-500/35",
    dot: "bg-red-400",
  },
  "camera-exif": {
    label: "Camera EXIF",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/35",
    dot: "bg-amber-400",
  },
  "xmp-iptc": {
    label: "XMP / IPTC",
    chip: "bg-purple-500/15 text-purple-300 border-purple-500/35",
    dot: "bg-purple-400",
  },
  "ancillary-text": {
    label: "Text / ancillary",
    chip: "bg-orange-500/15 text-orange-300 border-orange-500/35",
    dot: "bg-orange-400",
  },
  "color-profile": {
    label: "Colour profile",
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/35",
    dot: "bg-sky-400",
  },
  "image-stream": {
    label: "Image stream",
    chip: "bg-zinc-700/60 text-zinc-300 border-zinc-600/60",
    dot: "bg-zinc-400",
  },
  "video-container": {
    label: "Video container",
    chip: "bg-teal-500/15 text-teal-300 border-teal-500/35",
    dot: "bg-teal-400",
  },
  "document-structure": {
    label: "Document",
    chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/35",
    dot: "bg-indigo-400",
  },
};

export const GROUP_ORDER = [
  "IFD0",
  "ExifIFD",
  "GPS",
  "Interop",
  "IFD1",
  "XMP",
  "IPTC-IIM",
  "ICC",
  "QuickTime",
  "MP4",
  "HEIF",
  "ISOBMFF",
  "PDF Info",
  "PDF XMP",
  "OOXML Core",
  "OOXML App",
];

export const EMPTY_GROUP_LABEL: Record<string, string> = {
  IFD0: "Primary image directory (camera body, software, artist)",
  ExifIFD: "Capture settings (shutter, aperture, ISO, lens, serials)",
  GPS: "Geolocation (latitude, longitude, altitude, timestamps)",
  Interop: "Interoperability directory",
  IFD1: "Embedded thumbnail directory",
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(sec?: number): string | undefined {
  if (sec === undefined || !Number.isFinite(sec) || sec <= 0) return undefined;
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h > 0 ? `${h}h ` : ""}${m > 0 ? `${m}m ` : ""}${s}s`;
}

export function formatOffset(offset: number): string {
  return `0x${offset.toString(16).padStart(6, "0")}`;
}

export function groupTags(tags: MetadataTagRow[]): Array<[string, MetadataTagRow[]]> {
  const groups = new Map<string, MetadataTagRow[]>();
  for (const tag of tags) {
    const list = groups.get(tag.group) ?? [];
    list.push(tag);
    groups.set(tag.group, list);
  }
  return Array.from(groups.entries()).sort((a, b) => {
    const aIndex = GROUP_ORDER.indexOf(a[0]);
    const bIndex = GROUP_ORDER.indexOf(b[0]);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a[0].localeCompare(b[0]);
  });
}

export interface TagDiff {
  removedGroups: Array<[string, MetadataTagRow[]]>;
  addedGroups: Array<[string, MetadataTagRow[]]>;
  removedCount: number;
  addedCount: number;
  removedAiFindings: number;
}

function tagSignature(tag: MetadataTagRow): string {
  return `${tag.group}|${tag.hex ?? tag.tag}|${tag.tag}`;
}

/** Compare two inspection reports (original vs sanitized) tag by tag. */
export function diffReports(
  before: ForensicReport | null,
  after: ForensicReport | null
): TagDiff | null {
  if (!before || !after) return null;
  const afterKeys = new Set(after.tags.map(tagSignature));
  const beforeKeys = new Set(before.tags.map(tagSignature));
  const removed = before.tags.filter((tag) => !afterKeys.has(tagSignature(tag)));
  const added = after.tags.filter((tag) => !beforeKeys.has(tagSignature(tag)));
  return {
    removedGroups: groupTags(removed),
    addedGroups: groupTags(added),
    removedCount: removed.length,
    addedCount: added.length,
    removedAiFindings: before.aiFindings.filter(
      (f) => f.severity !== "info" && !after.aiFindings.some((a) => a.rule === f.rule)
    ).length,
  };
}

export function copyToClipboard(text: string): Promise<boolean> {
  const fallback = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };
  try {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallback()
    );
  } catch {
    return Promise.resolve(fallback());
  }
}

export function riskTone(score: number): { bar: string; text: string; label: string } {
  if (score >= 70) return { bar: "bg-red-500", text: "text-red-300", label: "High risk" };
  if (score >= 35) return { bar: "bg-amber-400", text: "text-amber-300", label: "Elevated risk" };
  if (score >= 15) return { bar: "bg-sky-400", text: "text-sky-300", label: "Low risk" };
  return { bar: "bg-emerald-400", text: "text-emerald-300", label: "Minimal risk" };
}
