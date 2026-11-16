"use client";

import { Check, ChevronRight } from "lucide-react";
import type { StudioStep, UploadMode } from "./studio-types";

interface StepIndicatorProps {
  currentStep: StudioStep;
  hasFiles: boolean;
  uploadMode: UploadMode;
  fileCount: number;
  onSelectStep: (step: StudioStep) => void;
}

/**
 * Compact single-rail stepper.
 *
 * Previous version rendered three tall cards with icon blocks, a "STEP 0X"
 * eyebrow, a title and a subtitle — roughly 130px of vertical space before any
 * work could start. This version keeps the same information in one ~44px row
 * so more of the viewport goes to the actual file workflow.
 */
export function StepIndicator({
  currentStep,
  hasFiles,
  uploadMode,
  fileCount,
  onSelectStep,
}: StepIndicatorProps) {
  const steps: Array<{
    step: StudioStep;
    code: string;
    title: string;
    hint: string;
    unlocked: boolean;
  }> = [
    {
      step: 1,
      code: "01",
      title: "Choose File",
      hint:
        fileCount > 0
          ? `${fileCount} ${uploadMode === "single" ? "selected" : "queued"}`
          : uploadMode === "single"
          ? "Single"
          : "Batch",
      unlocked: true,
    },
    {
      step: 2,
      code: "02",
      title: "Inspect",
      hint: hasFiles ? "Clean or inject" : "Locked",
      unlocked: hasFiles,
    },
    {
      step: 3,
      code: "03",
      title: "Inject & Export",
      hint: hasFiles ? "Telemetry" : "Locked",
      unlocked: hasFiles,
    },
  ];

  return (
    <nav
      aria-label="Workflow steps"
      className="flex items-center overflow-hidden rounded-xl border border-[#232834] bg-[#111318]"
    >
      <ol className="flex min-w-0 flex-1 items-stretch">
        {steps.map((item, index) => {
          const isActive = currentStep === item.step;
          const isDone = currentStep > item.step && item.unlocked;

          return (
            <li key={item.step} className="flex min-w-0 flex-1 items-stretch">
              {index > 0 && (
                <span
                  aria-hidden
                  className="flex shrink-0 items-center text-[#394153]"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}

              <button
                type="button"
                disabled={!item.unlocked}
                aria-current={isActive ? "step" : undefined}
                onClick={() => item.unlocked && onSelectStep(item.step)}
                className={`group flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left transition-colors sm:gap-2.5 sm:px-3.5 ${
                  isActive
                    ? "bg-amber-500/[0.09] cursor-default"
                    : isDone
                    ? "hover:bg-emerald-500/[0.07] cursor-pointer"
                    : item.unlocked
                    ? "hover:bg-[#171a22] cursor-pointer"
                    : "opacity-45 cursor-not-allowed"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-bold transition-colors ${
                    isActive
                      ? "border-amber-400/60 bg-amber-500 text-[#0a0b0e]"
                      : isDone
                      ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-300"
                      : item.unlocked
                      ? "border-[#2c3344] bg-[#171b24] text-[#9aa3b5] group-hover:text-[#f3f5f9]"
                      : "border-[#202430] bg-[#111318] text-[#4b5568]"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    item.code
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`truncate font-display text-xs font-semibold ${
                        isActive
                          ? "text-amber-100"
                          : item.unlocked
                          ? "text-[#e6ebf4]"
                          : "text-[#8891a4]"
                      }`}
                    >
                      {item.title}
                    </span>
                    {isActive && (
                      <span
                        aria-hidden
                        className="h-1 w-1 shrink-0 rounded-full bg-amber-400"
                      />
                    )}
                  </span>
                  <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-[#6f7889]">
                    {isDone ? "Done" : item.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
