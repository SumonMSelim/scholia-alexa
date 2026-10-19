import { beforeAll, describe, expect, it } from "vitest";
import { loadCourseChunks } from "../ingest/load.js";
import { HashEmbedder } from "./embedder.js";
import { LocalVectorIndex } from "./local.js";
import { Retriever } from "./retriever.js";

describe("Retriever over MIT 6.0001 notes", () => {
  const retriever = new Retriever(new LocalVectorIndex(), new HashEmbedder());

  beforeAll(async () => {
    const chunks = await loadCourseChunks("mit-6.0001");
    expect(chunks.length).toBeGreaterThanOrEqual(30);
    await retriever.ingest(chunks);
  });

  it.each([
    ["recursion", "recursion"],
    ["aliasing", "aliasing"],
    ["why does my while loop never stop", "iteration"],
    ["what is a tuple", "tuples"],
    ["bisection search square root", "bisection-search"],
  ])("'%s' -> %s with a citation", async (query, conceptId) => {
    const [top] = await retriever.explain("mit-6.0001", query, 1);
    expect(top.conceptId).toBe(conceptId);
    expect(top.citation).toMatch(/^Lecture \d+, Guttag ch\. [\d.]+: .+/);
    expect(top.text.length).toBeGreaterThan(50);
  });

  it("notesFor returns every section of one concept", async () => {
    const notes = await retriever.notesFor("mit-6.0001", "variables-and-types");
    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatch(/^Objects, values and types: /);
    expect(notes.join(" ")).not.toMatch(/indentation/);
  });

  it("returns nothing for an unknown course", async () => {
    expect(await retriever.explain("nope", "recursion")).toEqual([]);
  });
});
