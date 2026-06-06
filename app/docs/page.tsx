'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function DocsPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Array<{ source: string; page: number; score: number }>>([]);
  const [webSearchUsed, setWebSearchUsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsLoading(true);
    setAnswer('');
    setSources([]);
    setWebSearchUsed(false);
    setError('');

    try {
      const response = await fetch('/api/n8n-docs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '發生未知錯誤');
      }

      const data = await response.json();
      setAnswer(data.answer);
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setWebSearchUsed(Boolean(data.web_search_used));

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <div className="relative w-24 h-10">
              <Image src="/logo.jpeg" alt="PNA Logo" fill className="object-contain" priority />
            </div>
          </Link>
          <Link href="/dashboard" className="px-6 py-2 bg-transparent border-2 border-cyan-400 text-cyan-400 rounded-lg hover:bg-cyan-400 hover:text-slate-900 transition-all font-medium">
            Dashboard
          </Link>
        </nav>
      </header>

      {/* Main Content */}
      <section className="container mx-auto px-6 py-12">
        <div className="max-w-3xl mx-auto">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">專案文件問答</h1>
            <p className="text-lg text-gray-400">
              對專案有任何問題嗎？Gemini AI 將依據專案文件內容為您解答。
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 mb-12">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="請在此輸入您的問題..."
              rows={4}
              className="w-full px-4 py-3 bg-slate-800/50 border-2 border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-lg"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-semibold text-lg shadow-lg shadow-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '思考中...' : '提問'}
            </button>
          </form>

          {/* Response Area */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-300">
              <p className="font-bold mb-2">錯誤</p>
              <p>{error}</p>
            </div>
          )}

          {isLoading && (
             <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mx-auto"></div>
                <p className="text-white mt-4">Gemini 正在依據文件內容查找答案...</p>
             </div>
          )}

          {answer && (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-blue-500/30 shadow-xl">
              <h2 className="text-2xl font-bold text-white mb-4">Gemini 的回覆</h2>
              <div className="prose prose-invert prose-lg max-w-none text-gray-300 whitespace-pre-wrap">
                {answer}
              </div>
              {webSearchUsed && (
                <p className="mt-4 text-sm text-gray-400">
                  本次回覆已搭配網路搜尋，補充說明專有名詞（文件內容仍為主要依據）。
                </p>
              )}
              {sources.length > 0 && (
                <div className="mt-6 pt-4 border-t border-blue-500/20">
                  <h3 className="text-sm font-semibold text-cyan-300 mb-2">參考來源</h3>
                  <ul className="space-y-1 text-sm text-gray-400">
                    {sources.map((item, index) => (
                      <li key={`${item.source}-${item.page}-${index}`}>
                        {item.source}（第 {item.page} 頁，相關度 {(item.score * 100).toFixed(1)}%）
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}