import { NextResponse } from 'next/server';
import { callPythonApi, PythonApiError } from '@/lib/python-api';

type DocsAskResponse = {
  answer: string;
  sources?: Array<{
    source: string;
    page: number;
    score: number;
  }>;
  web_search_used?: boolean;
  web_search_queries?: string[];
};

export async function POST(request: Request) {
  const { question } = await request.json();

  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: '提問內容無效' }, { status: 400 });
  }

  try {
    const data = await callPythonApi<DocsAskResponse>('/api/python/docs/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });

    return NextResponse.json({
      answer: data.answer || 'AI 沒有提供有效的回覆',
      sources: data.sources ?? [],
      web_search_used: data.web_search_used ?? false,
      web_search_queries: data.web_search_queries ?? [],
    });
  } catch (error) {
    if (error instanceof PythonApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Docs RAG API 錯誤:', error);
    return NextResponse.json({ error: '與 AI 文件助理的通訊失敗' }, { status: 500 });
  }
}
