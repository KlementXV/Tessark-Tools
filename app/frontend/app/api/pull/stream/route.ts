import { NextRequest } from 'next/server';

const fallbackBackendUrl = (() => {
  const candidates = [
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_BACKEND_URL,
    process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : undefined,
    'http://helmer-api:8080',
    'http://tessark-backend-service:8080',
  ].filter(Boolean) as string[];
  return candidates[0] || 'http://localhost:8080';
})();

export async function POST(req: NextRequest) {
  const body = await req.text();

  const res = await fetch(`${fallbackBackendUrl}/api/pull/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  // Proxy stream as-is (SSE-style)
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}

