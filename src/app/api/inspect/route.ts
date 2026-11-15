import { NextResponse } from "next/server";
import { inspectFileStream } from "@/lib/streaming-file";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!request.body) {
    return NextResponse.json({ error: "Please attach a file to inspect." }, { status: 400 });
  }

  try {
    const encodedName = request.headers.get("x-file-name") || "upload";
    let filename = encodedName;
    try { filename = decodeURIComponent(encodedName); } catch { /* keep raw filename */ }
    const mimeType = request.headers.get("content-type") || "application/octet-stream";
    const report = await inspectFileStream(request.body, filename, mimeType);
    if (report.byteSize === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }
    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to inspect file metadata.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
