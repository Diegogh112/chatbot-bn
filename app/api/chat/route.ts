import { NextRequest, NextResponse } from 'next/server';
import { ragQuery } from '@/lib/rag';
import type { HistoryMessage } from '@/lib/llm';

export async function POST(request: NextRequest) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const question = body?.question;
  if (!question || typeof question !== 'string' || question.trim() === '') {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  // Validate and sanitize history — keep last 6 exchanges (12 messages) to avoid token overflow
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: HistoryMessage[] = rawHistory
    .filter((m): m is HistoryMessage =>
      m && typeof m === 'object' &&
      (m.role === 'USER' || m.role === 'CHATBOT') &&
      typeof m.message === 'string'
    )
    .slice(-12);

  try {
    const result = await ragQuery(question.trim(), { history });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/chat] Error:', message);
    if (message.includes('LLM service') || message.includes('Embedding') || message.includes('COHERE')) {
      return NextResponse.json({ error: 'Embedding service unavailable' }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
