import { CohereClient } from 'cohere-ai';

// Startup guard — fail fast if COHERE_API_KEY is missing (Requirement 8.2, 8.4)
if (!process.env.COHERE_API_KEY) {
  throw new Error('COHERE_API_KEY environment variable is not set');
}

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });

// Cohere embed API accepts at most 96 texts per request
const COHERE_BATCH_SIZE = 96;

/**
 * Generates embeddings for an array of document texts.
 * Automatically batches the input into groups of 96 (Cohere API limit).
 *
 * @param texts - Array of text strings to embed
 * @returns A 2-D array where each row is the embedding vector for the
 *          corresponding input text (1024 dimensions for embed-multilingual-v3)
 *
 * Requirements: 1.4, 8.2
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += COHERE_BATCH_SIZE) {
    const batch = texts.slice(i, i + COHERE_BATCH_SIZE);
    const res = await cohere.embed({
      texts: batch,
      model: 'embed-multilingual-v3.0',
      inputType: 'search_document',
    });
    results.push(...(res.embeddings as number[][]));
  }

  return results;
}

/**
 * Generates an embedding for a single query string.
 * Uses inputType 'search_query' so the model optimises the vector
 * for retrieval (as opposed to document indexing).
 *
 * @param question - The user's natural-language question
 * @returns A 1-D embedding vector (1024 dimensions)
 *
 * Requirements: 4.1, 8.2
 */
export async function embedQuery(question: string): Promise<number[]> {
  const res = await cohere.embed({
    texts: [question],
    model: 'embed-multilingual-v3.0',
    inputType: 'search_query',
  });
  return (res.embeddings as number[][])[0];
}
