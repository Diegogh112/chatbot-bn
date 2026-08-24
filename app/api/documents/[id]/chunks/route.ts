import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSecret } from '@/lib/auth';
import { getChunksByDocumentId } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdminSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const chunks = await getChunksByDocumentId(id);
    // Join all chunk texts in order to reconstruct the full content
    const content = chunks.map(c => c.texto).join(' ');
    return NextResponse.json({ content, chunks: chunks.length }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
