import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

  const token = request.cookies.get('authjs.session-token') ||
                request.cookies.get('__Secure-authjs.session-token') ||
                request.cookies.get('next-auth.session-token') ||
                request.cookies.get('__Secure-next-auth.session-token');

  if (request.nextUrl.pathname.startsWith('/api/python') && !token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is accessing dashboard
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
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