"use client";

import { useState } from "react";
import {
  Camera,
  Aperture,
  Dices,
  MapPin,
  Clock,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import {
  CAMERA_PROFILES,
  GPS_PRESETS,
  SHUTTER_SPEED_OPTIONS,
  compute35mmEquivalent,
  getCameraProfile,
  getLensForProfile,
  type CameraCategory,
  type TelemetryOptions,
} from "@/lib/camera-profiles";

interface CameraControlDeckProps {
  options: TelemetryOptions;
  onChange: (next: TelemetryOptions) => void;
  onProcessActive: () => void;
  onProcessAll?: () => void;
  isProcessing: boolean;
  hasActiveFile: boolean;
  activeMediaType: "image" | "video" | null;
  queueCount: number;
  unprocessedCount: number;
}

const CATEGORY_FILTERS: Array<{ id: "all" | CameraCategory; label: string }> = [
  { id: "all", label: "All Bodies" },
  { id: "full-frame", label: "Full-Frame" },
  { id: "compact-aps-c", label: "APS-C" },
  { id: "medium-format", label: "Medium" },
  { id: "smartphone", label: "Phone" },
];

export function CameraControlDeck({
  options,
  onChange,
  onProcessActive,
  onProcessAll,
  isProcessing,
  hasActiveFile,
  activeMediaType,
  queueCount,
  unprocessedCount,
}: CameraControlDeckProps) {
  const [categoryFilter, setCategoryFilter] = useState<"all" | CameraCategory>(
    "all"
  );
  const [showLocationSection, setShowLocationSection] = useState(false);
  const [showTimestampSection, setShowTimestampSection] = useState(false);

  const profile = getCameraProfile(options.profileId);
  const lens = getLensForProfile(profile, options.lensId);

  const visibleProfiles =
    categoryFilter === "all"
      ? CAMERA_PROFILES
      : CAMERA_PROFILES.filter((p) => p.category === categoryFilter);

  const handleSelectProfile = (profileId: string) => {
    const nextProfile = getCameraProfile(profileId);
    const defaultLens = nextProfile.lenses[0];
    onChange({
      ...options,
      profileId: nextProfile.id,
      lensId: defaultLens.id,
      focalLengthMm: defaultLens.defaultFocalMm,
      fNumber: defaultLens.defaultFNumber,
      iso: nextProfile.baseIso,
      shutterSpeed: nextProfile.shutterPresets[3] || "1/250",
    });
  };

  const handleSelectLens = (lensId: string) => {
    const nextLens = getLensForProfile(profile, lensId);
    onChange({
      ...options,
      lensId: nextLens.id,
      focalLengthMm: nextLens.defaultFocalMm,
      fNumber: nextLens.defaultFNumber,
    });
  };

  const handleRandomizeExposure = () => {
    const pick = <T,>(arr: T[]): T =>
      arr[Math.floor(Math.random() * arr.length)];
    const randomLens = pick(profile.lenses);
    const randomFocal = pick(randomLens.focalPresets);
    const randomAperture = pick(randomLens.aperturePresets);
    const randomShutter = pick(profile.shutterPresets);
    const naturalIsos = profile.isoPresets.slice(0, 6);
    const randomIso = pick(naturalIsos);
    const biases = [-0.7, -0.3, 0, 0, 0, 0.3];
    const randomBias = pick(biases);

    onChange({
      ...options,
      lensId: randomLens.id,
      focalLengthMm: randomFocal,
      fNumber: randomAperture,
      shutterSpeed: randomShutter,
      iso: randomIso,
      exposureBiasEv: randomBias,
    });
  };

  const currentFocal = options.focalLengthMm ?? lens.defaultFocalMm;
  const equiv35mm = compute35mmEquivalent(currentFocal, profile);
  const isVideo = activeMediaType === "video";

  return (
    <div className="space-y-4">
      {/* 1. CAMERA BODY SELECTOR */}
      <div className="rounded-xl border border-[#232834] bg-[#111318] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-amber-400" />
            <h2 className="font-display text-sm font-semibold text-[#f3f5f9]">
              Camera Hardware Profile
            </h2>
          </div>
          <span className="font-mono text-[11px] text-[#646e82]">
            {profile.make}
          </span>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1 mb-3">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                categoryFilter === cat.id
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-[#171a22] text-[#9aa3b5] border border-transparent hover:text-[#f3f5f9]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Camera Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-0.5">
          {visibleProfiles.map((p) => {
            const active = p.id === profile.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProfile(p.id)}
                className={`text-left rounded-lg border p-2.5 transition-all ${
                  active
                    ? "border-amber-500/70 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]"
                    : "border-[#232834] bg-[#161920] hover:border-[#343c4f]"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-display text-xs font-semibold text-[#f3f5f9] truncate">
                    {p.label}
                  </span>
                  {active && (
                    <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-1 font-mono text-[10px]">
                  <span className="text-[#9aa3b5] truncate">{p.model}</span>
                  <span className="rounded bg-[#0d0f14] px-1.5 py-0.5 text-amber-300/85 shrink-0">
                    {p.sensorBadge.split("·")[0].trim()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. OPTICS & EXPOSURE TELEMETRY (Image Full EXIF / Video Summary) */}
      <div className="rounded-xl border border-[#232834] bg-[#111318] p-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Aperture className="h-4 w-4 text-amber-400" />
            <h2 className="font-display text-sm font-semibold text-[#f3f5f9]">
              {isVideo ? "Container Firmware & Handler" : "Optics & Exposure IFD"}
            </h2>
          </div>
          {!isVideo && (
            <button
              type="button"
              onClick={handleRandomizeExposure}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2c3344] bg-[#171a22] px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/10 transition-colors"
              title="Roll realistic exposure combination for this camera & lens"
            >
              <Dices className="h-3.5 w-3.5" />
              Randomize Shot
            </button>
          )}
        </div>

        {isVideo ? (
          <div className="rounded-lg border border-[#232834] bg-[#151821] p-3 font-mono text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[#646e82]">QuickTime Make:</span>
              <span className="text-[#f3f5f9]">{profile.make}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#646e82]">QuickTime Model:</span>
              <span className="text-[#f3f5f9]">{profile.model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#646e82]">Firmware Tag:</span>
              <span className="text-amber-300">{profile.software}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#646e82]">Stream Handler:</span>
              <span className="text-[#9aa3b5] truncate max-w-[180px]">
                {profile.videoHandlerName}
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Lens Selector */}
            <div>
              <label className="block text-[11px] font-medium text-[#9aa3b5] mb-1">
                Mounted Optical Lens
              </label>
              <select
                value={lens.id}
                onChange={(e) => handleSelectLens(e.target.value)}
                className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-3 py-2 text-xs text-[#f3f5f9] focus:border-amber-500/60 focus:outline-none"
              >
                {profile.lenses.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 2x2 Exposure Dials Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="flex items-center justify-between text-[11px] text-[#9aa3b5] mb-1">
                  <span>Focal Length</span>
                  <span className="font-mono text-[10px] text-amber-400/90">
                    {equiv35mm}mm eq
                  </span>
                </div>
                {lens.focalPresets.length > 1 ? (
                  <select
                    value={currentFocal}
                    onChange={(e) =>
                      onChange({
                        ...options,
                        focalLengthMm: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-2 font-mono text-xs text-[#f3f5f9] focus:border-amber-500/60 focus:outline-none"
                  >
                    {lens.focalPresets.map((fl) => (
                      <option key={fl} value={fl}>
                        {fl} mm
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-lg border border-[#232834] bg-[#14171f] px-2.5 py-2 font-mono text-xs text-[#9aa3b5]">
                    {lens.defaultFocalMm} mm (Prime)
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-[#9aa3b5] mb-1">
                  Aperture (FNumber)
                </label>
                <select
                  value={options.fNumber ?? lens.defaultFNumber}
                  onChange={(e) =>
                    onChange({ ...options, fNumber: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-2 font-mono text-xs text-[#f3f5f9] focus:border-amber-500/60 focus:outline-none"
                >
                  {lens.aperturePresets.map((ap) => (
                    <option key={ap} value={ap}>
                      f/{ap}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[#9aa3b5] mb-1">
                  Shutter Speed
                </label>
                <select
                  value={options.shutterSpeed || "1/250"}
                  onChange={(e) =>
                    onChange({ ...options, shutterSpeed: e.target.value })
                  }
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-2 font-mono text-xs text-[#f3f5f9] focus:border-amber-500/60 focus:outline-none"
                >
                  {SHUTTER_SPEED_OPTIONS.map((ss) => (
                    <option key={ss} value={ss}>
                      {ss} sec
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[#9aa3b5] mb-1">
                  ISO Sensitivity
                </label>
                <select
                  value={options.iso ?? profile.baseIso}
                  onChange={(e) =>
                    onChange({ ...options, iso: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-2 font-mono text-xs text-[#f3f5f9] focus:border-amber-500/60 focus:outline-none"
                >
                  {profile.isoPresets.map((isoVal) => (
                    <option key={isoVal} value={isoVal}>
                      ISO {isoVal}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Secondary Exposure Mode Row */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-[#646e82] mb-1">
                  Exp. Bias
                </label>
                <select
                  value={options.exposureBiasEv ?? 0}
                  onChange={(e) =>
                    onChange({
                      ...options,
                      exposureBiasEv: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2 py-1.5 font-mono text-xs text-[#f3f5f9] focus:outline-none"
                >
                  {[-1.0, -0.7, -0.3, 0, 0.3, 0.7, 1.0].map((ev) => (
                    <option key={ev} value={ev}>
                      {ev > 0 ? `+${ev}` : ev} EV
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-[#646e82] mb-1">
                  White Bal.
                </label>
                <select
                  value={options.whiteBalance ?? 0}
                  onChange={(e) =>
                    onChange({
                      ...options,
                      whiteBalance: Number(e.target.value) as 0 | 1,
                    })
                  }
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2 py-1.5 text-xs text-[#f3f5f9] focus:outline-none"
                >
                  <option value={0}>Auto WB</option>
                  <option value={1}>Manual</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-[#646e82] mb-1">
                  Flash State
                </label>
                <select
                  value={options.flash ?? 16}
                  onChange={(e) =>
                    onChange({
                      ...options,
                      flash: Number(e.target.value) as 0 | 16 | 9,
                    })
                  }
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2 py-1.5 text-xs text-[#f3f5f9] focus:outline-none"
                >
                  <option value={16}>Off</option>
                  <option value={9}>Fired</option>
                  <option value={0}>None</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 3. COLLAPSIBLE: TIMESTAMP, SERIALS & ATTRIBUTION */}
      <div className="rounded-xl border border-[#232834] bg-[#111318] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTimestampSection((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#151821] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="font-display text-xs font-semibold text-[#f3f5f9]">
              RTC Timestamp, Serials &amp; Attribution
            </span>
          </div>
          {showTimestampSection ? (
            <ChevronUp className="h-4 w-4 text-[#646e82]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#646e82]" />
          )}
        </button>

        {showTimestampSection && (
          <div className="border-t border-[#232834] p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] text-[#9aa3b5] mb-1">
                  Capture Date &amp; Time (blank = smart recent)
                </label>
                <input
                  type="datetime-local"
                  value={options.captureTimestamp || ""}
                  onChange={(e) =>
                    onChange({ ...options, captureTimestamp: e.target.value })
                  }
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-1.5 font-mono text-xs text-[#f3f5f9] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9aa3b5] mb-1">
                  UTC Offset
                </label>
                <input
                  type="text"
                  value={options.timezoneOffset || "+00:00"}
                  onChange={(e) =>
                    onChange({ ...options, timezoneOffset: e.target.value })
                  }
                  placeholder="+06:00"
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-1.5 font-mono text-xs text-[#f3f5f9] focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-[#232834] bg-[#151821] px-3 py-2 cursor-pointer">
              <span className="text-xs text-[#f3f5f9]">
                Embed randomized hardware serial numbers
              </span>
              <input
                type="checkbox"
                checked={options.includeSerialNumbers !== false}
                onChange={(e) =>
                  onChange({
                    ...options,
                    includeSerialNumbers: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-amber-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-[#9aa3b5] mb-1">
                  Artist (Optional)
                </label>
                <input
                  type="text"
                  value={options.artist || ""}
                  onChange={(e) =>
                    onChange({ ...options, artist: e.target.value })
                  }
                  placeholder="Photographer name"
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-1.5 text-xs text-[#f3f5f9] placeholder:text-[#555e70] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9aa3b5] mb-1">
                  Copyright (Optional)
                </label>
                <input
                  type="text"
                  value={options.copyright || ""}
                  onChange={(e) =>
                    onChange({ ...options, copyright: e.target.value })
                  }
                  placeholder="© 2026 Studio"
                  className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-1.5 text-xs text-[#f3f5f9] placeholder:text-[#555e70] focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. COLLAPSIBLE: GPS GEOLOCATION IFD */}
      <div className="rounded-xl border border-[#232834] bg-[#111318] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLocationSection((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#151821] transition-colors"
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-amber-400" />
            <span className="font-display text-xs font-semibold text-[#f3f5f9]">
              GPS Geolocation IFD
            </span>
            <span className="rounded bg-[#1b202b] px-1.5 py-0.5 font-mono text-[10px] text-[#9aa3b5]">
              {options.gpsMode && options.gpsMode !== "none"
                ? "Active"
                : "Stripped"}
            </span>
          </div>
          {showLocationSection ? (
            <ChevronUp className="h-4 w-4 text-[#646e82]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#646e82]" />
          )}
        </button>

        {showLocationSection && (
          <div className="border-t border-[#232834] p-4 space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["none", "Strip GPS"],
                  ["preset", "City Preset"],
                  ["custom", "Custom Lat/Lng"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...options,
                      gpsMode: mode,
                      gpsPresetId:
                        mode === "preset"
                          ? options.gpsPresetId || GPS_PRESETS[0].id
                          : options.gpsPresetId,
                    })
                  }
                  className={`rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                    (options.gpsMode || "none") === mode
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                      : "border-[#232834] bg-[#161920] text-[#9aa3b5]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {options.gpsMode === "preset" && (
              <select
                value={options.gpsPresetId || GPS_PRESETS[0].id}
                onChange={(e) => {
                  const chosen = GPS_PRESETS.find(
                    (g) => g.id === e.target.value
                  );
                  onChange({
                    ...options,
                    gpsPresetId: e.target.value,
                    timezoneOffset:
                      chosen?.timezoneOffset || options.timezoneOffset,
                  });
                }}
                className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-3 py-2 text-xs text-[#f3f5f9] focus:outline-none"
              >
                {GPS_PRESETS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label} ({g.lat.toFixed(3)}°, {g.lng.toFixed(3)}°)
                  </option>
                ))}
              </select>
            )}

            {options.gpsMode === "custom" && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-[#9aa3b5] mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={options.customLat ?? 35.6595}
                    onChange={(e) =>
                      onChange({
                        ...options,
                        customLat: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2 py-1.5 font-mono text-xs text-[#f3f5f9]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#9aa3b5] mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={options.customLng ?? 139.7005}
                    onChange={(e) =>
                      onChange({
                        ...options,
                        customLng: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2 py-1.5 font-mono text-xs text-[#f3f5f9]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#9aa3b5] mb-1">
                    Alt (m)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={options.customAltitudeM ?? 24}
                    onChange={(e) =>
                      onChange({
                        ...options,
                        customAltitudeM: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2 py-1.5 font-mono text-xs text-[#f3f5f9]"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. SANITIZATION & OUTPUT PIPELINE */}
      <div className="rounded-xl border border-[#232834] bg-[#111318] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-amber-400" />
          <h2 className="font-display text-sm font-semibold text-[#f3f5f9]">
            Sanitization &amp; Output Pipeline
          </h2>
        </div>

        {!isVideo && (
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-[#9aa3b5] mb-1">
                Output Container
              </label>
              <select
                value={options.outputFormat || "jpeg"}
                onChange={(e) =>
                  onChange({
                    ...options,
                    outputFormat: e.target.value as TelemetryOptions["outputFormat"],
                  })
                }
                className="w-full rounded-lg border border-[#262b38] bg-[#0d0f14] px-2.5 py-2 text-xs text-[#f3f5f9] focus:outline-none"
              >
                <option value="jpeg">Camera .JPG (Recommended)</option>
                <option value="keep">Keep Original Format</option>
                <option value="png">Clean .PNG + eXIf</option>
                <option value="webp">Clean .WEBP + EXIF</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-[#9aa3b5] mb-1">
                <span>Encoder Quality</span>
                <span className="font-mono text-amber-300">
                  {options.jpegQuality ?? 96}%
                </span>
              </div>
              <input
                type="range"
                min={85}
                max={100}
                value={options.jpegQuality ?? 96}
                onChange={(e) =>
                  onChange({ ...options, jpegQuality: Number(e.target.value) })
                }
                className="w-full accent-amber-500 mt-1.5"
              />
            </div>
          </div>
        )}

        <label className="flex items-center justify-between rounded-lg border border-[#232834] bg-[#151821] px-3 py-2 cursor-pointer">
          <div>
            <div className="text-xs font-medium text-[#f3f5f9]">
              DCIM Camera Filename Convention
            </div>
            <div className="font-mono text-[10px] text-[#646e82]">
              e.g. {isVideo ? profile.videoPrefix : profile.imagePrefix}4821.
              {isVideo
                ? "MP4"
                : (options.outputFormat || "jpeg") === "jpeg"
                ? "JPG"
                : (options.outputFormat || "JPG").toUpperCase()}
            </div>
          </div>
          <input
            type="checkbox"
            checked={options.renameToCameraConvention !== false}
            onChange={(e) =>
              onChange({
                ...options,
                renameToCameraConvention: e.target.checked,
              })
            }
            className="h-4 w-4 accent-amber-500"
          />
        </label>

        {!isVideo && (
          <label className="flex items-center justify-between rounded-lg border border-[#232834] bg-[#151821] px-3 py-2 cursor-pointer">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#f3f5f9]">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                CMOS Optical Sensor Micro-Grain
              </div>
              <div className="text-[10px] text-[#646e82]">
                Adds subtle ISO luminance read noise (~1 LSB) to break synthetic
                flat gradients
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(options.addSensorGrain)}
              onChange={(e) =>
                onChange({ ...options, addSensorGrain: e.target.checked })
              }
              className="h-4 w-4 accent-amber-500"
            />
          </label>
        )}
      </div>

      {/* 6. PRIMARY EXECUTION BUTTONS */}
      <div className="space-y-2">
        <button
          type="button"
          disabled={!hasActiveFile || isProcessing}
          onClick={onProcessActive}
          className={`w-full rounded-xl py-3.5 px-4 font-display text-sm font-semibold transition-all ${
            !hasActiveFile || isProcessing
              ? "bg-[#1c202b] text-[#5c6579] cursor-not-allowed border border-[#252a38]"
              : "bg-amber-500 text-[#0a0b0e] hover:bg-amber-400 shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)] cursor-pointer"
          }`}
        >
          {isProcessing
            ? "Sanitizing Bitstream & Injecting Camera IFDs…"
            : "Purge AI Metadata & Inject Camera Telemetry"}
        </button>

        {queueCount > 1 && onProcessAll && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={onProcessAll}
            className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 py-2.5 px-4 font-display text-xs font-semibold text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            Batch Process All {queueCount} Files
            {unprocessedCount > 0 ? ` (${unprocessedCount} pending)` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
