// The GIS client script is loaded `async defer` (see index.html), so
// `window.google` may not exist when app code first runs. These guards let
// callers wait for it before calling into google.accounts.

/** True once the GIS client library has loaded and `google.accounts` exists. */
export function isGisReady(): boolean {
  return typeof window !== 'undefined' && !!window.google?.accounts;
}

/**
 * Resolve once GIS is ready, polling briefly; reject after `timeoutMs` so a
 * blocked/failed script load surfaces instead of hanging forever.
 */
export function waitForGis(timeoutMs = 10_000): Promise<void> {
  if (isGisReady()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      if (isGisReady()) {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        window.clearInterval(timer);
        reject(new Error('Google Identity Services failed to load'));
      }
    }, 50);
  });
}
