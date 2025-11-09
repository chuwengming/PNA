import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // 1. 從前端請求中獲取問題
  const { question } = await request.json();

  // 2. 簡單驗證
  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: '提問內容無效' }, { status: 400 });
  }

  // 3. 從環境變數中獲取 n8n Webhook URL
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('N8N_WEBHOOK_URL 未設定');
    return NextResponse.json({ error: '伺服器設定錯誤' }, { status: 500 });
  }

  try {
    // 4. 從我們的後端發送請求到 n8n Webhook
    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }), // 將問題作為 JSON payload 發送
    });

    if (!n8nResponse.ok) {
      // 如果 n8n 回應錯誤，將其傳遞給前端
      const errorData = await n8nResponse.json();
      console.error('n8n API 錯誤:', errorData);
      return NextResponse.json({ error: 'AI Agent 回應錯誤' }, { status: n8nResponse.status });
    }

    // 5. 假設 n8n 會回傳一個包含 'answer' 欄位的 JSON 物件
    const data = await n8nResponse.json();
    const answer = data.answer || 'AI Agent 沒有提供有效的回覆';

    // 6. 將 n8n 的回答回傳給前端
    return NextResponse.json({ answer });

  } catch (error) {
    console.error('呼叫 n8n Webhook 時發生錯誤:', error);
    return NextResponse.json({ error: '與 AI Agent 的通訊失敗' }, { status: 500 });
  }
}