import { useMemo } from "react";

/**
 * Time-of-day greeting + optional emotional footnote (E aesthetic).
 * Example: "晚上好, Rex · 今天少花了 42 元"
 */
function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return "深夜了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  if (h < 22) return "晚上好";
  return "夜深了";
}

export function EmotionalGreeting({
  name,
  footnote,
}: {
  name?: string | null;
  footnote?: string | null;
}) {
  const greeting = useMemo(timeGreeting, []);
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{greeting}</p>
      <p className="text-sm font-medium flex items-center gap-2">
        <span>{name || "你"}</span>
        {footnote && <span className="text-xs text-warm font-normal">· {footnote}</span>}
      </p>
    </div>
  );
}
