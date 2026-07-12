import { cn } from "@/lib/utils";

interface BrandCircleProps {
  /** Display text inside — "BTC", "RM", emoji, etc. */
  label: string;
  /** Gradient stops — pick brand-evocative colors. */
  from: string;
  to: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Colored circular asset badge — every wallet/token gets one for visual identity. */
export function BrandCircle({ label, from, to, size = "md", className }: BrandCircleProps) {
  const dim =
    size === "sm" ? "w-7 h-7 text-[10px]"
    : size === "lg" ? "w-12 h-12 text-[14px]"
    : "w-9 h-9 text-[11px]";
  return (
    <div
      className={cn("brand-circle", dim, className)}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {label}
    </div>
  );
}

/** Common brand color pairs you can pick from. */
export const BRAND_GRADIENTS = {
  MYR:  ["#F7931A", "#FFB85C"],
  USD:  ["#26A17B", "#4BC2A0"],
  EUR:  ["#003399", "#FFCC00"],
  CNY:  ["#DE2910", "#FFDE00"],
  USDT: ["#26A17B", "#4BC2A0"],
  BTC:  ["#F7931A", "#FFB85C"],
  ETH:  ["#627EEA", "#A4B5F2"],
  cash: ["#f5b97a", "#ec4899"],
  bank: ["#6366f1", "#a78bfa"],
  card: ["#7c3aed", "#ec4899"],
  warm: ["#f5b97a", "#ec4899"],
  cool: ["#6366f1", "#a78bfa"],
  green:["#7ec99b", "#4ade80"],
} as const;

/** Pick a brand pair based on a wallet currency/type. */
export function pickBrand(currency?: string | null, type?: string | null): [string, string] {
  if (currency && currency.toUpperCase() in BRAND_GRADIENTS) {
    return BRAND_GRADIENTS[currency.toUpperCase() as keyof typeof BRAND_GRADIENTS] as [string, string];
  }
  if (type === "cash") return BRAND_GRADIENTS.cash;
  if (type === "bank_card") return BRAND_GRADIENTS.bank;
  if (type === "credit_card") return BRAND_GRADIENTS.card;
  return BRAND_GRADIENTS.cool;
}
