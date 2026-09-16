'use client';

import { useCallback, useEffect, useState } from 'react';

type ApiKeyRecord = {
  id: number;
  userId: number;
  email: string;
  appName: string;
  apiKey: string;
  createdAt: string;
};

type ApiKeyModalProps = {
  open: boolean;
  onClose: () => void;
  accountEmail: string;
};

export default function ApiKeyModal({ open, onClose, accountEmail }: ApiKeyModalProps) {
  const [appName, setAppName] = useState('');
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const loadKeys = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/api-keys');
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || '無法載入 API Key');
      }
      setKeys(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法載入 API Key');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setAppName('');
    setCopiedId(null);
    void loadKeys();
  }, [open, loadKeys]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const copyKey = async (record: ApiKeyRecord) => {
    try {
      await navigator.clipboard.writeText(record.apiKey);
      setCopiedId(record.id);
    } catch {
      setError('無法複製到剪貼簿，請改以手動選取金鑰。');
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || '無法產生 API Key');
      }
      const created = payload as ApiKeyRecord;
      setKeys((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setAppName('');
      await copyKey(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法產生 API Key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (record: ApiKeyRecord) => {
    if (!window.confirm(`確定刪除應用程式「${record.appName}」的 API Key？刪除後 MCP 將無法再使用此金鑰。`)) {
      return;
    }
    setError('');
    try {
      const response = await fetch(`/api/api-keys/${record.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || '無法刪除 API Key');
      }
      setKeys((current) => current.filter((item) => item.id !== record.id));
      if (copiedId === record.id) {
        setCopiedId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法刪除 API Key');
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-3xl w-full border border-blue-500/30 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white">API KEY</h3>
            <p className="text-gray-400 text-sm mt-1">
              為 Hermes 或其他應用程式申請金鑰。帳號：{' '}
              <span className="text-cyan-300">{accountEmail}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-2"
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            value={appName}
            onChange={(event) => setAppName(event.target.value)}
            placeholder="應用程式名稱"
            maxLength={191}
            className="flex-1 px-4 py-2 bg-slate-900 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={isSaving || !appName.trim()}
            className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-medium disabled:opacity-50"
          >
            {isSaving ? '產生中…' : '生成 API KEY'}
          </button>
        </form>

        {error && (
          <p className="mb-4 text-sm text-red-400">{error}</p>
        )}

        <div className="flex-grow overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-gray-400 text-sm">載入既有申請…</p>
          ) : keys.length === 0 ? (
            <p className="text-gray-500 text-sm">尚未申請 API Key。輸入應用程式名稱後按生成。</p>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="border-b border-blue-500/30">
                  <th className="py-2 px-2 text-cyan-400 text-sm font-semibold">使用者帳號</th>
                  <th className="py-2 px-2 text-cyan-400 text-sm font-semibold">應用程式名稱</th>
                  <th className="py-2 px-2 text-cyan-400 text-sm font-semibold">API KEY</th>
                  <th className="py-2 px-2 text-cyan-400 text-sm font-semibold w-36">操作</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((record) => (
                  <tr key={record.id} className="border-b border-slate-700/50">
                    <td className="py-3 px-2 text-gray-300 text-sm break-all">{record.email}</td>
                    <td className="py-3 px-2 text-white text-sm">{record.appName}</td>
                    <td className="py-3 px-2 text-cyan-200 text-xs font-mono break-all">{record.apiKey}</td>
                    <td className="py-3 px-2">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => copyKey(record)}
                          className="px-3 py-1 border border-cyan-400 text-cyan-400 rounded-md text-xs hover:bg-cyan-400 hover:text-slate-900"
                        >
                          {copiedId === record.id ? '已拷貝' : '拷貝'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(record)}
                          className="px-3 py-1 border border-red-400 text-red-400 rounded-md text-xs hover:bg-red-400 hover:text-slate-900"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
