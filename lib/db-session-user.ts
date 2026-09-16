import { auth } from '@/lib/auth';
import { callPythonApi } from '@/lib/python-api';

type AuthUser = {
  id: number;
  email: string;
  name?: string | null;
};

export async function requireSessionDbUser(): Promise<{ userId: number; email: string } | null> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() || '';
  if (!email) {
    return null;
  }

  const rawId = session?.user?.id ? Number(session.user.id) : NaN;
  if (Number.isFinite(rawId) && rawId > 0) {
    return { userId: rawId, email };
  }

  try {
    const existing = await callPythonApi<AuthUser | null>('/api/python/auth/user-by-email', {
      method: 'POST',
      body: JSON.stringify({
        email,
        name: session?.user?.name,
        provider: 'google',
      }),
    });
    if (existing?.id && existing.id > 0) {
      return { userId: existing.id, email: (existing.email || email).toLowerCase() };
    }
  } catch {
    return null;
  }

  return null;
}
