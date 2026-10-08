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

/** Produces and grades questions. Stub now; Bedrock Nova later. */
export interface Tutor {
  generateQuestion(concept: Concept, priorGrades: number[]): Promise<GeneratedQuestion>;
  grade(concept: Concept, question: GeneratedQuestion, answer: string): Promise<Grading>;
}
