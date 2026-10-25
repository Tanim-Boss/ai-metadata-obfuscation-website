import { NextResponse } from "next/server";
import { generateSampleAiImage } from "@/lib/sample-generator";
import { inspectMediaBuffer } from "@/lib/metadata-inspector";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");
    const variant = searchParams.get("variant") === "c2pa" ? "c2pa" : "comfyui";

    const { buffer, filename, mimeType } = await generateSampleAiImage(variant);

    if (mode === "json") {
      const report = await inspectMediaBuffer(buffer, filename);
      return NextResponse.json({
        filename,
        mimeType,
        dataBase64: buffer.toString("base64"),
        report,
      });
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate sample image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
