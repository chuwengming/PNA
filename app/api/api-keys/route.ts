import { NextResponse } from 'next/server';
import { requireSessionDbUser } from '@/lib/db-session-user';
import { callPythonApi, PythonApiError } from '@/lib/python-api';

type ApiKeyRecord = {
  id: number;
  userId: number;
  email: string;
  appName: string;
  apiKey: string;
  createdAt: string;
};

export async function GET() {
  const user = await requireSessionDbUser();
  if (!user) {
    return NextResponse.json({ message: '請先登入' }, { status: 401 });
  }

  try {
    const keys = await callPythonApi<ApiKeyRecord[]>(
      `/api/python/api-keys?userId=${encodeURIComponent(String(user.userId))}`,
    );
    return NextResponse.json(keys);
  } catch (error) {
    const status = error instanceof PythonApiError ? error.status : 500;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '無法載入 API Key' },
      { status },
    );
  }
}

export async function POST(request: Request) {
  const user = await requireSessionDbUser();
  if (!user) {
    return NextResponse.json({ message: '請先登入' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const appName = typeof body?.appName === 'string' ? body.appName : '';

  try {
    const created = await callPythonApi<ApiKeyRecord>('/api/python/api-keys', {
      method: 'POST',
      body: JSON.stringify({
        userId: user.userId,
        email: user.email,
        appName,
      }),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const status = error instanceof PythonApiError ? error.status : 500;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '無法產生 API Key' },
      { status },
    );
  }
}
