// =============================================
// EMAIL WATCHER API - Dev/Admin Control Endpoint
// =============================================
// POST { action: "start" | "stop" | "status" } — control the watcher
// GET  — return watcher status + stats

import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspace } from '@/lib/middleware/get-workspace';
import { getEmailWatcher, hasEmailWatcher } from '@/lib/services/comms/email-watcher';

/**
 * GET /api/comms/email-watcher
 * Returns current watcher status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    // ensure we await in case requireWorkspace becomes async in future
    const workspace = await requireWorkspace(request);
    // only admins (or internal callers) allowed to inspect watcher
    if (workspace.role !== 'admin' && !process.env.EMAIL_WATCHER_INTERNAL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasEmailWatcher()) {
    return NextResponse.json({
      status: 'stopped',
      message: 'Email watcher has not been initialized',
      stats: null,
    });
  }

  const watcher = getEmailWatcher();
  return NextResponse.json({
    status: watcher.stats.status,
    stats: watcher.stats,
  });
}

/**
 * POST /api/comms/email-watcher
 * Control the email watcher: start, stop, or get status
 * Body: { action: "start" | "stop" | "status" }
 */
export async function POST(request: NextRequest) {
  let workspace;
  try {
    workspace = await requireWorkspace(request);
    // only admins or internal services may control the watcher
    if (workspace.role !== 'admin' && !process.env.EMAIL_WATCHER_INTERNAL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { action } = body;
  if (!action || !['start', 'stop', 'status'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be one of: start, stop, status' },
      { status: 400 }
    );
  }

  try {
    if (action === 'status') {
      if (!hasEmailWatcher()) {
        return NextResponse.json({
          status: 'stopped',
          message: 'Email watcher has not been initialized',
          stats: null,
        });
      }
      const watcher = getEmailWatcher();
      return NextResponse.json({
        status: watcher.stats.status,
        stats: watcher.stats,
      });
    }

    if (action === 'start') {
      if (!hasEmailWatcher()) {
        return NextResponse.json({ error: 'Email watcher not initialized' }, { status: 500 });
      }
      const watcher = getEmailWatcher();
      await watcher.start();
      return NextResponse.json({
        status: watcher.stats.status,
        message: 'Email watcher started',
        stats: watcher.stats,
      });
    }

    if (action === 'stop') {
      if (!hasEmailWatcher()) {
        return NextResponse.json({
          status: 'stopped',
          message: 'Email watcher was not running',
          stats: null,
        });
      }
      const watcher = getEmailWatcher();
      await watcher.stop();
      return NextResponse.json({
        status: 'stopped',
        message: 'Email watcher stopped',
        stats: watcher.stats,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Email watcher operation failed: ${message}` },
      { status: 500 }
    );
  }

  // should never reach here, but satisfy exhaustive return
  return NextResponse.json(
    { error: `Unknown action: ${action}` },
    { status: 400 }
  );
}
