import { NextResponse } from "next/server";
import { inspectMediaBuffer } from "@/lib/metadata-inspector";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please attach an image or video file to inspect." },
        { status: 400 }
      );
    }

    const arrayBuf = await file.arrayBuffer();
    if (arrayBuf.byteLength === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    const report = await inspectMediaBuffer(
      Buffer.from(arrayBuf),
      file.name || "upload"
    );

    return NextResponse.json({ report });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to inspect file metadata.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
