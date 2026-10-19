import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Chunk } from "../retrieval/types.js";
import { chunkNote } from "./chunk.js";

/** Reads every markdown note under <root>/<courseId> and chunks it. */
export async function loadCourseChunks(courseId: string, root = "courses"): Promise<Chunk[]> {
  const dir = join(root, courseId);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const chunks: Chunk[] = [];
  for (const file of files) {
    const markdown = await readFile(join(dir, file), "utf8");
    chunks.push(...chunkNote(courseId, file, markdown));
  }
  return chunks;
}
