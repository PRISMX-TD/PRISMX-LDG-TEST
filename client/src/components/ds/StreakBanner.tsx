interface StreakBannerProps {
  days: number;
  subline?: string;
  xp?: number;
}

/** Amber-tinted streak banner — appears on Dashboard when streak >= 3. */
export function StreakBanner({ days, subline, xp }: StreakBannerProps) {
  return (
    <div className="streak-banner flex items-center gap-3">
      <div className="text-[22px] leading-none">🔥</div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold m-0">连续记账 {days} 天</p>
        {subline && <p className="text-[10px] text-foreground/65 m-0 mt-0.5">{subline}</p>}
      </div>
      {xp !== undefined && <span className="xp-chip shrink-0">+{xp} XP</span>}
    </div>
  );
}
