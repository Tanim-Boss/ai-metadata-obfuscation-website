import { NextResponse } from "next/server";
import { sanitizeFileStream } from "@/lib/streaming-file";
import { detectSignatureFromName } from "@/lib/file-formats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilename(name: string): string {
  return Array.from(name.replace(/[\\/\r\n\0";]/g, "_")).slice(0, 240).join("") || "upload.bin";
}

function cleanedName(name: string): string {
  const safe = safeFilename(name);
  const dot = safe.lastIndexOf(".");
  return dot > 0 ? `${safe.slice(0, dot)}_clean${safe.slice(dot)}` : `${safe}_clean`;
}

function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function POST(request: Request) {
  if (!request.body) {
    return NextResponse.json({ error: "Please attach a file to process." }, { status: 400 });
  }

  try {
    const encodedName = request.headers.get("x-file-name") || "upload.bin";
    let decodedName = encodedName;
    try { decodedName = decodeURIComponent(encodedName); } catch { /* keep safe raw value */ }
    const filename = safeFilename(decodedName);
    const mimeType = request.headers.get("content-type") || "application/octet-stream";
    const signature = detectSignatureFromName(filename, mimeType);
    return new Response(sanitizeFileStream(request.body), {
      status: 200,
      headers: {
        "Content-Type": signature.mimeType || "application/octet-stream",
        "Content-Disposition": contentDisposition(cleanedName(filename)), 
        "X-File-Name": encodeURIComponent(cleanedName(filename)),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "File sanitization failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
