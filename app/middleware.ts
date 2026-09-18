import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isPythonApiKeysPath,
  pythonApiKeysForbiddenResponse,
} from '@/lib/block-python-api-keys';

export function middleware(request: NextRequest) {
  if (
    process.env.NODE_ENV === 'development' &&
    request.nextUrl.hostname !== 'localhost' &&
    request.nextUrl.hostname !== '127.0.0.1'
  ) {
    const url = request.nextUrl.clone();
    url.hostname = 'localhost';
    url.port = url.port || '3000';
    return NextResponse.redirect(url);
  }

  const pathname = request.nextUrl.pathname;

  // MCP is proxied by app/mcp → PYTHON_API_URL. No session cookie (Hermes / Cursor).
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
    return NextResponse.next();
  }

  // Keys are session-bound via /api/api-keys. Do not rewrite /api/python/api-keys
  // (logged-in users could otherwise pass another userId).
  if (isPythonApiKeysPath(pathname)) {
    return pythonApiKeysForbiddenResponse();
  }

  const token = request.cookies.get('authjs.session-token') ||
                request.cookies.get('__Secure-authjs.session-token') ||
                request.cookies.get('next-auth.session-token') ||
                request.cookies.get('__Secure-next-auth.session-token');

  if (pathname.startsWith('/api/python') && !token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is accessing dashboard
  if (pathname.startsWith('/dashboard')) {
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.jpeg).*)'],
};