import { Component, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; reloading: boolean; }

const RELOAD_FLAG = "prismx_chunk_reload";

/**
 * Catches render-time errors from the lazy-loaded route tree. The most common
 * one on mobile is a dynamic import() failure ("Failed to fetch dynamically
 * imported module" / ChunkLoadError) that happens after a new version is
 * deployed while the user is mid-session: the cached HTML points at chunk
 * hashes that no longer exist, the import rejects, React.lazy throws, and —
 * with no boundary — the whole route renders blank.
 *
 * On a chunk error we force one hard reload (guarded by sessionStorage so we
 * never loop) to pull the fresh HTML + chunk names. Other errors show a small
 * retry affordance instead of a white screen.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, reloading: false };

  static getDerivedStateFromError(error: unknown): State {
    const msg = String((error as any)?.message || error || "");
    const isChunkError =
      /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(msg);

    if (isChunkError && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
      return { hasError: true, reloading: true };
    }
    return { hasError: true, reloading: false };
  }

  componentDidMount() {
    // Successful mount means the latest code loaded — clear the guard so a
    // future deploy can trigger a fresh reload again.
    sessionStorage.removeItem(RELOAD_FLAG);
  }

  render() {
    if (this.state.reloading) {
      return (
        <div className="w-full min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-[50vh] flex flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-foreground/70 text-sm">页面加载失败，请重试</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-2xl text-sm font-medium bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] text-white"
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
