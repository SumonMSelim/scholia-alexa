import { describe, expect, it } from "vitest";
import { chunkNote } from "./chunk.js";

const note = `---
concept: recursion
citation: Lecture 6, Guttag ch. 4.3
---

## Base cases

Every recursive function needs a base case.
It stops the recursion.

## Recursive case

Reduce the input and call yourself.
`;

describe("chunkNote", () => {
  it("one chunk per section, paragraphs joined, frontmatter carried", () => {
    const chunks = chunkNote("c1", "r.md", note);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      id: "c1/recursion/0",
      courseId: "c1",
      conceptId: "recursion",
      heading: "Base cases",
      text: "Every recursive function needs a base case. It stops the recursion.",
      citation: "Lecture 6, Guttag ch. 4.3",
    });
    expect(chunks[1].heading).toBe("Recursive case");
  });

  it("rejects notes without concept and citation", () => {
    expect(() => chunkNote("c1", "x.md", "## Only heading\ntext")).toThrow(/frontmatter/);
  });
});
