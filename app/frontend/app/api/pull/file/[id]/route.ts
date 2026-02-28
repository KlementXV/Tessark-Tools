import { NextRequest } from 'next/server';

const backendBaseUrl = (() => {
  const candidates = [
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_BACKEND_URL,
    process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : undefined,
    'http://helmer-api:8080',
    'http://tessark-backend-service:8080',
  ].filter(Boolean) as string[];
  return candidates[0] || 'http://localhost:8080';
})();

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = params.id?.trim();
  if (!id) {
    return new Response('Missing file id', { status: 400 });
  }

  const upstream = await fetch(`${backendBaseUrl}/api/pull/file/${encodeURIComponent(id)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const msg = await upstream.text();
    return new Response(msg || 'Upstream error', { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/x-tar',
      'Content-Disposition': upstream.headers.get('content-disposition') || `attachment; filename="image-${id}.tar"`,
      'Cache-Control': 'no-store',
    },
  });
}
