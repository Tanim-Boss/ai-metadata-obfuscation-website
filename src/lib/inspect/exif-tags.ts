/**
 * Real EXIF / TIFF tag ids (hex) mapped to their official names.
 * These ids come straight from the TIFF 6.0, EXIF 2.32 and GPS IFD specs, so
 * the inspector can show the true `0x????` id for every tag it reads.
 */

export const IFD_TAG_NAMES: Record<number, string> = {
  0x000b: "ProcessingSoftware",
  0x00fe: "SubfileType",
  0x00ff: "OldSubfileType",
  0x0100: "ImageWidth",
  0x0101: "ImageHeight",
  0x0102: "BitsPerSample",
  0x0103: "Compression",
  0x0106: "PhotometricInterpretation",
  0x0107: "Thresholding",
  0x0108: "CellWidth",
  0x0109: "CellLength",
  0x010a: "FillOrder",
  0x010d: "DocumentName",
  0x010e: "ImageDescription",
  0x010f: "Make",
  0x0110: "Model",
  0x0111: "StripOffsets",
  0x0112: "Orientation",
  0x0115: "SamplesPerPixel",
  0x0116: "RowsPerStrip",
  0x0117: "StripByteCounts",
  0x0118: "MinSampleValue",
  0x0119: "MaxSampleValue",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x011c: "PlanarConfiguration",
  0x011d: "PageName",
  0x011e: "XPosition",
  0x011f: "YPosition",
  0x0122: "GrayResponseUnit",
  0x0128: "ResolutionUnit",
  0x0129: "PageNumber",
  0x012d: "TransferFunction",
  0x0131: "Software",
  0x0132: "ModifyDate",
  0x013b: "Artist",
  0x013c: "HostComputer",
  0x013d: "Predictor",
  0x013e: "WhitePoint",
  0x013f: "PrimaryChromaticities",
  0x014a: "SubIFDs",
  0x0151: "TileWidth",
  0x0152: "TileLength",
  0x0153: "TileOffsets",
  0x0154: "TileByteCounts",
  0x0156: "TransferRange",
  0x0200: "JPEGProc",
  0x0201: "ThumbnailOffset",
  0x0202: "ThumbnailLength",
  0x0211: "YCbCrCoefficients",
  0x0212: "YCbCrSubSampling",
  0x0213: "YCbCrPositioning",
  0x0214: "ReferenceBlackWhite",
  0x02bc: "XMLPacket",
  0x4746: "Rating",
  0x4749: "RatingPercent",
  0x8298: "Copyright",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x830e: "PixelScale",
  0x83bb: "IPTC-NAA",
  0x8649: "PhotoshopSettings",
  0x8769: "ExifIFDPointer",
  0x8773: "ICCProfile",
  0x8822: "ExposureProgram",
  0x8824: "SpectralSensitivity",
  0x8825: "GPSInfoIFDPointer",
  0x8827: "ISO",
  0x8828: "OECF",
  0x8829: "Interlace",
  0x882a: "TimeZoneOffset",
  0x882b: "SelfTimerMode",
  0x8830: "SensitivityType",
  0x8831: "StandardOutputSensitivity",
  0x8832: "RecommendedExposureIndex",
  0x8833: "ISOSpeed",
  0x8834: "ISOSpeedLatitudeyyy",
  0x8835: "ISOSpeedLatitudezzz",
  0x9000: "ExifVersion",
  0x9003: "DateTimeOriginal",
  0x9004: "CreateDate",
  0x9005: "OffsetTime",
  0x9006: "OffsetTimeOriginal",
  0x9007: "OffsetTimeDigitized",
  0x9009: "GooglePlusUploadCode",
  0x9010: "OffsetTime",
  0x9011: "OffsetTimeOriginal",
  0x9012: "OffsetTimeDigitized",
  0x9101: "ComponentsConfiguration",
  0x9102: "CompressedBitsPerPixel",
  0x9201: "ShutterSpeedValue",
  0x9202: "ApertureValue",
  0x9203: "BrightnessValue",
  0x9204: "ExposureCompensation",
  0x9205: "MaxApertureValue",
  0x9206: "SubjectDistance",
  0x9207: "MeteringMode",
  0x9208: "LightSource",
  0x9209: "Flash",
  0x920a: "FocalLength",
  0x9211: "ImageNumber",
  0x9212: "SecurityClassification",
  0x9213: "ImageHistory",
  0x9214: "SubjectArea",
  0x927c: "MakerNote",
  0x9286: "UserComment",
  0x9290: "SubSecTime",
  0x9291: "SubSecTimeOriginal",
  0x9292: "SubSecTimeDigitized",
  0x9400: "Temperature",
  0x9401: "Humidity",
  0x9402: "Pressure",
  0x9403: "WaterDepth",
  0x9404: "Acceleration",
  0x9405: "CameraElevationAngle",
  0x9c9b: "XPTitle",
  0x9c9c: "XPComment",
  0x9c9d: "XPAuthor",
  0x9c9e: "XPKeywords",
  0x9c9f: "XPSubject",
  0xa000: "FlashpixVersion",
  0xa001: "ColorSpace",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0xa004: "RelatedSoundFile",
  0xa005: "InteropIFDPointer",
  0xa20b: "FlashEnergy",
  0xa20c: "SpatialFrequencyResponse",
  0xa20e: "FocalPlaneXResolution",
  0xa20f: "FocalPlaneYResolution",
  0xa210: "FocalPlaneResolutionUnit",
  0xa214: "SubjectLocation",
  0xa215: "ExposureIndex",
  0xa217: "SensingMethod",
  0xa300: "FileSource",
  0xa301: "SceneType",
  0xa302: "CFAPattern",
  0xa401: "CustomRendered",
  0xa402: "ExposureMode",
  0xa403: "WhiteBalance",
  0xa404: "DigitalZoomRatio",
  0xa405: "FocalLengthIn35mmFilm",
  0xa406: "SceneCaptureType",
  0xa407: "GainControl",
  0xa408: "Contrast",
  0xa409: "Saturation",
  0xa40a: "Sharpness",
  0xa40b: "DeviceSettingDescription",
  0xa40c: "SubjectDistanceRange",
  0xa420: "ImageUniqueID",
  0xa430: "CameraOwnerName",
  0xa431: "BodySerialNumber",
  0xa432: "LensSpecification",
  0xa433: "LensMake",
  0xa434: "LensModel",
  0xa435: "LensSerialNumber",
  0xa460: "CompositeImage",
  0xa461: "SourceImageNumberOfCompositeImage",
  0xa462: "SourceExposureTimesOfCompositeImage",
  0xa500: "Gamma",
  0xc4a5: "PrintIM",
  0xc612: "DNGVersion",
  0xc613: "DNGBackwardVersion",
  0xc614: "UniqueCameraModel",
  0xc615: "LocalizedCameraModel",
  0xc62f: "CameraSerialNumber",
  0xea1c: "Padding",
  0xea1d: "OffsetSchema",
};

export const GPS_TAG_NAMES: Record<number, string> = {
  0x0000: "GPSVersionID",
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
  0x0005: "GPSAltitudeRef",
  0x0006: "GPSAltitude",
  0x0007: "GPSTimeStamp",
  0x0008: "GPSSatellites",
  0x0009: "GPSStatus",
  0x000a: "GPSMeasureMode",
  0x000b: "GPSDOP",
  0x000c: "GPSSpeedRef",
  0x000d: "GPSSpeed",
  0x000e: "GPSTrackRef",
  0x000f: "GPSTrack",
  0x0010: "GPSImgDirectionRef",
  0x0011: "GPSImgDirection",
  0x0012: "GPSMapDatum",
  0x0013: "GPSDestLatitudeRef",
  0x0014: "GPSDestLatitude",
  0x0015: "GPSDestLongitudeRef",
  0x0016: "GPSDestLongitude",
  0x0017: "GPSDestBearingRef",
  0x0018: "GPSDestBearing",
  0x0019: "GPSDestDistanceRef",
  0x001a: "GPSDestDistance",
  0x001b: "GPSProcessingMethod",
  0x001c: "GPSAreaInformation",
  0x001d: "GPSDateStamp",
  0x001e: "GPSDifferential",
  0x001f: "GPSHPositioningError",
};

export const INTEROP_TAG_NAMES: Record<number, string> = {
  0x0001: "InteropIndex",
  0x0002: "InteropVersion",
  0x1000: "RelatedImageFileFormat",
  0x1001: "RelatedImageWidth",
  0x1002: "RelatedImageLength",
};

/** TIFF field types, index == type id. */
export const TIFF_TYPE_NAMES: Record<number, string> = {
  1: "BYTE",
  2: "ASCII",
  3: "SHORT",
  4: "LONG",
  5: "RATIONAL",
  6: "SBYTE",
  7: "UNDEFINED",
  8: "SSHORT",
  9: "SLONG",
  10: "SRATIONAL",
  11: "FLOAT",
  12: "DOUBLE",
  13: "IFD",
};

export const TIFF_TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  13: 4,
};

/** Tag ids that are part of the "optical fingerprint" of a real capture. */
export const CAMERA_CORE_TAGS = new Set<string>([
  "Make",
  "Model",
  "LensMake",
  "LensModel",
  "LensSpecification",
  "ExposureTime",
  "FNumber",
  "ISO",
  "ISOSpeedRatings",
  "FocalLength",
  "FocalLengthIn35mmFilm",
  "DateTimeOriginal",
  "ShutterSpeedValue",
  "ApertureValue",
  "ExposureProgram",
  "MeteringMode",
  "Flash",
  "WhiteBalance",
  "BodySerialNumber",
  "LensSerialNumber",
  "MakerNote",
  "FocalPlaneXResolution",
  "SensingMethod",
  "CameraOwnerName",
]);

export const ORIENTATION_NAMES: Record<number, string> = {
  1: "Horizontal (normal)",
  2: "Mirror horizontal",
  3: "Rotate 180",
  4: "Mirror vertical",
  5: "Mirror horizontal and rotate 270 CW",
  6: "Rotate 90 CW",
  7: "Mirror horizontal and rotate 90 CW",
  8: "Rotate 270 CW",
};

export const RESOLUTION_UNIT_NAMES: Record<number, string> = {
  1: "none",
  2: "inches",
  3: "cm",
};

export const EXPOSURE_PROGRAM_NAMES: Record<number, string> = {
  0: "Not defined",
  1: "Manual",
  2: "Program AE",
  3: "Aperture priority",
  4: "Shutter priority",
  5: "Creative program (biased toward depth of field)",
  6: "Action program (biased toward fast shutter speed)",
  7: "Portrait mode",
  8: "Landscape mode",
  9: "Bulb",
};

export const METERING_MODE_NAMES: Record<number, string> = {
  0: "Unknown",
  1: "Average",
  2: "Center-weighted average",
  3: "Spot",
  4: "Multi-spot",
  5: "Pattern",
  6: "Partial",
  255: "Other",
};

export const WHITE_BALANCE_NAMES: Record<number, string> = {
  0: "Auto",
  1: "Manual",
};

export const EXPOSURE_MODE_NAMES: Record<number, string> = {
  0: "Auto exposure",
  1: "Manual exposure",
  2: "Auto bracket",
};

export const SCENE_CAPTURE_NAMES: Record<number, string> = {
  0: "Standard",
  1: "Landscape",
  2: "Portrait",
  3: "Night scene",
};

export const COLOR_SPACE_NAMES: Record<number, string> = {
  1: "sRGB",
  2: "Adobe RGB",
  0xfffd: "Wide Gamut RGB",
  0xfffe: "ICC Profile",
  0xffff: "Uncalibrated",
};

export const SENSITIVITY_TYPE_NAMES: Record<number, string> = {
  0: "Unknown",
  1: "Standard output sensitivity",
  2: "Recommended exposure index",
  3: "ISO speed",
  4: "Standard output sensitivity and recommended exposure index",
  5: "Standard output sensitivity and ISO speed",
  6: "Recommended exposure index and ISO speed",
  7: "Standard output sensitivity, recommended exposure index and ISO speed",
};

export const SENSING_METHOD_NAMES: Record<number, string> = {
  1: "Not defined",
  2: "One-chip color area sensor",
  3: "Two-chip color area sensor",
  4: "Three-chip color area sensor",
  5: "Color sequential area sensor",
  7: "Trilinear sensor",
  8: "Color sequential linear sensor",
};

export const FILE_SOURCE_NAMES: Record<number, string> = {
  1: "Film scanner",
  2: "Reflection print scanner",
  3: "DSC (digital still camera)",
};

export const SCENE_TYPE_NAMES: Record<number, string> = {
  1: "Directly photographed",
};

export const CUSTOM_RENDERED_NAMES: Record<number, string> = {
  0: "Normal process",
  1: "Custom process",
};

export const GAIN_CONTROL_NAMES: Record<number, string> = {
  0: "None",
  1: "Low gain up",
  2: "High gain up",
  3: "Low gain down",
  4: "High gain down",
};

export const CONTRAST_NAMES: Record<number, string> = {
  0: "Normal",
  1: "Low",
  2: "High",
};

export const SATURATION_NAMES: Record<number, string> = {
  0: "Normal",
  1: "Low",
  2: "High",
};

export const SHARPNESS_NAMES: Record<number, string> = {
  0: "Normal",
  1: "Soft",
  2: "Hard",
};

export const SUBJECT_DISTANCE_RANGE_NAMES: Record<number, string> = {
  0: "Unknown",
  1: "Macro",
  2: "Close view",
  3: "Distant view",
};

export const LIGHT_SOURCE_NAMES: Record<number, string> = {
  0: "Unknown",
  1: "Daylight",
  2: "Fluorescent",
  3: "Tungsten (incandescent)",
  4: "Flash",
  9: "Fine weather",
  10: "Cloudy",
  11: "Shade",
  12: "Daylight fluorescent",
  13: "Day white fluorescent",
  14: "Cool white fluorescent",
  15: "White fluorescent",
  17: "Standard light A",
  18: "Standard light B",
  19: "Standard light C",
  20: "D55",
  21: "D65",
  22: "D75",
  23: "D50",
  24: "ISO studio tungsten",
  255: "Other",
};

export function decodeFlash(value: number): string {
  const fired = value & 0x01 ? "Flash fired" : "Flash did not fire";
  const mode = (value >> 3) & 0x03;
  const modeText =
    mode === 0
      ? ""
      : mode === 1
      ? ", compulsory flash mode"
      : mode === 2
      ? ", compulsory suppression"
      : ", auto mode";
  const returnLight = (value >> 1) & 0x03;
  const returnText =
    returnLight === 1 ? ", return light detected" : returnLight === 2 ? ", return light not detected" : "";
  const redEye = value & 0x40 ? ", red-eye reduction" : "";
  return `${fired}${modeText}${returnText}${redEye}`;
}

export const INTEROP_INDEX_NAMES: Record<string, string> = {
  R98: "R98 — conforming to EXIF 2.1 (sRGB)",
  R03: "R03 — DCF basic file",
  THM: "THM — DCF thumbnail file",
};
