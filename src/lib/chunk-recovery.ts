/**
 * Client-side recovery for stale JavaScript chunks.
 *
 * `chunk-recovery-script.ts` handles failures that happen before hydration (it
 * is inlined at the top of <body>). This module installs the same guard after hydration so
 * client-side navigations that request a chunk from an older build also recover
 * instead of leaving the user staring at an error overlay.
 */

const STORAGE_KEY = "exifforge.chunk-recovery";
const COUNT_KEY = `${STORAGE_KEY}:count`;
const CHUNK_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk [^ ]* failed|Failed to load chunk|Loading CSS chunk|error loading dynamically imported module|Importing a module script failed/i;

function readNumber(key: string): number {
  try {
    return parseInt(window.sessionStorage.getItem(key) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number) {
  try {
    window.sessionStorage.setItem(key, String(value));
  } catch {
    /* storage may be blocked — the in-memory flag still prevents loops */
  }
}

export function isChunkLoadError(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === "string") return CHUNK_ERROR_PATTERN.test(value);
  if (value instanceof Error) {
    return CHUNK_ERROR_PATTERN.test(`${value.name} ${value.message}`);
  }
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" ? CHUNK_ERROR_PATTERN.test(message) : false;
}

let recovering = false;

export function recoverFromChunkError(detail: unknown): boolean {
  if (recovering || !isChunkLoadError(detail)) return false;
  recovering = true;

  const attempts = readNumber(COUNT_KEY) + 1;
  writeNumber(COUNT_KEY, attempts);

  if (attempts > 3) {
    // The chunk is genuinely gone (bad build / blocked asset) — stop reloading.
    console.warn(
      "[EXIF//FORGE] A JavaScript chunk failed to load repeatedly. Hard-refresh the page (Ctrl/Cmd+Shift+R)."
    );
    return false;
  }

  const now = Date.now();
  const last = readNumber(STORAGE_KEY);
  writeNumber(STORAGE_KEY, now);

  if (attempts > 1 && now - last < 20_000) {
    // Cached HTML is still pointing at dead chunk names — refetch the document.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_reload", String(now));
      window.location.replace(url.toString());
      return true;
    } catch {
      /* fall through to a plain reload */
    }
  }

  window.location.reload();
  return true;
}

/** Installs window listeners; returns a cleanup function. */
export function installChunkRecovery(): () => void {
  const onError = (event: ErrorEvent) => {
    const target = event.target as (HTMLElement & { src?: string }) | null;
    if (target && target !== (window as unknown) && (target.tagName === "SCRIPT" || target.tagName === "LINK")) {
      recoverFromChunkError(`Failed to load chunk ${target.src ?? ""}`);
      return;
    }
    recoverFromChunkError(event.message || event.error);
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    recoverFromChunkError(event.reason);
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
