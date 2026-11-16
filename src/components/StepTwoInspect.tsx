"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Binary,
  Camera,
  CheckCircle2,
  Download,
  FileImage,
  FileSearch,
  FileText,
  FileVideo,
  Loader2,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import {
  CATEGORY_META,
  SEVERITY_META,
  STATUS_META,
  formatBytes,
  formatDuration,
  formatOffset,
  groupTags,
  riskTone,
} from "@/components/inspector/shared";
import { formatBytesShort, type QueuedAsset } from "./studio-types";

interface StepTwoInspectProps {
  queue: QueuedAsset[];
  activeAsset: QueuedAsset;
  onSelectAsset: (id: string) => void;
  onBackToStepOne: () => void;
  onOpenFullModal: (asset: QueuedAsset) => void;
  onCleanDownloadActive: (asset: QueuedAsset) => void;
  onCleanDownloadAll: () => void;
  onDownloadCleanBlob: (asset: QueuedAsset) => void;
  onDownloadAllCleanZip: () => void;
  onProceedToInject: () => void;
}

type InspectTab = "findings" | "tags" | "structure";

export function StepTwoInspect({
  queue,
  activeAsset,
  onSelectAsset,
  onBackToStepOne,
  onOpenFullModal,
  onCleanDownloadActive,
  onCleanDownloadAll,
  onDownloadCleanBlob,
  onDownloadAllCleanZip,
  onProceedToInject,
}: StepTwoInspectProps) {
  const [activeTab, setActiveTab] = useState<InspectTab>("findings");
  const [tagQuery, setTagQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");

  const report = activeAsset.beforeReport;
  const cleanReport = activeAsset.cleanReport;
  const anyCleaning = queue.some((q) => q.isCleaning);
  const cleanedCount = queue.filter((q) => Boolean(q.cleanUrl)).length;

  const filteredTags = useMemo(() => {
    if (!report) return [];
    const q = tagQuery.trim().toLowerCase();
    return report.tags.filter((t) => {
      if (groupFilter !== "ALL" && t.group !== groupFilter) return false;
      if (!q) return true;
      return (
        t.tag.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q)
      );
    });
  }, [report, tagQuery, groupFilter]);

  const tagGroups = useMemo(() => {
    if (!report) return [];
    return groupTags(report.tags);
  }, [report]);

  const status = report ? STATUS_META[report.authenticityStatus] : null;
  const risk = report ? riskTone(report.aiRiskScore) : null;
  const nonInfoFindings = report
    ? report.aiFindings.filter((f) => f.severity !== "info")
    : [];

  return (
    <div className="space-y-5">
      {/* TOP BAR + QUEUE STRIP */}
      <div className="rounded-2xl border border-[#232834] bg-[#111318] p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToStepOne}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-3 py-1.5 text-xs font-medium text-[#d5dce9] hover:border-amber-500/50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Change Files
            </button>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-400">
                Step 02 · Forensic Metadata Inspection
              </span>
              <h2 className="font-display text-sm sm:text-base font-bold text-[#f3f5f9]">
                Inspect embedded signatures, then choose Clean Download or Inject Metadata
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenFullModal(activeAsset)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-display text-xs font-semibold text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            <FileSearch className="h-3.5 w-3.5" />
            Full Report &amp; JSON
          </button>
        </div>

        {/* Multi-file switcher */}
        {queue.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pt-2 border-t border-[#1e2330] pb-1">
            {queue.map((item) => {
              const selected = item.id === activeAsset.id;
              const aiFlags =
                item.beforeReport?.aiFindings.filter(
                  (f) => f.severity !== "info"
                ).length ?? 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectAsset(item.id);
                    setGroupFilter("ALL");
                    setTagQuery("");
                  }}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 min-w-[200px] max-w-[240px] text-left shrink-0 transition-all cursor-pointer ${
                    selected
                      ? "border-amber-500/75 bg-amber-500/10"
                      : "border-[#232834] bg-[#151821] hover:border-[#343c4e]"
                  }`}
                >
                  <div className="h-9 w-9 rounded-lg overflow-hidden bg-[#0b0d12] border border-[#252a37] flex items-center justify-center shrink-0">
                    {item.mediaType === "image" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="h-full w-full object-cover"
                      />
                    ) : item.mediaType === "video" ? (
                      <FileVideo className="h-4 w-4 text-amber-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-amber-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-medium text-[#f3f5f9]">
                      {item.file.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px]">
                      {item.isInspecting ? (
                        <span className="text-amber-300">Scanning…</span>
                      ) : item.cleanUrl ? (
                        <span className="text-emerald-400">✓ Cleaned</span>
                      ) : aiFlags > 0 ? (
                        <span className="text-red-400">{aiFlags} AI Flags</span>
                      ) : (
                        <span className="text-[#7c8599]">
                          {item.beforeReport?.tags.length ?? 0} tags ·{" "}
                          {formatBytesShort(item.file.size)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* MAIN INSPECTION WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: PREVIEW + RISK SCORE CARD */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-[#232834] bg-[#111318] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#1d222d] bg-[#0e1016] px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {activeAsset.mediaType === "image" ? (
                  <FileImage className="h-4 w-4 text-amber-400 shrink-0" />
                ) : activeAsset.mediaType === "video" ? (
                  <FileVideo className="h-4 w-4 text-amber-400 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <span className="truncate font-mono text-xs font-medium text-[#f3f5f9]">
                  {activeAsset.file.name}
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#7c8599] shrink-0 ml-2">
                {formatBytesShort(activeAsset.file.size)}
              </span>
            </div>

            <div className="flex min-h-[220px] max-h-[300px] items-center justify-center bg-[#08090c] p-4">
              {activeAsset.mediaType === "image" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={activeAsset.previewUrl}
                  alt={activeAsset.file.name}
                  className="max-h-[260px] w-auto rounded object-contain shadow-xl"
                />
              ) : activeAsset.mediaType === "video" ? (
                <video
                  key={activeAsset.previewUrl}
                  src={activeAsset.previewUrl}
                  controls
                  muted
                  className="max-h-[260px] w-auto rounded object-contain shadow-xl"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-center py-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2c3344] bg-[#171b24] text-amber-400">
                    <FileText className="h-8 w-8" />
                  </div>
                  <span className="font-mono text-xs text-[#9aa3b5]">
                    {report?.containerFormat || "Document"}
                  </span>
                </div>
              )}
            </div>

            {/* Risk & Status Summary */}
            {activeAsset.isInspecting && !report ? (
              <div className="p-4 text-center border-t border-[#1d222d]">
                <ScanLine className="mx-auto h-5 w-5 animate-pulse text-amber-400 mb-1.5" />
                <p className="font-mono text-xs text-[#9aa3b5]">
                  Parsing container bytes…
                </p>
              </div>
            ) : report && status && risk ? (
              <div className="border-t border-[#1d222d] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${status.ring} ${status.text}`}
                  >
                    {status.short}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-[#646e82]">
                      AI Risk
                    </span>
                    <span className={`font-mono text-sm font-bold ${risk.text}`}>
                      {report.aiRiskScore}/100
                    </span>
                  </div>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1e2330]">
                  <div
                    className={`h-full transition-all ${risk.bar}`}
                    style={{ width: `${Math.max(4, report.aiRiskScore)}%` }}
                  />
                </div>

                <p className="text-xs text-[#9aa3b5] leading-relaxed">
                  {status.blurb(report)}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                  <div className="rounded-lg border border-[#232834] bg-[#151821] px-2.5 py-2">
                    <div className="text-[9px] uppercase text-[#646e82]">
                      Container
                    </div>
                    <div className="font-semibold text-[#f3f5f9]">
                      {report.containerFormat}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#232834] bg-[#151821] px-2.5 py-2">
                    <div className="text-[9px] uppercase text-[#646e82]">
                      {report.width && report.height
                        ? "Dimensions"
                        : report.durationSec
                        ? "Duration"
                        : "Bytes"}
                    </div>
                    <div className="font-semibold text-[#f3f5f9]">
                      {report.width && report.height
                        ? `${report.width}×${report.height}`
                        : formatDuration(report.durationSec) ||
                          formatBytes(report.byteSize)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#232834] bg-[#151821] px-2.5 py-2">
                    <div className="text-[9px] uppercase text-[#646e82]">
                      Metadata Tags
                    </div>
                    <div className="font-semibold text-[#f3f5f9]">
                      {report.tags.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#232834] bg-[#151821] px-2.5 py-2">
                    <div className="text-[9px] uppercase text-[#646e82]">
                      AI Findings
                    </div>
                    <div
                      className={`font-semibold ${
                        nonInfoFindings.length > 0
                          ? "text-red-300"
                          : "text-emerald-300"
                      }`}
                    >
                      {nonInfoFindings.length}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILED METADATA INSPECTOR TABS */}
        <div className="lg:col-span-8 rounded-2xl border border-[#232834] bg-[#111318] overflow-hidden">
          {/* Tab Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232834] bg-[#0e1016] px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              {(
                [
                  {
                    id: "findings",
                    label: "AI & Provenance",
                    count: nonInfoFindings.length,
                    icon: ShieldAlert,
                  },
                  {
                    id: "tags",
                    label: "All Metadata Tags",
                    count: report?.tags.length ?? 0,
                    icon: Tag,
                  },
                  {
                    id: "structure",
                    label: "Binary Structure",
                    count: report?.chunks.length ?? 0,
                    icon: Binary,
                  },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-[#1c202a] text-[#f3f5f9] shadow-[inset_0_0_0_1px_rgba(245,158,11,0.4)]"
                        : "text-[#9aa3b5] hover:bg-[#171a22] hover:text-[#f3f5f9]"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 ${
                        active ? "text-amber-400" : "text-[#646e82]"
                      }`}
                    />
                    {t.label}
                    <span className="rounded bg-[#232834] px-1.5 py-px font-mono text-[10px] text-[#9aa3b5]">
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {report && (
              <span className="font-mono text-[10px] text-[#646e82]">
                Scanned in {report.scanMs} ms
              </span>
            )}
          </div>

          {/* Tab Content */}
          <div className="p-4 sm:p-5 max-h-[470px] overflow-y-auto">
            {activeAsset.isInspecting && !report ? (
              <div className="py-16 text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-amber-400 mb-3" />
                <p className="font-display text-sm font-semibold text-[#f3f5f9]">
                  Inspecting metadata blocks…
                </p>
                <p className="mt-1 font-mono text-xs text-[#7c8599]">
                  Reading EXIF IFDs, XMP packets, JUMBF/C2PA manifests &amp;
                  document properties
                </p>
              </div>
            ) : activeAsset.error ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200">
                {activeAsset.error}
              </div>
            ) : !report ? null : activeTab === "findings" ? (
              <div className="space-y-4">
                {/* Existing Camera EXIF Card (if present in source) */}
                {(report.exifSummary.make ||
                  report.exifSummary.model ||
                  report.exifSummary.software) && (
                  <div className="rounded-xl border border-[#232834] bg-[#151821] p-3.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-300 mb-2">
                      <Camera className="h-3.5 w-3.5" />
                      Embedded Device / Software Telemetry
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                      {report.exifSummary.make && (
                        <div>
                          <span className="text-[#646e82] block text-[9px]">
                            MAKE
                          </span>
                          <span className="text-[#f3f5f9]">
                            {report.exifSummary.make}
                          </span>
                        </div>
                      )}
                      {report.exifSummary.model && (
                        <div>
                          <span className="text-[#646e82] block text-[9px]">
                            MODEL
                          </span>
                          <span className="text-[#f3f5f9]">
                            {report.exifSummary.model}
                          </span>
                        </div>
                      )}
                      {report.exifSummary.software && (
                        <div>
                          <span className="text-[#646e82] block text-[9px]">
                            SOFTWARE
                          </span>
                          <span className="text-[#f3f5f9] truncate block">
                            {report.exifSummary.software}
                          </span>
                        </div>
                      )}
                      {report.exifSummary.lensModel && (
                        <div>
                          <span className="text-[#646e82] block text-[9px]">
                            LENS
                          </span>
                          <span className="text-[#f3f5f9] truncate block">
                            {report.exifSummary.lensModel}
                          </span>
                        </div>
                      )}
                      {report.exifSummary.gps && (
                        <div>
                          <span className="text-[#646e82] block text-[9px]">
                            GPS
                          </span>
                          <span className="text-sky-300">
                            {report.exifSummary.gps}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* AI & Provenance Findings */}
                {report.aiFindings.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                    <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-200">
                        No AI provenance or generation signatures detected
                      </p>
                      <p className="mt-0.5 text-[11px] text-emerald-300/80">
                        {report.tags.length > 0
                          ? `However, ${report.tags.length} general metadata tags are still embedded — use Clean Download to strip them or Inject Metadata to replace them.`
                          : "This file contains minimal or no extractable metadata tags."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {report.aiFindings.map((finding) => {
                      const meta = SEVERITY_META[finding.severity];
                      return (
                        <div
                          key={finding.id}
                          className={`rounded-xl border p-3.5 ${meta.panel}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {finding.severity === "critical" ? (
                                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                              )}
                              <span className="font-display text-xs font-semibold text-[#f3f5f9]">
                                {finding.generator}
                              </span>
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${meta.badge}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <p className="mt-1.5 font-mono text-[11px] text-amber-200/90">
                            {finding.location} → {finding.key}
                          </p>
                          <p className="mt-1 text-xs text-[#9aa3b5]">
                            {finding.explanation}
                          </p>
                          {finding.snippet && (
                            <pre className="mt-2 max-h-24 overflow-auto rounded-lg border border-[#232834] bg-[#0a0b0e] p-2 font-mono text-[10px] text-[#8e97aa]">
                              {finding.snippet}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeTab === "tags" ? (
              <div className="space-y-3">
                {/* Search + Group Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-[#646e82]" />
                    <input
                      type="text"
                      value={tagQuery}
                      onChange={(e) => setTagQuery(e.target.value)}
                      placeholder="Filter tags by key, group, or value…"
                      className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] py-1.5 pr-3 pl-8 text-xs text-[#f3f5f9] placeholder:text-[#555e70] focus:border-amber-500/60 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setGroupFilter("ALL")}
                      className={`rounded-md px-2 py-1 font-mono text-[10px] transition-colors cursor-pointer ${
                        groupFilter === "ALL"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-[#151821] text-[#9aa3b5] border border-[#232834]"
                      }`}
                    >
                      All ({report.tags.length})
                    </button>
                    {tagGroups.map(([grp, rows]) => (
                      <button
                        key={grp}
                        type="button"
                        onClick={() => setGroupFilter(grp)}
                        className={`rounded-md px-2 py-1 font-mono text-[10px] transition-colors cursor-pointer ${
                          groupFilter === grp
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-[#151821] text-[#9aa3b5] border border-[#232834]"
                        }`}
                      >
                        {grp} ({rows.length})
                      </button>
                    ))}
                  </div>
                </div>

                {filteredTags.length === 0 ? (
                  <div className="rounded-xl border border-[#232834] bg-[#151821] p-6 text-center text-xs text-[#7c8599]">
                    {report.tags.length === 0
                      ? "No embedded metadata tags found in this file."
                      : "No tags match your search filter."}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[#232834]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#232834] bg-[#0e1016] font-mono text-[10px] uppercase text-[#646e82]">
                          <th className="px-3 py-2">Group</th>
                          <th className="px-3 py-2">Tag</th>
                          <th className="px-3 py-2">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1d222d] font-mono text-[11px]">
                        {filteredTags.slice(0, 200).map((t, idx) => (
                          <tr
                            key={`${t.group}-${t.tag}-${idx}`}
                            className="hover:bg-[#151821]"
                          >
                            <td className="px-3 py-2 text-amber-300/85 whitespace-nowrap align-top">
                              {t.group}
                            </td>
                            <td className="px-3 py-2 text-[#e2e7f1] whitespace-nowrap align-top">
                              {t.tag}
                              {t.hex && (
                                <span className="ml-1.5 text-[9px] text-[#646e82]">
                                  {t.hex}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[#9aa3b5] break-all align-top">
                              {t.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredTags.length > 200 && (
                      <div className="border-t border-[#232834] bg-[#0e1016] px-3 py-2 text-center font-mono text-[10px] text-[#7c8599]">
                        Showing first 200 of {filteredTags.length} tags — open
                        Full Report for complete dump.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* STRUCTURE TAB */
              <div className="space-y-2">
                {report.chunks.map((chunk, idx) => {
                  const cat = CATEGORY_META[chunk.category];
                  return (
                    <div
                      key={`${chunk.id}-${chunk.offset}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#232834] bg-[#151821] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${cat.dot}`}
                        />
                        <span className="font-mono text-xs font-semibold text-[#f3f5f9]">
                          {chunk.marker}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${cat.chip}`}
                        >
                          {cat.label}
                        </span>
                        <span className="truncate text-xs text-[#9aa3b5]">
                          {chunk.label}
                          {chunk.preview ? ` — ${chunk.preview}` : ""}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-[#7c8599] shrink-0">
                        {formatOffset(chunk.offset)} ·{" "}
                        {formatBytes(chunk.byteLength)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CLEAN VERIFICATION BANNER (once Clean Download has run) */}
      {(cleanReport || cleanedCount > 0) && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.08] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-sm font-semibold text-emerald-100">
                Clean Export Verified — Metadata Stripped
              </h3>
              <p className="mt-0.5 font-mono text-xs text-emerald-200/85">
                {cleanReport && report
                  ? `${activeAsset.cleanFilename}: ${report.tags.length} tags → ${cleanReport.tags.length} tags · AI Risk ${report.aiRiskScore} → ${cleanReport.aiRiskScore}`
                  : `${cleanedCount} of ${queue.length} files cleaned and verified with 0 injected tags.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeAsset.cleanUrl && (
              <button
                type="button"
                onClick={() => onDownloadCleanBlob(activeAsset)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 font-display text-xs font-semibold text-[#06130c] hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Download {activeAsset.cleanFilename}
              </button>
            )}
            {cleanedCount > 1 && (
              <button
                type="button"
                onClick={onDownloadAllCleanZip}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3.5 py-2 font-display text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 transition-colors cursor-pointer"
              >
                <Archive className="h-3.5 w-3.5" />
                Download Clean ZIP ({cleanedCount})
              </button>
            )}
          </div>
        </div>
      )}

      {/* DECISION BAR: OPTION A (CLEAN DOWNLOAD) vs OPTION B (INJECT METADATA) */}
      <div className="rounded-2xl border border-[#282e3d] bg-[#111318] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9aa3b5]">
            Choose Next Action
          </span>
          <span className="font-mono text-[11px] text-[#646e82]">
            {queue.length === 1
              ? "1 file selected"
              : `${queue.length} files in batch`}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* OPTION 1: CLEAN DOWNLOAD */}
          <div className="flex flex-col justify-between rounded-xl border border-emerald-500/35 bg-emerald-500/[0.05] p-4">
            <div>
              <div className="flex items-center gap-2 font-display text-sm font-bold text-emerald-200">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Option 1 · Clean Download
              </div>
              <p className="mt-1 text-xs text-[#9aa3b5]">
                Strips 100% of AI provenance, C2PA, EXIF, XMP, GPS &amp;
                document author metadata — downloads a completely clean file
                with zero fake tags added.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {queue.length > 1 ? (
                <>
                  <button
                    type="button"
                    disabled={anyCleaning}
                    onClick={onCleanDownloadAll}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-display text-xs sm:text-sm font-semibold text-[#06130c] hover:bg-emerald-400 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {anyCleaning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    {anyCleaning
                      ? "Cleaning Batch…"
                      : `Clean Download All (${queue.length} ZIP)`}
                  </button>
                  <button
                    type="button"
                    disabled={anyCleaning}
                    onClick={() => onCleanDownloadActive(activeAsset)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/45 bg-emerald-500/15 px-3.5 py-2.5 font-display text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    This File Only
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={activeAsset.isCleaning}
                  onClick={() => onCleanDownloadActive(activeAsset)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-display text-sm font-semibold text-[#06130c] hover:bg-emerald-400 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {activeAsset.isCleaning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {activeAsset.isCleaning
                    ? "Stripping Metadata…"
                    : "Clean Download"}
                </button>
              )}
            </div>
          </div>

          {/* OPTION 2: INJECT METADATA */}
          <div className="flex flex-col justify-between rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
            <div>
              <div className="flex items-center gap-2 font-display text-sm font-bold text-amber-200">
                <SlidersHorizontal className="h-4 w-4 text-amber-400" />
                Option 2 · Inject Metadata
              </div>
              <p className="mt-1 text-xs text-[#9aa3b5]">
                Proceed to Step 3 to strip AI signatures and inject authentic
                camera hardware EXIF, lens optics, GPS, or clean document
                properties before downloading.
              </p>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={onProceedToInject}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-display text-sm font-semibold text-[#0a0b0e] shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)] hover:bg-amber-400 transition-colors cursor-pointer"
              >
                Inject Metadata &amp; Download
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
