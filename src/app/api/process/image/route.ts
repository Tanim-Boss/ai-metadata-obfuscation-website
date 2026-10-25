import { NextResponse } from "next/server";
import { processImageBuffer } from "@/lib/image-processor";
import type { TelemetryOptions } from "@/lib/camera-profiles";
import { db } from "@/db";
import { processingJobs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please provide an image file." },
        { status: 400 }
      );
    }

    const arrayBuf = await file.arrayBuffer();
    if (arrayBuf.byteLength === 0) {
      return NextResponse.json(
        { error: "Uploaded image file is empty." },
        { status: 400 }
      );
    }

    let options: TelemetryOptions = {
      profileId: String(formData.get("profile") || "canon-r5m2"),
    };

    const rawOptions = formData.get("options");
    if (typeof rawOptions === "string" && rawOptions.trim()) {
      try {
        const parsed = JSON.parse(rawOptions) as Partial<TelemetryOptions>;
        options = {
          ...options,
          ...parsed,
          profileId: parsed.profileId || options.profileId,
        };
      } catch {
        // Fallback to form field profileId
      }
    }

    const result = await processImageBuffer(
      Buffer.from(arrayBuf),
      file.name || "image.png",
      options
    );

    if (db) {
      try {
        await db.insert(processingJobs).values({
          originalFilename: file.name || "image",
          processedFilename: result.outputFilename,
          fileType: "image",
          status: "completed",
        });
      } catch {
        // Non-blocking optional telemetry persistence
      }
    }

    const responseMode = formData.get("responseMode");
    if (responseMode === "json") {
      return NextResponse.json({
        filename: result.outputFilename,
        mimeType: result.mimeType,
        byteSize: result.outputBuffer.length,
        dataBase64: result.outputBuffer.toString("base64"),
        beforeReport: result.beforeReport,
        afterReport: result.afterReport,
      });
    }

    return new Response(new Uint8Array(result.outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.outputFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Image processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
