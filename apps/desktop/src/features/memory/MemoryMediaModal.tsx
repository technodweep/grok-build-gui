import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  deleteMemoryFile,
  getMemoryCatalog,
  getMemoryFile,
  listRecentMedia,
  sendPrompt,
  setMemoryEnabled,
} from "../../shared/api";
import { LocalMedia } from "../../shared/LocalMedia";
import { mediaKind } from "../../shared/mediaPaths";
import { nextId, useAppStore } from "../../shared/store";
import type { MediaGalleryItem, MemoryCatalog, MemoryFileEntry } from "../../shared/types";

type Tab = "remember" | "browse" | "actions" | "imagine";

const btn: CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  cursor: "pointer",
};

const tabBtn = (active: boolean): CSSProperties => ({
  ...btn,
  borderColor: active ? "var(--gb-accent-dim)" : "var(--gb-border)",
  color: active ? "var(--gb-accent)" : "var(--gb-ink)",
  fontWeight: active ? 600 : 400,
});

function formatBytes(n?: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(ms?: number | null): string {
  if (ms == null) return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

export function MemoryMediaModal() {
  const open = useAppStore((s) => s.memoryOpen);
  const setOpen = useAppStore((s) => s.setMemoryOpen);
  const preferredTab = useAppStore((s) => s.memoryTab);
  const setPreferredTab = useAppStore((s) => s.setMemoryTab);
  const status = useAppStore((s) => s.status);
  const busy = useAppStore((s) => s.busy);
  const setBusy = useAppStore((s) => s.setBusy);
  const setError = useAppStore((s) => s.setError);
  const pushItem = useAppStore((s) => s.pushItem);
  const projectCwd = useAppStore((s) => s.projectCwd);
  const session = useAppStore((s) => s.session);
  const mediaGallery = useAppStore((s) => s.mediaGallery);
  const addMediaGalleryItem = useAppStore((s) => s.addMediaGalleryItem);
  const clearMediaGallery = useAppStore((s) => s.clearMediaGallery);

  const [tab, setTab] = useState<Tab>(preferredTab);
  const [catalog, setCatalog] = useState<MemoryCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<MemoryFileEntry | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewTrunc, setPreviewTrunc] = useState(false);

  // Remember form
  const [note, setNote] = useState("");

  // Imagine form
  const [imaginePrompt, setImaginePrompt] = useState("");
  const [imagineMode, setImagineMode] = useState<"image" | "video">("image");
  const [diskMedia, setDiskMedia] = useState<MemoryFileEntry[]>([]);

  const ready = status === "ready";
  const cwd = projectCwd || session?.cwd || null;

  const refresh = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const c = await getMemoryCatalog();
      setCatalog(c);
      setSelected((prev) => {
        if (!prev) return null;
        return c.files.find((f) => f.path === prev.path) ?? null;
      });
      if (cwd) {
        const recent = await listRecentMedia(cwd, 24).catch(() => []);
        setDiskMedia(recent);
        for (const r of recent) {
          const k = mediaKind(r.path);
          if (k === "image" || k === "video") {
            addMediaGalleryItem({
              path: r.path,
              kind: k,
              source: "disk",
              label: r.name,
            });
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [addMediaGalleryItem, cwd, setError]);

  useEffect(() => {
    if (open) {
      setTab(preferredTab);
      setMsg(null);
      setFilter("");
      setNote("");
      void refresh();
    }
  }, [open, preferredTab, refresh]);

  const files = useMemo(() => {
    const list = catalog?.files ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.relPath.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        (f.workspace ?? "").toLowerCase().includes(q) ||
        f.scope.toLowerCase().includes(q),
    );
  }, [catalog, filter]);

  const gallery = useMemo(() => {
    const byPath = new Map<string, MediaGalleryItem>();
    for (const m of mediaGallery) byPath.set(m.path, m);
    for (const d of diskMedia) {
      const k = mediaKind(d.path);
      if (k !== "image" && k !== "video") continue;
      if (!byPath.has(d.path)) {
        byPath.set(d.path, {
          path: d.path,
          kind: k,
          source: "disk",
          label: d.name,
          addedAt: d.modifiedMs ?? Date.now(),
        });
      }
    }
    return Array.from(byPath.values()).sort((a, b) => b.addedAt - a.addedAt);
  }, [diskMedia, mediaGallery]);

  if (!open) return null;

  const selectFile = async (f: MemoryFileEntry) => {
    setSelected(f);
    setPreview(null);
    setPreviewTrunc(false);
    try {
      const body = await getMemoryFile(f.path);
      setPreview(body.content);
      setPreviewTrunc(body.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runAgent = async (cmd: string, systemLabel?: string) => {
    if (!ready) {
      setError("Connect a session first");
      return;
    }
    setWorking(true);
    setMsg(null);
    try {
      setBusy(true);
      pushItem({
        id: nextId(),
        kind: "system",
        text: systemLabel ?? `Memory → ${cmd}`,
      });
      await sendPrompt(cmd);
      setMsg(`Sent: ${cmd}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setWorking(false);
    }
  };

  const onRemember = async () => {
    const text = note.trim();
    if (!text) {
      setError("Enter a note to remember");
      return;
    }
    if (!window.confirm(`Save this note to memory?\n\n${text.slice(0, 200)}`)) {
      return;
    }
    await runAgent(`/remember ${text}`, `Remember → ${text.slice(0, 80)}`);
    setNote("");
  };

  const onFlush = async () => {
    if (!window.confirm("Flush this session’s knowledge into memory? (LLM summary)")) {
      return;
    }
    await runAgent("/flush", "Memory flush started…");
  };

  const onDream = async () => {
    if (
      !window.confirm(
        "Run /dream consolidation? This merges session logs into organized topics.",
      )
    ) {
      return;
    }
    await runAgent("/dream", "Memory dream consolidation started…");
  };

  const onToggleSession = async (on: boolean) => {
    await runAgent(on ? "/memory on" : "/memory off", `Memory session → ${on ? "on" : "off"}`);
  };

  const onConfigToggle = async (enabled: boolean) => {
    setWorking(true);
    try {
      await setMemoryEnabled(enabled);
      setMsg(
        enabled
          ? "config.toml [memory].enabled = true (also send /memory on in session)"
          : "config.toml [memory].enabled = false",
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onDeleteSessionFile = async () => {
    if (!selected?.deletable) return;
    if (!window.confirm(`Delete session log?\n${selected.relPath}`)) return;
    setWorking(true);
    try {
      await deleteMemoryFile(selected.path);
      setSelected(null);
      setPreview(null);
      setMsg("Deleted session log.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onImagine = async () => {
    const p = imaginePrompt.trim();
    if (!p) {
      setError("Describe the image or video to generate");
      return;
    }
    if (!ready) {
      setError("Connect a session first");
      return;
    }
    const cmd =
      imagineMode === "video" ? `/imagine-video ${p}` : `/imagine ${p}`;
    await runAgent(cmd, `Imagine → ${p.slice(0, 80)}`);
    setPreferredTab("imagine");
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setPreferredTab(t);
  };

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 920,
          width: "94vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Memory & media</div>
            <div style={{ fontSize: 12, color: "var(--gb-ink-muted)", marginTop: 2 }}>
              Browse ~/.grok/memory, remember notes, flush/dream, /imagine
            </div>
          </div>
          <button type="button" style={btn} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(
            [
              ["remember", "Remember"],
              ["browse", "Browse"],
              ["actions", "Flush / Dream"],
              ["imagine", "Imagine"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              style={tabBtn(tab === id)}
              onClick={() => switchTab(id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            style={{ ...btn, marginLeft: "auto" }}
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>

        {msg ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--gb-success)",
              padding: "6px 10px",
              borderRadius: 8,
              background: "var(--gb-surface)",
              border: "1px solid var(--gb-border)",
            }}
          >
            {msg}
          </div>
        ) : null}

        {catalog?.notes?.length ? (
          <div style={{ fontSize: 12, color: "var(--gb-ink-muted)" }}>
            {catalog.notes.map((n, i) => (
              <div key={i}>• {n}</div>
            ))}
          </div>
        ) : null}

        {tab === "remember" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: "var(--gb-ink-muted)" }}>
              Save a durable note via agent <code>/remember</code>. Grok appends it to
              workspace or global MEMORY.md after confirmation on the agent side.
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. always open PR links after pushing"
              rows={5}
              style={{
                width: "100%",
                resize: "vertical",
                borderRadius: 10,
                border: "1px solid var(--gb-border)",
                background: "var(--gb-bg)",
                color: "var(--gb-ink)",
                padding: 12,
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                style={{
                  ...btn,
                  background: "var(--gb-accent)",
                  color: "#fff",
                  borderColor: "transparent",
                  opacity: !ready || working || busy || !note.trim() ? 0.5 : 1,
                }}
                disabled={!ready || working || busy || !note.trim()}
                onClick={() => void onRemember()}
              >
                Remember
              </button>
              {!ready ? (
                <span style={{ fontSize: 12, color: "var(--gb-warning)" }}>
                  Connect a session first
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "browse" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(200px, 280px) 1fr",
              gap: 12,
              minHeight: 320,
              flex: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 0,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--gb-border)",
                    color: catalog?.configEnabled
                      ? "var(--gb-success)"
                      : "var(--gb-ink-muted)",
                  }}
                >
                  config {catalog?.configEnabled ? "on" : "off"}
                </span>
                {catalog?.envEnabled != null ? (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid var(--gb-border)",
                      color: catalog.envEnabled
                        ? "var(--gb-success)"
                        : "var(--gb-ink-muted)",
                    }}
                  >
                    GROK_MEMORY={catalog.envEnabled ? "1" : "0"}
                  </span>
                ) : null}
              </div>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter files…"
                style={{
                  borderRadius: 8,
                  border: "1px solid var(--gb-border)",
                  background: "var(--gb-bg)",
                  color: "var(--gb-ink)",
                  padding: "6px 10px",
                  fontSize: 13,
                }}
              />
              <div
                style={{
                  overflow: "auto",
                  flex: 1,
                  border: "1px solid var(--gb-border)",
                  borderRadius: 10,
                  background: "var(--gb-bg)",
                }}
              >
                {files.length === 0 ? (
                  <div
                    style={{
                      padding: 12,
                      fontSize: 12,
                      color: "var(--gb-ink-muted)",
                    }}
                  >
                    {loading ? "Loading…" : "No memory files found."}
                  </div>
                ) : (
                  files.map((f) => {
                    const active = selected?.path === f.path;
                    return (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => void selectFile(f)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "none",
                          borderBottom: "1px solid var(--gb-border)",
                          background: active
                            ? "var(--gb-surface)"
                            : "transparent",
                          color: "var(--gb-ink)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          <span
                            style={{
                              color:
                                f.scope === "global"
                                  ? "var(--gb-accent)"
                                  : f.scope === "session"
                                    ? "var(--gb-warning)"
                                    : "var(--gb-ink-muted)",
                              marginRight: 6,
                              textTransform: "uppercase",
                              fontSize: 10,
                            }}
                          >
                            {f.scope}
                          </span>
                          {f.name}
                        </div>
                        <div
                          style={{
                            color: "var(--gb-ink-muted)",
                            fontSize: 10,
                            fontFamily: "ui-monospace, Menlo, monospace",
                            marginTop: 2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={f.relPath}
                        >
                          {f.relPath}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 0,
                minWidth: 0,
              }}
            >
              {selected ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <code
                      style={{
                        fontSize: 11,
                        color: "var(--gb-ink-muted)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={selected.path}
                    >
                      {selected.path}
                    </code>
                    <span style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>
                      {formatBytes(selected.sizeBytes)}
                      {selected.modifiedMs
                        ? ` · ${formatWhen(selected.modifiedMs)}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      style={btn}
                      onClick={() => {
                        void navigator.clipboard.writeText(selected.path);
                        setMsg("Path copied.");
                      }}
                    >
                      Copy path
                    </button>
                    {selected.deletable ? (
                      <button
                        type="button"
                        style={{ ...btn, color: "var(--gb-danger)" }}
                        disabled={working}
                        onClick={() => void onDeleteSessionFile()}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                  <pre
                    style={{
                      flex: 1,
                      margin: 0,
                      overflow: "auto",
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid var(--gb-border)",
                      background: "var(--gb-bg)",
                      fontSize: 12,
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                      fontFamily: "ui-monospace, Menlo, monospace",
                    }}
                  >
                    {preview ?? (loading ? "…" : "Select a file")}
                    {previewTrunc ? "\n\n… truncated" : ""}
                  </pre>
                </>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--gb-ink-muted)",
                    fontSize: 13,
                    border: "1px dashed var(--gb-border)",
                    borderRadius: 10,
                  }}
                >
                  Select a memory file to preview
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === "actions" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <section
              style={{
                border: "1px solid var(--gb-border)",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>Config & session toggle</div>
              <div style={{ fontSize: 12, color: "var(--gb-ink-muted)" }}>
                Config writes <code>[memory].enabled</code> in ~/.grok/config.toml.
                Session toggle uses agent <code>/memory on|off</code> (session-scoped).
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  style={btn}
                  disabled={working}
                  onClick={() => void onConfigToggle(true)}
                >
                  Enable in config
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={working}
                  onClick={() => void onConfigToggle(false)}
                >
                  Disable in config
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={!ready || working || busy}
                  onClick={() => void onToggleSession(true)}
                >
                  /memory on
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={!ready || working || busy}
                  onClick={() => void onToggleSession(false)}
                >
                  /memory off
                </button>
              </div>
            </section>

            <section
              style={{
                border: "1px solid var(--gb-border)",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>Flush & dream</div>
              <div style={{ fontSize: 12, color: "var(--gb-ink-muted)" }}>
                <strong>/flush</strong> — LLM summary of this session into memory
                (before compact). <strong>/dream</strong> — consolidate session logs into
                topics. Both require memory enabled.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  style={{
                    ...btn,
                    background: "var(--gb-accent)",
                    color: "#fff",
                    borderColor: "transparent",
                    opacity: !ready || working || busy ? 0.5 : 1,
                  }}
                  disabled={!ready || working || busy}
                  onClick={() => void onFlush()}
                >
                  Flush session
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={!ready || working || busy}
                  onClick={() => void onDream()}
                >
                  Dream consolidate
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {tab === "imagine" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                style={tabBtn(imagineMode === "image")}
                onClick={() => setImagineMode("image")}
              >
                Image
              </button>
              <button
                type="button"
                style={tabBtn(imagineMode === "video")}
                onClick={() => setImagineMode("video")}
              >
                Video
              </button>
            </div>
            <textarea
              value={imaginePrompt}
              onChange={(e) => setImaginePrompt(e.target.value)}
              placeholder={
                imagineMode === "video"
                  ? "a cat playing piano in a jazz club"
                  : "a golden sunset over a calm ocean with silhouetted palm trees"
              }
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                borderRadius: 10,
                border: "1px solid var(--gb-border)",
                background: "var(--gb-bg)",
                color: "var(--gb-ink)",
                padding: 12,
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                style={{
                  ...btn,
                  background: "var(--gb-accent)",
                  color: "#fff",
                  borderColor: "transparent",
                  opacity: !ready || working || busy || !imaginePrompt.trim() ? 0.5 : 1,
                }}
                disabled={!ready || working || busy || !imaginePrompt.trim()}
                onClick={() => void onImagine()}
              >
                {imagineMode === "video" ? "Generate video" : "Generate image"}
              </button>
              <span style={{ fontSize: 12, color: "var(--gb-ink-muted)" }}>
                Runs agent{" "}
                <code>
                  /{imagineMode === "video" ? "imagine-video" : "imagine"}
                </code>
                ; results appear in chat and below when paths are detected.
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                Gallery ({gallery.length})
              </div>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  clearMediaGallery();
                  setDiskMedia([]);
                }}
              >
                Clear list
              </button>
            </div>

            {gallery.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--gb-ink-muted)",
                  fontSize: 13,
                  border: "1px dashed var(--gb-border)",
                  borderRadius: 12,
                }}
              >
                No local media yet. Generate with /imagine, or drop paths into chat.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 12,
                  overflow: "auto",
                  maxHeight: "42vh",
                }}
              >
                {gallery.map((g) => (
                  <div
                    key={g.path}
                    style={{
                      border: "1px solid var(--gb-border)",
                      borderRadius: 12,
                      padding: 8,
                      background: "var(--gb-surface)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <LocalMedia path={g.path} maxHeight={160} />
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--gb-ink-muted)",
                        fontFamily: "ui-monospace, Menlo, monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={g.path}
                    >
                      {g.label || g.path.split("/").pop()}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>
                      {g.kind} · {g.source}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
