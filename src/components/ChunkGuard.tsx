"use client";

import { useEffect } from "react";
import { installChunkRecovery } from "@/lib/chunk-recovery";

/**
 * Post-hydration half of the stale-chunk guard (see chunk-recovery-script.ts
 * for the pre-hydration half). Renders nothing.
 */
export function ChunkGuard() {
  useEffect(() => installChunkRecovery(), []);
  return null;
}
