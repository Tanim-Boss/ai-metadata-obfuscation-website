"use client";

import { Check, FileUp, FileSearch, SlidersHorizontal } from "lucide-react";
import type { StudioStep, UploadMode } from "./studio-types";

interface StepIndicatorProps {
  currentStep: StudioStep;
  hasFiles: boolean;
  uploadMode: UploadMode;
  fileCount: number;
  onSelectStep: (step: StudioStep) => void;
}

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
    subtitle: string;
    icon: typeof FileUp;
    unlocked: boolean;
  }> = [
    {
      step: 1,
      code: "01",
      title: "Choose File",
      subtitle:
        fileCount > 0
          ? `${fileCount} ${uploadMode === "single" ? "file selected" : "files queued"}`
          : uploadMode === "single"
          ? "Single file mode"
          : "Multiple files mode",
      icon: FileUp,
      unlocked: true,
    },
    {
      step: 2,
      code: "02",
      title: "Inspect Metadata",
      subtitle: "Clean download or inject",
      icon: FileSearch,
      unlocked: hasFiles,
    },
    {
      step: 3,
      code: "03",
      title: "Inject & Download",
      subtitle: "Telemetry profile & export",
      icon: SlidersHorizontal,
      unlocked: hasFiles,
    },
  ];

  return (
    <nav
      aria-label="Workflow steps"
      className="rounded-2xl border border-[#232834] bg-[#111318] p-2 sm:p-2.5"
    >
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {steps.map((item) => {
          const isActive = currentStep === item.step;
          const isDone = currentStep > item.step && item.unlocked;
          const Icon = item.icon;

          return (
            <li key={item.step}>
              <button
                type="button"
                disabled={!item.unlocked}
                onClick={() => item.unlocked && onSelectStep(item.step)}
                className={`group flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                  isActive
                    ? "border-amber-500/60 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.2)] cursor-default"
                    : isDone
                    ? "border-emerald-500/35 bg-emerald-500/[0.06] hover:border-emerald-500/60 hover:bg-emerald-500/10 cursor-pointer"
                    : item.unlocked
                    ? "border-[#232834] bg-[#151821] hover:border-[#343c4e] cursor-pointer"
                    : "border-[#1b1f29] bg-[#0d0f14] opacity-45 cursor-not-allowed"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold transition-colors ${
                    isActive
                      ? "border-amber-500/60 bg-amber-500 text-[#0a0b0e]"
                      : isDone
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                      : item.unlocked
                      ? "border-[#2c3344] bg-[#171b24] text-[#9aa3b5] group-hover:text-[#f3f5f9]"
                      : "border-[#202430] bg-[#111318] text-[#4b5568]"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-mono text-[10px] font-semibold tracking-wider ${
                        isActive
                          ? "text-amber-400"
                          : isDone
                          ? "text-emerald-400"
                          : "text-[#646e82]"
                      }`}
                    >
                      STEP {item.code}
                    </span>
                  </div>
                  <div className="truncate font-display text-xs sm:text-sm font-semibold text-[#f3f5f9]">
                    {item.title}
                  </div>
                  <div className="truncate text-[11px] text-[#7c8599]">
                    {item.subtitle}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
