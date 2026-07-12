/**
 * Theme registry — future themes can be added here and switched at runtime
 * by setting document.documentElement.dataset.theme.
 *
 * All visual tokens live in index.css under [data-theme="<id>"]; this file
 * is only the human-readable index + persistence helper.
 */

export type ThemeId = "obsidian"; // | "ivory" | "neon" | ... (future)

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  // Hex for the small swatches shown in the theme picker.
  swatch: { bg: string; primary: string; accent: string };
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  obsidian: {
    id: "obsidian",
    label: "Obsidian",
    description: "温柔黑 + 紫色玻璃焦点 + 琥珀情绪点（默认）",
    swatch: { bg: "#141417", primary: "#9b8aff", accent: "#f5b97a" },
  },
};

const STORAGE_KEY = "prismx_theme";

export function getTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved && saved in THEMES) return saved;
  } catch {}
  return "obsidian";
}

export function applyTheme(id: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = id;
  // Keep .dark class for shadcn components that key off it.
  document.documentElement.classList.add("dark");
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
}

/** Call once at app boot. */
export function initTheme(): void {
  applyTheme(getTheme());
}
