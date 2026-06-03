export class PythonApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'PythonApiError';
  }
}

/** 本機直連 FastAPI；Railway 可直連 127.0.0.1:8000，失敗時改走公開網域 /api/python rewrite */
function getPythonApiBaseUrlCandidates(): string[] {
  const candidates: string[] = [];
  const push = (url: string) => {
    const normalized = url.replace(/\/$/, '');
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (process.env.PYTHON_API_URL) {
    push(process.env.PYTHON_API_URL);
  }
  if (process.env.NEXT_PUBLIC_PYTHON_API_URL) {
    push(process.env.NEXT_PUBLIC_PYTHON_API_URL);
  }

  const publicBase = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (publicBase) {
    push(publicBase);
  }

  if (process.env.NODE_ENV === 'development') {
    push('http://127.0.0.1:8000');
  }

  return candidates;
}

export function getPythonApiBaseUrl() {
  const candidates = getPythonApiBaseUrlCandidates();
  if (!candidates.length) {
    throw new Error('PYTHON_API_URL or AUTH_URL is required in production.');
  }
  return candidates[0];
}

async function callPythonApiOnce<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : detail?.message || payload?.message || `Python API request failed (${response.status})`;
    throw new PythonApiError(message, response.status);
  }

  return payload as T;
}

export async function callPythonApi<T>(path: string, init?: RequestInit): Promise<T> {
  const candidates = getPythonApiBaseUrlCandidates();
  if (!candidates.length) {
    throw new PythonApiError(
      '未設定 PYTHON_API_URL 或 AUTH_URL，無法連線後端。',
      503,
    );
  }

  let lastError: Error | null = null;

  for (const baseUrl of candidates) {
    try {
      return await callPythonApiOnce<T>(baseUrl, path, init);
    } catch (error) {
      if (error instanceof PythonApiError && error.status >= 400 && error.status < 500) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      lastError = new PythonApiError(
        `無法連線後端 API（${baseUrl}）：${detail}`,
        error instanceof PythonApiError ? error.status : 503,
      );
    }
  }

  throw (
    lastError ??
    new PythonApiError(
      '無法連線後端 API。Railway 請確認 npm run railway-start、DATABASE_URL、PYTHON_API_URL=http://127.0.0.1:8000',
      503,
    )
  );
}
