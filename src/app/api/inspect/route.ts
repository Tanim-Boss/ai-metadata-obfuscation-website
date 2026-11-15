import { NextResponse } from "next/server";
import { inspectMediaBuffer } from "@/lib/metadata-inspector";
import { inspectDocumentBuffer, isDocumentBuffer } from "@/lib/document-inspector";

export const dynamic = "force-dynamic";

// Accept arbitrarily large uploads — the tool is designed for "any size, no
// limitations", so we deliberately impose no body-size cap here.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please attach an image, video, or document file to inspect." },
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

    const buffer = Buffer.from(arrayBuf);
    const name = file.name || "upload";

    const report = isDocumentBuffer(buffer, name)
      ? await inspectDocumentBuffer(buffer, name)
      : await inspectMediaBuffer(buffer, name);

    return NextResponse.json({ report });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to inspect file metadata.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
