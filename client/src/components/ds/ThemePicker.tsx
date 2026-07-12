import { useState } from "react";
import { THEMES, applyTheme, getTheme, type ThemeId } from "@/lib/themes";
import { Check } from "lucide-react";

/**
 * Theme picker — currently only Obsidian is shipped, but the registry is
 * already swap-able so future themes show up here automatically.
 */
export function ThemePicker() {
  const [current, setCurrent] = useState<ThemeId>(getTheme());
  return (
    <div className="space-y-2">
      {(Object.values(THEMES)).map((t) => {
        const isActive = current === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => { applyTheme(t.id); setCurrent(t.id); }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
              isActive ? "border-primary/40 bg-primary/8" : "border-border hover:bg-surface-2"
            }`}
          >
            <div className="flex gap-1.5 shrink-0">
              <div className="w-5 h-5 rounded-md" style={{ background: t.swatch.bg, border: "1px solid hsl(var(--border))" }} />
              <div className="w-5 h-5 rounded-md" style={{ background: t.swatch.primary }} />
              <div className="w-5 h-5 rounded-md" style={{ background: t.swatch.accent }} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground truncate">{t.description}</p>
            </div>
            {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
          </button>
        );
      })}
      <p className="text-[11px] text-muted-foreground pt-1">更多主题将陆续上架。如有想要的风格，反馈给我们。</p>
    </div>
  );
}
