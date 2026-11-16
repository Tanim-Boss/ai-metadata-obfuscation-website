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

  return (
    <div className="space-y-6">
      {/* Hidden input switches single vs multiple cleanly */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={uploadMode === "multiple"}
        accept={acceptTypes}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            onAddFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* MODE SELECTOR: SINGLE FILE VS MULTIPLE FILES */}
      <div className="rounded-2xl border border-[#232834] bg-[#111318] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-400">
              Step 01 · Input Mode
            </span>
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#f3f5f9] mt-0.5">
              Choose how you want to load files
            </h1>
          </div>
          <span className="font-mono text-[11px] text-[#7c8599]">
            Zero-Retention · RAM only
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChangeMode("single")}
            className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all cursor-pointer ${
              uploadMode === "single"
                ? "border-amber-500/75 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]"
                : "border-[#232834] bg-[#151821] hover:border-[#343c4e]"
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                uploadMode === "single"
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                  : "border-[#2c3344] bg-[#171b24] text-[#9aa3b5]"
              }`}
            >
              <File className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-semibold text-[#f3f5f9]">
                  Single File
                </span>
                {uploadMode === "single" && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                    SELECTED
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[#9aa3b5] leading-relaxed">
                Pick one image, video, or document and jump straight into
                detailed metadata inspection.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChangeMode("multiple")}
            className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all cursor-pointer ${
              uploadMode === "multiple"
                ? "border-amber-500/75 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]"
                : "border-[#232834] bg-[#151821] hover:border-[#343c4e]"
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                uploadMode === "multiple"
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                  : "border-[#2c3344] bg-[#171b24] text-[#9aa3b5]"
              }`}
            >
              <Files className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-semibold text-[#f3f5f9]">
                  Multiple Files
                </span>
                {uploadMode === "multiple" && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                    SELECTED
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[#9aa3b5] leading-relaxed">
                Build a batch queue of photos, videos, or documents for
                side-by-side inspection and ZIP export.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* DROPZONE AREA */}
      <div
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
        className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all ${
          isDragOver
            ? "border-amber-400 bg-amber-500/10"
            : "border-[#282e3d] bg-[#111318] hover:border-amber-500/50 hover:bg-[#14171f]"
        }`}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2c3344] bg-[#171b24] text-amber-400 group-hover:scale-105 group-hover:border-amber-500/50 transition-all">
          <Upload className="h-6 w-6" />
        </div>

        <h2 className="font-display text-xl sm:text-2xl font-bold text-[#f3f5f9]">
          {uploadMode === "single"
            ? "Drop a single file here or click to browse"
            : "Drop multiple files here or click to queue"}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[#9aa3b5]">
          Supports images (JPG, PNG, WebP, AVIF), videos (MP4, MOV), and
          documents (PDF, DOCX, EPUB, TXT). No file size limits.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-display text-xs font-semibold text-[#0a0b0e] shadow-md">
            <Upload className="h-4 w-4" />
            {uploadMode === "single" ? "Select Single File" : "Select Multiple Files"}
          </span>

          <button
            type="button"
            disabled={loadingSample !== null}
            onClick={(e) => {
              e.stopPropagation();
              onLoadSample("comfyui");
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[#2f3646] bg-[#181c26] px-4 py-2.5 text-xs font-medium text-[#e2e7f1] hover:border-amber-500/50 transition-colors cursor-pointer"
          >
            {loadingSample === "comfyui" ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="h-4 w-4 text-amber-400" />
            )}
            Try ComfyUI + Flux Sample
          </button>

          <button
            type="button"
            disabled={loadingSample !== null}
            onClick={(e) => {
              e.stopPropagation();
              onLoadSample("c2pa");
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[#2f3646] bg-[#181c26] px-4 py-2.5 text-xs font-medium text-[#e2e7f1] hover:border-amber-500/50 transition-colors cursor-pointer"
          >
            {loadingSample === "c2pa" ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-red-400" />
            )}
            Try OpenAI C2PA Sample
          </button>
        </div>
      </div>

      {/* STAGED FILES LIST (shown when files are queued in Step 1) */}
      {queue.length > 0 && (
        <div className="rounded-2xl border border-[#232834] bg-[#111318] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#f3f5f9]">
                {uploadMode === "single"
                  ? "Selected File Ready"
                  : `Queued Files (${queue.length})`}
              </h3>
              <p className="text-xs text-[#7c8599]">
                Proceed to Step 2 to inspect all embedded metadata tags, AI
                signatures, and container chunks.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {uploadMode === "multiple" && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-3 py-1.5 text-xs font-medium text-[#d5dce9] hover:border-amber-500/50 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-amber-400" />
                  Add More
                </button>
              )}
              <button
                type="button"
                onClick={onClearAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2b3242] bg-[#171a22] px-3 py-1.5 text-xs text-[#9aa3b5] hover:text-red-300 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-[#232834] bg-[#151821] p-2.5"
              >
                <div className="h-11 w-11 rounded-lg overflow-hidden bg-[#0b0d12] border border-[#252a37] flex items-center justify-center shrink-0">
                  {item.mediaType === "image" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-full w-full object-cover"
                    />
                  ) : item.mediaType === "video" ? (
                    <FileVideo className="h-5 w-5 text-amber-400" />
                  ) : (
                    <FileText className="h-5 w-5 text-amber-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs font-medium text-[#f3f5f9]">
                    {item.file.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-[#7c8599]">
                    <span className="uppercase text-amber-300/85">
                      {item.mediaType}
                    </span>
                    <span>·</span>
                    <span>{formatBytesShort(item.file.size)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveFile(item.id)}
                  className="rounded-lg p-1.5 text-[#646e82] hover:bg-[#1e2330] hover:text-red-300 transition-colors cursor-pointer"
                  title="Remove file"
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2 border-t border-[#1e2330]">
            <button
              type="button"
              onClick={onContinueToInspect}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-display text-sm font-semibold text-[#0a0b0e] shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)] hover:bg-amber-400 transition-all cursor-pointer"
            >
              Continue to Step 2: Inspect Metadata
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* SUPPORTED SIGNATURES STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            icon: ShieldAlert,
            title: "C2PA & JUMBF",
            desc: "Detects OpenAI DALL·E, Sora, Firefly & SynthID provenance boxes",
          },
          {
            icon: FileImage,
            title: "Diffusion Chunks",
            desc: "Reads ComfyUI workflows, A1111, Forge & Flux tEXt/zTXt chunks",
          },
          {
            icon: FileVideo,
            title: "QuickTime & MP4",
            desc: "Inspects mdta, udta, XMP & handler boxes in MP4/MOV containers",
          },
          {
            icon: FileText,
            title: "Document Provenance",
            desc: "Parses PDF Info/XMP, Office docProps & EPUB creator properties",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-xl border border-[#202532] bg-[#0e1016] p-3.5"
            >
              <div className="flex items-center gap-2 font-mono text-xs font-semibold text-amber-300">
                <Icon className="h-3.5 w-3.5" />
                {card.title}
              </div>
              <p className="mt-1.5 text-[11px] text-[#7c8599] leading-relaxed">
                {card.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
