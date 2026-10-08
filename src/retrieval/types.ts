export interface Chunk {
  id: string;
  courseId: string;
  conceptId: string;
  /** Section heading inside the source note. */
  heading: string;
  text: string;
  /** Human-readable source pointer, e.g. "Lecture 6, Guttag ch. 4.3". */
  citation: string;
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

export interface VectorIndex {
  upsert(chunks: Chunk[], vectors: number[][]): Promise<void>;
  search(courseId: string, vector: number[], k: number): Promise<ScoredChunk[]>;
}
