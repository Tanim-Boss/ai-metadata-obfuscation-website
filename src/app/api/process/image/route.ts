import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import piexifjs from "piexifjs";
import { db } from "@/db";
import { processingJobs } from "@/db/schema";

export const dynamic = "force-dynamic";

// Preset fake camera profiles
const CAMERA_PROFILES: Record<string, any> = {
  canon: {
    make: "Canon",
    model: "EOS R5",
    lens: "RF 24-70mm f/2.8L IS USM",
    fstop: "f/2.8",
    shutter: "1/200",
    iso: "100",
    focalLength: "35mm",
  },
  nikon: {
    make: "Nikon",
    model: "Z 9",
    lens: "NIKKOR Z 24-70mm f/2.8 S",
    fstop: "f/4",
    shutter: "1/250",
    iso: "200",
    focalLength: "50mm",
  },
  sony: {
    make: "Sony",
    model: "Alpha 7R IV",
    lens: "FE 24-70mm F2.8 GM II",
    fstop: "f/5.6",
    shutter: "1/160",
    iso: "400",
    focalLength: "24mm",
  },
};

function buildExif(profile: any): Buffer {
  const exifObj: any = {
    "0th": {
      0x010f: profile.make, // Make
      0x0110: profile.model, // Model
      0x0132: new Date()
        .toISOString()
        .replace("T", " ")
        .substring(0, 19), // DateTime
      0x010e: "ImageDescription", // ImageDescription
      0x0131: "0123456789", // Software
    },
    "Exif": {
      0x829a: 0.02, // ExposureTime
      0x829d: "2.8", // FNumber
      0x8827: 400, // ISOSpeedRatings
      0x920a: 35, // FocalLength
      0xa434: "0123456789", // LensMake
      0xa435: profile.lens, // LensModel
      0xa433: "0123456789", // LensSerialNumber
    },
    "1st": {},
    thumbnail: null,
    GPS: {},
  };

  const exifBytes = piexifjs.dump(exifObj);
  // piexifjs.dump returns a string where each char is a byte (0-255)
  const buf = Buffer.alloc(exifBytes.length);
  for (let i = 0; i < exifBytes.length; i++) {
    buf[i] = exifBytes.charCodeAt(i) & 0xff;
  }
  return buf;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const profileName = (formData.get("profile") as string) || "canon";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const profile = CAMERA_PROFILES[profileName] || CAMERA_PROFILES.canon;

    // Determine format from file extension or mime type
    const fileName = file.name.toLowerCase();
    const isPng =
      fileName.endsWith(".png") || file.type === "image/png";
    const isWebp =
      fileName.endsWith(".webp") || file.type === "image/webp";

    // Sharp strips all metadata by default on re-encode; we inject our own EXIF
    let pipeline = sharp(buffer);

    // Get metadata to ensure it's a valid image
    const meta = await pipeline.metadata();
    if (!meta.format) {
      return NextResponse.json(
        { error: "Invalid image file" },
        { status: 400 }
      );
    }

    const exifBuffer = buildExif(profile);

    let output: Buffer;
    if (isPng) {
      output = await (pipeline as any).png({ exif: exifBuffer }).toBuffer();
    } else if (isWebp) {
      output = await (pipeline as any)
        .webp({ exif: exifBuffer })
        .toBuffer();
    } else {
      output = await pipeline
        .jpeg({ exif: exifBuffer, quality: 92 } as any)
        .toBuffer();
    }

    const processedFileName = `processed_${Date.now()}_${file.name}`;

    // Record in database
    try {
      await db.insert(processingJobs).values({
        originalFilename: file.name,
        processedFilename: processedFileName,
        fileType: "image",
        status: "completed",
      });
    } catch {
      // DB may not be migrated yet; continue regardless
    }

    return new NextResponse(output as any, {
      status: 200,
      headers: {
        "Content-Type": file.type,
        "Content-Disposition": `attachment; filename="${processedFileName}"`,
        "X-Processed": "true",
      },
    });
  } catch (err: any) {
    console.error("Image processing error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process image" },
      { status: 500 }
    );
  }
}
