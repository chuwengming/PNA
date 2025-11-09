import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if user is accessing dashboard
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    // Get the session token from cookies
    const token = request.cookies.get('next-auth.session-token') || 
                  request.cookies.get('__Secure-next-auth.session-token');
    
    // If no token, redirect to login
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};