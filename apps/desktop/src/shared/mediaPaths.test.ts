import { describe, expect, it } from "vitest";
import { extractMediaPaths, mediaKind } from "./mediaPaths";

describe("mediaPaths", () => {
  it("detects kinds", () => {
    expect(mediaKind("/tmp/a.png")).toBe("image");
    expect(mediaKind("clip.MP4")).toBe("video");
    expect(mediaKind("readme.md")).toBe("other");
  });

  it("extracts markdown images and bare paths", () => {
    const text = `
Here is ![shot](/home/me/images/out.png) and also /tmp/video.mp4 done.
`;
    const paths = extractMediaPaths(text);
    expect(paths.some((p) => p.endsWith("out.png"))).toBe(true);
    expect(paths.some((p) => p.endsWith("video.mp4"))).toBe(true);
  });

  it("ignores remote http images", () => {
    const paths = extractMediaPaths("![x](https://example.com/a.png)");
    expect(paths).toHaveLength(0);
  });
});
