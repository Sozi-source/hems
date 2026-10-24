import { NextResponse } from 'next/server';
import { matchesConfiguredSecret } from '@/lib/security/secret-match';
import { processSmsQueue } from '@/lib/sms/processor';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const supplied = authorization.slice(7);
  return [process.env.SMS_WORKER_SECRET, process.env.CRON_SECRET]
    .some((secret) => matchesConfiguredSecret(secret, supplied));
}

async function runWorker(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processSmsQueue();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: result.status });
}

// Vercel Cron invokes scheduled routes with GET and an Authorization bearer token.
export async function GET(request: Request) {
  return runWorker(request);
}

// Keep POST available for manual or external scheduler invocations.
export async function POST(request: Request) {
  return runWorker(request);
}
