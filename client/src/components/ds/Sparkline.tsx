interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  tone?: "up" | "down" | "flat";
  className?: string;
}

/** Inline sparkline path + soft area fill. Auto-direction tone if not given. */
export function Sparkline({ data, height = 22, tone, className }: SparklineProps) {
  if (!data || data.length < 2) return <svg className={className} />;
  const w = 100;
  const h = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${w},${h} L0,${h} Z`;

  const t = tone ?? (data[data.length - 1] > data[0] ? "up" : data[data.length - 1] < data[0] ? "down" : "flat");
  const stroke = t === "up" ? "#7ec99b" : t === "down" ? "#e89a9a" : "#a78bfa";
  const fill = t === "up" ? "rgba(126,201,155,0.22)" : t === "down" ? "rgba(232,154,154,0.22)" : "rgba(167,139,250,0.20)";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" style={{ width: "100%", height: h }}>
      <path d={area} fill={fill} />
      <path d={line} stroke={stroke} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
