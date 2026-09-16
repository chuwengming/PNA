import { NextResponse } from 'next/server';

export const PYTHON_API_KEYS_PUBLIC_FORBIDDEN =
  '請使用 /api/api-keys（Dashboard session），不可經 /api/python/api-keys 讀寫金鑰';

export function isPythonApiKeysPath(pathname: string): boolean {
  return pathname === '/api/python/api-keys' || pathname.startsWith('/api/python/api-keys/');
}

export function pythonApiKeysForbiddenResponse() {
  return NextResponse.json(
    { message: PYTHON_API_KEYS_PUBLIC_FORBIDDEN },
    { status: 403 },
  );
}
