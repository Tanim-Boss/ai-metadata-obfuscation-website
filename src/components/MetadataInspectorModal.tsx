"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  FileSearch,
  Copy,
  Check,
  Hash,
  Layers,
  Camera,
  Search,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  FileJson,
  Binary,
  ListFilter,
  Fingerprint,
} from "lucide-react";
import type {
  ChunkCategory,
  ExifSummary,
  ForensicReport,
} from "@/lib/metadata-inspector";

interface MetadataInspectorModalProps {
  open: boolean;
  onClose: () => void;
  filename: string;
  mediaType: "image" | "video" | "document";
  beforeReport: ForensicReport | null;
  afterReport: ForensicReport | null;
  isInspecting: boolean;
  onRescan?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec?: number): string | undefined {
  if (sec === undefined || !Number.isFinite(sec)) return undefined;
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function chunkBadgeStyle(cat: ChunkCategory): string {
  switch (cat) {
    case "ai-provenance":
      return "bg-red-500/15 text-red-300 border-red-500/35";
    case "camera-exif":
      return "bg-amber-500/15 text-amber-300 border-amber-500/35";
    case "xmp-iptc":
      return "bg-purple-500/15 text-purple-300 border-purple-500/35";
    case "color-profile":
      return "bg-sky-500/15 text-sky-300 border-sky-500/35";
    case "ancillary-text":
      return "bg-orange-500/15 text-orange-300 border-orange-500/35";
    case "video-container":
      return "bg-teal-500/15 text-teal-300 border-teal-500/35";
    default:
      return "bg-zinc-800/80 text-zinc-400 border-zinc-700/70";
  }
}

const EXIF_FIELDS: Array<{ key: keyof ExifSummary; label: string }> = [
  { key: "make", label: "Camera Make" },
  { key: "model", label: "Camera Model" },
  { key: "lensMake", label: "Lens Make" },
  { key: "lensModel", label: "Lens Model" },
  { key: "software", label: "Software / Firmware" },
  { key: "exposureTime", label: "Shutter Speed" },
  { key: "fNumber", label: "Aperture" },
  { key: "iso", label: "ISO" },
  { key: "focalLength", label: "Focal Length" },
  { key: "focalLength35mm", label: "35mm Equivalent" },
  { key: "dateTimeOriginal", label: "DateTime Original" },
  { key: "offsetTime", label: "Timezone Offset" },
  { key: "subSecTime", label: "SubSec Time" },
  { key: "exposureProgram", label: "Exposure Program" },
  { key: "meteringMode", label: "Metering Mode" },
  { key: "flash", label: "Flash" },
  { key: "whiteBalance", label: "White Balance" },
  { key: "colorSpace", label: "Color Space" },
  { key: "bodySerial", label: "Body Serial No." },
  { key: "lensSerial", label: "Lens Serial No." },
  { key: "artist", label: "Artist" },
  { key: "copyright", label: "Copyright" },
  { key: "gps", label: "GPS Coordinates" },
];

const STATUS_STYLE: Record<
  ForensicReport["authenticityStatus"],
  { label: string; className: string }
> = {
  "ai-detected": {
    label: "AI PROVENANCE DETECTED",
    className: "bg-red-500/15 text-red-300 border-red-500/40",
  },
  suspicious: {
    label: "SUSPICIOUS",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
  "camera-verified": {
    label: "CAMERA VERIFIED",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  },
  stripped: {
    label: "METADATA STRIPPED",
    className: "bg-zinc-700/40 text-zinc-300 border-zinc-600/50",
  },
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function SectionTitle({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Hash;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232834] pb-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-amber-400" />
        <h3 className="font-display text-[13px] font-semibold uppercase tracking-wider text-[#f3f5f9]">
          {title}
        </h3>
      </div>
      {hint && (
        <span className="font-mono text-[10px] text-[#646e82]">{hint}</span>
      )}
    </div>
  );
}

export function MetadataInspectorModal(props: MetadataInspectorModalProps) {
  const { open, onClose } = props;

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  // Freshly mounted on every open so filter/target state resets naturally.
  return <InspectorPanel {...props} />;
}

function InspectorPanel({
  onClose,
  filename,
  mediaType,
  beforeReport,
  afterReport,
  isInspecting,
  onRescan,
}: MetadataInspectorModalProps) {
  const [viewTarget, setViewTarget] = useState<"before" | "after">(() =>
    beforeReport ? "before" : "after"
  );
  const [tagQuery, setTagQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<"sha" | "json" | null>(null);

  const report =
    viewTarget === "after" && afterReport
      ? afterReport
      : beforeReport ?? afterReport;

  const presentExifFields = useMemo(() => {
    if (!report) return 0;
    return EXIF_FIELDS.filter(({ key }) => {
      const v = report.exifSummary[key];
      return v !== undefined && v !== null && String(v).trim() !== "";
    }).length;
  }, [report]);

  const filteredTags = useMemo(() => {
    if (!report) return [];
    const q = tagQuery.trim().toLowerCase();
    if (!q) return report.tags;
    return report.tags.filter(
      (t) =>
        t.tag.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        (t.hex && t.hex.toLowerCase().includes(q))
    );
  }, [report, tagQuery]);

  const hasBothReports = Boolean(beforeReport && afterReport);
  const statusStyle = report ? STATUS_STYLE[report.authenticityStatus] : null;
  const duration = formatDuration(report?.durationSec);

  const handleCopy = async (key: "sha" | "json") => {
    if (!report) return;
    const text =
      key === "sha"
        ? report.sha256
        : JSON.stringify(report, null, 2);
    const ok = await copyText(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dot = report.filename.lastIndexOf(".");
    const stem = dot > 0 ? report.filename.slice(0, dot) : report.filename;
    a.href = url;
    a.download = `${stem || "upload"}.metadata-report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Metadata inspector"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#2b3242] bg-[#111318] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232834] bg-[#0d0f14] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400">
              <FileSearch className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm font-bold tracking-tight text-[#f3f5f9]">
                  Metadata Inspector
                </h2>
                <span className="rounded border border-[#2b3242] bg-[#171a22] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#9aa3b5]">
                  {mediaType}
                </span>
                {statusStyle && (
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${statusStyle.className}`}
                  >
                    {statusStyle.label}
                  </span>
                )}
              </div>
              <p
                className="mt-0.5 max-w-md truncate font-mono text-[11px] text-[#7c8599]"
                title={filename}
              >
                {filename}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Before / After switcher when both reports exist */}
            {hasBothReports && (
              <div className="inline-flex rounded-lg border border-[#232834] bg-[#14171f] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setViewTarget("before")}
                  className={`rounded-md px-2 py-1 font-medium transition-colors ${
                    viewTarget === "before"
                      ? "bg-red-500/20 text-red-200"
                      : "text-[#9aa3b5] hover:text-white"
                  }`}
                >
                  Original
                </button>
                <button
                  type="button"
                  onClick={() => setViewTarget("after")}
                  className={`rounded-md px-2 py-1 font-medium transition-colors ${
                    viewTarget === "after"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "text-[#9aa3b5] hover:text-white"
                  }`}
                >
                  Sanitized
                </button>
              </div>
            )}

            {onRescan && (
              <button
                type="button"
                onClick={onRescan}
                disabled={isInspecting}
                title="Re-scan this file"
                className="rounded-lg border border-[#2b3242] bg-[#171a22] p-2 text-[#d5dce9] transition-colors hover:border-amber-500/50 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isInspecting ? "animate-spin" : ""}`}
                />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="rounded-lg border border-[#2b3242] bg-[#171a22] p-2 text-[#d5dce9] transition-colors hover:border-red-500/50 hover:text-red-300 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── BODY ───────────────────────────────────────────── */}
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-5">
          {isInspecting && !report ? (
            <div className="py-14 text-center">
              <div className="mx-auto mb-3 inline-flex h-11 w-11 animate-spin items-center justify-center rounded-full border-2 border-amber-500/30 border-t-amber-400" />
              <p className="text-sm text-[#9aa3b5]">
                Scanning binary container chunks, C2PA JUMBF boxes, XMP packets
                &amp; EXIF IFDs…
              </p>
            </div>
          ) : !report ? (
            <div className="py-14 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
              <p className="text-sm font-medium text-[#f3f5f9]">
                No metadata report for this file yet.
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-[#7c8599]">
                The scan may have failed or hasn&apos;t run. Re-scan to extract
                container chunks, EXIF/XMP/IPTC tags and AI provenance signals.
              </p>
              {onRescan && (
                <button
                  type="button"
                  onClick={onRescan}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 font-display text-xs font-semibold text-[#0a0b0e] hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                  Scan Now
                </button>
              )}
            </div>
          ) : (
            <>
              {/* ── 1 · FILE IDENTITY ─────────────────────────── */}
              <section className="space-y-3">
                <SectionTitle
                  icon={Fingerprint}
                  title="File Identity"
                  hint={`${report.chunks.length} chunks · ${report.tags.length} tags`}
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {[
                    ["Container", report.containerFormat],
                    ["Byte Size", `${formatBytes(report.byteSize)} (${report.byteSize.toLocaleString()} B)`],
                    ...(report.width && report.height
                      ? [["Dimensions", `${report.width} × ${report.height} px`]]
                      : []),
                    ...(duration ? [["Duration", duration]] : []),
                    ["Media Type", report.mediaType.toUpperCase()],
                    [
                      "AI Risk",
                      `${report.aiRiskScore}/100`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-[#232834] bg-[#151821] px-3 py-2.5"
                    >
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-[#646e82]">
                        {label}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs font-medium text-[#f3f5f9]" title={String(value)}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI risk bar */}
                <div className="rounded-lg border border-[#232834] bg-[#151821] px-3 py-2.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#646e82]">
                    <span>AI Provenance Risk</span>
                    <span className="font-mono text-[#9aa3b5]">
                      {report.aiRiskScore}/100
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#232834]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        report.aiRiskScore >= 70
                          ? "bg-red-500"
                          : report.aiRiskScore >= 30
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                      }`}
                      style={{ width: `${report.aiRiskScore}%` }}
                    />
                  </div>
                </div>

                {/* Full SHA-256 */}
                <div className="flex items-center gap-2 rounded-lg border border-[#232834] bg-[#0b0d12] px-3 py-2">
                  <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#646e82]">
                    SHA-256
                  </span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-amber-200/90" title={report.sha256}>
                    {report.sha256}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopy("sha")}
                    title="Copy full SHA-256"
                    className="shrink-0 rounded p-1.5 text-[#9aa3b5] transition-colors hover:bg-[#1c202a] hover:text-amber-200 cursor-pointer"
                  >
                    {copiedKey === "sha" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </section>

              {/* ── 2 · CAMERA EXIF GRID ─────────────────────── */}
              <section className="space-y-3">
                <SectionTitle
                  icon={Camera}
                  title="Camera / EXIF Summary"
                  hint={`${presentExifFields} / ${EXIF_FIELDS.length} fields present`}
                />
                {presentExifFields === 0 ? (
                  <div className="rounded-lg border border-[#232834] bg-[#14171f] px-4 py-3 text-xs text-[#7c8599]">
                    {mediaType === "document"
                      ? "Documents don't carry camera EXIF — see the full extracted tag list below."
                      : "No camera EXIF fields were extracted from this container."}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {EXIF_FIELDS.map(({ key, label }) => {
                      const raw = report.exifSummary[key];
                      const value =
                        raw !== undefined &&
                        raw !== null &&
                        String(raw).trim() !== ""
                          ? String(raw)
                          : null;
                      return (
                        <div
                          key={key}
                          className="rounded-lg border border-[#232834] bg-[#151821] px-3 py-2.5"
                        >
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#646e82]">
                            {label}
                          </div>
                          <div
                            className={`mt-0.5 truncate font-mono text-[11px] ${
                              value ? "text-[#f3f5f9]" : "text-[#3f4657]"
                            }`}
                            title={value ?? "Not present"}
                          >
                            {value ?? "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── 3 · AI PROVENANCE FINDINGS ───────────────── */}
              <section className="space-y-3">
                <SectionTitle
                  icon={ShieldAlert}
                  title="AI Provenance Signals"
                  hint={
                    report.detectedGenerators.length > 0
                      ? report.detectedGenerators.join(" · ")
                      : "none detected"
                  }
                />
                {report.aiFindings.length === 0 ? (
                  <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    No C2PA manifests, diffusion parameters, trained-algorithmic-media
                    declarations or other AI provenance markers found.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {report.aiFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className={`rounded-lg border p-3 ${
                          finding.severity === "critical"
                            ? "border-red-500/30 bg-red-500/5"
                            : finding.severity === "warning"
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-[#252a37] bg-[#14171f]"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                                finding.severity === "critical"
                                  ? "bg-red-500/25 text-red-200"
                                  : finding.severity === "warning"
                                  ? "bg-amber-500/25 text-amber-200"
                                  : "bg-zinc-700/60 text-zinc-300"
                              }`}
                            >
                              {finding.severity}
                            </span>
                            <span className="text-xs font-semibold text-[#f3f5f9]">
                              {finding.generator}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-[#9aa3b5]">
                            {finding.location} → {finding.key}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] text-[#9aa3b5]">
                          {finding.explanation}
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded border border-[#232834] bg-[#0b0d12] px-2.5 py-1.5 font-mono text-[10px] text-amber-200/90">
                          {finding.snippet}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── 4 · BINARY CHUNKS / SEGMENTS ─────────────── */}
              <section className="space-y-3">
                <SectionTitle
                  icon={Layers}
                  title="Binary Segments / Chunks"
                  hint={`${report.chunks.length} segments`}
                />
                {report.chunks.length === 0 ? (
                  <div className="rounded-lg border border-[#232834] bg-[#14171f] px-4 py-3 text-xs text-[#7c8599]">
                    No discrete container chunks were mapped for this format.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {report.chunks.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-col justify-between gap-1.5 rounded-lg border border-[#232834] bg-[#151821] px-3 py-2 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${chunkBadgeStyle(
                                c.category
                              )}`}
                            >
                              {c.marker}
                            </span>
                            <span className="truncate text-[11px] font-medium text-[#f3f5f9]">
                              {c.label}
                            </span>
                          </div>
                          {c.preview && (
                            <p className="mt-1 truncate font-mono text-[10px] text-[#9aa3b5]" title={c.preview}>
                              {c.preview}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 font-mono text-[10px] text-[#646e82]">
                          <span>@0x{c.offset.toString(16).padStart(6, "0")}</span>
                          <span className="text-[#9aa3b5]">
                            {formatBytes(c.byteLength)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── 5 · FULL TAG DUMP ────────────────────────── */}
              <section className="space-y-3">
                <SectionTitle
                  icon={Binary}
                  title="Full Metadata Tag Dump"
                  hint={`${filteredTags.length} of ${report.tags.length} shown`}
                />
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#646e82]" />
                  <input
                    type="text"
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="Filter by tag, group, hex ID or value (e.g. 0x010F, LensModel, ISO, C2PA, Author)…"
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] py-2 pl-9 pr-3 text-xs text-[#f3f5f9] placeholder:text-[#646e82] focus:border-amber-500/60 focus:outline-none"
                  />
                </div>

                {filteredTags.length === 0 ? (
                  <div className="rounded-lg border border-[#232834] bg-[#14171f] px-4 py-6 text-center text-xs text-[#9aa3b5]">
                    {report.tags.length === 0
                      ? "Zero metadata tags present in this file container."
                      : "No metadata tags match your filter."}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[#232834]">
                    <table className="w-full border-collapse text-left">
                      <thead className="border-b border-[#232834] bg-[#14171f] text-[10px] uppercase tracking-wider text-[#646e82]">
                        <tr>
                          <th className="px-3 py-2 font-medium">IFD / Group</th>
                          <th className="px-3 py-2 font-medium">Hex</th>
                          <th className="px-3 py-2 font-medium">Tag</th>
                          <th className="px-3 py-2 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1d212c] font-mono text-[11px]">
                        {filteredTags.map((row, idx) => (
                          <tr
                            key={`${row.group}-${row.tag}-${idx}`}
                            className={
                              row.isAiFlag
                                ? "bg-red-500/10 text-red-200"
                                : "hover:bg-[#161922]"
                            }
                          >
                            <td className="whitespace-nowrap px-3 py-1.5 text-[10px] text-[#9aa3b5]">
                              {row.group}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-[10px] text-amber-400/85">
                              {row.hex || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 font-medium text-[#f3f5f9]">
                              {row.tag}
                            </td>
                            <td className="break-all px-3 py-1.5 text-[#c4ccdc]">
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        {report && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#232834] bg-[#0d0f14] px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2 font-mono text-[10px] text-[#646e82]">
              <ListFilter className="h-3.5 w-3.5" />
              <span>
                {report.tags.length} tags · {report.chunks.length} chunks ·{" "}
                {report.aiFindings.length} findings ·{" "}
                {report.detectedGenerators.length > 0
                  ? `${report.detectedGenerators.length} AI signature${
                      report.detectedGenerators.length === 1 ? "" : "s"
                    }`
                  : "no AI signatures"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleCopy("json")}
                title="Copy the full inspection report as JSON"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-2.5 py-1.5 text-[11px] font-medium text-[#d5dce9] transition-colors hover:border-amber-500/50 hover:text-amber-200 cursor-pointer"
              >
                {copiedKey === "json" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedKey === "json" ? "Copied!" : "Copy JSON"}
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                title="Download the full inspection report as a .json file"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-2.5 py-1.5 text-[11px] font-medium text-[#d5dce9] transition-colors hover:border-amber-500/50 hover:text-amber-200 cursor-pointer"
              >
                <FileJson className="h-3.5 w-3.5" />
                Report .json
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 font-display text-[11px] font-semibold text-[#0a0b0e] transition-colors hover:bg-amber-400 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
