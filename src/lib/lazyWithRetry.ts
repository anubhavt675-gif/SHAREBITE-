import { lazy, type ComponentType } from 'react';

const CHUNK_RELOAD_KEY = 'sharebite_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 15000;

function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('dynamically imported module')
  );
}

/**
 * Wraps React.lazy with an automatic retry and safe single-shot reload
 * if a stale deployed chunk 404s, preventing blank white screens after deploys.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // Ignore storage errors
      }
      return mod;
    } catch (_firstErr) {
      // Retry once after a brief delay for transient network blips
      await new Promise((resolve) => setTimeout(resolve, 350));
      try {
        return await factory();
      } catch (secondErr) {
        if (typeof window !== 'undefined' && isChunkLoadError(secondErr)) {
          try {
            const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0');
            if (!lastReload || Date.now() - lastReload > RELOAD_COOLDOWN_MS) {
              sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
              window.location.reload();
              return new Promise<{ default: T }>(() => {});
            }
          } catch {
            // Fall through to ErrorBoundary
          }
        }
        throw secondErr;
      }
    }
  });
}
