import { useEffect, useState, type CSSProperties } from "react";
import { getLocalMedia } from "./api";
import { mediaKind } from "./mediaPaths";
import { useAppStore } from "./store";

const cache = new Map<string, string>();

export function LocalMedia({
  path,
  style,
  maxHeight = 320,
}: {
  path: string;
  style?: CSSProperties;
  maxHeight?: number;
}) {
  const projectCwd = useAppStore((s) => s.projectCwd);
  const sessionCwd = useAppStore((s) => s.session?.cwd);
  const cwd = projectCwd || sessionCwd || null;
  const [src, setSrc] = useState<string | null>(() => cache.get(path) ?? null);
  const [err, setErr] = useState<string | null>(null);
  const kind = mediaKind(path);

  useEffect(() => {
    let cancelled = false;
    if (cache.has(path)) {
      setSrc(cache.get(path)!);
      return;
    }
    setErr(null);
    void getLocalMedia(path, cwd, 8 * 1024 * 1024)
      .then((m) => {
        if (cancelled) return;
        cache.set(path, m.dataUrl);
        setSrc(m.dataUrl);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [path, cwd]);

  if (err) {
    return (
      <div
        style={{
          fontSize: 11,
          color: "var(--gb-ink-muted)",
          fontFamily: "ui-monospace, Menlo, monospace",
          padding: "6px 8px",
          border: "1px solid var(--gb-border)",
          borderRadius: 8,
          ...style,
        }}
        title={err}
      >
        {path}
        <div style={{ color: "var(--gb-danger)", marginTop: 2 }}>{err}</div>
      </div>
    );
  }
  if (!src) {
    return (
      <div
        style={{
          fontSize: 11,
          color: "var(--gb-ink-muted)",
          padding: 8,
          ...style,
        }}
      >
        Loading media…
      </div>
    );
  }
  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        style={{
          maxWidth: "100%",
          maxHeight,
          borderRadius: 10,
          border: "1px solid var(--gb-border)",
          background: "#000",
          ...style,
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={path}
      style={{
        maxWidth: "100%",
        maxHeight,
        borderRadius: 10,
        border: "1px solid var(--gb-border)",
        objectFit: "contain",
        background: "var(--gb-surface)",
        ...style,
      }}
    />
  );
}
