import type { ScrollItem } from "./types";

/** Flatten scrollback into a plain-text transcript. */
export function conversationText(items: ScrollItem[]): string {
  return items
    .map((it) => {
      if (it.kind === "user") return `You:\n${it.text}`;
      if (it.kind === "agent") return `Grok:\n${it.text}`;
      if (it.kind === "thought") return `Thinking:\n${it.text}`;
      if (it.kind === "tool") {
        return `Tool ${it.title} [${it.status}]${it.output ? `\n${it.output}` : ""}`;
      }
      if (it.kind === "plan") {
        return `Plan:\n${it.entries.map((e) => `- [${e.status}] ${e.content}`).join("\n")}`;
      }
      return it.text;
    })
    .join("\n\n");
}

/** Write arbitrary text to an absolute path (Tauri) or trigger download. */
export async function writeTextFile(path: string, content: string): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_export_file", { path, content });
  } catch {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "copy.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** Save transcript via Tauri dialog, or fall back to download in browser. */
export async function exportConversationToFile(
  items: ScrollItem[],
  defaultName = "grok-conversation.md",
): Promise<"saved" | "cancelled"> {
  const text = conversationText(items);
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      title: "Export conversation",
      defaultPath: defaultName,
      filters: [
        { name: "Markdown / text", extensions: ["md", "txt"] },
        { name: "All", extensions: ["*"] },
      ],
    });
    if (!path) return "cancelled";
    // Prefer write via fs plugin if available; otherwise use invoke-free approach.
    // Tauri 2 core doesn't ship fs by default — use a minimal write through Rust
    // or the dialog path with a custom command. Fall back to clipboard + toast if write fails.
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_export_file", { path, content: text });
      return "saved";
    } catch {
      // Fallback: use browser download if invoke missing
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
      return "saved";
    }
  } catch {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return "saved";
  }
}
