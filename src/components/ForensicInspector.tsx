"use client";

import { useState, useMemo } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Layers,
  FileSearch,
  Search,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cpu,
  Camera,
  Hash,
} from "lucide-react";
import type {
  ForensicReport,
  ChunkCategory,
} from "@/lib/metadata-inspector";

interface ForensicInspectorProps {
  beforeReport: ForensicReport | null;
  afterReport: ForensicReport | null;
  isInspecting: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
    default:
      return "bg-zinc-800/80 text-zinc-400 border-zinc-700/70";
  }
}

export function ForensicInspector({
  beforeReport,
  afterReport,
  isInspecting,
}: ForensicInspectorProps) {
  const [activeTab, setActiveTab] = useState<"audit" | "chunks" | "tags">(
    "audit"
  );
  const [viewTarget, setViewTarget] = useState<"after" | "before">("after");
  const [tagQuery, setTagQuery] = useState("");

  const displayedReport =
    afterReport && viewTarget === "after" ? afterReport : beforeReport;

  const filteredTags = useMemo(() => {
    if (!displayedReport) return [];
    const q = tagQuery.trim().toLowerCase();
    if (!q) return displayedReport.tags;
    return displayedReport.tags.filter(
      (t) =>
        t.tag.toLowerCase().includes(q) ||
        t.group.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        (t.hex && t.hex.toLowerCase().includes(q))
    );
  }, [displayedReport, tagQuery]);

  if (isInspecting && !beforeReport) {
    return (
      <div className="rounded-xl border border-[#232834] bg-[#111318] p-8 text-center">
        <div className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-2 border-amber-500/30 border-t-amber-400 mb-3" />
        <p className="text-sm text-[#9aa3b5]">
          Scanning binary container chunks, C2PA JUMBF boxes, XMP packets &amp;
          EXIF IFDs…
        </p>
      </div>
    );
  }

  if (!beforeReport) return null;

  const criticalBefore = beforeReport.aiFindings.filter(
    (f) => f.severity === "critical" || f.severity === "warning"
  );

  return (
    <div className="rounded-xl border border-[#232834] bg-[#111318] overflow-hidden">
      {/* Top Tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232834] bg-[#0d0f14] px-4 py-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "audit"
                ? "bg-[#1c202a] text-[#f3f5f9] border border-[#2f3646]"
                : "text-[#9aa3b5] hover:text-[#f3f5f9]"
            }`}
          >
            {afterReport ? (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            ) : criticalBefore.length > 0 ? (
              <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            ) : (
              <FileSearch className="h-3.5 w-3.5 text-amber-400" />
            )}
            {afterReport ? "Sanitization Diff" : "Provenance Audit"}
            {!afterReport && criticalBefore.length > 0 && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-[10px] text-red-300">
                {criticalBefore.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("chunks")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "chunks"
                ? "bg-[#1c202a] text-[#f3f5f9] border border-[#2f3646]"
                : "text-[#9aa3b5] hover:text-[#f3f5f9]"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            Binary Chunks
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              {displayedReport?.chunks.length ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("tags")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "tags"
                ? "bg-[#1c202a] text-[#f3f5f9] border border-[#2f3646]"
                : "text-[#9aa3b5] hover:text-[#f3f5f9]"
            }`}
          >
            <Hash className="h-3.5 w-3.5 text-amber-400" />
            EXIF / Tag Hex Table
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              {displayedReport?.tags.length ?? 0}
            </span>
          </button>
        </div>

        {/* Before / After Switcher when processed */}
        {afterReport && activeTab !== "audit" && (
          <div className="inline-flex rounded-lg border border-[#232834] bg-[#14171f] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewTarget("before")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                viewTarget === "before"
                  ? "bg-red-500/20 text-red-200"
                  : "text-[#9aa3b5] hover:text-white"
              }`}
            >
              Original ({beforeReport.tags.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTarget("after")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                viewTarget === "after"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "text-[#9aa3b5] hover:text-white"
              }`}
            >
              Sanitized ({afterReport.tags.length})
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: PROVENANCE AUDIT & DIFF */}
      {activeTab === "audit" && (
        <div className="p-5 space-y-5">
          {afterReport ? (
            <>
              {/* Verified Before -> After Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                  <div className="flex items-center justify-between text-xs text-emerald-300/80 mb-1">
                    <span>AI Provenance Risk</span>
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-2 font-mono">
                    <span className="text-sm line-through text-red-400/80">
                      {beforeReport.aiRiskScore}/100
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-xl font-semibold text-emerald-300">
                      {afterReport.aiRiskScore}/100
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-200/75">
                    0 AI signatures in re-inspected binary
                  </p>
                </div>

                <div className="rounded-lg border border-[#262b38] bg-[#161920] p-3.5">
                  <div className="flex items-center justify-between text-xs text-[#9aa3b5] mb-1">
                    <span>Container &amp; Bitstream</span>
                    <Cpu className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="flex items-baseline gap-2 font-mono text-sm text-[#f3f5f9]">
                    <span>{beforeReport.containerFormat}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-semibold text-amber-300">
                      {afterReport.containerFormat}
                    </span>
                    <span className="text-xs text-[#9aa3b5]">
                      ({formatBytes(afterReport.byteSize)})
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-[#646e82] truncate">
                    SHA256: {afterReport.sha256.slice(0, 20)}…
                  </p>
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5">
                  <div className="flex items-center justify-between text-xs text-amber-200/80 mb-1">
                    <span>Verified Camera Telemetry</span>
                    <Camera className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="font-display text-sm font-semibold text-amber-200 truncate">
                    {afterReport.exifSummary.make}{" "}
                    {afterReport.exifSummary.model}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-amber-200/75 truncate">
                    {afterReport.tags.length} authentic optical tags verified
                  </p>
                </div>
              </div>

              {/* Side-by-side Purged vs Injected */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-[#252a37] bg-[#14171e] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-300 mb-3">
                    <XCircle className="h-4 w-4 text-red-400" />
                    Purged Provenance &amp; Ancillary Data
                  </div>
                  {beforeReport.aiFindings.length > 0 ? (
                    <ul className="space-y-2.5">
                      {beforeReport.aiFindings.map((f) => (
                        <li
                          key={f.id}
                          className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-red-200 line-through">
                              {f.generator}
                            </span>
                            <span className="font-mono text-[10px] text-red-300/80">
                              PURGED · {f.location}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-zinc-400 truncate">
                            {f.key}: {f.snippet}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-[#9aa3b5]">
                      Re-encoded from raw uncompressed pixels — stripped all prior
                      container headers, ICC tags, and encoder footprints.
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[#252a37] bg-[#14171e] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Embedded Optical Telemetry
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    {[
                      ["Make", afterReport.exifSummary.make],
                      ["Model", afterReport.exifSummary.model],
                      ["Lens", afterReport.exifSummary.lensModel],
                      ["Firmware", afterReport.exifSummary.software],
                      ["Shutter", afterReport.exifSummary.exposureTime],
                      ["Aperture", afterReport.exifSummary.fNumber],
                      ["ISO", afterReport.exifSummary.iso],
                      [
                        "Focal Length",
                        afterReport.exifSummary.focalLength35mm
                          ? `${afterReport.exifSummary.focalLength} (${afterReport.exifSummary.focalLength35mm})`
                          : afterReport.exifSummary.focalLength,
                      ],
                      ["Captured", afterReport.exifSummary.dateTimeOriginal],
                      ["GPS", afterReport.exifSummary.gps || "None (Stripped)"],
                    ]
                      .filter(([, v]) => Boolean(v))
                      .map(([k, v]) => (
                        <div
                          key={k}
                          className="rounded border border-[#232834] bg-[#0f1117] px-2.5 py-1.5"
                        >
                          <div className="text-[10px] text-[#646e82]">{k}</div>
                          <div className="text-[#f3f5f9] truncate" title={v}>
                            {v}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Pre-processing Provenance Audit */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-[#252a37] bg-[#151821] p-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                      beforeReport.authenticityStatus === "ai-detected"
                        ? "border-red-500/40 bg-red-500/15 text-red-400"
                        : beforeReport.authenticityStatus === "camera-verified"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                        : "border-amber-500/40 bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {beforeReport.authenticityStatus === "ai-detected" ? (
                      <ShieldAlert className="h-5 w-5" />
                    ) : beforeReport.authenticityStatus === "camera-verified" ? (
                      <ShieldCheck className="h-5 w-5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-[#f3f5f9]">
                        {beforeReport.authenticityStatus === "ai-detected"
                          ? "AI Generation Provenance Detected"
                          : beforeReport.authenticityStatus === "camera-verified"
                          ? "Camera EXIF Telemetry Present"
                          : "Missing Optical Camera Telemetry"}
                      </h3>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[11px] font-medium ${
                          beforeReport.aiRiskScore >= 70
                            ? "bg-red-500/20 text-red-300"
                            : beforeReport.aiRiskScore >= 20
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        AI Risk Score: {beforeReport.aiRiskScore}/100
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#9aa3b5]">
                      {beforeReport.detectedGenerators.length > 0
                        ? `Identified signatures: ${beforeReport.detectedGenerators.join(
                            " · "
                          )}`
                        : beforeReport.exifSummary.make
                        ? `Current camera tag: ${beforeReport.exifSummary.make} ${
                            beforeReport.exifSummary.model || ""
                          }`
                        : `No camera Make/Model/Lens IFDs found in ${beforeReport.containerFormat} container.`}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right font-mono text-xs text-[#9aa3b5] shrink-0">
                  <div>
                    {beforeReport.containerFormat} ·{" "}
                    {formatBytes(beforeReport.byteSize)}
                  </div>
                  {beforeReport.width && beforeReport.height && (
                    <div className="text-[#646e82]">
                      {beforeReport.width} × {beforeReport.height} px
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed Findings List */}
              {beforeReport.aiFindings.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-medium uppercase tracking-wider text-[#9aa3b5]">
                    Detected Provenance Markers ({beforeReport.aiFindings.length})
                  </div>
                  {beforeReport.aiFindings.map((finding) => (
                    <div
                      key={finding.id}
                      className={`rounded-lg border p-3.5 ${
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
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase font-semibold ${
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
                        <span className="font-mono text-[11px] text-[#9aa3b5]">
                          {finding.location} → {finding.key}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-[#9aa3b5]">
                        {finding.explanation}
                      </p>
                      <pre className="mt-2 overflow-x-auto rounded border border-[#232834] bg-[#0b0d12] px-3 py-2 font-mono text-[11px] text-amber-200/90 whitespace-pre-wrap break-all">
                        {finding.snippet}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: BINARY CONTAINER CHUNKS */}
      {activeTab === "chunks" && displayedReport && (
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#9aa3b5]">
            <span>
              Low-level {displayedReport.containerFormat} binary segments in{" "}
              <code className="text-[#f3f5f9]">{displayedReport.filename}</code>
            </span>
            <span className="font-mono">
              SHA-256: {displayedReport.sha256.slice(0, 16)}…
            </span>
          </div>
          <div className="space-y-2">
            {displayedReport.chunks.map((c) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-[#232834] bg-[#151821] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${chunkBadgeStyle(
                        c.category
                      )}`}
                    >
                      {c.marker}
                    </span>
                    <span className="text-xs font-medium text-[#f3f5f9] truncate">
                      {c.label}
                    </span>
                  </div>
                  {c.preview && (
                    <p className="mt-1.5 font-mono text-[11px] text-[#9aa3b5] truncate">
                      {c.preview}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-[#646e82] shrink-0">
                  <span>@0x{c.offset.toString(16).padStart(6, "0")}</span>
                  <span className="text-[#9aa3b5]">
                    {formatBytes(c.byteLength)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: FULL HEX / EXIF TAG TABLE */}
      {activeTab === "tags" && displayedReport && (
        <div className="p-5 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#646e82]" />
            <input
              type="text"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Filter tags by name, hex ID (e.g. 0x010F, LensModel, ISO, C2PA)…"
              className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] py-2 pl-9 pr-3 text-xs text-[#f3f5f9] placeholder:text-[#646e82] focus:border-amber-500/60 focus:outline-none"
            />
          </div>

          {filteredTags.length === 0 ? (
            <div className="rounded-lg border border-[#232834] bg-[#14171f] p-6 text-center text-xs text-[#9aa3b5]">
              {displayedReport.tags.length === 0
                ? "Zero metadata tags present in this file container."
                : "No metadata tags match your filter."}
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-[#232834]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#14171f] text-[11px] uppercase tracking-wider text-[#646e82] border-b border-[#232834]">
                  <tr>
                    <th className="py-2 px-3 font-medium">IFD / Group</th>
                    <th className="py-2 px-3 font-medium">Hex</th>
                    <th className="py-2 px-3 font-medium">Tag</th>
                    <th className="py-2 px-3 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1d212c] font-mono text-xs">
                  {filteredTags.map((row, idx) => (
                    <tr
                      key={`${row.group}-${row.tag}-${idx}`}
                      className={
                        row.isAiFlag
                          ? "bg-red-500/10 text-red-200"
                          : "hover:bg-[#161922]"
                      }
                    >
                      <td className="py-2 px-3 text-[11px] text-[#9aa3b5] whitespace-nowrap">
                        {row.group}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-amber-400/85 whitespace-nowrap">
                        {row.hex || "—"}
                      </td>
                      <td className="py-2 px-3 font-medium text-[#f3f5f9] whitespace-nowrap">
                        {row.tag}
                      </td>
                      <td className="py-2 px-3 text-[#c4ccdc] break-all">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
