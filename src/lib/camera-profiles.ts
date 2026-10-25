export type CameraCategory =
  | "full-frame"
  | "compact-aps-c"
  | "medium-format"
  | "smartphone";

export interface LensSpec {
  id: string;
  label: string;
  lensMake: string;
  lensModel: string;
  minFocalMm: number;
  maxFocalMm: number;
  minFNumberAtMin: number;
  minFNumberAtMax: number;
  defaultFocalMm: number;
  defaultFNumber: number;
  focalPresets: number[];
  aperturePresets: number[];
  serialPrefix: string;
}

export interface CameraProfile {
  id: string;
  label: string;
  shortName: string;
  category: CameraCategory;
  categoryLabel: string;
  sensorBadge: string;
  make: string; // Exact manufacturer EXIF Make casing
  model: string; // Exact manufacturer EXIF Model string
  software: string; // Authentic firmware string
  sensorWidthMm: number;
  sensorHeightMm: number;
  cropFactor: number;
  dpi: number;
  ycbcrPositioning: 1 | 2;
  baseIso: number;
  isoPresets: number[];
  shutterPresets: string[]; // e.g. ["1/4000", "1/2000", ...]
  serialPrefix: string;
  serialDigits: number;
  imagePrefix: string; // e.g. "IMG_", "DSC0", "DSC_", "DSCF", "L100"
  videoPrefix: string; // e.g. "MVI_", "C", "DSC_", "IMG_"
  videoHandlerName: string;
  audioHandlerName: string;
  lenses: LensSpec[];
}

export interface GpsPreset {
  id: string;
  label: string;
  country: string;
  lat: number;
  lng: number;
  altitudeM: number;
  timezoneOffset: string;
}

export interface TelemetryOptions {
  profileId: string;
  lensId?: string;
  focalLengthMm?: number;
  fNumber?: number;
  shutterSpeed?: string; // e.g. "1/250" or "0.004"
  iso?: number;
  exposureBiasEv?: number;
  exposureProgram?: number; // 1=Manual, 2=Normal, 3=Aperture Priority, 4=Shutter Priority
  meteringMode?: number; // 5=Pattern/Matrix, 2=CenterWeighted, 3=Spot
  whiteBalance?: 0 | 1; // 0=Auto, 1=Manual
  flash?: 0 | 16 | 9; // 16=Off did not fire, 0=No flash, 9=Fired
  captureTimestamp?: string; // ISO string or "YYYY-MM-DDTHH:mm:ss"
  timezoneOffset?: string; // e.g. "+00:00", "+06:00", "-04:00"
  includeSerialNumbers?: boolean;
  customBodySerial?: string;
  customLensSerial?: string;
  artist?: string;
  copyright?: string;
  gpsMode?: "none" | "preset" | "custom";
  gpsPresetId?: string;
  customLat?: number;
  customLng?: number;
  customAltitudeM?: number;
  outputFormat?: "jpeg" | "keep" | "png" | "webp";
  jpegQuality?: number;
  renameToCameraConvention?: boolean;
  addSensorGrain?: boolean;
}

export const SHUTTER_SPEED_OPTIONS = [
  "1/8000",
  "1/4000",
  "1/2000",
  "1/1600",
  "1/1000",
  "1/800",
  "1/640",
  "1/500",
  "1/400",
  "1/320",
  "1/250",
  "1/200",
  "1/160",
  "1/125",
  "1/100",
  "1/80",
  "1/60",
  "1/50",
  "1/30",
  "1/15",
];

export const GPS_PRESETS: GpsPreset[] = [
  {
    id: "tokyo-shibuya",
    label: "Tokyo · Shibuya Crossing",
    country: "JP",
    lat: 35.659482,
    lng: 139.70056,
    altitudeM: 34.2,
    timezoneOffset: "+09:00",
  },
  {
    id: "nyc-soho",
    label: "New York · SoHo District",
    country: "US",
    lat: 40.723301,
    lng: -74.002988,
    altitudeM: 12.8,
    timezoneOffset: "-04:00",
  },
  {
    id: "paris-marais",
    label: "Paris · Le Marais",
    country: "FR",
    lat: 48.857548,
    lng: 2.361112,
    altitudeM: 38.5,
    timezoneOffset: "+02:00",
  },
  {
    id: "london-soho",
    label: "London · Westminster",
    country: "GB",
    lat: 51.513614,
    lng: -0.136549,
    altitudeM: 24.1,
    timezoneOffset: "+01:00",
  },
  {
    id: "dhaka-gulshan",
    label: "Dhaka · Gulshan Lake",
    country: "BD",
    lat: 23.792496,
    lng: 90.415482,
    altitudeM: 11.4,
    timezoneOffset: "+06:00",
  },
  {
    id: "zurich-altstadt",
    label: "Zurich · Limmatquai",
    country: "CH",
    lat: 47.37174,
    lng: 8.54226,
    altitudeM: 408.6,
    timezoneOffset: "+02:00",
  },
  {
    id: "sf-embarcadero",
    label: "San Francisco · Embarcadero",
    country: "US",
    lat: 37.79549,
    lng: -122.39352,
    altitudeM: 6.3,
    timezoneOffset: "-07:00",
  },
  {
    id: "reykjavik-harpa",
    label: "Reykjavik · Old Harbour",
    country: "IS",
    lat: 64.15035,
    lng: -21.93259,
    altitudeM: 8.9,
    timezoneOffset: "+00:00",
  },
];

export const CAMERA_PROFILES: CameraProfile[] = [
  {
    id: "canon-r5m2",
    label: "Canon EOS R5 Mark II",
    shortName: "EOS R5 II",
    category: "full-frame",
    categoryLabel: "Full-Frame Mirrorless",
    sensorBadge: "FF · 45MP BSI",
    make: "Canon",
    model: "Canon EOS R5m2",
    software: "Firmware Version 1.0.2",
    sensorWidthMm: 36.0,
    sensorHeightMm: 24.0,
    cropFactor: 1.0,
    dpi: 300,
    ycbcrPositioning: 2,
    baseIso: 100,
    isoPresets: [100, 125, 160, 200, 320, 400, 640, 800, 1600, 3200],
    shutterPresets: ["1/2000", "1/1000", "1/500", "1/320", "1/250", "1/160", "1/125", "1/80"],
    serialPrefix: "04202",
    serialDigits: 7,
    imagePrefix: "IMG_",
    videoPrefix: "MVI_",
    videoHandlerName: "Canon MP4 Video Handler",
    audioHandlerName: "Canon MP4 Audio Handler",
    lenses: [
      {
        id: "canon-rf-24-70-f28",
        label: "RF 24-70mm F2.8 L IS USM",
        lensMake: "Canon",
        lensModel: "RF24-70mm F2.8 L IS USM",
        minFocalMm: 24,
        maxFocalMm: 70,
        minFNumberAtMin: 2.8,
        minFNumberAtMax: 2.8,
        defaultFocalMm: 35,
        defaultFNumber: 2.8,
        focalPresets: [24, 28, 35, 50, 70],
        aperturePresets: [2.8, 3.2, 4.0, 5.6, 8.0, 11],
        serialPrefix: "914500",
      },
      {
        id: "canon-rf-50-f12",
        label: "RF 50mm F1.2 L USM",
        lensMake: "Canon",
        lensModel: "RF50mm F1.2 L USM",
        minFocalMm: 50,
        maxFocalMm: 50,
        minFNumberAtMin: 1.2,
        minFNumberAtMax: 1.2,
        defaultFocalMm: 50,
        defaultFNumber: 1.8,
        focalPresets: [50],
        aperturePresets: [1.2, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
        serialPrefix: "782200",
      },
      {
        id: "canon-rf-85-f12",
        label: "RF 85mm F1.2 L USM",
        lensMake: "Canon",
        lensModel: "RF85mm F1.2 L USM",
        minFocalMm: 85,
        maxFocalMm: 85,
        minFNumberAtMin: 1.2,
        minFNumberAtMax: 1.2,
        defaultFocalMm: 85,
        defaultFNumber: 1.8,
        focalPresets: [85],
        aperturePresets: [1.2, 1.4, 1.8, 2.2, 2.8, 4.0, 5.6],
        serialPrefix: "831000",
      },
    ],
  },
  {
    id: "sony-a7rv",
    label: "Sony Alpha 7R V",
    shortName: "α7R V",
    category: "full-frame",
    categoryLabel: "Full-Frame Mirrorless",
    sensorBadge: "FF · 61MP Exmor R",
    make: "SONY",
    model: "ILCE-7RM5",
    software: "ILCE-7RM5 v2.02",
    sensorWidthMm: 35.7,
    sensorHeightMm: 23.8,
    cropFactor: 1.0,
    dpi: 350,
    ycbcrPositioning: 2,
    baseIso: 100,
    isoPresets: [100, 125, 160, 200, 250, 400, 640, 800, 1600, 3200],
    shutterPresets: ["1/2000", "1/1000", "1/640", "1/500", "1/320", "1/250", "1/160", "1/125"],
    serialPrefix: "338",
    serialDigits: 4,
    imagePrefix: "DSC0",
    videoPrefix: "C",
    videoHandlerName: "Video Media Handler",
    audioHandlerName: "Sound Media Handler",
    lenses: [
      {
        id: "sony-fe-24-70-gm2",
        label: "FE 24-70mm F2.8 GM II",
        lensMake: "SONY",
        lensModel: "FE 24-70mm F2.8 GM II",
        minFocalMm: 24,
        maxFocalMm: 70,
        minFNumberAtMin: 2.8,
        minFNumberAtMax: 2.8,
        defaultFocalMm: 35,
        defaultFNumber: 2.8,
        focalPresets: [24, 28, 35, 50, 70],
        aperturePresets: [2.8, 3.5, 4.0, 5.6, 8.0, 11],
        serialPrefix: "1842",
      },
      {
        id: "sony-fe-35-gm",
        label: "FE 35mm F1.4 GM",
        lensMake: "SONY",
        lensModel: "FE 35mm F1.4 GM",
        minFocalMm: 35,
        maxFocalMm: 35,
        minFNumberAtMin: 1.4,
        minFNumberAtMax: 1.4,
        defaultFocalMm: 35,
        defaultFNumber: 2.0,
        focalPresets: [35],
        aperturePresets: [1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0],
        serialPrefix: "1991",
      },
      {
        id: "sony-fe-50-gm",
        label: "FE 50mm F1.2 GM",
        lensMake: "SONY",
        lensModel: "FE 50mm F1.2 GM",
        minFocalMm: 50,
        maxFocalMm: 50,
        minFNumberAtMin: 1.2,
        minFNumberAtMax: 1.2,
        defaultFocalMm: 50,
        defaultFNumber: 1.8,
        focalPresets: [50],
        aperturePresets: [1.2, 1.4, 1.8, 2.2, 2.8, 4.0, 5.6],
        serialPrefix: "2034",
      },
    ],
  },
  {
    id: "nikon-z8",
    label: "Nikon Z 8",
    shortName: "Nikon Z8",
    category: "full-frame",
    categoryLabel: "Full-Frame Mirrorless",
    sensorBadge: "FF · 45.7MP Stacked",
    make: "NIKON CORPORATION",
    model: "NIKON Z 8",
    software: "Ver.02.01",
    sensorWidthMm: 35.9,
    sensorHeightMm: 23.9,
    cropFactor: 1.0,
    dpi: 300,
    ycbcrPositioning: 2,
    baseIso: 64,
    isoPresets: [64, 80, 100, 160, 200, 400, 500, 800, 1600, 3200],
    shutterPresets: ["1/4000", "1/2000", "1/1000", "1/500", "1/320", "1/250", "1/125"],
    serialPrefix: "301",
    serialDigits: 4,
    imagePrefix: "DSC_",
    videoPrefix: "DSC_",
    videoHandlerName: "Nikon Video Media Handler",
    audioHandlerName: "Nikon Sound Media Handler",
    lenses: [
      {
        id: "nikkor-z-24-70-s",
        label: "NIKKOR Z 24-70mm f/2.8 S",
        lensMake: "NIKON",
        lensModel: "NIKKOR Z 24-70mm f/2.8 S",
        minFocalMm: 24,
        maxFocalMm: 70,
        minFNumberAtMin: 2.8,
        minFNumberAtMax: 2.8,
        defaultFocalMm: 50,
        defaultFNumber: 2.8,
        focalPresets: [24, 28, 35, 50, 70],
        aperturePresets: [2.8, 3.5, 4.0, 5.6, 8.0, 11],
        serialPrefix: "2008",
      },
      {
        id: "nikkor-z-50-f12",
        label: "NIKKOR Z 50mm f/1.2 S",
        lensMake: "NIKON",
        lensModel: "NIKKOR Z 50mm f/1.2 S",
        minFocalMm: 50,
        maxFocalMm: 50,
        minFNumberAtMin: 1.2,
        minFNumberAtMax: 1.2,
        defaultFocalMm: 50,
        defaultFNumber: 1.8,
        focalPresets: [50],
        aperturePresets: [1.2, 1.4, 1.8, 2.2, 2.8, 4.0, 5.6],
        serialPrefix: "2019",
      },
    ],
  },
  {
    id: "fujifilm-x100vi",
    label: "Fujifilm X100VI",
    shortName: "X100VI",
    category: "compact-aps-c",
    categoryLabel: "APS-C Rangefinder",
    sensorBadge: "APS-C · 40.2MP X-Trans",
    make: "FUJIFILM",
    model: "X100VI",
    software: "Digital Camera X100VI Ver1.11",
    sensorWidthMm: 23.5,
    sensorHeightMm: 15.7,
    cropFactor: 1.53,
    dpi: 72,
    ycbcrPositioning: 2,
    baseIso: 125,
    isoPresets: [125, 160, 200, 320, 400, 640, 800, 1250, 1600, 3200],
    shutterPresets: ["1/4000", "1/2000", "1/1000", "1/500", "1/250", "1/125", "1/60"],
    serialPrefix: "4A0",
    serialDigits: 5,
    imagePrefix: "DSCF",
    videoPrefix: "DSCF",
    videoHandlerName: "FUJIFILM Video Handler",
    audioHandlerName: "FUJIFILM Audio Handler",
    lenses: [
      {
        id: "fuji-23mm-f2",
        label: "Fujinon 23mm F2 II (35mm Equiv.)",
        lensMake: "FUJIFILM",
        lensModel: "FUJINONシングル焦点レンズ 23mm F2",
        minFocalMm: 23,
        maxFocalMm: 23,
        minFNumberAtMin: 2.0,
        minFNumberAtMax: 2.0,
        defaultFocalMm: 23,
        defaultFNumber: 2.8,
        focalPresets: [23],
        aperturePresets: [2.0, 2.8, 4.0, 5.6, 8.0, 11],
        serialPrefix: "41A0",
      },
    ],
  },
  {
    id: "leica-q3",
    label: "Leica Q3",
    shortName: "Leica Q3",
    category: "full-frame",
    categoryLabel: "Full-Frame Compact",
    sensorBadge: "FF · 60MP Maestro IV",
    make: "Leica Camera AG",
    model: "LEICA Q3",
    software: "2.0.1",
    sensorWidthMm: 36.0,
    sensorHeightMm: 24.0,
    cropFactor: 1.0,
    dpi: 300,
    ycbcrPositioning: 2,
    baseIso: 100,
    isoPresets: [50, 100, 200, 400, 800, 1600, 3200],
    shutterPresets: ["1/2000", "1/1000", "1/500", "1/250", "1/125", "1/60"],
    serialPrefix: "584",
    serialDigits: 4,
    imagePrefix: "L100",
    videoPrefix: "L100",
    videoHandlerName: "Leica Video Media Handler",
    audioHandlerName: "Leica Sound Media Handler",
    lenses: [
      {
        id: "leica-summilux-28",
        label: "Summilux 28mm f/1.7 ASPH.",
        lensMake: "Leica Camera AG",
        lensModel: "SUMMILUX 1:1.7/28 ASPH.",
        minFocalMm: 28,
        maxFocalMm: 28,
        minFNumberAtMin: 1.7,
        minFNumberAtMax: 1.7,
        defaultFocalMm: 28,
        defaultFNumber: 2.0,
        focalPresets: [28],
        aperturePresets: [1.7, 2.0, 2.8, 4.0, 5.6, 8.0, 11],
        serialPrefix: "4920",
      },
    ],
  },
  {
    id: "iphone-16-pro",
    label: "Apple iPhone 16 Pro",
    shortName: "iPhone 16 Pro",
    category: "smartphone",
    categoryLabel: "Flagship Smartphone",
    sensorBadge: "48MP Fusion · iOS 18",
    make: "Apple",
    model: "iPhone 16 Pro",
    software: "18.1",
    sensorWidthMm: 9.8,
    sensorHeightMm: 7.3,
    cropFactor: 3.55,
    dpi: 72,
    ycbcrPositioning: 1,
    baseIso: 64,
    isoPresets: [50, 64, 80, 100, 125, 160, 250, 400, 640, 1000],
    shutterPresets: ["1/2000", "1/1000", "1/500", "1/250", "1/125", "1/60", "1/30"],
    serialPrefix: "F17M",
    serialDigits: 6,
    imagePrefix: "IMG_",
    videoPrefix: "IMG_",
    videoHandlerName: "Core Media Video",
    audioHandlerName: "Core Media Audio",
    lenses: [
      {
        id: "iphone-16p-main-24mm",
        label: "Main Fusion 24mm f/1.78",
        lensMake: "Apple",
        lensModel: "iPhone 16 Pro back triple camera 6.765mm f/1.78",
        minFocalMm: 6.765,
        maxFocalMm: 6.765,
        minFNumberAtMin: 1.78,
        minFNumberAtMax: 1.78,
        defaultFocalMm: 6.765,
        defaultFNumber: 1.78,
        focalPresets: [6.765],
        aperturePresets: [1.78],
        serialPrefix: "AP24",
      },
      {
        id: "iphone-16p-tele-120mm",
        label: "Tetraprism 5x 120mm f/2.8",
        lensMake: "Apple",
        lensModel: "iPhone 16 Pro back triple camera 15.66mm f/2.8",
        minFocalMm: 15.66,
        maxFocalMm: 15.66,
        minFNumberAtMin: 2.8,
        minFNumberAtMax: 2.8,
        defaultFocalMm: 15.66,
        defaultFNumber: 2.8,
        focalPresets: [15.66],
        aperturePresets: [2.8],
        serialPrefix: "AP120",
      },
      {
        id: "iphone-16p-uw-13mm",
        label: "Ultra Wide 13mm f/2.2",
        lensMake: "Apple",
        lensModel: "iPhone 16 Pro back triple camera 2.22mm f/2.2",
        minFocalMm: 2.22,
        maxFocalMm: 2.22,
        minFNumberAtMin: 2.2,
        minFNumberAtMax: 2.2,
        defaultFocalMm: 2.22,
        defaultFNumber: 2.2,
        focalPresets: [2.22],
        aperturePresets: [2.2],
        serialPrefix: "AP13",
      },
    ],
  },
  {
    id: "samsung-s24-ultra",
    label: "Samsung Galaxy S24 Ultra",
    shortName: "S24 Ultra",
    category: "smartphone",
    categoryLabel: "Flagship Smartphone",
    sensorBadge: "200MP ISOCELL HP2",
    make: "samsung",
    model: "SM-S928B",
    software: "S928BXXU3AXH7",
    sensorWidthMm: 9.6,
    sensorHeightMm: 7.2,
    cropFactor: 3.65,
    dpi: 72,
    ycbcrPositioning: 1,
    baseIso: 50,
    isoPresets: [50, 64, 100, 125, 200, 320, 500, 800],
    shutterPresets: ["1/2000", "1/1000", "1/500", "1/250", "1/125", "1/60", "1/30"],
    serialPrefix: "R5CX",
    serialDigits: 6,
    imagePrefix: "SAM_",
    videoPrefix: "SAM_",
    videoHandlerName: "VideoHandle",
    audioHandlerName: "SoundHandle",
    lenses: [
      {
        id: "s24u-main-23mm",
        label: "Wide 23mm f/1.7 OIS",
        lensMake: "samsung",
        lensModel: "Samsung S24 Ultra Rear Wide 6.3mm f/1.7",
        minFocalMm: 6.3,
        maxFocalMm: 6.3,
        minFNumberAtMin: 1.7,
        minFNumberAtMax: 1.7,
        defaultFocalMm: 6.3,
        defaultFNumber: 1.7,
        focalPresets: [6.3],
        aperturePresets: [1.7],
        serialPrefix: "SM23",
      },
    ],
  },
  {
    id: "hasselblad-x2d",
    label: "Hasselblad X2D 100C",
    shortName: "X2D 100C",
    category: "medium-format",
    categoryLabel: "Medium Format",
    sensorBadge: "MF · 100MP 16-Bit",
    make: "Hasselblad",
    model: "X2D 100C",
    software: "3.1.0",
    sensorWidthMm: 43.8,
    sensorHeightMm: 32.9,
    cropFactor: 0.79,
    dpi: 300,
    ycbcrPositioning: 2,
    baseIso: 64,
    isoPresets: [64, 100, 200, 400, 800, 1600, 3200],
    shutterPresets: ["1/2000", "1/1000", "1/500", "1/250", "1/125", "1/60"],
    serialPrefix: "JT23",
    serialDigits: 5,
    imagePrefix: "B000",
    videoPrefix: "B000",
    videoHandlerName: "Video Media Handler",
    audioHandlerName: "Sound Media Handler",
    lenses: [
      {
        id: "hasselblad-xcd-55v",
        label: "XCD 2,5/55V (43mm Equiv.)",
        lensMake: "Hasselblad",
        lensModel: "XCD 55V",
        minFocalMm: 55,
        maxFocalMm: 55,
        minFNumberAtMin: 2.5,
        minFNumberAtMax: 2.5,
        defaultFocalMm: 55,
        defaultFNumber: 2.8,
        focalPresets: [55],
        aperturePresets: [2.5, 2.8, 4.0, 5.6, 8.0, 11],
        serialPrefix: "9U02",
      },
      {
        id: "hasselblad-xcd-38v",
        label: "XCD 2,5/38V (30mm Equiv.)",
        lensMake: "Hasselblad",
        lensModel: "XCD 38V",
        minFocalMm: 38,
        maxFocalMm: 38,
        minFNumberAtMin: 2.5,
        minFNumberAtMax: 2.5,
        defaultFocalMm: 38,
        defaultFNumber: 2.8,
        focalPresets: [38],
        aperturePresets: [2.5, 2.8, 4.0, 5.6, 8.0, 11],
        serialPrefix: "9T01",
      },
    ],
  },
  {
    id: "ricoh-griii-x",
    label: "Ricoh GR IIIx",
    shortName: "GR IIIx",
    category: "compact-aps-c",
    categoryLabel: "APS-C Street Compact",
    sensorBadge: "APS-C · 24.2MP GR Engine",
    make: "RICOH IMAGING COMPANY, LTD.",
    model: "RICOH GR IIIx",
    software: "GR IIIx Ver 1.41",
    sensorWidthMm: 23.5,
    sensorHeightMm: 15.6,
    cropFactor: 1.53,
    dpi: 300,
    ycbcrPositioning: 2,
    baseIso: 100,
    isoPresets: [100, 160, 200, 400, 800, 1600, 3200],
    shutterPresets: ["1/2500", "1/1000", "1/500", "1/250", "1/125", "1/60"],
    serialPrefix: "0014",
    serialDigits: 4,
    imagePrefix: "R000",
    videoPrefix: "R000",
    videoHandlerName: "RICOH Video Handler",
    audioHandlerName: "RICOH Sound Handler",
    lenses: [
      {
        id: "ricoh-gr-26mm",
        label: "GR Lens 26.1mm F2.8 (40mm Equiv.)",
        lensMake: "RICOH",
        lensModel: "GR LENS 26.1mm F2.8",
        minFocalMm: 26.1,
        maxFocalMm: 26.1,
        minFNumberAtMin: 2.8,
        minFNumberAtMax: 2.8,
        defaultFocalMm: 26.1,
        defaultFNumber: 2.8,
        focalPresets: [26.1],
        aperturePresets: [2.8, 4.0, 5.6, 8.0, 11],
        serialPrefix: "GR40",
      },
    ],
  },
];

// Also support legacy short IDs ("canon", "nikon", "sony") gracefully
const LEGACY_PROFILE_ALIASES: Record<string, string> = {
  canon: "canon-r5m2",
  sony: "sony-a7rv",
  nikon: "nikon-z8",
  fujifilm: "fujifilm-x100vi",
  leica: "leica-q3",
  iphone: "iphone-16-pro",
  samsung: "samsung-s24-ultra",
  hasselblad: "hasselblad-x2d",
  ricoh: "ricoh-griii-x",
};

export function getCameraProfile(profileId?: string): CameraProfile {
  if (!profileId) return CAMERA_PROFILES[0];
  const mappedId = LEGACY_PROFILE_ALIASES[profileId] || profileId;
  return (
    CAMERA_PROFILES.find((p) => p.id === mappedId) ?? CAMERA_PROFILES[0]
  );
}

export function getLensForProfile(
  profile: CameraProfile,
  lensId?: string
): LensSpec {
  if (!lensId) return profile.lenses[0];
  return profile.lenses.find((l) => l.id === lensId) ?? profile.lenses[0];
}

export function parseShutterSpeed(shutter: string): [number, number] {
  const trimmed = shutter.trim();
  if (trimmed.includes("/")) {
    const [numStr, denStr] = trimmed.split("/");
    const num = Math.max(1, Math.round(Number(numStr) || 1));
    const den = Math.max(1, Math.round(Number(denStr) || 250));
    return [num, den];
  }
  const val = Number(trimmed);
  if (!Number.isFinite(val) || val <= 0) return [1, 250];
  if (val >= 1) return [Math.round(val * 10), 10];
  return [1, Math.max(1, Math.round(1 / val))];
}

/**
 * APEX ShutterSpeedValue = -log2(exposure_time_seconds)
 * Returned as signed rational [num, 1000]
 */
export function exposureTimeToApex(num: number, den: number): [number, number] {
  const seconds = num / den;
  const apex = -Math.log2(seconds);
  return [Math.round(apex * 1000), 1000];
}

/**
 * APEX ApertureValue = 2 * log2(FNumber)
 * Returned as unsigned rational [num, 1000]
 */
export function fNumberToApex(fNumber: number): [number, number] {
  const apex = 2 * Math.log2(Math.max(0.7, fNumber));
  return [Math.max(0, Math.round(apex * 1000)), 1000];
}

export function floatToRational(
  value: number,
  precision = 1000
): [number, number] {
  if (Number.isInteger(value)) return [value, 1];
  const rounded10 = Math.round(value * 10) / 10;
  if (Math.abs(rounded10 - value) < 1e-6) {
    return [Math.round(value * 10), 10];
  }
  return [Math.round(value * precision), precision];
}

export function compute35mmEquivalent(
  focalMm: number,
  profile: CameraProfile
): number {
  // Handle smartphone special focal mappings accurately
  if (profile.id === "iphone-16-pro") {
    if (Math.abs(focalMm - 6.765) < 0.1) return 24;
    if (Math.abs(focalMm - 15.66) < 0.2) return 120;
    if (Math.abs(focalMm - 2.22) < 0.1) return 13;
  }
  if (profile.id === "samsung-s24-ultra" && Math.abs(focalMm - 6.3) < 0.1) {
    return 23;
  }
  return Math.round(focalMm * profile.cropFactor);
}

export function generateSerialNumber(prefix: string, digits = 6): string {
  let suffix = "";
  for (let i = 0; i < digits; i++) {
    suffix += Math.floor(Math.random() * 10).toString();
  }
  return `${prefix}${suffix}`;
}

export function generateCameraFilename(
  profile: CameraProfile,
  ext: string,
  isVideo = false,
  captureDate = new Date()
): string {
  const cleanExt = ext.replace(/^\./, "");
  const frameNum = Math.floor(1040 + Math.random() * 8850)
    .toString()
    .padStart(4, "0");

  if (profile.id === "samsung-s24-ultra") {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const stamp = `${captureDate.getFullYear()}${pad(
      captureDate.getMonth() + 1
    )}${pad(captureDate.getDate())}_${pad(captureDate.getHours())}${pad(
      captureDate.getMinutes()
    )}${pad(captureDate.getSeconds())}`;
    return `${stamp}.${cleanExt.toLowerCase()}`;
  }

  const prefix = isVideo ? profile.videoPrefix : profile.imagePrefix;
  const formattedExt =
    cleanExt.toLowerCase() === "jpeg" ? "JPG" : cleanExt.toUpperCase();
  return `${prefix}${frameNum}.${formattedExt}`;
}

export function formatExifDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getUTCFullYear()}:${pad(date.getUTCMonth() + 1)}:${pad(
    date.getUTCDate()
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
    date.getUTCSeconds()
  )}`;
}
