import type { Chunk, Embedder, VectorIndex } from "./types.js";

export interface Explanation {
  conceptId: string;
  heading: string;
  text: string;
  citation: string;
}

export class Retriever {
  constructor(
    private readonly index: VectorIndex,
    private readonly embedder: Embedder,
  ) {}

  async ingest(chunks: Chunk[]): Promise<void> {
    const vectors = await Promise.all(chunks.map((c) => this.embedder.embed(`${c.heading}. ${c.text}`)));
    await this.index.upsert(chunks, vectors);
  }

  /** Note text for one concept, used to ground question generation. */
  async notesFor(courseId: string, conceptId: string): Promise<string[]> {
    return (await this.index.byConcept(courseId, conceptId)).map((c) => `${c.heading}: ${c.text}`);
  }

  /** Top-k course chunks for a free-text query (a concept name or a learner's question). */
  async explain(courseId: string, query: string, k = 2): Promise<Explanation[]> {
    const vector = await this.embedder.embed(query);
    const hits = await this.index.search(courseId, vector, k);
    return hits.map(({ chunk }) => ({
      conceptId: chunk.conceptId,
      heading: chunk.heading,
      text: chunk.text,
      citation: `${chunk.citation}: ${chunk.heading}`,
    }));
  }
}
