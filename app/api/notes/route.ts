import { NextRequest, NextResponse } from 'next/server';
import { validateAdminSecret } from '@/lib/auth';
import { chunkText } from '@/lib/chunking';
import { embedTexts } from '@/lib/embeddings';
import { insertDocumentWithChunks } from '@/lib/database';

export async function POST(request: NextRequest) {
  if (!validateAdminSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { titulo?: string; contenido?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { titulo, contenido } = body;
  if (!titulo || !titulo.trim()) {
    return NextResponse.json({ error: 'El título es requerido' }, { status: 400 });
  }
  if (!contenido || !contenido.trim()) {
    return NextResponse.json({ error: 'El contenido es requerido' }, { status: 400 });
  }

  const chunks = chunkText(contenido.trim());

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(chunks);
  } catch {
    return NextResponse.json({ error: 'Embedding service unavailable' }, { status: 502 });
  }

  try {
    const chunkData = chunks.map((texto, i) => ({
      texto,
      embedding: embeddings[i],
      posicion: i,
    }));
    const doc = await insertDocumentWithChunks(titulo.trim(), 'nota', chunkData);
    return NextResponse.json({ id: doc.id, nombre: doc.nombre }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
