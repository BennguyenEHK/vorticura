// =============================================
// SSE PREVIEW EMIT - Bridge for external processes
// =============================================
// POST /api/preview-stream/emit
// Accepts a ProcessorResult JSON body and emits it to the
// in-process eventBus so connected SSE clients receive it.
// Used by CLI test scripts that run in a separate process.

import { NextRequest, NextResponse } from 'next/server';
import { eventBus } from '@/lib/event-bus';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || !body.data_type) {
      return NextResponse.json({ error: 'Invalid payload: data_type required' }, { status: 400 });
    }

    eventBus.emit('preview-update', body);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
