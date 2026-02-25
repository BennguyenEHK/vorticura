// =============================================
// NEXT.JS INSTRUMENTATION HOOK
// =============================================
// Auto-starts background services in production.
// This file is loaded once by Next.js at server startup.
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

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
        await watcher.start();
        console.log('[instrumentation] Email watcher auto-started');
      } catch (error) {
        console.error('[instrumentation] Failed to auto-start email watcher:', error);
      }
    }
  }
}
