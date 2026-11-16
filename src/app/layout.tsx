import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CHUNK_RECOVERY_SCRIPT } from "@/lib/chunk-recovery-script";
import { ChunkGuard } from "@/components/ChunkGuard";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "EXIF // FORGE — AI Metadata Remover & Camera Telemetry Studio",
  description:
    "Purge C2PA, JUMBF, XMP, and diffusion generation metadata from images, videos, and documents (PDF, DOCX, EPUB, TXT…) via raw pixel re-encoding and embed authentic optical camera EXIF & QuickTime telemetry. No upload size limits.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (and password managers)
    // routinely rewrite attributes on <html>/<body> before React hydrates.
    // That is the one mismatch React cannot and should not patch, so we opt
    // these two elements out of attribute comparison. The suppression is only
    // one level deep and does not hide mismatches in the tree below.
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[#0a0b0e] text-[#f3f5f9] antialiased selection:bg-amber-500/30 selection:text-amber-200"
        suppressHydrationWarning
      >
        {/*
          Runs inline during the initial HTML parse, before any Next.js chunk
          is requested, so a tab that outlived a dev-server restart (or a fresh
          deployment) recovers from a stale ChunkLoadError instead of dying on
          the framework error overlay.

          Kept as a plain inline <script> (rather than a manually written
          <head> element) because the App Router owns <head>; rendering our own
          produces a server/client tree mismatch during hydration.
        */}
        <script
          id="chunk-recovery"
          dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_SCRIPT }}
        />
        <ChunkGuard />
        {children}
      </body>
    </html>
  );
}
