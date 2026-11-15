import { NextResponse } from "next/server";
import { processDocumentBuffer } from "@/lib/document-processor";
import { db } from "@/db";
import { processingJobs } from "@/db/schema";

export const dynamic = "force-dynamic";

// Documents can be large (e.g. books, datasets) — allow long-running jobs and
// never cap the upload body size.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please provide a document file (PDF, DOCX, EPUB, TXT, …)." },
        { status: 400 }
      );
    }

    const arrayBuf = await file.arrayBuffer();
    if (arrayBuf.byteLength === 0) {
      return NextResponse.json(
        { error: "Uploaded document file is empty." },
        { status: 400 }
      );
    }

    const result = await processDocumentBuffer(
      Buffer.from(arrayBuf),
      file.name || "document.pdf"
    );

    if (db) {
      try {
        await db.insert(processingJobs).values({
          originalFilename: file.name || "document",
          processedFilename: result.outputFilename,
          fileType: "document",
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
      err instanceof Error ? err.message : "Document processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
