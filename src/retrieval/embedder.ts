import type { Embedder } from "./types.js";

/**
 * Local, deterministic embedder: feature-hashed bag of words, L2-normalised.
 * Good enough to pick the right note by topic. Swapped for Titan v2 when S3 Vectors lands.
 */
export class HashEmbedder implements Embedder {
  constructor(private readonly dims = 256) {}

  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(this.dims).fill(0);
    for (const token of tokenize(text)) v[hash(token) % this.dims] += 1;
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "its", "that", "this", "with", "as", "for", "on", "by", "be", "are", "not"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** Crude suffix stripping so "loops" and "loop", "binding" and "bind" collide. */
function stem(t: string): string {
  for (const suf of ["ing", "es", "s", "ed"]) {
    if (t.length > suf.length + 2 && t.endsWith(suf)) return t.slice(0, -suf.length);
  }
  return t;
}

/** FNV-1a 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
