import type { Chunk } from "../retrieval/types.js";

/**
 * Splits a course note into chunks. Format:
 *   ---\n concept: <id>\n citation: <text>\n ---\n ## Heading\n paragraphs...
 * One chunk per "## " section.
 */
export function chunkNote(courseId: string, source: string, markdown: string): Chunk[] {
  const { meta, body } = parseFrontmatter(markdown);
  const conceptId = meta.concept;
  const citation = meta.citation;
  if (!conceptId || !citation) throw new Error(`${source}: frontmatter needs 'concept' and 'citation'`);

  const chunks: Chunk[] = [];
  for (const section of body.split(/^## /m).slice(1)) {
    const nl = section.indexOf("\n");
    const heading = section.slice(0, nl).trim();
    const text = section.slice(nl + 1).trim().replace(/\s*\n\s*/g, " ");
    if (!text) continue;
    chunks.push({ id: `${courseId}/${conceptId}/${chunks.length}`, courseId, conceptId, heading, text, citation });
  }
  return chunks;
}

function parseFrontmatter(markdown: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(markdown);
  if (!m) return { meta: {}, body: markdown };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: markdown.slice(m[0].length) };
}
