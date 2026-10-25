"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useRef, useEffect } from "react";

const CAMERA_PROFILES = [
  { id: "canon", label: "Canon EOS R5", make: "Canon", model: "EOS R5" },
  { id: "nikon", label: "Nikon Z 9", make: "Nikon", model: "Z 9" },
  { id: "sony", label: "Sony A7R IV", make: "Sony", model: "Alpha 7R IV" },
];

function getFileType(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"image" | "video" | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processedFileName, setProcessedFileName] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState("canon");
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ffmpegLoadedRef = useRef(false);
  const ffmpegRef = useRef<any>(null);

  // Load ffmpeg WASM for client-side video processing
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadFfmpeg = async () => {
      if (ffmpegLoadedRef.current) return;
      try {
        // Dynamic import to avoid bundling WASM in server bundle
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        const { fetchFile } = await import("@ffmpeg/util");
        const instance = new FFmpeg();
        instance.on("progress", ({ progress }: { progress: number }) => {
          setProgress(Math.round(progress * 100));
        });
        await instance.load();
        ffmpegRef.current = instance;
        ffmpegLoadedRef.current = true;
        ;(window as any).__ffmpegFetchFile = fetchFile;
      } catch (err) {
        console.error("Failed to load ffmpeg WASM:", err);
      }
    };
    loadFfmpeg();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length) handleFileSelect(files[0]);
    },
    []
  );

  const handleFileSelect = useCallback((f: File) => {
    const type = getFileType(f);
    if (!type) {
      setError("Please upload an image or video file.");
      return;
    }
    setFile(f);
    setFileType(type);
    setError("");
    setProcessedUrl(null);
    setProcessedFileName("");
  }, []);

  const handleImageProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError("");
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("profile", profile);

      const res = await fetch("/api/process/image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Image processing failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") || "";
      const nameMatch = cd.match(/filename="([^"]+)"/);
      setProcessedUrl(url);
      setProcessedFileName(nameMatch ? nameMatch[1] : "processed_image.jpg");
      setProgress(100);
    } catch (err: any) {
      setError(err.message || "Failed to process image");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVideoProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError("");
    setProgress(0);

    try {
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) {
        throw new Error("FFmpeg is still loading. Please wait and try again.");
      }

      const { fetchFile } = (window as any).__ffmpegFetchFile || {};
      if (!fetchFile) {
        throw new Error("FFmpeg utilities not available.");
      }

      const inputName = "input_video";
      const outputName = "output_video.mp4";

      // Load input file into ffmpeg MEMFS
      const fileData = await fetchFile(file);
      ffmpeg.writeFile(inputName, fileData);

      // Strip all metadata and add fake camera metadata
      await ffmpeg.exec([
        "-i",
        inputName,
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        "-metadata",
        "title=Recorded footage",
        "-metadata",
        "comment=Captured with Canon EOS R5",
        "-metadata",
        "description=Personal video recording",
        "-metadata:s:v:0",
        "handler_name=Canon MP4 Video Handler",
        "-metadata:s:a:0",
        "handler_name=Canon MP4 Audio Handler",
        "-c",
        "copy",
        outputName,
      ]);

      setProgress(100);

      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data.buffer as ArrayBuffer], {
        type: file.type || "video/mp4",
      });
      const url = URL.createObjectURL(blob);
      setProcessedUrl(url);
      setProcessedFileName(`processed_${file.name}`);
    } catch (err: any) {
      setError(err.message || "Failed to process video");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedUrl) return;
    const link = document.createElement("a");
    link.href = processedUrl;
    link.download = processedFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const isImage = fileType === "image";
  const isVideo = fileType === "video";

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Metadata Cleaner
          </h1>
          <p className="text-slate-600 text-lg">
            Remove AI content metadata and add authentic camera data to your
            images and videos
          </p>
        </div>

        {/* Upload Zone */}
        <div
          className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition-all hover:border-slate-400 hover:bg-slate-50"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
            }}
          />
          <button
            onClick={() =>
              (document.querySelector('input[type="file"]') as HTMLInputElement)
                ?.click()
            }
            className="inline-flex items-center justify-center px-8 py-4 text-slate-700 font-medium hover:text-slate-900"
          >
            <svg
              className="w-6 h-6 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Choose image or video
          </button>
          <p className="mt-4 text-sm text-slate-500">
            Drag & drop or click to upload. Supports JPG, PNG, WebP, MP4, MOV.
          </p>
        </div>

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* File Selected */}
        {file && !isProcessing && !processedUrl && (
          <div className="mt-8">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-1">
                <div className="rounded-xl bg-slate-100 p-4 mb-4">
                  {isImage ? (
                    <img
                      src={URL.createObjectURL(file)}
                      alt="Preview"
                      className="max-w-full max-h-64 rounded-lg object-cover"
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      src={URL.createObjectURL(file)}
                      className="max-w-full max-h-64 rounded-lg object-cover"
                      controls
                      autoPlay
                      muted
                    />
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  {file.name} • {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>

              <div className="flex-1 space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Camera Profile
                </h3>
                {isImage && (
                  <div className="space-y-2">
                    {CAMERA_PROFILES.map((p) => (
                      <label key={p.id} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-slate-50 hover:border-slate-300">
                        <input
                          type="radio"
                          name="profile"
                          value={p.id}
                          checked={profile === p.id}
                          onChange={() => setProfile(p.id)}
                          className="w-4 h-4 text-slate-600"
                        />
                        <div>
                          <div className="font-medium text-slate-900">{p.label}</div>
                          <div className="text-xs text-slate-500">
                            {p.make} • {p.model}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {!isImage && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-sm font-medium text-blue-900">
                      Video metadata stripping
                    </div>
                    <p className="text-xs text-blue-700 mt-1">
                      Client-side processing removes all metadata and injects
                      authentic camera tags.
                    </p>
                  </div>
                )}

                <button
                  onClick={isImage ? handleImageProcess : handleVideoProcess}
                  disabled={isProcessing}
                  className={`w-full py-4 rounded-xl font-semibold transition-all ${
                    isProcessing
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  {isProcessing ? "Processing..." : "Remove AI Metadata & Add Camera Data"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Processing */}
        {isProcessing && !processedUrl && (
          <div className="mt-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-full max-w-xs bg-white rounded-xl p-6 shadow">
                <div className="w-full bg-slate-200 rounded-full h-2.5 mb-4">
                  <div
                    className="bg-slate-900 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-slate-600">{progress}% complete</p>
              </div>
              <p className="text-slate-500 text-sm">
                Stripping AI signatures and embedding camera metadata…
              </p>
            </div>
          </div>
        )}

        {/* Result */}
        {processedUrl && (
          <div className="mt-8">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-1">
                <div className="rounded-xl bg-white p-4 mb-4 shadow-sm border border-slate-200">
                  {isImage ? (
                    <img
                      src={processedUrl}
                      alt="Processed"
                      className="max-w-full max-h-64 rounded-lg object-cover"
                    />
                  ) : (
                    <video
                      src={processedUrl}
                      className="max-w-full max-h-64 rounded-lg object-cover"
                      controls
                      autoPlay
                      muted
                    />
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  {processedFileName} • Cleaned &amp; tagged
                </p>
              </div>

              <div className="flex-1 space-y-4">
                <div className="p-4 rounded-xl bg-green-50 border border-green-200">
                  <h3 className="text-lg font-semibold text-green-900 mb-1">
                    ✓ Metadata Cleaned
                  </h3>
                  <ul className="text-sm text-green-800 space-y-1 mt-2 list-disc list-inside">
                    <li>Removed AI generator tags</li>
                    <li>Stripped EXIF/XMP signatures</li>
                    <li>Removed software watermarks</li>
                    <li>
                      {isImage
                        ? "Injected authentic camera EXIF"
                        : "Injected authentic video container tags"}
                    </li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex-1 py-4 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors"
                  >
                    Download Processed File
                  </button>
                  <button
                    onClick={() => {
                      setProcessedUrl(null);
                      setProcessedFileName("");
                      setFile(null);
                      setFileType(null);
                    }}
                    className="flex-1 py-4 border border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Process Another
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
