// =============================================
// NEXT.JS INSTRUMENTATION HOOK
// =============================================
// Auto-starts background services in production.
// This file is loaded once by Next.js at server startup.
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

// exported health flag for monitoring endpoints
export let emailWatcherHealthy = true;

export async function register() {
  // Only run on the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Auto-start email watcher in production when IMAP is configured
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.IMAP_HOST &&
      process.env.IMAP_USER &&
      process.env.IMAP_PASS
    ) {
      try {
        const { getEmailWatcher } = await import('@/lib/services/comms/email-watcher');
        const watcher = getEmailWatcher();
        // start in background with timeout so server init isn't blocked
        const startPromise = watcher.start();
        const timeoutMs = Number(process.env.EMAIL_WATCHER_START_TIMEOUT_MS) || 5000;
        const race = Promise.race([
          startPromise.then(() => 'ok'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
        ]);
        race
          .then(() => console.log('[instrumentation] Email watcher auto-started'))
          .catch((err) => {
            // record failure but do not rethrow during boot
            emailWatcherHealthy = false;
            console.error(
              '[instrumentation] Email watcher auto-start failed or timed out:',
              err
            );
            // telemetry/metrics placeholder
            try {
              const telemetry = require('@/lib/telemetry').default;
              telemetry?.incrementMetric?.('email_watcher_start_failure', 1);
            } catch {}
          });
      } catch (error) {
        // this catch only wraps dynamic import, treat similarly
        emailWatcherHealthy = false;
        console.error('[instrumentation] Failed to auto-start email watcher:', error);
        try {
          const telemetry = require('@/lib/telemetry').default;
          telemetry?.incrementMetric?.('email_watcher_start_failure', 1);
        } catch {}
      }
    }
  }
}
