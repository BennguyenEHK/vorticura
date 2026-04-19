import { WorkspaceContext } from '@/lib/middleware/workspace-context';
import { emitQueuedRFQs } from '@/lib/services/rfq-queue/queue-manager';

const workspace = new WorkspaceContext({
  user_id: 1,
  company_id: 1,
  username: 'versempra',
  role: 'admin',
});

async function run() {
  await emitQueuedRFQs(1, workspace, 'supplier_discovery');
}

run();
