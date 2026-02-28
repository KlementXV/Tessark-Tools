import { NextRequest } from 'next/server';

function normalizeToIndex(url: string) {
  const u = url.trim();
  if (u.endsWith('/index.yaml') || u.endsWith('/index.yml')) return u;
  return u.replace(/\/$/, '') + '/index.yaml';
}

function isAllowedUrl(u: string) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') || '';
  if (!url) {
    return new Response('Missing url', { status: 400 });
  }
  const indexUrl = normalizeToIndex(url);
  if (!isAllowedUrl(indexUrl)) {
    return new Response('Invalid URL', { status: 400 });
  }
  try {
    const res = await fetch(indexUrl, { cache: 'no-store' });
    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, { status: 502 });
    }
    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-helmer-upstream': indexUrl,
      },
    });
  } catch (e: any) {
    return new Response(`Fetch failed: ${e?.message || e}`, { status: 500 });
  }
}

