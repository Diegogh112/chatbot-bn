import { embedQuery } from './embeddings';
import { searchChunks } from './database';
import { generateAnswer, HistoryMessage } from './llm';
import type { ChatResponse } from './database';

export const SIMILARITY_THRESHOLD = 0.3;
export const TOP_K = 6;
export const FALLBACK_ANSWER = 'No encontré información suficiente en la base de conocimiento';

export function buildPrompt(question: string, context: string): string {
  return (
    `Eres Banquito, asistente experto en gestión de proyectos y demanda TI del Banco de la Nación del Perú.\n\n` +
    `REGLAS:\n` +
    `- Responde ÚNICAMENTE con la información del contexto de documentos. No inventes ni omitas datos.\n` +
    `- Si el contexto contiene una tabla, inclúyela COMPLETA en tu respuesta sin omitir ninguna fila ni valor.\n` +
    `- No repitas la misma información dos veces.\n` +
    `- Usa **negritas** para el dato más importante.\n` +
    `- Si la pregunta requiere combinar o razonar sobre múltiples datos, hazlo paso a paso.\n` +
    `- Puedes usar el historial de la conversación para dar respuestas más precisas y contextualmente relevantes.\n` +
    `- Responde en español.\n` +
    `- Si la información no está disponible di: "No encontré esa información en los documentos."\n\n` +
    `CONTEXTO DE DOCUMENTOS:\n${context}\n\n` +
    `PREGUNTA: ${question}\n\n` +
    `RESPUESTA:`
  );
}

export interface RagQueryOptions {
  history?: HistoryMessage[];
}

export async function ragQuery(
  question: string,
  options: RagQueryOptions = {},
): Promise<ChatResponse> {
  const queryEmbedding = await embedQuery(question);
  const chunks = await searchChunks(queryEmbedding, TOP_K);

  if (chunks.length === 0 || chunks[0].similarity < SIMILARITY_THRESHOLD) {
    return { answer: FALLBACK_ANSWER, sources: [] };
  }

  // Deduplicate chunks: skip any chunk whose text is substantially contained
  // in an already-selected chunk (case-insensitive, ignoring whitespace).
  const seen: string[] = [];
  const uniqueChunks = chunks.filter((c) => {
    const normalized = c.texto.replace(/\s+/g, ' ').toLowerCase().trim();
    const isDuplicate = seen.some(
      (s) => s.includes(normalized) || normalized.includes(s)
    );
    if (!isDuplicate) seen.push(normalized);
    return !isDuplicate;
  });

  const context = uniqueChunks.map((c) => c.texto).join('\n\n---\n\n');
  const prompt = buildPrompt(question, context);
  const answer = await generateAnswer(prompt, options.history ?? []);
  const sources = Array.from(new Set(uniqueChunks.map((c) => c.nombre)));

  return { answer, sources };
}
