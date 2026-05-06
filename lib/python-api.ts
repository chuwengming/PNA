export class PythonApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'PythonApiError';
  }
}

export function getPythonApiBaseUrl() {
  const configuredUrl =
    process.env.PYTHON_API_URL ||
    process.env.NEXT_PUBLIC_PYTHON_API_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : '');

  if (!configuredUrl) {
    throw new Error('PYTHON_API_URL is required in production.');
  }

  return configuredUrl.replace(/\/$/, '');
}

export async function callPythonApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getPythonApiBaseUrl()}${path}`, {
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
