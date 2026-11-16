"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Binary,
  Boxes,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Download,
  FileJson,
  FileSearch,
  Fingerprint,
  Gauge,
  Hash,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
  XCircle,
} from "lucide-react";
import type {
  ChunkCategory,
  ForensicReport,
  MetadataTagRow,
  Severity,
} from "@/lib/metadata-inspector";
import {
  CATEGORY_META,
  EMPTY_GROUP_LABEL,
  SEVERITY_META,
  STATUS_META,
  copyToClipboard,
  diffReports,
  formatBytes,
  formatDuration,
  formatOffset,
  groupTags,
  riskTone,
} from "@/components/inspector/shared";

type TabKey = "overview" | "exif" | "provenance" | "structure" | "tags" | "raw";

export interface MetadataInspectorModalProps {
  open: boolean;
  onClose: () => void;
  filename: string;
  mediaType: "image" | "video" | "document";
  beforeReport: ForensicReport | null;
  afterReport: ForensicReport | null;
  isInspecting: boolean;
  onRescan?: () => void;
  error?: string | null;
}

const TAB_ORDER: TabKey[] = [
  "overview",
  "exif",
  "provenance",
  "structure",
  "tags",
  "raw",
];

const CAMERA_GROUPS = new Set(["IFD0", "ExifIFD", "GPS", "Interop", "IFD1"]);

export function MetadataInspectorModal(props: MetadataInspectorModalProps) {
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return <InspectorDialog {...props} />;
}

function InspectorDialog({
  onClose,
  filename,
  mediaType,
  beforeReport,
  afterReport,
  isInspecting,
  onRescan,
  error,
}: MetadataInspectorModalProps) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [target, setTarget] = useState<"original" | "sanitized">("original");
  const [copied, setCopied] = useState<string | null>(null);

  const report =
    target === "sanitized" && afterReport
      ? afterReport
      : beforeReport ?? afterReport;

  const copy = async (key: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
  };

  const downloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stem = report.filename.replace(/\.[^.]+$/, "");
    link.href = url;
    link.download = `${stem || "file"}.metadata-report.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const status = report ? STATUS_META[report.authenticityStatus] : null;
  const cameraTags = report
    ? report.tags.filter((tag) => CAMERA_GROUPS.has(tag.group)).length
    : 0;
  const findings = report
    ? report.aiFindings.filter((f) => f.severity !== "info")
    : [];

  const counts: Record<TabKey, number | null> = {
    overview: null,
    exif: cameraTags,
    provenance: findings.length,
    structure: report?.chunks.length ?? 0,
    tags: report?.tags.length ?? 0,
    raw: null,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Metadata inspector"
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden border border-[#2b3242] bg-[#0d0f14] shadow-2xl shadow-black/70 sm:h-[92vh] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* HEADER */}
        <header className="shrink-0 border-b border-[#232834] bg-[#111318]">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
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
                  {status && (
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${status.ring} ${status.text}`}
                    >
                      {status.short}
                    </span>
                  )}
                  {report && (
                    <span className="rounded border border-[#2b3242] bg-[#171a22] px-1.5 py-0.5 font-mono text-[9px] text-[#9aa3b5]">
                      {report.parsedWith.length} parser{report.parsedWith.length === 1 ? "" : "s"} ·{" "}
                      {report.scanMs} ms
                    </span>
                  )}
                </div>
                <p className="mt-0.5 max-w-lg truncate font-mono text-[11px] text-[#7c8599]" title={filename}>
                  {filename}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {beforeReport && afterReport && (
                <div className="inline-flex rounded-lg border border-[#232834] bg-[#14171f] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setTarget("original")}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      target === "original" ? "bg-white/10 text-white" : "text-[#9aa3b5] hover:text-white"
                    }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setTarget("sanitized")}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      target === "sanitized"
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
                  title="Re-read the file bytes"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-2.5 py-1.5 text-[11px] font-medium text-[#d5dce9] transition-colors hover:border-amber-500/50 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isInspecting ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Re-scan</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                title="Close (Esc)"
                className="rounded-lg border border-[#2b3242] bg-[#171a22] p-2 text-[#d5dce9] transition-colors hover:border-red-500/50 hover:text-red-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* TAB STRIP */}
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 sm:px-4">
            {TAB_ORDER.map((key) => {
              const active = tab === key;
              const meta = TAB_META[key];
              const Icon = meta.icon;
              const count = counts[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-[#1c202a] text-[#f3f5f9] shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]"
                      : "text-[#9aa3b5] hover:bg-[#171a22] hover:text-[#e2e7f1]"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? "text-amber-400" : "text-[#646e82]"}`} />
                  {meta.label}
                  {count !== null && count > 0 && (
                    <span className="rounded bg-[#232834] px-1 py-px font-mono text-[9px] text-[#9aa3b5]">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && (
            <div className="m-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              <XCircle className="mt-px h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Inspection failed</p>
                <p className="mt-0.5 text-red-200/80">{error}</p>
              </div>
              {onRescan && (
                <button
                  type="button"
                  onClick={onRescan}
                  className="shrink-0 rounded-md border border-red-400/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wide hover:bg-red-500/20"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {isInspecting && !report ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full border border-amber-500/25" />
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-amber-500/25 border-t-amber-400" />
                <ScanLine className="h-5 w-5 text-amber-400" />
              </div>
              <p className="font-display text-sm font-semibold text-[#f3f5f9]">
                Reading raw bytes…
              </p>
              <p className="mt-1 max-w-sm text-xs text-[#7c8599]">
                Walking container segments, TIFF IFDs, XMP packets, IPTC datasets and
                JUMBF manifests. Nothing is uploaded anywhere — parsing happens in the
                request and the buffer is discarded.
              </p>
            </div>
          ) : !report ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <AlertTriangle className="mb-3 h-8 w-8 text-amber-400" />
              <p className="text-sm font-medium text-[#f3f5f9]">No report for this file yet</p>
              <p className="mt-1 max-w-sm text-xs text-[#7c8599]">
                The scan has not run or did not finish. Re-scan to parse the container.
              </p>
              {onRescan && (
                <button
                  type="button"
                  onClick={onRescan}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 font-display text-xs font-semibold text-[#0a0b0e] hover:bg-amber-400"
                >
                  <RefreshCw className="h-4 w-4" /> Scan now
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              {tab === "overview" && (
                <OverviewTab report={report} beforeReport={beforeReport} afterReport={afterReport} />
              )}
              {tab === "exif" && <ExifTab report={report} />}
              {tab === "provenance" && <ProvenanceTab report={report} />}
              {tab === "structure" && <StructureTab report={report} />}
              {tab === "tags" && <TagsTab report={report} onCopy={copy} copied={copied} />}
              {tab === "raw" && <RawTab report={report} onCopy={copy} copied={copied} />}
            </div>
          )}
        </div>

        {/* FOOTER */}
        {report && (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#232834] bg-[#111318] px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2 font-mono text-[10px] text-[#646e82]">
              <Layers className="h-3.5 w-3.5" />
              <span>
                {report.tags.length} tags · {report.chunks.length} segments ·{" "}
                {report.aiFindings.filter((f) => f.severity !== "info").length} findings ·{" "}
                {report.detectedGenerators.length > 0
                  ? report.detectedGenerators.length
                  : "no"}{" "}
                AI signature{report.detectedGenerators.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void copy("json", JSON.stringify(report, null, 2))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-2.5 py-1.5 text-[11px] font-medium text-[#d5dce9] transition-colors hover:border-amber-500/50 hover:text-amber-200"
              >
                {copied === "json" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied === "json" ? "Copied" : "Copy JSON"}
              </button>
              <button
                type="button"
                onClick={downloadJson}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-2.5 py-1.5 text-[11px] font-medium text-[#d5dce9] transition-colors hover:border-amber-500/50 hover:text-amber-200"
              >
                <FileJson className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Report .json</span>
                <Download className="h-3 w-3 sm:hidden" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-amber-500 px-3 py-1.5 font-display text-[11px] font-semibold text-[#0a0b0e] transition-colors hover:bg-amber-400"
              >
                Done
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

const TAB_META: Record<TabKey, { label: string; icon: typeof Hash }> = {
  overview: { label: "Overview", icon: Gauge },
  exif: { label: "Camera EXIF", icon: Camera },
  provenance: { label: "AI Provenance", icon: ShieldAlert },
  structure: { label: "Binary Map", icon: Layers },
  tags: { label: "All Tags", icon: Hash },
  raw: { label: "Raw JSON", icon: Binary },
};

/* ------------------------------------------------------------------ */
/*  Tab 1 — Overview                                                   */
/* ------------------------------------------------------------------ */

function OverviewTab({
  report,
  beforeReport,
  afterReport,
}: {
  report: ForensicReport;
  beforeReport: ForensicReport | null;
  afterReport: ForensicReport | null;
}) {
  const status = STATUS_META[report.authenticityStatus];
  const risk = riskTone(report.aiRiskScore);
  const diff = diffReports(beforeReport, afterReport);
  const xmpCount = report.xmp?.properties.length ?? 0;
  const iptcCount = report.iptc?.length ?? 0;
  const exifIfdCount = new Set(
    report.tags.filter((tag) => CAMERA_GROUPS.has(tag.group)).map((tag) => tag.group)
  ).size;
  const critical = report.aiFindings.filter((f) => f.severity === "critical");
  const warnings = report.aiFindings.filter((f) => f.severity === "warning");

  return (
    <div className="space-y-5">
      {/* Verdict */}
      <section className={`rounded-2xl border p-4 sm:p-5 ${status.ring}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {status.tone === "danger" ? (
                <ShieldAlert className={`h-5 w-5 ${status.text}`} />
              ) : status.tone === "success" ? (
                <ShieldCheck className={`h-5 w-5 ${status.text}`} />
              ) : status.tone === "warning" ? (
                <AlertTriangle className={`h-5 w-5 ${status.text}`} />
              ) : (
                <Info className={`h-5 w-5 ${status.text}`} />
              )}
              <h3 className={`font-display text-base font-bold ${status.text}`}>{status.label}</h3>
            </div>
            <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-[#c4ccdc]">
              {status.blurb(report)}
            </p>
            {report.detectedGenerators.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {report.detectedGenerators.map((generator) => (
                  <span
                    key={generator}
                    className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-red-200"
                  >
                    {generator}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="w-full shrink-0 sm:w-52">
            <div className="flex items-end justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#9aa3b5]">
                AI provenance risk
              </span>
              <span className={`font-display text-2xl font-bold leading-none ${risk.text}`}>
                {report.aiRiskScore}
                <span className="text-xs font-medium text-[#7c8599]">/100</span>
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/40">
              <div
                className={`h-full rounded-full ${risk.bar} transition-all`}
                style={{ width: `${Math.max(3, report.aiRiskScore)}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase tracking-wider text-[#7c8599]">
              <span>camera</span>
              <span>{risk.label}</span>
              <span>synthetic</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Critical" value={critical.length} tone="danger" />
          <MiniStat label="Warnings" value={warnings.length} tone="warning" />
          <MiniStat label="EXIF IFDs" value={exifIfdCount} tone="neutral" />
          <MiniStat label="XMP props" value={xmpCount} tone="neutral" />
        </div>
      </section>

      {/* Identity */}
      <section className="space-y-2.5">
        <SectionHeading icon={Fingerprint} title="File identity" hint={`${formatBytes(report.byteSize)}`} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Fact label="Container" value={report.containerFormat} />
          <Fact label="MIME" value={report.mimeType ?? "—"} mono />
          <Fact
            label="Dimensions"
            value={report.width && report.height ? `${report.width} × ${report.height} px` : "—"}
          />
          <Fact
            label="Bit depth"
            value={report.bitDepth ? `${report.bitDepth}-bit` : "—"}
          />
          <Fact
            label="Duration"
            value={formatDuration(report.durationSec) ?? (report.mediaType === "video" ? "—" : "n/a")}
          />
          <Fact
            label="Colour profile"
            value={report.colorProfile?.description ?? report.colorProfile?.colorSpace ?? "—"}
          />
          <Fact label="Media type" value={report.mediaType} />
          <Fact
            label="Appended data"
            value={report.trailingBytes ? `${formatBytes(report.trailingBytes)} after end` : "none"}
          />
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-[#232834] bg-[#0b0d12] px-3 py-2">
          <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#646e82]">
            SHA-256
          </span>
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-amber-200/90" title={report.sha256}>
            {report.sha256}
          </code>
        </div>
      </section>

      {/* Sources */}
      <section className="space-y-2.5">
        <SectionHeading icon={Boxes} title="Metadata sources found" hint={`${report.parsedWith.join(" · ")}`} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <SourceCard
            title="EXIF / TIFF tags"
            count={report.tags.filter((tag) => CAMERA_GROUPS.has(tag.group)).length}
            detail={
              report.exifSummary.make || report.exifSummary.model
                ? `${report.exifSummary.make ?? ""} ${report.exifSummary.model ?? ""}`.trim()
                : "No camera identity directory"
            }
            icon={Camera}
            active={report.tags.some((tag) => CAMERA_GROUPS.has(tag.group))}
          />
          <SourceCard
            title="XMP packet"
            count={xmpCount}
            detail={report.xmp?.present ? `${formatBytes(report.xmp.packetBytes)} of RDF/XML` : "No XMP packet"}
            icon={Tag}
            active={Boolean(report.xmp?.present)}
          />
          <SourceCard
            title="IPTC-IIM"
            count={iptcCount}
            detail={iptcCount > 0 ? "Author / caption / copyright datasets" : "No IPTC datasets"}
            icon={FileJson}
            active={iptcCount > 0}
          />
          <SourceCard
            title="C2PA / JUMBF"
            count={report.hasC2paManifest ? 1 : 0}
            detail={report.hasC2paManifest ? "Signed provenance manifest present" : "No provenance manifest"}
            icon={ShieldAlert}
            active={Boolean(report.hasC2paManifest)}
            danger
          />
          <SourceCard
            title="ICC colour profile"
            count={report.colorProfile ? 1 : 0}
            detail={report.colorProfile?.description ?? "No embedded profile"}
            icon={Sparkles}
            active={Boolean(report.colorProfile)}
          />
          <SourceCard
            title="GPS position"
            count={report.exifSummary.latitude !== undefined ? 1 : 0}
            detail={report.exifSummary.gps ?? "No geolocation tags"}
            icon={MapPin}
            active={report.exifSummary.latitude !== undefined}
          />
        </div>
      </section>

      {/* Diff */}
      {diff && (
        <section className="space-y-2.5">
          <SectionHeading
            icon={ArrowRight}
            title="Sanitization diff"
            hint={`${diff.removedCount} removed · ${diff.addedCount} added`}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-emerald-300/80">
                AI risk
              </p>
              <p className="mt-0.5 flex items-baseline gap-1.5 font-mono">
                <span className="text-sm text-red-300/80 line-through">
                  {beforeReport?.aiRiskScore ?? 0}
                </span>
                <ArrowRight className="h-3 w-3 text-zinc-500" />
                <span className="text-lg font-semibold text-emerald-300">
                  {afterReport?.aiRiskScore ?? 0}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-[#262c3a] bg-[#151821] px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#646e82]">
                Metadata properties
              </p>
              <p className="mt-0.5 font-display text-sm font-semibold text-[#f3f5f9]">
                {beforeReport?.tags.length ?? 0} → {afterReport?.tags.length ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-[#262c3a] bg-[#151821] px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#646e82]">
                AI findings neutralised
              </p>
              <p className="mt-0.5 font-display text-sm font-semibold text-[#f3f5f9]">
                {diff.removedAiFindings}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <DiffList title="Removed by the sanitizer" groups={diff.removedGroups} tone="removed" />
            <DiffList title="Written by the sanitizer" groups={diff.addedGroups} tone="added" />
          </div>
        </section>
      )}

      {/* Notes */}
      <section className="space-y-2">
        <SectionHeading icon={Cpu} title="Parser log" hint={`${report.parsedWith.length} parsers`} />
        <ul className="space-y-1 rounded-lg border border-[#232834] bg-[#0b0d12] px-3 py-2.5 font-mono text-[10px] leading-relaxed text-[#9aa3b5]">
          <li className="text-[#646e82]">
            inspected {new Date(report.inspectedAt).toLocaleString()} in {report.scanMs} ms
          </li>
          {report.notes.map((note, index) => (
            <li key={`${note}-${index}`}>· {note}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "danger" && value > 0
      ? "text-red-300"
      : tone === "warning" && value > 0
      ? "text-amber-300"
      : "text-[#f3f5f9]";
  return (
    <div className="rounded-lg border border-black/20 bg-black/20 px-2.5 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-[#9aa3b5]">{label}</p>
      <p className={`font-display text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Hash;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232834] pb-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-amber-400" />
        <h4 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c4ccdc]">
          {title}
        </h4>
      </div>
      {hint && <span className="max-w-[60%] truncate font-mono text-[9px] text-[#646e82]">{hint}</span>}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-[#232834] bg-[#151821] px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-wider text-[#646e82]">{label}</p>
      <p
        className={`mt-0.5 truncate text-xs font-medium text-[#f3f5f9] ${
          mono ? "font-mono text-[11px]" : ""
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function SourceCard({
  title,
  count,
  detail,
  icon: Icon,
  active,
  danger,
}: {
  title: string;
  count: number;
  detail: string;
  icon: typeof Hash;
  active: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        danger && active
          ? "border-red-500/40 bg-red-500/[0.07]"
          : active
          ? "border-[#2a3140] bg-[#151821]"
          : "border-[#1d222d] bg-[#101219]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon
            className={`h-3.5 w-3.5 ${
              danger && active ? "text-red-400" : active ? "text-amber-400" : "text-[#4b5568]"
            }`}
          />
          <span className="text-[11px] font-medium text-[#e2e7f1]">{title}</span>
        </div>
        {count > 0 ? (
          <span className="rounded bg-[#232834] px-1.5 py-px font-mono text-[9px] text-[#9aa3b5]">
            {count}
          </span>
        ) : (
          <XCircle className="h-3 w-3 text-[#3f4657]" />
        )}
      </div>
      <p
        className={`mt-1 truncate font-mono text-[10px] ${
          active ? "text-[#9aa3b5]" : "text-[#4b5568]"
        }`}
        title={detail}
      >
        {detail}
      </p>
    </div>
  );
}

function DiffList({
  title,
  groups,
  tone,
}: {
  title: string;
  groups: Array<[string, MetadataTagRow[]]>;
  tone: "removed" | "added";
}) {
  const accent = tone === "removed" ? "text-red-300" : "text-emerald-300";
  const total = groups.reduce((sum, [, rows]) => sum + rows.length, 0);
  return (
    <div className="rounded-lg border border-[#232834] bg-[#101219]">
      <div className="flex items-center justify-between border-b border-[#1d222d] px-3 py-1.5">
        <span className={`font-mono text-[10px] uppercase tracking-wider ${accent}`}>{title}</span>
        <span className="font-mono text-[10px] text-[#646e82]">{total}</span>
      </div>
      <div className="max-h-52 overflow-y-auto px-3 py-2">
        {groups.length === 0 ? (
          <p className="py-2 text-center font-mono text-[10px] text-[#4b5568]">nothing</p>
        ) : (
          <div className="space-y-2">
            {groups.map(([group, rows]) => (
              <div key={group}>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#646e82]">
                  {group} · {rows.length}
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {rows.slice(0, 6).map((row, index) => (
                    <li key={`${row.tag}-${index}`} className="truncate font-mono text-[10px] text-[#9aa3b5]">
                      <span className="text-[#c4ccdc]">{row.tag}</span>
                      {row.hex ? <span className="text-[#4b5568]"> {row.hex}</span> : null}
                      <span className="text-[#646e82]"> = {row.value}</span>
                    </li>
                  ))}
                </ul>
                {rows.length > 6 && (
                  <p className="font-mono text-[9px] text-[#4b5568]">+{rows.length - 6} more…</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 2 — Camera EXIF                                                */
/* ------------------------------------------------------------------ */

function ExifTab({ report }: { report: ForensicReport }) {
  const groups = useMemo(
    () => groupTags(report.tags.filter((tag) => CAMERA_GROUPS.has(tag.group))),
    [report.tags]
  );
  const summary = report.exifSummary;
  const summaryRows: Array<[string, string | undefined]> = [
    ["Camera", [summary.make, summary.model].filter(Boolean).join(" ") || undefined],
    ["Lens", [summary.lensMake, summary.lensModel].filter(Boolean).join(" ") || undefined],
    ["Exposure", [summary.exposureTime, summary.fNumber, summary.iso].filter(Boolean).join(" · ") || undefined],
    ["Focal length", [summary.focalLength, summary.focalLength35mm && `(${summary.focalLength35mm} eq.)`].filter(Boolean).join(" ") || undefined],
    ["Captured", [summary.dateTimeOriginal, summary.offsetTime].filter(Boolean).join(" ") || undefined],
    ["Program / metering", [summary.exposureProgram, summary.meteringMode].filter(Boolean).join(" · ") || undefined],
    ["Flash / WB", [summary.flash, summary.whiteBalance].filter(Boolean).join(" · ") || undefined],
    ["Serial numbers", [summary.bodySerial, summary.lensSerial].filter(Boolean).join(" / ") || undefined],
    ["Artist / copyright", [summary.artist, summary.copyright].filter(Boolean).join(" · ") || undefined],
    ["Software", summary.software],
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

  const hasExif = groups.length > 0;

  return (
    <div className="space-y-5">
      {summary.latitude !== undefined && summary.longitude !== undefined && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-sky-500/[0.07] px-4 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-300" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-wider text-sky-300/80">
                Embedded GPS position
              </p>
              <p className="font-mono text-xs text-[#e2e7f1]">{summary.gps}</p>
            </div>
          </div>
          <a
            href={`https://www.openstreetmap.org/?mlat=${summary.latitude}&mlon=${summary.longitude}#map=16/${summary.latitude}/${summary.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-sky-400/40 px-2.5 py-1 font-mono text-[10px] text-sky-200 hover:bg-sky-500/15"
          >
            {summary.latitude.toFixed(5)}, {summary.longitude.toFixed(5)} ↗
          </a>
        </div>
      )}

      {summaryRows.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeading
            icon={Camera}
            title="Optical fingerprint"
            hint={`${report.tags.filter((t) => CAMERA_GROUPS.has(t.group)).length} EXIF tags`}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {summaryRows.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#232834] bg-[#151821] px-3 py-2">
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#646e82]">{label}</p>
                <p className="mt-0.5 text-xs text-[#f3f5f9]">{value}</p>
              </div>
            ))}
          </div>
          {summary.makerNote && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-200/90">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                {summary.makerNote} present. Vendor maker notes frequently hide body serials, shutter
                counts and lens IDs — they are not interpreted here, only detected.
              </span>
            </div>
          )}
        </section>
      )}

      {!hasExif ? (
        <div className="rounded-xl border border-[#232834] bg-[#101219] px-4 py-8 text-center">
          <Camera className="mx-auto mb-2 h-7 w-7 text-[#3f4657]" />
          <p className="text-sm font-medium text-[#e2e7f1]">No EXIF directories in this file</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-[#7c8599]">
            {report.mediaType === "document"
              ? "Documents do not carry camera EXIF. Their authoring properties live in the All Tags tab."
              : `The ${report.containerFormat} container has no TIFF/EXIF directory. Screenshots, web exports and generative tools usually strip or never write one.`}
          </p>
        </div>
      ) : (
        groups.map(([group, rows]) => <TagGroupTable key={group} group={group} rows={rows} />)
      )}
    </div>
  );
}

function TagGroupTable({ group, rows }: { group: string; rows: MetadataTagRow[] }) {
  return (
    <section className="space-y-2">
      <SectionHeading
        icon={Camera}
        title={group}
        hint={EMPTY_GROUP_LABEL[group] ?? `${rows.length} tags`}
      />
      <div className="overflow-x-auto rounded-lg border border-[#232834]">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-[#232834] bg-[#14171f] font-mono text-[9px] uppercase tracking-wider text-[#646e82]">
            <tr>
              <th className="px-3 py-1.5 font-medium">Hex</th>
              <th className="px-3 py-1.5 font-medium">Tag</th>
              <th className="px-3 py-1.5 font-medium">Type</th>
              <th className="px-3 py-1.5 font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a1e27] font-mono text-[11px]">
            {rows.map((row, index) => (
              <tr key={`${group}-${row.tag}-${index}`} className="align-top hover:bg-[#141821]">
                <td className="whitespace-nowrap px-3 py-1.5 text-[10px] text-amber-400/80">
                  {row.hex ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-[#e2e7f1]">{row.tag}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-[9px] text-[#646e82]">
                  {row.type ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-[#c4ccdc]">
                  <span className="break-all">{row.value}</span>
                  {row.rawValue && row.rawValue !== row.value && row.rawValue.length <= 40 && (
                    <span className="ml-1 font-mono text-[9px] text-[#4b5568]">raw: {row.rawValue}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 3 — AI provenance                                              */
/* ------------------------------------------------------------------ */

function ProvenanceTab({ report }: { report: ForensicReport }) {
  const severityRank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  const findings = [...report.aiFindings].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity]
  );
  const has = (rule: string) => report.aiFindings.some((f) => f.rule === rule);
  const hasToken = report.aiFindings.some((f) => f.rule?.startsWith("token-"));

  const checks: Array<{ label: string; found: boolean; detail: string }> = [
    {
      label: "C2PA / JUMBF manifest",
      found: Boolean(report.hasC2paManifest),
      detail: report.hasC2paManifest
        ? "Signed provenance box present in the container"
        : "No JUMBF provenance box in this container",
    },
    {
      label: "IPTC DigitalSourceType",
      found: has("iptc-source-type"),
      detail: "Machine-readable AI declaration (trainedAlgorithmicMedia)",
    },
    {
      label: "Diffusion parameter block",
      found: has("diffusion-params") || has("comfy-graph"),
      detail: "Prompt / sampler / seed / ComfyUI graph text chunks",
    },
    {
      label: "Generator fingerprints",
      found: hasToken || has("filename-convention"),
      detail: "Tool names in software-style fields or the filename",
    },
    {
      label: "Camera optical telemetry",
      found: Boolean(report.cameraVerified),
      detail: "Make + model + exposure / ISO / lens data",
    },
    {
      label: "Appended data",
      found: has("trailing-data"),
      detail: "Bytes after the declared end of the container",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${
              check.found ? "border-amber-500/35 bg-amber-500/[0.06]" : "border-[#1d222d] bg-[#101219]"
            }`}
          >
            {check.found ? (
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-amber-400" />
            ) : (
              <XCircle className="mt-px h-4 w-4 shrink-0 text-[#3f4657]" />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#e2e7f1]">{check.label}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[#7c8599]">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-2.5">
        <SectionHeading
          icon={ShieldAlert}
          title="Evidence"
          hint={`${findings.length} marker${findings.length === 1 ? "" : "s"}`}
        />
        {findings.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            No AI provenance markers, diffusion parameters or generator identifiers were found in the
            parsed bytes.
          </div>
        ) : (
          <div className="space-y-2">
            {findings.map((finding) => {
              const meta = SEVERITY_META[finding.severity];
              return (
                <article key={finding.id} className={`rounded-xl border p-3.5 ${meta.panel}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide ${meta.badge}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-xs font-semibold text-[#f3f5f9]">{finding.generator}</span>
                    </div>
                    <span className="font-mono text-[10px] text-[#7c8599]">
                      {finding.location} → {finding.key}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#9aa3b5]">{finding.explanation}</p>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-[#232834] bg-[#0b0d12] px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-amber-200/85">
                    {finding.snippet}
                  </pre>
                  {finding.rule && (
                    <p className="mt-1 text-right font-mono text-[9px] text-[#4b5568]">
                      rule: {finding.rule}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 4 — Binary map                                                 */
/* ------------------------------------------------------------------ */

function StructureTab({ report }: { report: ForensicReport }) {
  const [category, setCategory] = useState<"all" | ChunkCategory>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<ChunkCategory, number>();
    for (const chunk of report.chunks) {
      map.set(chunk.category, (map.get(chunk.category) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [report.chunks]);

  const chunks = report.chunks.filter((chunk) => category === "all" || chunk.category === category);
  const totalBytes = report.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`rounded-lg border px-2 py-1 font-mono text-[10px] transition-colors ${
              category === "all"
                ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                : "border-[#262c3a] bg-[#14171f] text-[#9aa3b5] hover:text-white"
            }`}
          >
            all · {report.chunks.length}
          </button>
          {categories.map(([key, count]) => {
            const meta = CATEGORY_META[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10px] transition-colors ${
                  category === key
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                    : "border-[#262c3a] bg-[#14171f] text-[#9aa3b5] hover:text-white"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label} · {count}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[10px] text-[#646e82]">
          {formatBytes(totalBytes)} mapped / {formatBytes(report.byteSize)} file
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#232834]">
        <div className="grid grid-cols-[92px_44px_1fr_auto] items-center gap-2 border-b border-[#232834] bg-[#14171f] px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-[#646e82]">
          <span>Offset</span>
          <span>Size</span>
          <span>Segment</span>
          <span>Type</span>
        </div>
        <div className="divide-y divide-[#1a1e27]">
          {chunks.map((chunk) => {
            const meta = CATEGORY_META[chunk.category];
            const open = expanded === chunk.id;
            return (
              <div key={chunk.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : chunk.id)}
                  className="grid w-full grid-cols-[92px_44px_1fr_auto] items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[#141821]"
                >
                  <span className="font-mono text-[10px] text-[#646e82]">{formatOffset(chunk.offset)}</span>
                  <span className="font-mono text-[10px] text-[#9aa3b5]">{formatBytes(chunk.byteLength)}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    {open ? (
                      <ChevronDown className="h-3 w-3 shrink-0 text-[#646e82]" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 text-[#3f4657]" />
                    )}
                    <span className={`shrink-0 rounded border px-1.5 py-px font-mono text-[9px] ${meta.chip}`}>
                      {chunk.marker}
                    </span>
                    <span className="truncate text-[11px] text-[#c4ccdc]">{chunk.label}</span>
                    {chunk.note && (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1 py-px font-mono text-[9px] text-amber-300">
                        {chunk.note}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-[9px] text-[#646e82]">
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-[#1a1e27] bg-[#0b0d12] px-3 py-2 font-mono text-[10px] text-[#9aa3b5]">
                    {chunk.hexPreview && (
                      <p className="text-amber-200/80">
                        <span className="text-[#646e82]">hex </span>
                        {chunk.hexPreview}
                      </p>
                    )}
                    {chunk.preview ? (
                      <p className="mt-1 whitespace-pre-wrap break-all text-[#c4ccdc]">{chunk.preview}</p>
                    ) : (
                      <p className="mt-1 text-[#4b5568]">No printable payload preview.</p>
                    )}
                    <p className="mt-1 text-[#4b5568]">
                      {formatBytes(chunk.byteLength)} at byte {chunk.offset.toLocaleString()} (0x
                      {chunk.offset.toString(16)})
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {chunks.length === 0 && (
        <p className="rounded-lg border border-[#232834] bg-[#101219] px-4 py-6 text-center text-xs text-[#7c8599]">
          No segments mapped for this filter.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 5 — All tags                                                   */
/* ------------------------------------------------------------------ */

function TagsTab({
  report,
  onCopy,
  copied,
}: {
  report: ForensicReport;
  onCopy: (key: string, text: string) => void;
  copied: string | null;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");

  const groups = useMemo(() => groupTags(report.tags), [report.tags]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return report.tags.filter((tag) => {
      if (group !== "all" && tag.group !== group) return false;
      if (!q) return true;
      return (
        tag.tag.toLowerCase().includes(q) ||
        tag.group.toLowerCase().includes(q) ||
        tag.value.toLowerCase().includes(q) ||
        (tag.hex ? tag.hex.toLowerCase().includes(q) : false)
      );
    });
  }, [report.tags, query, group]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#646e82]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by tag, hex id (0x010F), group or value…"
            className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] py-2 pl-9 pr-3 font-mono text-[11px] text-[#f3f5f9] placeholder:text-[#4b5568] focus:border-amber-500/60 focus:outline-none"
          />
        </div>
        <span className="font-mono text-[10px] text-[#646e82]">
          {filtered.length} of {report.tags.length} tags
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setGroup("all")}
          className={`rounded-md border px-2 py-1 font-mono text-[10px] ${
            group === "all"
              ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
              : "border-[#262c3a] bg-[#14171f] text-[#9aa3b5] hover:text-white"
          }`}
        >
          all · {report.tags.length}
        </button>
        {groups.map(([name, rows]) => (
          <button
            key={name}
            type="button"
            onClick={() => setGroup(name)}
            className={`rounded-md border px-2 py-1 font-mono text-[10px] ${
              group === name
                ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                : "border-[#262c3a] bg-[#14171f] text-[#9aa3b5] hover:text-white"
            }`}
          >
            {name} · {rows.length}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-[#232834] bg-[#101219] px-4 py-6 text-center text-xs text-[#7c8599]">
          {report.tags.length === 0
            ? "This container carries zero metadata properties."
            : "No tags match the current filter."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#232834]">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 border-b border-[#232834] bg-[#14171f] font-mono text-[9px] uppercase tracking-wider text-[#646e82]">
              <tr>
                <th className="px-3 py-2 font-medium">Group</th>
                <th className="px-3 py-2 font-medium">Hex</th>
                <th className="px-3 py-2 font-medium">Tag</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1e27] font-mono text-[11px]">
              {filtered.map((row, index) => {
                const key = `${row.group}-${row.tag}-${index}`;
                return (
                  <tr
                    key={key}
                    className={`align-top ${row.isAiFlag ? "bg-red-500/[0.08]" : "hover:bg-[#141821]"}`}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 text-[10px] text-[#7c8599]">{row.group}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[10px] text-amber-400/80">
                      {row.hex ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#e2e7f1]">{row.tag}</td>
                    <td className="px-3 py-1.5 text-[#c4ccdc]">
                      <span className="break-all">{row.value}</span>
                      {row.type && (
                        <span className="ml-1.5 rounded bg-[#1c202a] px-1 py-px text-[9px] text-[#646e82]">
                          {row.type}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => onCopy(key, `${row.tag} = ${row.value}`)}
                        title="Copy tag value"
                        className="rounded p-1 text-[#4b5568] transition-colors hover:text-amber-300"
                      >
                        {copied === key ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 6 — Raw JSON                                                   */
/* ------------------------------------------------------------------ */

function RawTab({
  report,
  onCopy,
  copied,
}: {
  report: ForensicReport;
  onCopy: (key: string, text: string) => void;
  copied: string | null;
}) {
  const json = useMemo(() => JSON.stringify(report, null, 2), [report]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionHeading icon={Binary} title="Inspection report" hint={`${formatBytes(json.length)} of JSON`} />
        <button
          type="button"
          onClick={() => onCopy("raw", json)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-2.5 py-1.5 text-[11px] text-[#d5dce9] hover:border-amber-500/50 hover:text-amber-200"
        >
          {copied === "raw" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          Copy
        </button>
      </div>
      <pre className="max-h-[62vh] overflow-auto rounded-lg border border-[#232834] bg-[#0b0d12] p-3 font-mono text-[10px] leading-relaxed text-[#c4ccdc]">
        {json}
      </pre>
    </div>
  );
}

/** Exported for render tests (each tab is a pure view over a report). */
export { OverviewTab, ExifTab, ProvenanceTab, StructureTab, TagsTab, RawTab };
