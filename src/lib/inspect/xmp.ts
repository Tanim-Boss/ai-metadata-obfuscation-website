import type { XmpProperty } from "./types";

const MAX_PROPERTIES = 400;
const MAX_VALUE = 600;

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function stripTags(input: string): string {
  return decodeEntities(input.replace(/<[^>]*>/g, " ")).replace(/\s{2,}/g, " ").trim();
}

function clip(input: string, max = MAX_VALUE): string {
  const clean = input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Pull the raw XMP packet out of a larger blob (APP1 segment, iTXt chunk...). */
export function extractXmpPacket(blob: Buffer | string): string | undefined {
  const text = typeof blob === "string" ? blob : blob.toString("utf8");
  const startMarkers = ["<x:xmpmeta", "<?xpacket", "<rdf:RDF"];
  let start = -1;
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx >= 0 && (start === -1 || idx < start)) start = idx;
  }
  if (start === -1) return undefined;
  const endMarkers = ["</x:xmpmeta>", "<?xpacket end=", "</rdf:RDF>"];
  let end = -1;
  for (const marker of endMarkers) {
    const idx = text.lastIndexOf(marker);
    if (idx >= 0) {
      end = Math.max(
        end,
        marker === "<?xpacket end=" ? text.indexOf("?>", idx) + 2 : idx + marker.length
      );
    }
  }
  if (end <= start) end = text.length;
  const packet = text.slice(start, end);
  return packet.replace(/\u0000+$/g, "");
}

const NAMESPACE_HINTS: Record<string, string> = {
  xmp: "http://ns.adobe.com/xap/1.0/",
  dc: "http://purl.org/dc/elements/1.1/",
  photoshop: "http://ns.adobe.com/photoshop/1.0/",
  xmpMM: "http://ns.adobe.com/xap/1.0/mm/",
  stEvt: "http://ns.adobe.com/xap/1.0/sType/ResourceEvent#",
  stRef: "http://ns.adobe.com/xap/1.0/sType/ResourceRef#",
  crs: "http://ns.adobe.com/camera-raw-settings/1.0/",
  exif: "http://ns.adobe.com/exif/1.0/",
  tiff: "http://ns.adobe.com/tiff/1.0/",
  aux: "http://ns.adobe.com/exif/1.0/aux/",
  iptc: "http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/",
  iptcExt: "http://iptc.org/std/Iptc4xmpExt/2008-02-29/",
  plus: "http://ns.useplus.org/ldf/xmp/1.0/",
  lr: "http://ns.adobe.com/lightroom/1.0/",
  c2pa: "http://c2pa.org/spec/specs/xmp/1.0",
};

/**
 * Real XMP parser: reads rdf:Description attributes, simple element
 * properties, and rdf:Bag/Seq/Alt arrays. Returns one row per property.
 */
export function parseXmpProperties(packet: string): XmpProperty[] {
  const properties: XmpProperty[] = [];
  const seen = new Set<string>();
  const push = (key: string, value: string) => {
    const cleanKey = key.trim();
    const cleanValue = clip(value.trim());
    if (!cleanKey || !cleanValue) return;
    if (/^xmlns(:\w+)?$/.test(cleanKey)) return;
    if (cleanKey === "rdf:about" || cleanKey === "rdf:parseType" || cleanKey === "rdf:nodeID")
      return;
    const signature = `${cleanKey}=${cleanValue}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    if (properties.length >= MAX_PROPERTIES) return;
    const namespace = cleanKey.includes(":") ? cleanKey.split(":")[0] : undefined;
    properties.push({
      key: cleanKey,
      value: cleanValue,
      namespace: namespace ? NAMESPACE_HINTS[namespace] ?? namespace : undefined,
    });
  };

  // 1. Attributes on rdf:Description (e.g. xmp:CreatorTool="...").
  const descriptionRegex = /<rdf:Description\b([^>]*)>/g;
  let desc: RegExpExecArray | null;
  while ((desc = descriptionRegex.exec(packet))) {
    const attrs = desc[1];
    const attrRegex = /([\w.-]+:[\w.-]+)\s*=\s*"([^"]*)"/g;
    let attr: RegExpExecArray | null;
    while ((attr = attrRegex.exec(attrs))) {
      if (attr[1].startsWith("xmlns:")) continue;
      push(attr[1], decodeEntities(attr[2]));
    }
  }

  // 2. Element properties, including rdf:Bag / rdf:Seq / rdf:Alt containers.
  //    Opening tags are walked one by one (instead of matching paired tags) so
  //    nested properties inside <rdf:Description> are still reached.
  const openTagRegex = /<([\w.-]+):([\w.-]+)\b([^>]*)>/g;
  let open: RegExpExecArray | null;
  while ((open = openTagRegex.exec(packet))) {
    const prefix = open[1];
    const local = open[2];
    const attrs = open[3];
    const tagEnd = open.index + open[0].length;

    if (prefix === "rdf" || prefix === "x") {
      openTagRegex.lastIndex = tagEnd;
      continue;
    }
    if (attrs.trimEnd().endsWith("/")) {
      openTagRegex.lastIndex = tagEnd;
      continue;
    }

    const closeIndex = packet.indexOf(`</${prefix}:${local}>`, tagEnd);
    if (closeIndex === -1) {
      openTagRegex.lastIndex = tagEnd;
      continue;
    }
    const inner = packet.slice(tagEnd, closeIndex);
    const innerTrimmed = inner.trim();
    const key = `${prefix}:${local}`;

    if (/^<rdf:(?:Bag|Seq|Alt)\b/i.test(innerTrimmed)) {
      const liRegex = /<rdf:li\b([^>]*)>([\s\S]*?)<\/rdf:li>/g;
      let li: RegExpExecArray | null;
      let index = 0;
      while ((li = liRegex.exec(inner))) {
        index++;
        const rawItem = li[2];
        const itemText = stripTags(rawItem);
        if (itemText) push(`${key}[${index}]`, itemText);

        // Structured entries (xmpMM:History / stEvt) are attribute based.
        const attrRegex = /([\w.-]+:[\w.-]+)\s*=\s*"([^"]*)"/g;
        let attr: RegExpExecArray | null;
        while ((attr = attrRegex.exec(rawItem))) {
          const attrName = attr[1];
          if (
            attrName.startsWith("xmlns:") ||
            attrName.startsWith("rdf:") ||
            attrName.startsWith("xml:")
          ) {
            continue;
          }
          push(`${key}[${index}]/${attrName}`, decodeEntities(attr[2]));
        }
      }

      // Self-closing entries such as <rdf:li stEvt:action="saved" ... />.
      const selfClosingRegex = /<rdf:li\b([^>]*)\/>/g;
      let selfItem: RegExpExecArray | null;
      while ((selfItem = selfClosingRegex.exec(inner))) {
        index++;
        const attrRegex = /([\w.-]+:[\w.-]+)\s*=\s*"([^"]*)"/g;
        let attr: RegExpExecArray | null;
        while ((attr = attrRegex.exec(selfItem[1]))) {
          const attrName = attr[1];
          if (attrName.startsWith("xmlns:") || attrName.startsWith("rdf:") || attrName.startsWith("xml:")) {
            continue;
          }
          push(`${key}[${index}]/${attrName}`, decodeEntities(attr[2]));
        }
      }
    } else if (innerTrimmed.includes("<")) {
      // A structured (non-array) value: surface its attributes instead of a
      // flattened XML blob.
      const attrRegex = /([\w.-]+:[\w.-]+)\s*=\s*"([^"]*)"/g;
      let attr: RegExpExecArray | null;
      let found = false;
      while ((attr = attrRegex.exec(inner))) {
        if (attr[1].startsWith("xmlns:") || attr[1].startsWith("rdf:") || attr[1].startsWith("xml:")) {
          continue;
        }
        push(`${key}/${attr[1]}`, decodeEntities(attr[2]));
        found = true;
      }
      if (!found) {
        const text = stripTags(inner);
        if (text) push(key, text);
      }
    } else {
      const text = stripTags(inner);
      if (text) push(key, text);
    }

    // Continue scanning right after the opening tag so nested elements are
    // visited as well.
    openTagRegex.lastIndex = tagEnd;
  }

  return properties;
}

/** Best-effort extraction of a photoshop:DocumentAncestors style list. */
export function xmpPropertyMap(properties: XmpProperty[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const prop of properties) {
    if (!map.has(prop.key)) map.set(prop.key, prop.value);
  }
  return map;
}
