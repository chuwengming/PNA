import { NextResponse } from 'next/server';
import { requireSessionDbUser } from '@/lib/db-session-user';
import { callPythonApi, PythonApiError } from '@/lib/python-api';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireSessionDbUser();
  if (!user) {
    return NextResponse.json({ message: '請先登入' }, { status: 401 });
  }

  const { id } = await context.params;
  const keyId = Number(id);
  if (!Number.isFinite(keyId) || keyId <= 0) {
    return NextResponse.json({ message: '無效的 API Key' }, { status: 400 });
  }

  try {
    await callPythonApi(
      `/api/python/api-keys/${keyId}?userId=${encodeURIComponent(String(user.userId))}`,
      { method: 'DELETE' },
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    const status = error instanceof PythonApiError ? error.status : 500;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : '無法刪除 API Key' },
      { status },
    );
  }
}
