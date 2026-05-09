// ============================================================
// TreatNote V2 — OpenAI Embedding Utility
// ============================================================

import 'dotenv/config';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required in .env');

/** Generate embeddings for a batch of texts */
export async function getEmbeddings(
  texts: string[],
  model: string = 'text-embedding-3-large'
): Promise<number[][]> {
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    for (const item of data.data) {
      all.push(item.embedding);
    }
  }
  return all;
}

/** Generate a single embedding */
export async function getEmbedding(
  text: string,
  model: string = 'text-embedding-3-large'
): Promise<number[]> {
  const [emb] = await getEmbeddings([text], model);
  return emb;
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Find top-K most similar items from a corpus */
export function findTopK(
  queryEmbedding: number[],
  corpus: { id: string; embedding: number[] }[],
  k: number = 5
): { id: string; similarity: number }[] {
  const scored = corpus.map(item => ({
    id: item.id,
    similarity: cosineSimilarity(queryEmbedding, item.embedding),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}
