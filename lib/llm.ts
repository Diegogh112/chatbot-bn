import { CohereClient } from 'cohere-ai';

// ---------------------------------------------------------------------------
// Startup guard — fail fast if COHERE_API_KEY is missing (Requirement 8.2, 8.4)
// ---------------------------------------------------------------------------
if (!process.env.COHERE_API_KEY) {
  throw new Error('COHERE_API_KEY environment variable is not set');
}

// ---------------------------------------------------------------------------
// Singleton Cohere client (shared across serverless invocations when the
// module is cached — mirrors the pattern used in lib/embeddings.ts)
// ---------------------------------------------------------------------------
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });

/**
 * Sends a prompt to Cohere command-r and returns the generated answer text.
 *
 * The `cohere.chat` API is used here because `cohere.generate` is deprecated
 * in the cohere-ai v7+ SDK. The prompt is passed as a single user message;
 * no chat history is maintained (stateless, one-shot RAG pattern).
 *
 * @param prompt - The fully-assembled RAG prompt (question + retrieved context)
 * @returns The LLM's response text
 * @throws Error with a descriptive message on API failure — callers are
 *         expected to catch this and return HTTP 502 to the client
 *
 * Requirements: 4.3, 8.2
 */
export async function generateAnswer(prompt: string): Promise<string> {
  try {
    const res = await cohere.chat({
      model: 'command-r-08-2024',
      message: prompt,
      maxTokens: 800,
    });

    const text = res.text;

    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('Cohere command-r returned an empty response');
    }

    return text;
  } catch (err) {
    // Re-throw with a descriptive message so callers can surface a proper
    // HTTP 502 without leaking internal SDK error details to the client.
    const message =
      err instanceof Error ? err.message : 'Unknown error from Cohere API';
    throw new Error(`LLM service error: ${message}`);
  }
}
