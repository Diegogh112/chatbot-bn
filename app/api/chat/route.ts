import { NextRequest, NextResponse } from 'next/server';
import { ragQuery } from '@/lib/rag';

export async function POST(request: NextRequest) {
  let body: { question?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const question = body?.question;
  if (!question || typeof question !== 'string' || question.trim() === '') {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  try {
    const result = await ragQuery(question.trim());
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/chat] Error:', message, err);
    if (
      message.includes('LLM service') ||
      message.includes('Embedding') ||
      message.includes('COHERE')
    ) {
      return NextResponse.json(
        { error: 'Embedding service unavailable' },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
