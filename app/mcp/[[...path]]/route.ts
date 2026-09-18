import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const INTERNAL_REDIRECT = new Set([301, 302, 303, 307, 308]);

function pythonBase(): string {
  return (process.env.PYTHON_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

function pythonOrigin(): URL {
  return new URL(`${pythonBase()}/`);
}

function isInternalUrl(url: URL): boolean {
  return (
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost' ||
    url.host === pythonOrigin().host
  );
}

function targetUrl(request: NextRequest): string {
  const base = pythonBase();
  let pathname = request.nextUrl.pathname;
  // FastAPI/Starlette mount lives at /mcp/; Next.js 308s public /mcp/ back to /mcp.
  if (pathname === '/mcp') {
    pathname = '/mcp/';
  }
  return `${base}${pathname}${request.nextUrl.search}`;
}

function copyRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower.startsWith('x-forwarded-')) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

function sanitizeLocation(
  value: string,
  upstreamUrl: string,
  publicOrigin: string,
): string {
  try {
    const loc = new URL(value, upstreamUrl);
    if (!isInternalUrl(loc)) {
      return loc.toString();
    }
    const path = loc.pathname === '/mcp/' ? '/mcp' : loc.pathname;
    return `${publicOrigin}${path}${loc.search}`;
  } catch {
    return value;
  }
}

async function proxyMcp(request: NextRequest): Promise<NextResponse> {
  const headers = copyRequestHeaders(request);
  const publicOrigin = request.nextUrl.origin;
  let url = targetUrl(request);
  const body =
    request.method !== 'GET' && request.method !== 'HEAD'
      ? Buffer.from(await request.arrayBuffer())
      : undefined;

  try {
    for (let hop = 0; hop < 5; hop += 1) {
      const init: RequestInit = {
        method: request.method,
        headers,
        redirect: 'manual',
        cache: 'no-store',
      };
      if (body) {
        init.body = body;
      }
      const upstream = await fetch(url, init);
      if (INTERNAL_REDIRECT.has(upstream.status)) {
        const location = upstream.headers.get('location');
        if (location) {
          const next = new URL(location, url);
          if (isInternalUrl(next)) {
            const internal = pythonOrigin();
            next.protocol = internal.protocol;
            next.host = internal.host;
            url = next.toString();
            continue;
          }
        }
      }

      const responseHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        if (HOP_BY_HOP.has(key.toLowerCase())) {
          return;
        }
        if (key.toLowerCase() === 'location') {
          responseHeaders.set(
            'location',
            sanitizeLocation(value, url, publicOrigin),
          );
          return;
        }
        responseHeaders.set(key, value);
      });
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    return NextResponse.json(
      { message: 'MCP upstream redirect loop' },
      { status: 502 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { message: `MCP upstream unavailable: ${detail}` },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest) {
  return proxyMcp(request);
}

export async function POST(request: NextRequest) {
  return proxyMcp(request);
}

export async function DELETE(request: NextRequest) {
  return proxyMcp(request);
}

export async function PUT(request: NextRequest) {
  return proxyMcp(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, Accept, mcp-session-id, mcp-protocol-version',
      'Access-Control-Max-Age': '86400',
    },
  });
}
