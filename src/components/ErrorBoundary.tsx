import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  isChunkError: boolean;
}

/** Returns true for "Failed to fetch dynamically imported module" errors — these happen
 *  after a Vercel deployment when the browser has an old bundle referencing chunks
 *  that no longer exist at those URLs. The fix is a silent page reload. */
const isChunkLoadError = (error: Error) =>
  error.message.includes("Failed to fetch dynamically imported module") ||
  error.message.includes("Importing a module script failed") ||
  error.message.includes("error loading dynamically imported module");

/** Session-storage key to prevent infinite reload loops. */
const CHUNK_RELOAD_KEY = "xplay_chunk_reload";

/**
 * Catches uncaught runtime errors in the component tree below it.
 * Mount with a `key` equal to the current pathname so that navigating
 * to a different route resets the boundary automatically.
 *
 * Special case: chunk-load failures (stale deployment) trigger a silent
 * page reload instead of showing the error screen.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, isChunkError: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);

    // Auto-reload on stale chunk errors, but only once per session to avoid loops.
    if (isChunkLoadError(error)) {
      const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      if (!alreadyReloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
      }
    }
  }

  private handleGoBack = () => {
    this.setState({ error: null });
    window.history.back();
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    // For chunk-load errors: show a silent "updating" spinner while the page reloads.
    if (this.state.isChunkError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Updating app…</p>
        </div>
      );
    }

    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="w-8 h-8 text-destructive"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Your data is safe — go back or reload to continue.
            </p>
          </div>

          {/* Error detail — always shown temporarily for debugging */}
          <div className="text-left rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-[11px] font-mono text-destructive break-all leading-relaxed">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack?.split('\n').slice(0, 5).join('\n')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleGoBack}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm text-foreground hover:bg-muted/50 transition-colors"
            >
              ← Go back
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Reload
            </button>
          </div>

          {/* Brand */}
          <p className="text-[10px] tracking-widest text-muted-foreground/40 uppercase">
            XPLAY Player
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
