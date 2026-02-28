import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale } from './i18n/config';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Ignore Next internals and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets')
  ) {
    return NextResponse.next();
  }

  // If path already starts with a valid locale, continue
  const segments = pathname.split('/').filter(Boolean);
  const maybeLocale = segments[0];
  if (maybeLocale && isLocale(maybeLocale)) {
    return NextResponse.next();
  }

  // Redirect to default locale keeping the rest of the path
  const url = req.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|.*\..*|api).*)'],
};

