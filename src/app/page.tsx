"use client";

import { useState, useCallback, useRef } from "react";
import JSZip from "jszip";
import {
  Upload,
  Download,
  Archive,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  FileImage,
  FileVideo,
  CheckCircle2,
  Loader2,
  Plus,
  Lock,
  Eye,
} from "lucide-react";
import {
  CAMERA_PROFILES,
  compute35mmEquivalent,
  getCameraProfile,
  getLensForProfile,
  type TelemetryOptions,
} from "@/lib/camera-profiles";
import type { ForensicReport } from "@/lib/metadata-inspector";
import { ForensicInspector } from "@/components/ForensicInspector";
import { CameraControlDeck } from "@/components/CameraControlDeck";

interface QueuedAsset {
  id: string;
  file: File;
  mediaType: "image" | "video";
  previewUrl: string;
  isInspecting: boolean;
  isProcessing: boolean;
  beforeReport: ForensicReport | null;
  afterReport: ForensicReport | null;
  processedBlob: Blob | null;
  processedUrl: string | null;
  processedFilename: string | null;
  error: string | null;
}

function detectMediaType(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const lower = file.name.toLowerCase();
  if (/\.(jpg|jpeg|png|webp|avif|tiff|tif)$/i.test(lower)) return "image";
  if (/\.(mp4|mov|m4v)$/i.test(lower)) return "video";
  return null;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function HomePage() {
  const defaultProfile = CAMERA_PROFILES[0];
  const defaultLens = defaultProfile.lenses[0];

  const [options, setOptions] = useState<TelemetryOptions>({
    profileId: defaultProfile.id,
    lensId: defaultLens.id,
    focalLengthMm: defaultLens.defaultFocalMm,
    fNumber: defaultLens.defaultFNumber,
    shutterSpeed: "1/250",
    iso: defaultProfile.baseIso,
    exposureBiasEv: 0,
    exposureProgram: 3,
    meteringMode: 5,
    whiteBalance: 0,
    flash: 16,
    timezoneOffset: "+00:00",
    includeSerialNumbers: true,
    gpsMode: "none",
    outputFormat: "jpeg",
    jpegQuality: 96,
    renameToCameraConvention: true,
    addSensorGrain: false,
  });

  const [queue, setQueue] = useState<QueuedAsset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadingSample, setLoadingSample] = useState<"comfyui" | "c2pa" | null>(
    null
  );
  const [previewStageMode, setPreviewStageMode] = useState<"after" | "before">(
    "after"
  );
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeAsset = queue.find((item) => item.id === activeId) ?? queue[0] ?? null;

  const inspectQueuedFile = useCallback(async (assetId: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/inspect", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to inspect metadata");
      }
      setQueue((prev) =>
        prev.map((item) =>
          item.id === assetId
            ? { ...item, isInspecting: false, beforeReport: data.report }
            : item
        )
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to inspect file.";
      setQueue((prev) =>
        prev.map((item) =>
          item.id === assetId
            ? { ...item, isInspecting: false, error: msg }
            : item
        )
      );
    }
  }, []);

  const addFilesToQueue = useCallback(
    (fileList: FileList | File[]) => {
      setGlobalError(null);
      const incoming = Array.from(fileList);
      const validAssets: QueuedAsset[] = [];

      for (const f of incoming) {
        const mediaType = detectMediaType(f);
        if (!mediaType) {
          setGlobalError(
            `Skipped "${f.name}" — supported formats: JPG, PNG, WebP, AVIF, MP4, MOV.`
          );
          continue;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        validAssets.push({
          id,
          file: f,
          mediaType,
          previewUrl: URL.createObjectURL(f),
          isInspecting: true,
          isProcessing: false,
          beforeReport: null,
          afterReport: null,
          processedBlob: null,
          processedUrl: null,
          processedFilename: null,
          error: null,
        });
      }

      if (validAssets.length === 0) return;

      setQueue((prev) => [...prev, ...validAssets]);
      setActiveId((prev) => prev ?? validAssets[0].id);
      setPreviewStageMode("after");

      for (const asset of validAssets) {
        void inspectQueuedFile(asset.id, asset.file);
      }
    },
    [inspectQueuedFile]
  );

  const handleLoadSample = async (variant: "comfyui" | "c2pa") => {
    setLoadingSample(variant);
    setGlobalError(null);
    try {
      const res = await fetch(`/api/sample?mode=json&variant=${variant}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not generate sample asset");
      }

      const blob = base64ToBlob(data.dataBase64, data.mimeType);
      const sampleFile = new File([blob], data.filename, {
        type: data.mimeType,
      });
      const id = `sample-${Date.now()}`;
      const newAsset: QueuedAsset = {
        id,
        file: sampleFile,
        mediaType: "image",
        previewUrl: URL.createObjectURL(blob),
        isInspecting: false,
        isProcessing: false,
        beforeReport: data.report,
        afterReport: null,
        processedBlob: null,
        processedUrl: null,
        processedFilename: null,
        error: null,
      };

      setQueue((prev) => [newAsset, ...prev]);
      setActiveId(id);
      setPreviewStageMode("after");
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Failed to load sample AI file."
      );
    } finally {
      setLoadingSample(null);
    }
  };

  const processSingleAsset = useCallback(
    async (asset: QueuedAsset, currentOptions: TelemetryOptions) => {
      setQueue((prev) =>
        prev.map((item) =>
          item.id === asset.id
            ? { ...item, isProcessing: true, error: null }
            : item
        )
      );

      try {
        const endpoint =
          asset.mediaType === "video"
            ? "/api/process/video"
            : "/api/process/image";

        const formData = new FormData();
        formData.append("file", asset.file);
        formData.append("profile", currentOptions.profileId);
        formData.append("options", JSON.stringify(currentOptions));
        formData.append("responseMode", "json");

        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Processing failed");
        }

        const outBlob = base64ToBlob(data.dataBase64, data.mimeType);
        const outUrl = URL.createObjectURL(outBlob);

        setQueue((prev) =>
          prev.map((item) => {
            if (item.id !== asset.id) return item;
            if (item.processedUrl) URL.revokeObjectURL(item.processedUrl);
            return {
              ...item,
              isProcessing: false,
              beforeReport: data.beforeReport || item.beforeReport,
              afterReport: data.afterReport,
              processedBlob: outBlob,
              processedUrl: outUrl,
              processedFilename: data.filename,
              error: null,
            };
          })
        );
        setPreviewStageMode("after");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to sanitize file.";
        setQueue((prev) =>
          prev.map((item) =>
            item.id === asset.id
              ? { ...item, isProcessing: false, error: msg }
              : item
          )
        );
      }
    },
    []
  );

  const handleProcessActive = () => {
    if (!activeAsset) return;
    void processSingleAsset(activeAsset, options);
  };

  const handleProcessAll = async () => {
    for (const item of queue) {
      await processSingleAsset(item, options);
    }
  };

  const handleDownloadAsset = (asset: QueuedAsset) => {
    if (!asset.processedUrl || !asset.processedFilename) return;
    const link = document.createElement("a");
    link.href = asset.processedUrl;
    link.download = asset.processedFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadBatchZip = async () => {
    const completed = queue.filter(
      (q) => q.processedBlob && q.processedFilename
    );
    if (completed.length === 0) return;

    const zip = new JSZip();
    const usedNames = new Set<string>();

    for (const item of completed) {
      let name = item.processedFilename!;
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf(".");
        name =
          dot > 0
            ? `${name.slice(0, dot)}_${usedNames.size}${name.slice(dot)}`
            : `${name}_${usedNames.size}`;
      }
      usedNames.add(name);
      zip.file(name, item.processedBlob!);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `DCIM_Camera_Batch_${completed.length}_Files.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleRemoveAsset = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.processedUrl) URL.revokeObjectURL(target.processedUrl);
      }
      const next = prev.filter((i) => i.id !== id);
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleClearAll = () => {
    for (const item of queue) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.processedUrl) URL.revokeObjectURL(item.processedUrl);
    }
    setQueue([]);
    setActiveId(null);
    setGlobalError(null);
  };

  // Telemetry readout for Viewfinder HUD
  const selectedProfile = getCameraProfile(options.profileId);
  const selectedLens = getLensForProfile(selectedProfile, options.lensId);
  const hudFocal = options.focalLengthMm ?? selectedLens.defaultFocalMm;
  const hudEquiv = compute35mmEquivalent(hudFocal, selectedProfile);
  const hudAperture = options.fNumber ?? selectedLens.defaultFNumber;
  const hudShutter = options.shutterSpeed || "1/250";
  const hudIso = options.iso ?? selectedProfile.baseIso;

  const processedCount = queue.filter((q) => Boolean(q.processedUrl)).length;
  const unprocessedCount = queue.length - processedCount;
  const anyProcessing = queue.some((q) => q.isProcessing);

  const showingProcessed =
    Boolean(activeAsset?.processedUrl) && previewStageMode === "after";
  const stageMediaUrl = showingProcessed
    ? activeAsset?.processedUrl
    : activeAsset?.previewUrl;

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0b0e] text-[#f3f5f9]">
      {/* TOP INSTRUMENT BAR */}
      <header className="sticky top-0 z-30 border-b border-[#1f2430] bg-[#0a0b0e]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10 font-mono text-xs font-bold text-amber-400">
              f/
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-bold tracking-tight text-[#f3f5f9]">
                  EXIF<span className="text-amber-400">{"//"}</span>FORGE
                </span>
                <span className="hidden sm:inline-block rounded border border-[#262c3a] bg-[#14171f] px-2 py-0.5 font-mono text-[10px] text-[#9aa3b5]">
                  OPTICAL TELEMETRY BENCH
                </span>
              </div>
              <p className="text-[11px] text-[#7c8599]">
                Strip C2PA, JUMBF, XMP &amp; diffusion signatures · Inject
                authentic camera EXIF
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleLoadSample("comfyui")}
              disabled={loadingSample !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#282e3d] bg-[#14171f] px-3 py-1.5 text-xs font-medium text-[#d0d7e6] hover:border-amber-500/50 hover:text-amber-200 transition-colors cursor-pointer"
            >
              {loadingSample === "comfyui" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              )}
              Try ComfyUI + Flux Sample
            </button>

            <button
              type="button"
              onClick={() => handleLoadSample("c2pa")}
              disabled={loadingSample !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#282e3d] bg-[#14171f] px-3 py-1.5 text-xs font-medium text-[#d0d7e6] hover:border-amber-500/50 hover:text-amber-200 transition-colors cursor-pointer"
            >
              {loadingSample === "c2pa" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
              )}
              Try OpenAI C2PA Sample
            </button>

            <div className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300">
              <Lock className="h-3 w-3" />
              Zero-Retention RAM
            </div>
          </div>
        </div>
      </header>

      {/* MAIN STUDIO WORKBENCH */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.avif,.mp4,.mov"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              addFilesToQueue(e.target.files);
              e.target.value = "";
            }
          }}
        />

        {globalError && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              className="font-mono text-red-300 hover:text-white ml-4"
            >
              DISMISS
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT STAGE: UPLOAD / QUEUE + VIEWFINDER + FORENSIC INSPECTOR */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-5">
            {queue.length === 0 ? (
              /* INITIAL FULL-STAGE DROPZONE */
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
                    addFilesToQueue(e.dataTransfer.files);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center transition-all ${
                  isDragOver
                    ? "border-amber-400 bg-amber-500/10"
                    : "border-[#282e3d] bg-[#111318] hover:border-amber-500/50 hover:bg-[#14171f]"
                }`}
              >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2c3344] bg-[#171b24] text-amber-400 group-hover:scale-105 group-hover:border-amber-500/50 transition-all">
                  <Upload className="h-7 w-7" />
                </div>

                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#f3f5f9]">
                  Drop AI Images or Videos for Deep Sanitization
                </h1>
                <p className="mx-auto mt-2.5 max-w-xl text-sm text-[#9aa3b5]">
                  Decodes images down to raw uncompressed RGB pixels to destroy
                  C2PA manifests, ComfyUI node graphs, Stable Diffusion prompts
                  &amp; XMP tags—then injects hardware-accurate camera EXIF.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-display text-xs font-semibold text-[#0a0b0e] shadow-md">
                    <Upload className="h-4 w-4" />
                    Select Photos or Videos
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleLoadSample("comfyui");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#2f3646] bg-[#181c26] px-4 py-2.5 text-xs font-medium text-[#e2e7f1] hover:border-amber-500/50 transition-colors"
                  >
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    Load Live AI Sample Image
                  </button>
                </div>

                {/* Supported Signatures Strip */}
                <div className="mt-10 pt-6 border-t border-[#1e2330] grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                  {[
                    {
                      title: "C2PA & JUMBF",
                      desc: "OpenAI DALL·E, GPT-4o, Sora, Firefly & SynthID",
                    },
                    {
                      title: "Diffusion Chunks",
                      desc: "ComfyUI workflows, A1111, Forge & Flux tEXt/zTXt",
                    },
                    {
                      title: "XMP & IPTC",
                      desc: "Purges trainedAlgorithmicMedia & CreatorTool URIs",
                    },
                    {
                      title: "35+ Optical Tags",
                      desc: "APEX shutter/aperture, LensSpec, RTC sub-sec & GPS",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="rounded-lg border border-[#202532] bg-[#0d0f14] p-3"
                    >
                      <div className="font-mono text-xs font-semibold text-amber-300">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[11px] text-[#7c8599] leading-relaxed">
                        {item.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* ACTIVE ASSET QUEUE + OPTICAL VIEWFINDER */
              <>
                {/* Queue Strip */}
                <div className="rounded-xl border border-[#232834] bg-[#111318] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#9aa3b5]">
                      <span>Asset Queue ({queue.length})</span>
                      {processedCount > 0 && (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                          {processedCount} sanitized
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {processedCount > 1 && (
                        <button
                          type="button"
                          onClick={handleDownloadBatchZip}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Download ZIP ({processedCount})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#2b3242] bg-[#171a22] px-2.5 py-1 text-xs font-medium text-[#d5dce9] hover:border-amber-500/50 transition-colors cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 text-amber-400" />
                        Add Files
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#2b3242] bg-[#171a22] px-2.5 py-1 text-xs text-[#9aa3b5] hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {queue.map((item) => {
                      const isSelected = activeAsset?.id === item.id;
                      const aiDetected =
                        item.beforeReport &&
                        item.beforeReport.aiFindings.some(
                          (f) =>
                            f.severity === "critical" ||
                            f.severity === "warning"
                        );
                      return (
                        <div
                          key={item.id}
                          onClick={() => setActiveId(item.id)}
                          className={`group relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 min-w-[205px] max-w-[240px] cursor-pointer transition-all shrink-0 ${
                            isSelected
                              ? "border-amber-500/70 bg-amber-500/10"
                              : "border-[#232834] bg-[#161920] hover:border-[#343c4e]"
                          }`}
                        >
                          <div className="h-10 w-10 rounded overflow-hidden bg-[#0b0d12] flex items-center justify-center shrink-0 border border-[#252a37]">
                            {item.mediaType === "image" ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={item.processedUrl || item.previewUrl}
                                alt={item.file.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <FileVideo className="h-5 w-5 text-amber-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-[#f3f5f9]">
                              {item.processedFilename || item.file.name}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px]">
                              {item.isProcessing ? (
                                <span className="text-amber-300 flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Processing…
                                </span>
                              ) : item.afterReport ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Camera Verified
                                </span>
                              ) : aiDetected ? (
                                <span className="text-red-400 flex items-center gap-1">
                                  <ShieldAlert className="h-3 w-3" />
                                  {item.beforeReport?.aiFindings.length} AI Flags
                                </span>
                              ) : (
                                <span className="text-[#7c8599]">
                                  {formatBytes(item.file.size)}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAsset(item.id);
                            }}
                            className="opacity-60 hover:opacity-100 text-[#7c8599] hover:text-red-400 p-1"
                            title="Remove file"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* CAMERA VIEWFINDER STAGE */}
                {activeAsset && (
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
                        addFilesToQueue(e.dataTransfer.files);
                      }
                    }}
                    className={`rounded-xl border overflow-hidden bg-[#0d0f14] transition-colors ${
                      isDragOver ? "border-amber-400" : "border-[#232834]"
                    }`}
                  >
                    {/* Viewfinder Top Bezel */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1d222d] bg-[#111318] px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {activeAsset.mediaType === "image" ? (
                          <FileImage className="h-4 w-4 text-amber-400 shrink-0" />
                        ) : (
                          <FileVideo className="h-4 w-4 text-amber-400 shrink-0" />
                        )}
                        <span className="font-mono text-xs font-medium text-[#f3f5f9] truncate">
                          {showingProcessed && activeAsset.processedFilename
                            ? activeAsset.processedFilename
                            : activeAsset.file.name}
                        </span>
                        {activeAsset.afterReport ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                            <ShieldCheck className="h-3 w-3" />
                            CLEANED &amp; TAGGED
                          </span>
                        ) : (
                          activeAsset.beforeReport?.authenticityStatus ===
                            "ai-detected" && (
                            <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-red-300">
                              <ShieldAlert className="h-3 w-3" />
                              AI PROVENANCE PRESENT
                            </span>
                          )
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {activeAsset.processedUrl && (
                          <div className="inline-flex rounded-lg border border-[#262c3a] bg-[#0b0d12] p-0.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setPreviewStageMode("before")}
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
                                previewStageMode === "before"
                                  ? "bg-zinc-800 text-white"
                                  : "text-[#8e97aa]"
                              }`}
                            >
                              <Eye className="h-3 w-3" />
                              Source
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewStageMode("after")}
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
                                previewStageMode === "after"
                                  ? "bg-amber-500/25 text-amber-200"
                                  : "text-[#8e97aa]"
                              }`}
                            >
                              Camera Output
                            </button>
                          </div>
                        )}

                        {activeAsset.processedUrl && (
                          <button
                            type="button"
                            onClick={() => handleDownloadAsset(activeAsset)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 font-display text-xs font-semibold text-[#07110c] hover:bg-emerald-400 transition-colors cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download {activeAsset.processedFilename}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Optical Frame Area */}
                    <div className="relative flex min-h-[290px] max-h-[460px] items-center justify-center bg-[#08090c] p-4">
                      {/* Subtle Viewfinder Corner Brackets */}
                      <div className="pointer-events-none absolute top-4 left-4 h-4 w-4 border-t border-l border-amber-400/35" />
                      <div className="pointer-events-none absolute top-4 right-4 h-4 w-4 border-t border-r border-amber-400/35" />
                      <div className="pointer-events-none absolute bottom-4 left-4 h-4 w-4 border-b border-l border-amber-400/35" />
                      <div className="pointer-events-none absolute bottom-4 right-4 h-4 w-4 border-b border-r border-amber-400/35" />

                      {activeAsset.mediaType === "image" && stageMediaUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={stageMediaUrl}
                          alt={activeAsset.file.name}
                          className="max-h-[420px] w-auto rounded object-contain shadow-2xl"
                        />
                      ) : stageMediaUrl ? (
                        <video
                          key={stageMediaUrl}
                          src={stageMediaUrl}
                          controls
                          muted
                          className="max-h-[420px] w-auto rounded object-contain shadow-2xl"
                        />
                      ) : null}

                      {activeAsset.isProcessing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#08090c]/80 backdrop-blur-xs">
                          <Loader2 className="h-9 w-9 animate-spin text-amber-400 mb-3" />
                          <p className="font-display text-sm font-semibold text-[#f3f5f9]">
                            Re-encoding Raw Pixels &amp; Embedding Camera IFDs…
                          </p>
                          <p className="mt-1 font-mono text-xs text-amber-300/80">
                            {selectedProfile.make} · {selectedProfile.model}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Camera Viewfinder OLED Bottom Readout Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1d222d] bg-[#0e1016] px-4 py-2.5 font-mono text-xs">
                      <div className="flex flex-wrap items-center gap-3 text-amber-300">
                        <span className="font-semibold text-[#f3f5f9]">
                          {showingProcessed && activeAsset.afterReport?.exifSummary.model
                            ? `${activeAsset.afterReport.exifSummary.make} ${activeAsset.afterReport.exifSummary.model}`
                            : `${selectedProfile.make} · ${selectedProfile.shortName}`}
                        </span>
                        {activeAsset.mediaType === "image" && (
                          <>
                            <span className="text-[#3a4254]">|</span>
                            <span>{hudShutter}s</span>
                            <span>f/{hudAperture}</span>
                            <span>ISO {hudIso}</span>
                            <span>
                              {hudFocal}mm ({hudEquiv}mm)
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-[#7c8599]">
                        {activeAsset.afterReport ? (
                          <span>
                            {activeAsset.afterReport.containerFormat} ·{" "}
                            {formatBytes(activeAsset.afterReport.byteSize)}
                          </span>
                        ) : activeAsset.beforeReport ? (
                          <span>
                            {activeAsset.beforeReport.containerFormat} ·{" "}
                            {formatBytes(activeAsset.beforeReport.byteSize)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {activeAsset.error && (
                      <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
                        {activeAsset.error}
                      </div>
                    )}
                  </div>
                )}

                {/* FORENSIC METADATA INSPECTOR */}
                {activeAsset && (
                  <ForensicInspector
                    beforeReport={activeAsset.beforeReport}
                    afterReport={activeAsset.afterReport}
                    isInspecting={activeAsset.isInspecting}
                  />
                )}
              </>
            )}
          </div>

          {/* RIGHT CONTROL BAY: CAMERA & SANITIZATION TELEMETRY DECK */}
          <aside className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20">
            <CameraControlDeck
              options={options}
              onChange={setOptions}
              onProcessActive={handleProcessActive}
              onProcessAll={handleProcessAll}
              isProcessing={anyProcessing}
              hasActiveFile={Boolean(activeAsset)}
              activeMediaType={activeAsset?.mediaType ?? null}
              queueCount={queue.length}
              unprocessedCount={unprocessedCount}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
