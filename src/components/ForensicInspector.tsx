"use client";

import {
  AlertTriangle,
  ArrowRight,
  Camera,
  ChevronRight,
  FileSearch,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { ForensicReport } from "@/lib/metadata-inspector";
import {
  SEVERITY_META,
  STATUS_META,
  formatBytes,
  riskTone,
} from "@/components/inspector/shared";

interface ForensicInspectorProps {
  beforeReport: ForensicReport | null;
  afterReport: ForensicReport | null;
  isInspecting: boolean;
  error?: string | null;
  onOpenInspector?: () => void;
}

/**
 * Compact on-page summary of what the byte-level inspector found. The full
 * drill-down (every IFD, every chunk, every tag) lives in the inspector modal.
 */
export function ForensicInspector({
  beforeReport,
  afterReport,
  isInspecting,
  error,
  onOpenInspector,
}: ForensicInspectorProps) {
  if (isInspecting && !beforeReport) {
    return (
      <div className="rounded-xl border border-[#232834] bg-[#111318] p-6 text-center">
        <div className="relative mx-auto mb-3 flex h-10 w-10 items-center justify-center">
          <span className="absolute h-10 w-10 animate-ping rounded-full border border-amber-500/20" />
          <ScanLine className="h-5 w-5 animate-pulse text-amber-400" />
        </div>
        <p className="font-display text-sm font-semibold text-[#f3f5f9]">Inspecting binary structure</p>
        <p className="mt-1 font-mono text-[11px] text-[#7c8599]">
          reading segments, TIFF IFDs, XMP packets, IPTC datasets &amp; JUMBF manifests…
        </p>
      </div>
    );
  }

  const primary = beforeReport ?? afterReport;
  if (!primary) {
    return (
      <div className="rounded-xl border border-[#232834] bg-[#111318] px-4 py-5 text-center">
        <FileSearch className="mx-auto mb-2 h-6 w-6 text-[#3f4657]" />
        <p className="text-xs text-[#7c8599]">
          No inspection report yet for this file.
        </p>
        {onOpenInspector && (
          <button
            type="button"
            onClick={onOpenInspector}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-display text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            <FileSearch className="h-3.5 w-3.5" />
            Inspect metadata
          </button>
        )}
      </div>
    );
  }

  const status = STATUS_META[primary.authenticityStatus];
  const risk = riskTone(primary.aiRiskScore);
  const findings = primary.aiFindings.filter((finding) => finding.severity !== "info");
  const sorted = [...findings].sort(
    (a, b) =>
      (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1)
  );
  const cameraLine = [primary.exifSummary.make, primary.exifSummary.model]
    .filter(Boolean)
    .join(" ");
  const exposure = [
    primary.exifSummary.exposureTime,
    primary.exifSummary.fNumber,
    primary.exifSummary.iso,
    primary.exifSummary.focalLength,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-hidden rounded-xl border border-[#232834] bg-[#111318]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232834] bg-[#0d0f14] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileSearch className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c4ccdc]">
            Inspection
          </span>
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${status.ring} ${status.text}`}
          >
            {status.short}
          </span>
          {afterReport && (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
              re-inspected after sanitize
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#646e82]">risk</span>
            <span className={`font-mono text-xs font-semibold ${risk.text}`}>
              {primary.aiRiskScore}
            </span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[#232834]">
              <span
                className={`block h-full ${risk.bar}`}
                style={{ width: `${Math.max(4, primary.aiRiskScore)}%` }}
              />
            </span>
          </div>
          {onOpenInspector && (
            <button
              type="button"
              onClick={onOpenInspector}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-display text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/20"
            >
              Full report
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="AI findings" value={String(findings.length)} danger={findings.length > 0} />
          <Tile label="Metadata tags" value={String(primary.tags.length)} />
          <Tile label="Segments" value={String(primary.chunks.length)} />
          <Tile
            label="Container"
            value={primary.containerFormat}
            hint={formatBytes(primary.byteSize)}
          />
        </div>

        {cameraLine || exposure ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#232834] bg-[#0f1218] px-3 py-2 font-mono text-[10px] text-[#9aa3b5]">
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <Camera className="h-3 w-3" />
              {cameraLine || "unidentified body"}
            </span>
            {exposure && <span className="text-[#c4ccdc]">{exposure}</span>}
            {primary.exifSummary.gps && (
              <span className="truncate text-sky-300/80">GPS {primary.exifSummary.gps}</span>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3 py-2 text-[11px] text-red-200">
            <XCircle className="h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        ) : sorted.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-[11px] text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            No AI provenance markers found in the parsed bytes.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sorted.slice(0, 3).map((finding) => {
              const meta = SEVERITY_META[finding.severity];
              return (
                <div
                  key={finding.id}
                  className="flex items-start gap-2 rounded-lg border border-[#232834] bg-[#0f1218] px-2.5 py-1.5"
                >
                  {finding.severity === "critical" ? (
                    <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-red-400" />
                  ) : (
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-[#e2e7f1]">
                      {finding.generator}
                    </p>
                    <p className="truncate font-mono text-[10px] text-[#7c8599]">
                      {finding.location} → {finding.key}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1 py-px font-mono text-[9px] uppercase ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                </div>
              );
            })}
            {sorted.length > 3 && (
              <button
                type="button"
                onClick={onOpenInspector}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[#2a3140] py-1 font-mono text-[10px] text-[#7c8599] hover:border-amber-500/40 hover:text-amber-200"
              >
                +{sorted.length - 3} more findings
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#232834] bg-[#151821] px-2.5 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-[#646e82]">{label}</p>
      <p
        className={`truncate font-display text-sm font-semibold ${
          danger ? "text-red-300" : "text-[#f3f5f9]"
        }`}
      >
        {value}
      </p>
      {hint && <p className="font-mono text-[9px] text-[#4b5568]">{hint}</p>}
    </div>
  );
}
