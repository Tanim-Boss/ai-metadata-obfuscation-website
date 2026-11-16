"use client";

import type { ReactNode } from "react";
import { FileText, FileVideo } from "lucide-react";
import type { QueuedAsset } from "./studio-types";

/**
 * Small shared building blocks for the studio chrome.
 *
 * The redesign intentionally trades big marketing cards for dense, instrument
 * style rows: every helper here is sized so a full step (header + form + CTA)
 * fits in noticeably less vertical space than before.
 */

export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.16em] text-amber-400 ${className}`}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-[#2b3242] bg-[#14171f] px-1.5 py-0.5 font-mono text-[10px] text-[#9aa3b5]">
      {children}
    </kbd>
  );
}

/**
 * Thumbnail for a queued asset. Same visual language as the old 44px tiles,
 * but parameterised so lists can shrink to 28px rows.
 */
export function AssetThumb({
  asset,
  size = "sm",
  src,
}: {
  asset: QueuedAsset;
  size?: "xs" | "sm" | "md";
  src?: string | null;
}) {
  const box =
    size === "xs"
      ? "h-7 w-7 rounded-md"
      : size === "md"
      ? "h-10 w-10 rounded-lg"
      : "h-8 w-8 rounded-md";
  const icon =
    size === "xs" ? "h-3.5 w-3.5" : size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div
      className={`${box} shrink-0 overflow-hidden border border-[#252a37] bg-[#0b0d12] flex items-center justify-center`}
    >
      {asset.mediaType === "image" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src || asset.previewUrl}
          alt={asset.file.name}
          className="h-full w-full object-cover"
        />
      ) : asset.mediaType === "video" ? (
        <FileVideo className={`${icon} text-amber-400`} />
      ) : (
        <FileText className={`${icon} text-amber-400`} />
      )}
    </div>
  );
}

export function MediaTypeChip({
  mediaType,
}: {
  mediaType: QueuedAsset["mediaType"];
}) {
  return (
    <span className="shrink-0 rounded bg-[#1c2029] px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-amber-300/85">
      {mediaType}
    </span>
  );
}
