/**
 * Inline bootstrap script that survives a stale dev-server tab.
 *
 * Turbopack/webpack chunk names change whenever the dev server restarts (or a
 * new production build is deployed). A tab that is still open then requests a
 * chunk that no longer exists and the app dies with:
 *
 *   Runtime ChunkLoadError
 *   Failed to load chunk /_next/static/chunks/... from module ...
 *
 * The script below is inlined as the first child of <body> so it runs before any chunk is
 * requested. It detects chunk-load failures (script/link load errors, unhandled
 * rejection of a dynamic import, or the visible dev-overlay text) and reloads
 * the document once, re-fetching the HTML so the correct chunk names are used.
 * A small attempt counter prevents a reload loop when the failure is real.
 */
export const CHUNK_RECOVERY_SCRIPT = `(function () {
  var KEY = "exifforge.chunk-recovery";
  var COUNT = KEY + ":count";
  var recovering = false;

  function readNumber(key) {
    try {
      return parseInt(window.sessionStorage.getItem(key) || "0", 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  function write(key, value) {
    try {
      window.sessionStorage.setItem(key, String(value));
    } catch (error) {
      /* storage can be blocked; the in-memory flag still prevents loops */
    }
  }

  function isChunkError(message) {
    return (
      typeof message === "string" &&
      /ChunkLoadError|Loading chunk [^ ]* failed|Failed to load chunk|Loading CSS chunk|error loading dynamically imported module|Importing a module script failed/i.test(
        message
      )
    );
  }

  function recover(detail) {
    if (recovering || !isChunkError(detail)) return;
    recovering = true;

    var attempts = readNumber(COUNT) + 1;
    write(COUNT, attempts);

    if (attempts > 3) {
      // Give up quietly: the chunk really is missing (bad build, blocked asset).
      // eslint-disable-next-line no-console
      console.warn(
        "[EXIF//FORGE] A JavaScript chunk failed to load repeatedly. Hard-refresh the page (Ctrl/Cmd+Shift+R)."
      );
      return;
    }

    var now = Date.now();
    var last = readNumber(KEY);
    write(KEY, now);

    // A second failure while the cached HTML is still being served: navigate to
    // a fresh URL so the document (and therefore the chunk manifest) is refetched.
    if (attempts > 1 && now - last < 20000) {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set("_reload", String(now));
        window.location.replace(url.toString());
        return;
      } catch (error) {
        /* fall through to a plain reload */
      }
    }

    window.location.reload();
  }

  window.addEventListener(
    "error",
    function (event) {
      var target = event && event.target;
      if (
        target &&
        target !== window &&
        (target.tagName === "SCRIPT" || target.tagName === "LINK") &&
        target.src
      ) {
        recover("Failed to load chunk " + target.src);
        return;
      }
      if (event && event.message) recover(String(event.message));
    },
    true
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    var message =
      reason && (reason.message || reason.name)
        ? String(reason.message || reason.name)
        : String(reason || "");
    recover(message);
  });

  // Fallback for the framework error overlay, which reports the failure as text
  // instead of a loadable promise rejection.
  window.addEventListener("load", function () {
    window.setTimeout(function () {
      var text = document.body ? document.body.innerText || "" : "";
      if (isChunkError(text)) {
        recover(text);
        return;
      }
      if (!recovering) write(COUNT, 0);
    }, 1500);
  });
})();`;
