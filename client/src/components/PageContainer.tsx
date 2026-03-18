import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

export function PageContainer({ children, className, scrollable = true }: PageContainerProps) {
  return (
    <div className="flex-1 w-full flex flex-col h-full min-h-0 overflow-hidden bg-black relative text-foreground font-sans">
      <div className="ambient-noise"></div>
      <div className="ambient-glow"></div>
      <div className="ambient-glow-2"></div>
      <div className="flex-1 flex flex-col relative overflow-hidden z-10">
        {scrollable ? (
          <div className={cn("flex-1 overflow-y-auto custom-scroll p-4 md:p-8", className)}>
            {children}
          </div>
        ) : (
          <div className={cn("flex-1 flex flex-col min-h-0 p-4 md:p-8", className)}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
