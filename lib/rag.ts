import { embedQuery } from './embeddings';
import { searchChunks } from './database';
import { generateAnswer, HistoryMessage } from './llm';
import type { ChatResponse } from './database';

export const SIMILARITY_THRESHOLD = 0.3;
export const TOP_K = 4;
export const FALLBACK_ANSWER = 'No encontré información suficiente en la base de conocimiento';

export function buildPrompt(question: string, context: string): string {
  return (
    `Eres Banquito, asistente experto en gestión de proyectos y demanda TI del Banco de la Nación del Perú.\n\n` +
    `REGLAS:\n` +
    `- Responde directamente a lo que se pregunta.\n` +
    `- Da 1-2 oraciones de contexto antes del dato principal.\n` +
    `- Si hay datos tabulares usa UNA tabla Markdown.\n` +
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

  const context = chunks.map((c) => c.texto).join('\n\n');
  const prompt = buildPrompt(question, context);
  const answer = await generateAnswer(prompt, options.history ?? []);
  const sources = Array.from(new Set(chunks.map((c) => c.nombre)));

  return { answer, sources };
}
