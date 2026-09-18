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

function pythonBase(): string {
  return (process.env.PYTHON_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

function targetUrl(request: NextRequest): string {
  return `${pythonBase()}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function copyRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

async function proxyMcp(request: NextRequest): Promise<NextResponse> {
  const init: RequestInit = {
    method: request.method,
    headers: copyRequestHeaders(request),
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  try {
    const upstream = await fetch(targetUrl(request), init);
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP.has(key.toLowerCase())) {
        return;
      }
      responseHeaders.set(key, value);
    });
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
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
