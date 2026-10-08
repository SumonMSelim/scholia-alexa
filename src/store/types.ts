import type { ConceptState } from "../scheduler/sm2.js";

export interface ConceptRecord extends ConceptState {
  learnerId: string;
  courseId: string;
  conceptId: string;
}

export interface PendingQuestion {
  conceptId: string;
  question: string;
  reference: string;
  citation: string;
}

export interface ReviewSession {
  sessionId: string;
  learnerId: string;
  courseId: string;
  queue: string[]; // concept ids still to ask
  asked: number;
  correct: number;
  current?: PendingQuestion;
  startedAt: string;
}

export interface HistoryEntry {
  learnerId: string;
  courseId: string;
  conceptId: string;
  grade: number;
  at: string;
}

export interface LearnerStore {
  getConcept(learnerId: string, courseId: string, conceptId: string): Promise<ConceptRecord | undefined>;
  putConcept(record: ConceptRecord): Promise<void>;
  listConcepts(learnerId: string, courseId: string): Promise<ConceptRecord[]>;
  getSession(sessionId: string): Promise<ReviewSession | undefined>;
  putSession(session: ReviewSession): Promise<void>;
  appendHistory(entry: HistoryEntry): Promise<void>;
  listHistory(learnerId: string, courseId: string): Promise<HistoryEntry[]>;
}
