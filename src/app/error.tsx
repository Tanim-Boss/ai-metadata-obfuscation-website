"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Route-level error boundary. Catches render/runtime failures (and the
 * ChunkLoadError overlay) so the page never dies on a blank screen.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isChunkError] = useState(() =>
    /ChunkLoadError|Failed to load chunk|Loading chunk .* failed|dynamically imported module/i.test(
      `${error.name} ${error.message}`
    )
  );

  useEffect(() => {
    if (isChunkError) {
      const timer = window.setTimeout(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("_reload", String(Date.now()));
          window.location.replace(url.toString());
        } catch {
          window.location.reload();
        }
      }, 400);
      return () => window.clearTimeout(timer);
    }
  }, [isChunkError]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b0e] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#2b3242] bg-[#111318] p-6 text-center shadow-2xl shadow-black/60">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="font-display text-base font-bold text-[#f3f5f9]">
          {isChunkError ? "The page bundle changed" : "Something broke"}
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-[#9aa3b5]">
          {isChunkError
            ? "A JavaScript chunk from an older build is no longer available. Reloading fetches the current bundle."
            : "An unexpected error stopped the interface from rendering. Nothing you uploaded leaves the request."}
        </p>
        {error?.message && (
          <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#232834] bg-[#0b0d12] px-3 py-2 text-left font-mono text-[10px] text-[#7c8599]">
            {error.message}
          </pre>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 font-display text-xs font-semibold text-[#0a0b0e] hover:bg-amber-400"
          >
            <RefreshCw className="h-4 w-4" /> Reload page
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-[#2b3242] bg-[#171a22] px-4 py-2 font-display text-xs font-medium text-[#d5dce9] hover:border-amber-500/50 hover:text-amber-200"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
