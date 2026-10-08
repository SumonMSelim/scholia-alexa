import type { Concept } from "../course/types.js";

export interface GeneratedQuestion {
  question: string;
  reference: string;
}

export interface Grading {
  /** SM-2 grade 0..5 */
  grade: number;
  /** One or two spoken sentences: what was right, what was missing. */
  feedback: string;
}

/** Produces and grades questions. KeywordTutor for tests, BedrockTutor for real use. */
export interface Tutor {
  /** passages: retrieved course notes for grounding; may be empty. */
  generateQuestion(concept: Concept, priorGrades: number[], passages?: string[]): Promise<GeneratedQuestion>;
  grade(concept: Concept, question: GeneratedQuestion, answer: string): Promise<Grading>;
}
