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
    <html lang="en" className="dark">
      <head>
        {/*
          Runs before any chunk request so a tab that outlived a dev-server
          restart (or a fresh deployment) recovers from a stale ChunkLoadError
          instead of dying on the framework error overlay.
        */}
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-[#0a0b0e] text-[#f3f5f9] antialiased selection:bg-amber-500/30 selection:text-amber-200">
        <ChunkGuard />
        {children}
      </body>
    </html>
  );
}
