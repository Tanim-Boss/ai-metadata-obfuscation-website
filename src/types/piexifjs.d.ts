declare module "piexifjs" {
  export type ExifTagMap = Record<number, unknown>;

  export interface ExifData {
    "0th"?: ExifTagMap;
    Exif?: ExifTagMap;
    GPS?: ExifTagMap;
    Interop?: ExifTagMap;
    "1st"?: ExifTagMap;
    thumbnail?: string | null;
  }

  export const ImageIFD: Record<string, number>;
  export const ExifIFD: Record<string, number>;
  export const GPSIFD: Record<string, number>;
  export const InteropIFD: Record<string, number>;
  export const TAGS: {
    Image: Record<number, { name: string; type: string }>;
    Exif: Record<number, { name: string; type: string }>;
    GPS: Record<number, { name: string; type: string }>;
    Interop: Record<number, { name: string; type: string }>;
  };
  export const GPSHelper: {
    degToDmsRational(degFloat: number): Array<[number, number]>;
    dmsRationalToDeg(dmsArray: Array<[number, number]>, ref: string): number;
  };

  export function dump(exifObj: ExifData): string;
  export function load(exifBytes: string): ExifData;
  export function remove(jpegData: string): string;
  export function insert(exifBytes: string, jpegData: string): string;
}
