import { Plus } from "lucide-react";

/* r7 — FAB rewritten as a custom warm web3 gradient pill with a
   pulse halo. Doesn't use Button anymore so it gets a unique presence. */

interface FloatingActionButtonProps { onClick: () => void; }

export function FloatingActionButton({ onClick }: FloatingActionButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="记一笔"
      data-testid="button-fab"
      className="group !fixed bottom-28 right-5 md:bottom-10 md:right-10 z-[9999] w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
      style={{
        background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #7c3aed 100%)",
        boxShadow: "0 14px 38px -10px rgba(124,58,237,0.7), 0 6px 16px -6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)",
      }}
    >
      <span aria-hidden className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "radial-gradient(circle, rgba(245,158,11,0.5) 0%, transparent 70%)" }} />
      <Plus className="relative w-6 h-6 md:w-7 md:h-7" strokeWidth={2.4} />
    </button>
  );
}
