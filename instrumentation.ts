// =============================================
// NEXT.JS INSTRUMENTATION HOOK
// =============================================
// This file is loaded once by Next.js at server startup.
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// IMAP email watcher auto-start has been removed.
// Email processing now uses OAuth + webhook push notifications:
//   - Gmail: Google Pub/Sub → /api/webhooks/gmail
//   - Outlook: Microsoft Graph → /api/webhooks/microsoft
// See lib/services/email/ for the new pipeline.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[instrumentation] Server started — email watching via OAuth webhooks (no IMAP)');
  }
}
