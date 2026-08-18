import { embedQuery } from './embeddings';
import { searchChunks } from './database';
import { generateAnswer } from './llm';
import type { ChatResponse } from './database';

// ---------------------------------------------------------------------------
// Constants — Requirement 4.2, 4.5, 4.6
// ---------------------------------------------------------------------------

/** Minimum cosine similarity score for a chunk to be considered relevant. */
export const SIMILARITY_THRESHOLD = 0.3;

/** Maximum number of chunks to retrieve from the vector store. */
export const TOP_K = 4;

/** Answer returned when no relevant chunks are found above the threshold. */
export const FALLBACK_ANSWER =
  'No encontré información suficiente en la base de conocimiento';

// ---------------------------------------------------------------------------
// buildPrompt — Requirement 4.3 (Property 10)
// ---------------------------------------------------------------------------

/**
 * Assembles the RAG prompt that is forwarded to the LLM.
 *
 * Each chunk's `texto` is included verbatim as a substring of the context
 * block, so Property 10 ("Prompt contains all retrieved chunk texts") is
 * satisfied by construction.
 *
 * @param question - The user's original question
 * @param context  - All retrieved chunk texts joined with double newlines
 * @returns A fully-assembled prompt string ready for `generateAnswer`
 *
 * Requirements: 4.3
 */
export function buildPrompt(question: string, context: string): string {
  return (
    `Eres Banquito, asistente de gestión de proyectos y demanda TI del Banco de la Nación del Perú.\n\n` +
    `REGLAS:\n` +
    `- Responde directamente a lo que se pregunta, sin información extra no solicitada.\n` +
    `- Da una breve explicación de contexto antes de la respuesta (1-2 oraciones), luego presenta el dato.\n` +
    `- Si la respuesta tiene datos tabulares (cantidades, estados, porcentajes), usa UNA tabla Markdown.\n` +
    `- Usa **negritas** para resaltar el dato más importante.\n` +
    `- Responde en español.\n` +
    `- Si la información no está en el contexto, di: "No encontré esa información en los documentos."\n\n` +
    `CONTEXTO:\n${context}\n\n` +
    `PREGUNTA: ${question}\n\n` +
    `RESPUESTA:`
  );
}

// ---------------------------------------------------------------------------
// ragQuery — Requirement 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
// ---------------------------------------------------------------------------

/**
 * End-to-end RAG pipeline:
 *   1. Embed the question via Cohere embed-multilingual-v3 (search_query)
 *   2. Retrieve the top-K most similar chunks from pgvector
 *   3. If no chunks exceed the similarity threshold → return fallback
 *   4. Assemble the RAG prompt and call Cohere command-r
 *   5. Deduplicate source document names and return the response
 *
 * @param question - The user's natural-language question (non-empty)
 * @returns `ChatResponse` with `answer` (string) and `sources` (unique nombres)
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
export async function ragQuery(question: string): Promise<ChatResponse> {
  // Step 1 — embed the question (Requirement 4.1)
  const queryEmbedding = await embedQuery(question);

  // Step 2 — retrieve top-K chunks by cosine similarity (Requirement 4.2)
  const chunks = await searchChunks(queryEmbedding, TOP_K);

  // Step 3 — threshold check (Requirements 4.5, 4.6)
  if (chunks.length === 0 || chunks[0].similarity < SIMILARITY_THRESHOLD) {
    return { answer: FALLBACK_ANSWER, sources: [] };
  }

  // Step 4 — assemble prompt and call LLM (Requirement 4.3)
  const context = chunks.map((c) => c.texto).join('\n\n');
  const prompt = buildPrompt(question, context);
  const answer = await generateAnswer(prompt);

  // Step 5 — deduplicate source document names (Requirement 4.4)
  const sources = Array.from(new Set(chunks.map((c) => c.nombre)));

  return { answer, sources };
}
