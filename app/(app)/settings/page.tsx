// =============================================
// Settings Page — Account & integrations
// =============================================
// Editorial settings surface in the Mission Control vocabulary.
// Mono overline → serif headline → panel.

import { redirect } from 'next/navigation';
import { getServerActionWorkspace } from '@/lib/middleware/get-workspace';
import EmailConnectionPanel from '@/components/settings/EmailConnectionPanel';

export default async function SettingsPage() {
  const workspace = await getServerActionWorkspace();
  if (!workspace) redirect('/login');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Editorial header — instrument-then-headline cadence */}
      <header className="space-y-3 border-b border-rule-strong pb-6">
        <p className="micro-label text-graphite">VORTICURA · OPS · SETTINGS</p>
        <h1 className="font-display text-ink text-[40px] leading-tight tracking-[-0.02em]">
          Account &amp; Integrations
        </h1>
        <p className="font-body text-graphite max-w-2xl">
          Manage authenticated email connections, OAuth tokens, and webhook delivery state.
          Disconnecting an account removes its Pub/Sub watch and stops new RFQ ingestion.
        </p>
      </header>

      <section>
        <EmailConnectionPanel companyId={workspace.company_id} />
      </section>
    </div>
  );
}
