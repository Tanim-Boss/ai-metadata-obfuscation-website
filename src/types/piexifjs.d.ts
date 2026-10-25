declare module "piexifjs" {
  export function dump(exifObj: any): string;
  export function load(exifBytes: string | Uint8Array): any;
  export function remove(exifBytes: string | Uint8Array): string;
  export function insert(exifBytes: string | Uint8Array, jpegBytes: string | Uint8Array): string;
}
