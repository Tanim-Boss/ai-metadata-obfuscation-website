"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  File,
  FileImage,
  FileText,
  FileVideo,
  Files,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  formatBytesShort,
  type QueuedAsset,
  type UploadMode,
} from "./studio-types";
import { AssetThumb, MediaTypeChip, SectionLabel } from "./studio-ui";

interface StepOneUploadProps {
  uploadMode: UploadMode;
  onChangeMode: (mode: UploadMode) => void;
  queue: QueuedAsset[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
  onLoadSample: (variant: "comfyui" | "c2pa") => void;
  loadingSample: "comfyui" | "c2pa" | null;
  onContinueToInspect: () => void;
}

const COVERAGE = [
  {
    icon: ShieldAlert,
    title: "C2PA & JUMBF",
    desc: "DALL·E · Sora · Firefly · SynthID",
  },
  {
    icon: FileImage,
    title: "Diffusion chunks",
    desc: "ComfyUI · A1111 · Forge · Flux",
  },
  {
    icon: FileVideo,
    title: "Video containers",
    desc: "MP4 · MOV · mdta · udta · XMP",
  },
  {
    icon: FileText,
    title: "Document provenance",
    desc: "PDF · Office · EPUB · TXT",
  },
];

const PIPELINE = [
  {
    code: "01",
    title: "Scan",
    desc: "Read every EXIF IFD, XMP packet, C2PA manifest & container chunk.",
  },
  {
    code: "02",
    title: "Clean",
    desc: "Re-encode the pixels — zero provenance, zero hidden tags.",
  },
  {
    code: "03",
    title: "Inject",
    desc: "Write authentic camera EXIF, lens & QuickTime telemetry.",
  },
];

/**
 * Step 1 — file intake.
 *
 * Redesigned for density: the old screen stacked a two-card mode selector, a
 * 12-unit padded dropzone with three large buttons, a 3-column file grid and a
 * four-card capability strip (≈900px tall before a file was even chosen).
 * Now the mode switch lives in the panel header, the dropzone is a short row,
 * queued files are dense list rows, and the explainer cards moved into a side
 * rail so the extra width is used instead of extra height.
 */
export function StepOneUpload({
  uploadMode,
  onChangeMode,
  queue,
  onAddFiles,
  onRemoveFile,
  onClearAll,
  onLoadSample,
  loadingSample,
  onContinueToInspect,
}: StepOneUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const acceptTypes =
    "image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.epub,.odt,.ods,.odp,.ppt,.pptx,.xls,.xlsx,.csv,.md,.html,.xml,.json";

  const isBatch = uploadMode === "multiple";

  return (
    <div className="grid items-start gap-3 lg:grid-cols-12">
      {/* Hidden input switches single vs multiple cleanly */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={isBatch}
        accept={acceptTypes}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            onAddFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* ── MAIN INTAKE PANEL ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-[#232834] bg-[#111318] lg:col-span-8 xl:col-span-9">
        {/* HEADER: title + compact segmented mode switch */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#1d222d] px-3.5 py-2.5 sm:px-4">
          <div className="min-w-0">
            <SectionLabel>Step 01 · Choose file</SectionLabel>
            <h1 className="mt-0.5 truncate font-display text-sm font-bold text-[#f3f5f9] sm:text-base">
              Drop a file to scan its AI metadata
            </h1>
          </div>

          <div
            role="group"
            aria-label="Input mode"
            className="flex shrink-0 items-center rounded-lg border border-[#262c3a] bg-[#0d0f14] p-0.5"
          >
            {[
              { id: "single" as const, label: "Single", icon: File },
              { id: "multiple" as const, label: "Batch", icon: Files },
            ].map((mode) => {
              const Icon = mode.icon;
              const selected = uploadMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChangeMode(mode.id)}
                  title={
                    mode.id === "single"
                      ? "One image, video or document at a time"
                      : "Queue photos, videos and documents with ZIP export"
                  }
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-display text-[11px] font-semibold transition-colors cursor-pointer ${
                    selected
                      ? "bg-amber-500 text-[#0a0b0e] shadow-sm"
                      : "text-[#9aa3b5] hover:text-[#f3f5f9]"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* DROPZONE — short inline row instead of a tall hero block */}
        <div className="px-3 pt-3 pb-3 sm:px-4">
          <div
            role="button"
            tabIndex={0}
            aria-label={
              isBatch
                ? "Drop multiple files here or browse"
                : "Drop a file here or browse"
            }
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files?.length) {
                onAddFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`group flex cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-3 rounded-lg border border-dashed px-3.5 py-4 transition-colors ${
              isDragOver
                ? "border-amber-400 bg-amber-500/10"
                : "border-[#2b3242] bg-[#0d0f14] hover:border-amber-500/55 hover:bg-[#10131a]"
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2c3344] bg-[#171b24] text-amber-400 transition-transform group-hover:scale-105 group-hover:border-amber-500/50">
              <Upload className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-semibold text-[#f3f5f9]">
                {isBatch
                  ? "Drop files here or click to queue"
                  : "Drop a file here or click to browse"}
              </span>
              <span className="mt-0.5 block font-mono text-[10px] leading-relaxed text-[#7c8599]">
                JPG · PNG · WebP · AVIF · TIFF · MP4 · MOV · WEBM · PDF · DOCX ·
                EPUB · TXT — no size limit
              </span>
            </span>

            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 font-display text-[11px] font-semibold text-[#0a0b0e] shadow-[0_6px_18px_-8px_rgba(245,158,11,0.7)] transition-colors group-hover:bg-amber-400">
              <Upload className="h-3 w-3" />
              {isBatch ? "Select files" : "Select file"}
            </span>
          </div>

          {/* Sample loaders + privacy note, one compact row */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-[#646e82]">
              Processed in RAM · nothing written to disk
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#5c6579]">
                No file?
              </span>
              <button
                type="button"
                disabled={loadingSample !== null}
                onClick={() => onLoadSample("comfyui")}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#2b3242] bg-[#171a22] px-2.5 py-1 font-mono text-[10px] text-[#cfd6e4] transition-colors hover:border-amber-500/50 hover:text-amber-200 disabled:opacity-50 cursor-pointer"
              >
                {loadingSample === "comfyui" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                ) : (
                  <Sparkles className="h-3 w-3 text-amber-400" />
                )}
                ComfyUI + Flux
              </button>
              <button
                type="button"
                disabled={loadingSample !== null}
                onClick={() => onLoadSample("c2pa")}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#2b3242] bg-[#171a22] px-2.5 py-1 font-mono text-[10px] text-[#cfd6e4] transition-colors hover:border-red-500/50 hover:text-red-200 disabled:opacity-50 cursor-pointer"
              >
                {loadingSample === "c2pa" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-red-400" />
                ) : (
                  <ShieldAlert className="h-3 w-3 text-red-400" />
                )}
                OpenAI C2PA
              </button>
            </div>
          </div>
        </div>

        {/* STAGED FILES — dense scrollable rows + pinned action bar */}
        {queue.length > 0 && (
          <div className="border-t border-[#1d222d]">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-display text-xs font-semibold text-[#f3f5f9]">
                  {isBatch ? `${queue.length} files ready` : "File ready"}
                </span>
                <span className="hidden truncate font-mono text-[10px] text-[#7c8599] sm:inline">
                  · inspect tags before export
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {isBatch && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-md border border-[#2b3242] bg-[#171a22] px-2 py-1 font-mono text-[10px] font-medium text-[#d5dce9] transition-colors hover:border-amber-500/50 cursor-pointer"
                  >
                    <Plus className="h-3 w-3 text-amber-400" />
                    Add
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClearAll}
                  className="inline-flex items-center gap-1 rounded-md border border-[#2b3242] bg-[#171a22] px-2 py-1 font-mono text-[10px] text-[#9aa3b5] transition-colors hover:text-red-300 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>

            <ul className="queue-rail max-h-[184px] overflow-y-auto border-y border-[#1a1e28] bg-[#0e1016]">
              {queue.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2.5 border-b border-[#171b24] px-3.5 py-1.5 last:border-b-0 hover:bg-[#13161e] sm:px-4"
                >
                  <AssetThumb asset={item} size="sm" />

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-mono text-[11px] font-medium text-[#e6ebf4]">
                      {item.file.name}
                    </span>
                    <MediaTypeChip mediaType={item.mediaType} />
                  </div>

                  <span className="shrink-0 font-mono text-[10px] text-[#7c8599]">
                    {formatBytesShort(item.file.size)}
                  </span>

                  <button
                    type="button"
                    onClick={() => onRemoveFile(item.id)}
                    className="shrink-0 rounded p-1 text-[#5c6579] transition-colors hover:bg-[#1e2330] hover:text-red-300 cursor-pointer"
                    title="Remove file"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 sm:px-4">
              <span className="font-mono text-[10px] text-[#7c8599]">
                {isBatch
                  ? `${queue.length} × files → clean ZIP or camera telemetry`
                  : "Next: full tag & container inspection"}
              </span>
              <button
                type="button"
                onClick={onContinueToInspect}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-1.5 font-display text-xs font-semibold text-[#0a0b0e] shadow-[0_6px_18px_-8px_rgba(245,158,11,0.8)] transition-colors hover:bg-amber-400 cursor-pointer"
              >
                Inspect metadata
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── SIDE RAIL: pipeline + coverage (uses width, not height) ────── */}
      <aside className="space-y-3 lg:col-span-4 lg:sticky lg:top-[3.25rem] xl:col-span-3">
        <div className="overflow-hidden rounded-xl border border-[#232834] bg-[#111318]">
          <div className="flex items-center justify-between border-b border-[#1d222d] px-3 py-2">
            <SectionLabel>Pipeline</SectionLabel>
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#5c6579]">
              3 stages
            </span>
          </div>
          <ol className="divide-y divide-[#171b24]">
            {PIPELINE.map((stage) => (
              <li
                key={stage.code}
                className="flex items-start gap-2.5 px-3 py-2"
              >
                <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[#2c3344] bg-[#171b24] font-mono text-[9px] font-bold text-amber-300">
                  {stage.code}
                </span>
                <div className="min-w-0">
                  <div className="font-display text-[11px] font-semibold text-[#e6ebf4]">
                    {stage.title}
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-[#7c8599]">
                    {stage.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#232834] bg-[#111318]">
          <div className="flex items-center justify-between border-b border-[#1d222d] px-3 py-2">
            <SectionLabel>What gets scanned</SectionLabel>
            <ShieldCheck className="h-3 w-3 text-emerald-400/80" />
          </div>
          <ul className="divide-y divide-[#171b24]">
            {COVERAGE.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex items-center gap-2.5 px-3 py-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-amber-400/90" />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[10px] font-semibold text-[#cfd6e4]">
                      {item.title}
                    </div>
                    <div className="truncate text-[10px] text-[#6f7889]">
                      {item.desc}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
