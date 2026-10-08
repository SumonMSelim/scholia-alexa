import type { Chunk, ScoredChunk, VectorIndex } from "./types.js";

/** In-process vector index with cosine similarity. Fine for a few hundred chunks. */
export class LocalVectorIndex implements VectorIndex {
  private readonly rows = new Map<string, { chunk: Chunk; vector: number[] }>();

  async upsert(chunks: Chunk[], vectors: number[][]): Promise<void> {
    chunks.forEach((chunk, i) => this.rows.set(chunk.id, { chunk, vector: vectors[i] }));
  }

  async search(courseId: string, vector: number[], k: number): Promise<ScoredChunk[]> {
    const out: ScoredChunk[] = [];
    for (const { chunk, vector: v } of this.rows.values()) {
      if (chunk.courseId !== courseId) continue;
      out.push({ chunk, score: cosine(vector, v) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }

  get size(): number {
    return this.rows.size;
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
