import { CohereClient } from 'cohere-ai';

if (!process.env.COHERE_API_KEY) {
  throw new Error('COHERE_API_KEY environment variable is not set');
}

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY! });

export interface HistoryMessage {
  role: 'USER' | 'CHATBOT';
  message: string;
}

/**
 * Generates an answer using Cohere command-r7b-12-2024 with optional chat history.
 * This model is optimized for speed (~5-8s) and supports reasoning.
 */
export async function generateAnswer(
  prompt: string,
  history: HistoryMessage[] = [],
): Promise<string> {
  try {
    const res = await cohere.chat({
      model: 'command-r7b-12-2024',
      message: prompt,
      chatHistory: history,
      maxTokens: 700,
    });

    const text = res.text;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('Cohere returned an empty response');
    }
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error from Cohere API';
    throw new Error(`LLM service error: ${message}`);
  }
}
