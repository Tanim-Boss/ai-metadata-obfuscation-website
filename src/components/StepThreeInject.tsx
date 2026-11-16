"use client";

import { useState } from "react";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileImage,
  FileSearch,
  FileText,
  FileVideo,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  compute35mmEquivalent,
  getCameraProfile,
  getLensForProfile,
  type TelemetryOptions,
} from "@/lib/camera-profiles";
import { CameraControlDeck } from "./CameraControlDeck";
import { formatBytesShort, type QueuedAsset } from "./studio-types";

interface StepThreeInjectProps {
  queue: QueuedAsset[];
  activeAsset: QueuedAsset;
  options: TelemetryOptions;
  onChangeOptions: (next: TelemetryOptions) => void;
  onSelectAsset: (id: string) => void;
  onBackToInspect: () => void;
  onInjectAndDownloadActive: (asset: QueuedAsset) => void;
  onInjectAndDownloadAll: () => void;
  onDownloadInjectedBlob: (asset: QueuedAsset) => void;
  onDownloadAllInjectedZip: () => void;
  onOpenFullModal: (asset: QueuedAsset) => void;
}

export function StepThreeInject({
  queue,
  activeAsset,
  options,
  onChangeOptions,
  onSelectAsset,
  onBackToInspect,
  onInjectAndDownloadActive,
  onInjectAndDownloadAll,
  onDownloadInjectedBlob,
  onDownloadAllInjectedZip,
  onOpenFullModal,
}: StepThreeInjectProps) {
  const [previewMode, setPreviewMode] = useState<"after" | "before">("after");

  const profile = getCameraProfile(options.profileId);
  const lens = getLensForProfile(profile, options.lensId);
  const hudFocal = options.focalLengthMm ?? lens.defaultFocalMm;
  const hudEquiv = compute35mmEquivalent(hudFocal, profile);
  const hudAperture = options.fNumber ?? lens.defaultFNumber;
  const hudShutter = options.shutterSpeed || "1/250";
  const hudIso = options.iso ?? profile.baseIso;

  const anyInjecting = queue.some((q) => q.isInjecting);
  const injectedCount = queue.filter((q) => Boolean(q.injectedUrl)).length;

  const showingInjected =
    Boolean(activeAsset.injectedUrl) && previewMode === "after";
  const stageUrl = showingInjected
    ? activeAsset.injectedUrl
    : activeAsset.previewUrl;

  const docMeta = options.documentMetadata ?? {};
  const updateDocMeta = (
    field: keyof NonNullable<TelemetryOptions["documentMetadata"]>,
    value: string
  ) => {
    onChangeOptions({
      ...options,
      documentMetadata: {
        ...docMeta,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* TOP BAR + QUEUE STRIP */}
      <div className="rounded-2xl border border-[#232834] bg-[#111318] p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToInspect}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-3 py-1.5 text-xs font-medium text-[#d5dce9] hover:border-amber-500/50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Inspect
            </button>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-400">
                Step 03 · Inject Metadata &amp; Download
              </span>
              <h2 className="font-display text-sm sm:text-base font-bold text-[#f3f5f9]">
                Configure target telemetry, sanitize AI signatures, and export
              </h2>
            </div>
          </div>

          {injectedCount > 1 && (
            <button
              type="button"
              onClick={onDownloadAllInjectedZip}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 transition-colors cursor-pointer"
            >
              <Archive className="h-3.5 w-3.5" />
              Download Batch ZIP ({injectedCount})
            </button>
          )}
        </div>

        {/* Multi-file switcher */}
        {queue.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pt-2 border-t border-[#1e2330] pb-1">
            {queue.map((item) => {
              const selected = item.id === activeAsset.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectAsset(item.id)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 min-w-[205px] max-w-[245px] text-left shrink-0 transition-all cursor-pointer ${
                    selected
                      ? "border-amber-500/75 bg-amber-500/10"
                      : "border-[#232834] bg-[#151821] hover:border-[#343c4e]"
                  }`}
                >
                  <div className="h-9 w-9 rounded-lg overflow-hidden bg-[#0b0d12] border border-[#252a37] flex items-center justify-center shrink-0">
                    {item.mediaType === "image" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.injectedUrl || item.previewUrl}
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
                      {item.injectedFilename || item.file.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px]">
                      {item.isInjecting ? (
                        <span className="text-amber-300 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Injecting…
                        </span>
                      ) : item.injectedReport ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Ready to Download
                        </span>
                      ) : (
                        <span className="text-[#7c8599]">
                          Pending · {formatBytesShort(item.file.size)}
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

      {/* 2-COLUMN WORKBENCH: LEFT = TELEMETRY CONTROLS, RIGHT = VIEWFINDER & DOWNLOAD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: METADATA CONFIGURATION */}
        <div className="lg:col-span-7 space-y-4">
          {activeAsset.mediaType === "document" ? (
            <div className="rounded-2xl border border-[#232834] bg-[#111318] p-5 space-y-4">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-400">
                  Document Metadata Properties
                </span>
                <h3 className="font-display text-base font-bold text-[#f3f5f9] mt-0.5">
                  Purge Author &amp; Provenance + Optional Custom PDF Fields
                </h3>
                <p className="mt-1 text-xs text-[#9aa3b5]">
                  Original Author, Producer, XMP streams, and timestamps are
                  always wiped. For PDF files, any fields you fill below will be
                  written as clean replacement properties (leave blank to keep
                  them empty).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#9aa3b5] mb-1">
                    Document Title
                  </label>
                  <input
                    type="text"
                    value={docMeta.title || ""}
                    onChange={(e) => updateDocMeta("title", e.target.value)}
                    placeholder="Leave blank to strip"
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-3 py-2 text-xs text-[#f3f5f9] placeholder:text-[#555e70] focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#9aa3b5] mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    value={docMeta.author || ""}
                    onChange={(e) => updateDocMeta("author", e.target.value)}
                    placeholder="Leave blank to strip"
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-3 py-2 text-xs text-[#f3f5f9] placeholder:text-[#555e70] focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#9aa3b5] mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={docMeta.subject || ""}
                    onChange={(e) => updateDocMeta("subject", e.target.value)}
                    placeholder="Leave blank to strip"
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-3 py-2 text-xs text-[#f3f5f9] placeholder:text-[#555e70] focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#9aa3b5] mb-1">
                    Creator Application
                  </label>
                  <input
                    type="text"
                    value={docMeta.creator || ""}
                    onChange={(e) => updateDocMeta("creator", e.target.value)}
                    placeholder="Leave blank to strip"
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-3 py-2 text-xs text-[#f3f5f9] placeholder:text-[#555e70] focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#9aa3b5] mb-1">
                    Keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={docMeta.keywords || ""}
                    onChange={(e) => updateDocMeta("keywords", e.target.value)}
                    placeholder="e.g. report, 2026 (or leave blank to strip)"
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-3 py-2 text-xs text-[#f3f5f9] placeholder:text-[#555e70] focus:border-amber-500/60 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            <CameraControlDeck
              options={options}
              onChange={onChangeOptions}
              isProcessing={anyInjecting}
              hasActiveFile={true}
              activeMediaType={activeAsset.mediaType}
              queueCount={queue.length}
              unprocessedCount={queue.length - injectedCount}
              hideActions
            />
          )}
        </div>

        {/* RIGHT: STICKY VIEWFINDER + INJECT & DOWNLOAD PANEL */}
        <aside className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
          {/* Viewfinder Stage */}
          <div className="rounded-2xl border border-[#232834] bg-[#0d0f14] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1d222d] bg-[#111318] px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {activeAsset.mediaType === "image" ? (
                  <FileImage className="h-4 w-4 text-amber-400 shrink-0" />
                ) : activeAsset.mediaType === "video" ? (
                  <FileVideo className="h-4 w-4 text-amber-400 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <span className="truncate font-mono text-xs font-medium text-[#f3f5f9]">
                  {showingInjected && activeAsset.injectedFilename
                    ? activeAsset.injectedFilename
                    : activeAsset.file.name}
                </span>
              </div>

              {activeAsset.injectedUrl && (
                <div className="inline-flex rounded-lg border border-[#262c3a] bg-[#0b0d12] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("before")}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium cursor-pointer ${
                      previewMode === "before"
                        ? "bg-zinc-800 text-white"
                        : "text-[#8e97aa]"
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    Source
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("after")}
                    className={`rounded px-2 py-0.5 font-medium cursor-pointer ${
                      previewMode === "after"
                        ? "bg-amber-500/25 text-amber-200"
                        : "text-[#8e97aa]"
                    }`}
                  >
                    Injected
                  </button>
                </div>
              )}
            </div>

            <div className="relative flex min-h-[220px] max-h-[300px] items-center justify-center bg-[#08090c] p-4">
              <div className="pointer-events-none absolute top-3 left-3 h-3.5 w-3.5 border-t border-l border-amber-400/35" />
              <div className="pointer-events-none absolute top-3 right-3 h-3.5 w-3.5 border-t border-r border-amber-400/35" />
              <div className="pointer-events-none absolute bottom-3 left-3 h-3.5 w-3.5 border-b border-l border-amber-400/35" />
              <div className="pointer-events-none absolute bottom-3 right-3 h-3.5 w-3.5 border-b border-r border-amber-400/35" />

              {activeAsset.mediaType === "image" && stageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={stageUrl}
                  alt={activeAsset.file.name}
                  className="max-h-[260px] w-auto rounded object-contain shadow-xl"
                />
              ) : activeAsset.mediaType === "video" && stageUrl ? (
                <video
                  key={stageUrl}
                  src={stageUrl}
                  controls
                  muted
                  className="max-h-[260px] w-auto rounded object-contain shadow-xl"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2c3344] bg-[#171b24] text-amber-400">
                    <FileText className="h-8 w-8" />
                  </div>
                  <span className="font-mono text-xs text-[#9aa3b5]">
                    {activeAsset.beforeReport?.containerFormat || "Document"} ·{" "}
                    {formatBytesShort(activeAsset.file.size)}
                  </span>
                </div>
              )}

              {activeAsset.isInjecting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#08090c]/85 backdrop-blur-xs">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-400 mb-2" />
                  <p className="font-display text-xs font-semibold text-[#f3f5f9]">
                    Stripping AI Metadata &amp; Injecting Telemetry…
                  </p>
                </div>
              )}
            </div>

            {/* OLED HUD Strip */}
            <div className="border-t border-[#1d222d] bg-[#0e1016] px-4 py-2.5 font-mono text-[11px] space-y-1">
              {activeAsset.mediaType === "document" ? (
                <div className="flex items-center justify-between text-[#9aa3b5]">
                  <span>Target: Scrub + Custom PDF Info</span>
                  <span className="text-amber-300">
                    {activeAsset.beforeReport?.containerFormat || "DOC"}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#f3f5f9]">
                      {profile.make} · {profile.model}
                    </span>
                    <span className="text-amber-300">
                      GPS:{" "}
                      {options.gpsMode && options.gpsMode !== "none"
                        ? "Embedded"
                        : "Stripped"}
                    </span>
                  </div>
                  {activeAsset.mediaType === "image" && (
                    <div className="flex flex-wrap items-center gap-2 text-amber-300/90">
                      <span>{hudShutter}s</span>
                      <span className="text-[#3a4254]">·</span>
                      <span>f/{hudAperture}</span>
                      <span className="text-[#3a4254]">·</span>
                      <span>ISO {hudIso}</span>
                      <span className="text-[#3a4254]">·</span>
                      <span>
                        {hudFocal}mm ({hudEquiv}mm)
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* INJECT & DOWNLOAD ACTION CARD */}
          <div className="rounded-2xl border border-[#232834] bg-[#111318] p-4 space-y-3">
            {activeAsset.error && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
                {activeAsset.error}
              </div>
            )}

            {queue.length > 1 ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={anyInjecting}
                  onClick={onInjectAndDownloadAll}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 px-4 font-display text-sm font-semibold text-[#0a0b0e] shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)] hover:bg-amber-400 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {anyInjecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {anyInjecting
                    ? "Injecting Metadata Batch…"
                    : `Inject Metadata & Download All (${queue.length} ZIP)`}
                </button>
                <button
                  type="button"
                  disabled={anyInjecting}
                  onClick={() => onInjectAndDownloadActive(activeAsset)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/45 bg-amber-500/10 py-2.5 px-4 font-display text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Inject &amp; Download Current File Only
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={activeAsset.isInjecting}
                onClick={() => onInjectAndDownloadActive(activeAsset)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 px-4 font-display text-sm font-semibold text-[#0a0b0e] shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)] hover:bg-amber-400 disabled:opacity-50 transition-all cursor-pointer"
              >
                {activeAsset.isInjecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {activeAsset.isInjecting
                  ? "Injecting Metadata…"
                  : "Inject Metadata & Download"}
              </button>
            )}

            {/* POST-INJECTION VERIFICATION & RE-DOWNLOAD */}
            {activeAsset.injectedReport && activeAsset.injectedUrl && (
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-display text-xs font-semibold text-emerald-200">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Output Verified &amp; Ready
                  </span>
                  <span className="font-mono text-[10px] text-emerald-300">
                    AI Risk {activeAsset.beforeReport?.aiRiskScore ?? "—"} →{" "}
                    {activeAsset.injectedReport.aiRiskScore}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                  <div className="rounded-lg border border-emerald-500/20 bg-[#0c1410] px-2.5 py-1.5">
                    <span className="text-emerald-300/70 block">
                      OUTPUT TAGS
                    </span>
                    <span className="font-semibold text-emerald-100">
                      {activeAsset.injectedReport.tags.length} tags
                    </span>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-[#0c1410] px-2.5 py-1.5">
                    <span className="text-emerald-300/70 block">SIZE</span>
                    <span className="font-semibold text-emerald-100">
                      {formatBytesShort(activeAsset.injectedReport.byteSize)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onDownloadInjectedBlob(activeAsset)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 py-2 px-3 font-display text-xs font-semibold text-[#06130c] hover:bg-emerald-400 transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download {activeAsset.injectedFilename}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFullModal(activeAsset)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 py-1.5 px-3 font-display text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                  >
                    <FileSearch className="h-3.5 w-3.5" />
                    Inspect Original vs Injected Diff
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
