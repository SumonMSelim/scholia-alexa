export interface Concept {
  id: string;
  name: string;
  /** Short reference explanation used as grading ground truth until retrieval lands. */
  summary: string;
  /** Human-readable source pointer, e.g. "Lecture 2, 12:40" or "Guttag ch. 3". */
  citation: string;
  keywords: string[];
}

export interface Course {
  id: string;
  title: string;
  concepts: Concept[];
}
