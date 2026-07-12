import { useMemo } from "react";

interface StarfieldProps {
  count?: number;
  className?: string;
}

/** Subtle decorative starfield + soft waves — drop inside a hero card. */
export function Starfield({ count = 14, className }: StarfieldProps) {
  const stars = useMemo(() => {
    const list: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        r: Math.random() * 0.9 + 0.4,
        o: Math.random() * 0.6 + 0.4,
      });
    }
    return list;
  }, [count]);

  return (
    <svg className={`starfield ${className || ""}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.o} />
      ))}
      <path d="M0,90 Q25,72 50,82 T100,75 L100,100 L0,100 Z" fill="rgba(255,255,255,0.04)" />
      <path d="M0,94 Q25,80 50,88 T100,82 L100,100 L0,100 Z" fill="rgba(167,139,250,0.06)" />
    </svg>
  );
}
