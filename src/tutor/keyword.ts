import type { Concept } from "../course/types.js";
import type { GeneratedQuestion, Grading, Tutor } from "./types.js";

/**
 * Deterministic placeholder tutor. Asks "explain X", grades by keyword coverage.
 * Keeps the review loop testable without an LLM.
 */
export class KeywordTutor implements Tutor {
  async generateQuestion(concept: Concept): Promise<GeneratedQuestion> {
    return {
      question: `In your own words, explain ${concept.name}.`,
      reference: concept.summary,
    };
  }

  async grade(concept: Concept, _q: GeneratedQuestion, answer: string): Promise<Grading> {
    const text = answer.toLowerCase();
    const hits = concept.keywords.filter((k) => text.includes(k.toLowerCase()));
    const coverage = concept.keywords.length ? hits.length / concept.keywords.length : 0;
    const grade = Math.min(5, Math.round(coverage * 6));
    const missed = concept.keywords.filter((k) => !hits.includes(k)).slice(0, 3);
    const feedback =
      grade >= 4
        ? `Good. You covered the key ideas of ${concept.name}.`
        : grade >= 3
          ? `Mostly there. You could also mention: ${missed.join(", ")}.`
          : `Not quite. ${concept.summary}`;
    return { grade, feedback };
  }
}
