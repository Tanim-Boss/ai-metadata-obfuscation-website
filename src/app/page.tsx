"use client";

import { useState, useCallback } from "react";
import JSZip from "jszip";
import { Lock, RotateCcw } from "lucide-react";
import {
  CAMERA_PROFILES,
  type TelemetryOptions,
} from "@/lib/camera-profiles";
import { classifyFileType } from "@/lib/media-classify";
import { MetadataInspectorModal } from "@/components/MetadataInspectorModal";
import { StepIndicator } from "@/components/StepIndicator";
import { StepOneUpload } from "@/components/StepOneUpload";
import { StepTwoInspect } from "@/components/StepTwoInspect";
import { StepThreeInject } from "@/components/StepThreeInject";
import type {
  QueuedAsset,
  StudioStep,
  UploadMode,
} from "@/components/studio-types";

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function revokeAssetUrls(asset: QueuedAsset) {
  URL.revokeObjectURL(asset.previewUrl);
  if (asset.cleanUrl) URL.revokeObjectURL(asset.cleanUrl);
  if (asset.injectedUrl) URL.revokeObjectURL(asset.injectedUrl);
}

export default function HomePage() {
  const defaultProfile = CAMERA_PROFILES[0];
  const defaultLens = defaultProfile.lenses[0];

  const [currentStep, setCurrentStep] = useState<StudioStep>(1);
  const [uploadMode, setUploadMode] = useState<UploadMode>("single");

  const [options, setOptions] = useState<TelemetryOptions>({
    mode: "inject",
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
    documentMetadata: {},
  });

  const [queue, setQueue] = useState<QueuedAsset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inspectModalAssetId, setInspectModalAssetId] = useState<string | null>(
    null
  );
  const [loadingSample, setLoadingSample] = useState<"comfyui" | "c2pa" | null>(
    null
  );
  const [globalError, setGlobalError] = useState<string | null>(null);

  const activeAsset = queue.find((item) => item.id === activeId) ?? queue[0] ?? null;
  const modalAsset =
    queue.find((item) => item.id === inspectModalAssetId) ?? activeAsset;

  const inspectQueuedFile = useCallback(async (assetId: string, file: File) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === assetId
          ? { ...item, isInspecting: true, error: null }
          : item
      )
    );
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

  const handleChangeMode = useCallback(
    (nextMode: UploadMode) => {
      setUploadMode(nextMode);
      if (nextMode === "single" && queue.length > 1) {
        const keep = activeAsset ?? queue[0];
        for (const item of queue) {
          if (item.id !== keep.id) revokeAssetUrls(item);
        }
        setQueue([keep]);
        setActiveId(keep.id);
      }
    },
    [queue, activeAsset]
  );

  const addFilesToQueue = useCallback(
    (fileList: FileList | File[]) => {
      setGlobalError(null);
      const incoming = Array.from(fileList);
      const validAssets: QueuedAsset[] = [];

      for (const f of incoming) {
        const mediaType = classifyFileType(f);
        if (!mediaType) {
          setGlobalError(
            `Skipped "${f.name}" — supported formats: JPG, PNG, WebP, AVIF, MP4, MOV, PDF, DOCX, EPUB, TXT & more.`
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
          isCleaning: false,
          isInjecting: false,
          beforeReport: null,
          cleanReport: null,
          cleanBlob: null,
          cleanUrl: null,
          cleanFilename: null,
          injectedReport: null,
          injectedBlob: null,
          injectedUrl: null,
          injectedFilename: null,
          error: null,
        });
      }

      if (validAssets.length === 0) return;

      // If multiple files were dropped while in Single File mode, automatically promote to Multiple Files mode
      const effectiveMode: UploadMode =
        validAssets.length > 1 && uploadMode === "single"
          ? "multiple"
          : uploadMode;

      if (effectiveMode !== uploadMode) {
        setUploadMode(effectiveMode);
      }

      if (effectiveMode === "single") {
        const single = validAssets[0];
        setQueue((prev) => {
          for (const old of prev) revokeAssetUrls(old);
          return [single];
        });
        setActiveId(single.id);
        setCurrentStep(2);
        void inspectQueuedFile(single.id, single.file);
      } else {
        setQueue((prev) => [...prev, ...validAssets]);
        setActiveId((prev) => prev ?? validAssets[0].id);
        for (const asset of validAssets) {
          void inspectQueuedFile(asset.id, asset.file);
        }
      }
    },
    [uploadMode, inspectQueuedFile]
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
        isCleaning: false,
        isInjecting: false,
        beforeReport: data.report,
        cleanReport: null,
        cleanBlob: null,
        cleanUrl: null,
        cleanFilename: null,
        injectedReport: null,
        injectedBlob: null,
        injectedUrl: null,
        injectedFilename: null,
        error: null,
      };

      if (uploadMode === "single") {
        setQueue((prev) => {
          for (const old of prev) revokeAssetUrls(old);
          return [newAsset];
        });
        setActiveId(id);
        setCurrentStep(2);
      } else {
        setQueue((prev) => [...prev, newAsset]);
        setActiveId(id);
      }
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Failed to load sample AI file."
      );
    } finally {
      setLoadingSample(null);
    }
  };

  const processAsset = useCallback(
    async (
      asset: QueuedAsset,
      mode: "clean" | "inject",
      currentOptions: TelemetryOptions
    ): Promise<{ blob: Blob; filename: string } | null> => {
      setQueue((prev) =>
        prev.map((item) =>
          item.id === asset.id
            ? {
                ...item,
                isCleaning: mode === "clean" ? true : item.isCleaning,
                isInjecting: mode === "inject" ? true : item.isInjecting,
                error: null,
              }
            : item
        )
      );

      try {
        const endpoint =
          asset.mediaType === "video"
            ? "/api/process/video"
            : asset.mediaType === "document"
            ? "/api/process/document"
            : "/api/process/image";

        const payloadOptions: TelemetryOptions =
          mode === "clean"
            ? { ...currentOptions, mode: "clean", outputFormat: "keep" }
            : { ...currentOptions, mode: "inject" };

        const formData = new FormData();
        formData.append("file", asset.file);
        formData.append("profile", payloadOptions.profileId);
        formData.append("options", JSON.stringify(payloadOptions));
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
            if (mode === "clean") {
              if (item.cleanUrl) URL.revokeObjectURL(item.cleanUrl);
              return {
                ...item,
                isCleaning: false,
                beforeReport: data.beforeReport || item.beforeReport,
                cleanReport: data.afterReport,
                cleanBlob: outBlob,
                cleanUrl: outUrl,
                cleanFilename: data.filename,
                error: null,
              };
            } else {
              if (item.injectedUrl) URL.revokeObjectURL(item.injectedUrl);
              return {
                ...item,
                isInjecting: false,
                beforeReport: data.beforeReport || item.beforeReport,
                injectedReport: data.afterReport,
                injectedBlob: outBlob,
                injectedUrl: outUrl,
                injectedFilename: data.filename,
                error: null,
              };
            }
          })
        );

        return { blob: outBlob, filename: data.filename };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to process file.";
        setQueue((prev) =>
          prev.map((item) =>
            item.id === asset.id
              ? {
                  ...item,
                  isCleaning: mode === "clean" ? false : item.isCleaning,
                  isInjecting: mode === "inject" ? false : item.isInjecting,
                  error: msg,
                }
              : item
          )
        );
        return null;
      }
    },
    []
  );

  const downloadZipFromEntries = useCallback(
    async (
      entries: Array<{ blob: Blob; filename: string }>,
      zipName: string
    ) => {
      if (entries.length === 0) return;
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (const entry of entries) {
        let name = entry.filename;
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf(".");
          name =
            dot > 0
              ? `${name.slice(0, dot)}_${usedNames.size}${name.slice(dot)}`
              : `${name}_${usedNames.size}`;
        }
        usedNames.add(name);
        zip.file(name, entry.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      triggerDownload(url, zipName);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    []
  );

  const handleCleanDownloadActive = async (asset: QueuedAsset) => {
    const res = await processAsset(asset, "clean", options);
    if (res) {
      const url = URL.createObjectURL(res.blob);
      triggerDownload(url, res.filename);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  };

  const handleCleanDownloadAll = async () => {
    const entries: Array<{ blob: Blob; filename: string }> = [];
    for (const item of queue) {
      const res = await processAsset(item, "clean", options);
      if (res) entries.push(res);
    }
    if (entries.length === 1) {
      const url = URL.createObjectURL(entries[0].blob);
      triggerDownload(url, entries[0].filename);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else if (entries.length > 1) {
      await downloadZipFromEntries(
        entries,
        `Clean_Files_${entries.length}.zip`
      );
    }
  };

  const handleInjectAndDownloadActive = async (asset: QueuedAsset) => {
    const res = await processAsset(asset, "inject", options);
    if (res) {
      const url = URL.createObjectURL(res.blob);
      triggerDownload(url, res.filename);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  };

  const handleInjectAndDownloadAll = async () => {
    const entries: Array<{ blob: Blob; filename: string }> = [];
    for (const item of queue) {
      const res = await processAsset(item, "inject", options);
      if (res) entries.push(res);
    }
    if (entries.length === 1) {
      const url = URL.createObjectURL(entries[0].blob);
      triggerDownload(url, entries[0].filename);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else if (entries.length > 1) {
      await downloadZipFromEntries(
        entries,
        `DCIM_Injected_Batch_${entries.length}_Files.zip`
      );
    }
  };

  const handleDownloadAllCleanZip = async () => {
    const entries = queue
      .filter((q) => q.cleanBlob && q.cleanFilename)
      .map((q) => ({ blob: q.cleanBlob!, filename: q.cleanFilename! }));
    await downloadZipFromEntries(entries, `Clean_Files_${entries.length}.zip`);
  };

  const handleDownloadAllInjectedZip = async () => {
    const entries = queue
      .filter((q) => q.injectedBlob && q.injectedFilename)
      .map((q) => ({ blob: q.injectedBlob!, filename: q.injectedFilename! }));
    await downloadZipFromEntries(
      entries,
      `DCIM_Injected_Batch_${entries.length}_Files.zip`
    );
  };

  const handleRemoveAsset = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) revokeAssetUrls(target);
      const next = prev.filter((i) => i.id !== id);
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null);
      }
      if (next.length === 0) {
        setCurrentStep(1);
      }
      return next;
    });
  };

  const handleClearAll = () => {
    for (const item of queue) revokeAssetUrls(item);
    setQueue([]);
    setActiveId(null);
    setGlobalError(null);
    setCurrentStep(1);
  };

  const modalAfterReport = modalAsset
    ? currentStep === 3
      ? modalAsset.injectedReport ?? modalAsset.cleanReport
      : modalAsset.cleanReport ?? modalAsset.injectedReport
    : null;

  return (
    <div className="canvas-glow flex min-h-screen flex-col bg-[#0a0b0e] text-[#f3f5f9]">
      {/* TOP INSTRUMENT BAR — single compact row, sticky */}
      <header className="sticky top-0 z-30 border-b border-[#1f2430] bg-[#0a0b0e]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10 font-mono text-[11px] font-bold text-amber-400">
              f/
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-display text-sm font-bold tracking-tight text-[#f3f5f9]">
                EXIF<span className="text-amber-400">{"//"}</span>FORGE
              </span>
              <span className="hidden h-3 w-px bg-[#2b3242] sm:block" />
              <p className="hidden truncate text-[11px] text-[#7c8599] md:block">
                Strip AI provenance · inject authentic camera telemetry
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {queue.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1 rounded-md border border-[#282e3d] bg-[#14171f] px-2 py-1 font-mono text-[10px] font-medium text-[#d0d7e6] transition-colors hover:border-red-500/45 hover:text-red-200 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                New session
              </button>
            )}
            <div className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-300">
              <Lock className="h-3 w-3" />
              <span className="hidden sm:inline">Zero-retention RAM</span>
              <span className="sm:hidden">RAM only</span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN 3-STEP WORKSPACE */}
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-3 px-3 py-3 sm:px-5 sm:py-4">
        <StepIndicator
          currentStep={currentStep}
          hasFiles={queue.length > 0}
          uploadMode={uploadMode}
          fileCount={queue.length}
          onSelectStep={(step) => {
            if (step === 1 || queue.length > 0) {
              setCurrentStep(step);
            }
          }}
        />

        {globalError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              className="shrink-0 font-mono text-[10px] text-red-300 hover:text-white cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        )}

        {currentStep === 1 && (
          <StepOneUpload
            uploadMode={uploadMode}
            onChangeMode={handleChangeMode}
            queue={queue}
            onAddFiles={addFilesToQueue}
            onRemoveFile={handleRemoveAsset}
            onClearAll={handleClearAll}
            onLoadSample={(variant) => void handleLoadSample(variant)}
            loadingSample={loadingSample}
            onContinueToInspect={() => {
              if (queue.length > 0) setCurrentStep(2);
            }}
          />
        )}

        {currentStep === 2 && activeAsset && (
          <StepTwoInspect
            queue={queue}
            activeAsset={activeAsset}
            onSelectAsset={(id) => setActiveId(id)}
            onBackToStepOne={() => setCurrentStep(1)}
            onOpenFullModal={(asset) => {
              setInspectModalAssetId(asset.id);
            }}
            onCleanDownloadActive={(asset) =>
              void handleCleanDownloadActive(asset)
            }
            onCleanDownloadAll={() => void handleCleanDownloadAll()}
            onDownloadCleanBlob={(asset) => {
              if (asset.cleanUrl && asset.cleanFilename) {
                triggerDownload(asset.cleanUrl, asset.cleanFilename);
              }
            }}
            onDownloadAllCleanZip={() => void handleDownloadAllCleanZip()}
            onProceedToInject={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 3 && activeAsset && (
          <StepThreeInject
            queue={queue}
            activeAsset={activeAsset}
            options={options}
            onChangeOptions={setOptions}
            onSelectAsset={(id) => setActiveId(id)}
            onBackToInspect={() => setCurrentStep(2)}
            onInjectAndDownloadActive={(asset) =>
              void handleInjectAndDownloadActive(asset)
            }
            onInjectAndDownloadAll={() => void handleInjectAndDownloadAll()}
            onDownloadInjectedBlob={(asset) => {
              if (asset.injectedUrl && asset.injectedFilename) {
                triggerDownload(asset.injectedUrl, asset.injectedFilename);
              }
            }}
            onDownloadAllInjectedZip={() =>
              void handleDownloadAllInjectedZip()
            }
            onOpenFullModal={(asset) => {
              setInspectModalAssetId(asset.id);
            }}
          />
        )}
      </main>

      {/* FULL METADATA INSPECTOR MODAL */}
      {modalAsset && (
        <MetadataInspectorModal
          open={Boolean(inspectModalAssetId)}
          onClose={() => setInspectModalAssetId(null)}
          filename={modalAsset.file.name}
          mediaType={modalAsset.mediaType}
          beforeReport={modalAsset.beforeReport}
          afterReport={modalAfterReport}
          isInspecting={modalAsset.isInspecting}
          error={modalAsset.error}
          onRescan={() => inspectQueuedFile(modalAsset.id, modalAsset.file)}
        />
      )}
    </div>
  );
}
