import sharp from "sharp";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(typeStr: string, data: Buffer): Buffer {
  const type = Buffer.from(typeStr, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  return Buffer.concat([len, type, data, crc]);
}

function makePngTextChunk(keyword: string, text: string): Buffer {
  const payload = Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0]),
    Buffer.from(text, "utf8"),
  ]);
  return makePngChunk("tEXt", payload);
}

function makePngItxtChunk(keyword: string, text: string): Buffer {
  const payload = Buffer.concat([
    Buffer.from(keyword, "utf8"),
    Buffer.from([0, 0, 0, 0, 0]),
    Buffer.from(text, "utf8"),
  ]);
  return makePngChunk("iTXt", payload);
}

function makeJpegSegment(markerSecondByte: number, payload: Buffer): Buffer {
  const hdr = Buffer.alloc(4);
  hdr[0] = 0xff;
  hdr[1] = markerSecondByte;
  hdr.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([hdr, payload]);
}

export async function generateSampleAiImage(
  variant: "comfyui" | "c2pa" = "comfyui"
): Promise<{
  buffer: Buffer;
  filename: string;
  mimeType: string;
}> {
  if (variant === "c2pa") {
    const svgStreet = `
    <svg width="1440" height="960" viewBox="0 0 1440 960" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#07090f"/>
          <stop offset="55%" stop-color="#111927"/>
          <stop offset="100%" stop-color="#0b101b"/>
        </linearGradient>
        <radialGradient id="amberBokeh" cx="34%" cy="54%" r="30%">
          <stop offset="0%" stop-color="#ffb347" stop-opacity="0.72"/>
          <stop offset="55%" stop-color="#f59e0b" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#111927" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cyanBokeh" cx="72%" cy="46%" r="32%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.58"/>
          <stop offset="55%" stop-color="#0284c7" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="#111927" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1440" height="960" fill="url(#night)"/>
      <rect width="1440" height="960" fill="url(#amberBokeh)"/>
      <rect width="1440" height="960" fill="url(#cyanBokeh)"/>

      <!-- Architectural Tower Silhouettes -->
      <rect x="80" y="140" width="210" height="580" fill="#090d16"/>
      <rect x="320" y="220" width="180" height="500" fill="#0d1320"/>
      <rect x="920" y="110" width="230" height="610" fill="#0a0f1a"/>
      <rect x="1180" y="190" width="190" height="530" fill="#080c14"/>

      <!-- Warm Illuminated Windows & Street Neon -->
      <rect x="255" y="420" width="18" height="110" rx="3" fill="#fbbf24" opacity="0.88"/>
      <rect x="945" y="340" width="20" height="145" rx="3" fill="#38bdf8" opacity="0.85"/>
      <circle cx="490" cy="540" r="34" fill="#fde68a" opacity="0.55"/>
      <circle cx="585" cy="565" r="22" fill="#f97316" opacity="0.62"/>
      <circle cx="835" cy="555" r="28" fill="#38bdf8" opacity="0.52"/>
      <circle cx="740" cy="580" r="18" fill="#f43f5e" opacity="0.6"/>

      <!-- Wet Asphalt Reflections -->
      <rect y="680" width="1440" height="280" fill="#070b13"/>
      <ellipse cx="490" cy="745" rx="68" ry="12" fill="#fbbf24" opacity="0.42"/>
      <ellipse cx="490" cy="810" rx="45" ry="8" fill="#f59e0b" opacity="0.28"/>
      <ellipse cx="835" cy="755" rx="62" ry="11" fill="#38bdf8" opacity="0.38"/>
      <ellipse cx="740" cy="770" rx="38" ry="7" fill="#f43f5e" opacity="0.34"/>
    </svg>`;

    const cleanJpeg = await sharp(Buffer.from(svgStreet))
      .jpeg({ quality: 94 })
      .toBuffer();

    const xmpXml = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
           xmlns:xmp="http://ns.adobe.com/xap/1.0/"
           xmlns:iptcExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
           xmlns:dc="http://purl.org/dc/elements/1.1/">
    <rdf:Description rdf:about=""
      xmp:CreatorTool="OpenAI GPT-4o / DALL-E 3 Image Generator"
      iptcExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

    const app1Xmp = makeJpegSegment(
      0xe1,
      Buffer.concat([
        Buffer.from("http://ns.adobe.com/xap/1.0/\0", "ascii"),
        Buffer.from(xmpXml, "utf8"),
      ])
    );

    const app11C2pa = makeJpegSegment(
      0xeb,
      Buffer.from(
        "JP\0\0\0\x01jumbc2pa\0urn:uuid:openai-c2pa-manifest-8f31a\0claim_generator=ChatGPT/GPT-4o OpenAI C2PA Content Credentials;actions=c2pa.created;digitalSourceType=trainedAlgorithmicMedia",
        "latin1"
      )
    );

    const comSeg = makeJpegSegment(
      0xfe,
      Buffer.from("Generated with OpenAI DALL-E / C2PA Content Credentials", "utf8")
    );

    // Splice right after SOI (0xFFD8)
    const injectedJpeg = Buffer.concat([
      cleanJpeg.subarray(0, 2),
      app1Xmp,
      app11C2pa,
      comSeg,
      cleanJpeg.subarray(2),
    ]);

    return {
      buffer: injectedJpeg,
      filename: "DALL-E_2026-10-25_rainy_tokyo_bokeh.jpg",
      mimeType: "image/jpeg",
    };
  }

  const svgScene = `
  <svg width="1440" height="960" viewBox="0 0 1440 960" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0b132b"/>
        <stop offset="42%" stop-color="#1c2541"/>
        <stop offset="72%" stop-color="#3a506b"/>
        <stop offset="92%" stop-color="#d97736"/>
        <stop offset="100%" stop-color="#f3a75c"/>
      </linearGradient>
      <radialGradient id="sunGlow" cx="68%" cy="74%" r="38%">
        <stop offset="0%" stop-color="#ffd28a" stop-opacity="0.9"/>
        <stop offset="40%" stop-color="#f28f3b" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="#1c2541" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2b3a55"/>
        <stop offset="45%" stop-color="#182235"/>
        <stop offset="100%" stop-color="#090d16"/>
      </linearGradient>
      <linearGradient id="ridge1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1f2c44"/>
        <stop offset="100%" stop-color="#121a2b"/>
      </linearGradient>
    </defs>

    <rect width="1440" height="680" fill="url(#sky)"/>
    <rect width="1440" height="760" fill="url(#sunGlow)"/>
    <circle cx="978" cy="592" r="56" fill="#ffe6b3" opacity="0.92"/>

    <polygon points="0,680 0,510 210,430 420,520 650,390 870,515 1120,415 1310,490 1440,455 1440,680" fill="url(#ridge1)" opacity="0.88"/>
    <polygon points="0,680 0,575 180,535 390,595 590,480 820,585 1040,540 1260,590 1440,530 1440,680" fill="#101726"/>

    <polygon points="260,680 410,635 660,655 740,680" fill="#0b0f19"/>
    <rect x="445" y="598" width="128" height="46" fill="#0d121d"/>
    <polygon points="435,598 515,574 585,598" fill="#151d2e"/>
    <rect x="468" y="612" width="34" height="20" fill="#ffb75e" opacity="0.9"/>
    <rect x="512" y="612" width="42" height="20" fill="#ff9e3d" opacity="0.82"/>

    <rect y="680" width="1440" height="280" fill="url(#water)"/>
    <ellipse cx="978" cy="705" rx="95" ry="7" fill="#ffd28a" opacity="0.5"/>
    <ellipse cx="978" cy="730" rx="74" ry="5" fill="#f3a75c" opacity="0.38"/>
    <ellipse cx="978" cy="760" rx="52" ry="4" fill="#d97736" opacity="0.28"/>
    <ellipse cx="505" cy="702" rx="44" ry="3.5" fill="#ffb75e" opacity="0.35"/>
  </svg>`;

  const basePng = await sharp(Buffer.from(svgScene))
    .png({ compressionLevel: 8 })
    .toBuffer();

  const sdParams = makePngTextChunk(
    "parameters",
    "nordic architectural cabin overlooking twilight fjord, warm tungsten interior window glow, golden hour horizon, medium format photography, atmospheric mist\nNegative prompt: cartoon, illustration, CGI, watermark, oversaturated\nSteps: 28, Sampler: DPM++ 2M Karras, Schedule type: Karras, CFG scale: 6.5, Seed: 3891047219, Size: 1440x960, Model hash: e3c8a29f11, Model: flux1-dev-fp8, Version: f2.0.1v1.10.1"
  );

  const comfyWorkflow = makePngTextChunk(
    "workflow",
    JSON.stringify({
      last_node_id: 9,
      nodes: [
        {
          id: 1,
          class_type: "CheckpointLoaderSimple",
          widgets_values: ["flux1-dev-fp8.safetensors"],
        },
        {
          id: 4,
          class_type: "CLIPTextEncode",
          widgets_values: [
            "nordic architectural cabin overlooking twilight fjord",
          ],
        },
        {
          id: 7,
          class_type: "KSampler",
          widgets_values: [3891047219, "fixed", 28, 6.5, "dpmpp_2m", "karras", 1.0],
        },
      ],
    })
  );

  const xmpPacket = makePngItxtChunk(
    "XML:com.adobe.xmp",
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
           xmlns:xmp="http://ns.adobe.com/xap/1.0/"
           xmlns:iptcExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">
    <rdf:Description rdf:about=""
      xmp:CreatorTool="ComfyUI 0.3.12 / Adobe Firefly Bridge"
      iptcExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
  );

  const c2paPayload = Buffer.from(
    "jumb\x00\x00\x00\x1dc2pa\x00urn:uuid:9a4f1b20-c2pa-manifest\x00c2pa.actions:c2pa.created:openai:trainedAlgorithmicMedia:contentauthenticity",
    "latin1"
  );
  const c2paChunk = makePngChunk("caBX", c2paPayload);

  let offset = 8;
  while (offset + 8 <= basePng.length) {
    const len = basePng.readUInt32BE(offset);
    const type = basePng.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") {
      const injected = Buffer.concat([
        basePng.subarray(0, offset),
        sdParams,
        comfyWorkflow,
        xmpPacket,
        c2paChunk,
        basePng.subarray(offset),
      ]);
      return {
        buffer: injected,
        filename: "ComfyUI_00482_flux_nordic_fjord.png",
        mimeType: "image/png",
      };
    }
    offset += 12 + len;
  }

  return {
    buffer: basePng,
    filename: "ComfyUI_00482_flux_nordic_fjord.png",
    mimeType: "image/png",
  };
}
