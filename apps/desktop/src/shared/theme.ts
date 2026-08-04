export type ThemeId = "dark" | "light" | "dim";

export function applyTheme(theme: ThemeId | string, fontSize = 14) {
  const t: ThemeId =
    theme === "light" || theme === "dim" || theme === "dark" ? theme : "dark";
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.setProperty(
    "--gb-font-size",
    `${Math.min(20, Math.max(12, fontSize))}px`,
  );
}

export const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "dim", label: "Dim" },
  { id: "light", label: "Light" },
];
