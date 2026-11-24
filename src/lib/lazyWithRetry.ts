import { lazy, type ComponentType } from 'react';

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk') ||
    (err instanceof Error && err.name === 'ChunkLoadError')
  );
}

const CHUNK_RELOAD_KEY = 'sharebite_chunk_reload_ts';

/**
 * Wraps React.lazy with automatic in-place retries and stale-chunk recovery.
 * When a deployment updates asset hashes, dynamic import fails with a 404/chunk error.
 * This helper automatically refreshes the window once to fetch the latest manifest.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const delays = [200, 600];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const component = await factory();
        // Clear reload timestamp on successful load
        try {
          sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        } catch {}
        return component;
      } catch (err) {
        lastError = err;

        if (isChunkLoadError(err)) {
          let lastReload = 0;
          try {
            lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0');
          } catch {}

          // If we haven't auto-reloaded in the last 15 seconds, reload once cleanly
          if (Date.now() - lastReload > 15000) {
            try {
              sessionStorage.setItem(CHUNK_RELOAD_KEY, Date.now().toString());
            } catch {}
            window.location.reload();
            return new Promise<{ default: T }>(() => {});
          }
        }

        if (attempt < delays.length) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
      }
    }

    throw lastError;
  });
}
