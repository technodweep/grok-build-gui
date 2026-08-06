/** Extract local image/video filesystem paths from agent text. */

const EXT = "(?:png|jpe?g|gif|webp|bmp|mp4|webm|mov)";

/** Absolute or relative paths that look like media files. */
const PATH_RE = new RegExp(
  "(?:^|[\\s\\(\"'=`])((?:\\/[\\w./@+-]+|~\\/[\\w./@+-]+|\\.\\/[\\w./@+-]+|[\\w.-]+\\/[\\w./@+-]+)\\." +
    EXT +
    ")\\b",
  "gi",
);

/** Markdown images: ![alt](path) */
const MD_IMG_RE = new RegExp(
  "!\\[[^\\]]*\\]\\(([^)\\s]+(?:\\.(?:png|jpe?g|gif|webp|bmp|mp4|webm|mov))(?:\\?[^)\\s]*)?)\\)",
  "gi",
);

export function mediaKind(path: string): "image" | "video" | "other" {
  const lower = path.toLowerCase();
  if (/\.(mp4|webm|mov)(\?|$)/i.test(lower)) return "video";
  if (/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(lower)) return "image";
  return "other";
}

export function extractMediaPaths(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  MD_IMG_RE.lastIndex = 0;
  while ((m = MD_IMG_RE.exec(text)) !== null) {
    const p = cleanPath(m[1]);
    if (p) found.add(p);
  }
  PATH_RE.lastIndex = 0;
  while ((m = PATH_RE.exec(text)) !== null) {
    const p = cleanPath(m[1]);
    if (p) found.add(p);
  }
  return Array.from(found);
}

function cleanPath(raw: string): string | null {
  let p = raw.trim();
  p = p.replace(/^['"]|['"]$/g, "");
  p = p.replace(/[),.;]+$/g, "");
  if (p.startsWith("file://")) p = p.slice("file://".length);
  if (/^https?:\/\//i.test(p)) return null;
  if (!p || p.length < 5) return null;
  return p;
}

export function isImagePath(path: string): boolean {
  return mediaKind(path) === "image";
}

export function isVideoPath(path: string): boolean {
  return mediaKind(path) === "video";
}
