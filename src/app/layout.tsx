import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "EXIF // FORGE — AI Metadata Remover & Camera Telemetry Studio",
  description:
    "Purge C2PA, JUMBF, XMP, and diffusion generation metadata via raw pixel re-encoding and embed authentic optical camera EXIF & QuickTime telemetry.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0b0e] text-[#f3f5f9] antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
