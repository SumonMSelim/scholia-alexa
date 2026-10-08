import { randomUUID } from "node:crypto";
import { getCourse } from "../course/catalog.js";
import type { Retriever } from "../retrieval/retriever.js";
import { isDue, mastery, newConceptState, review } from "../scheduler/sm2.js";
import type { ConceptRecord, LearnerStore, ReviewSession } from "../store/types.js";
import type { Tutor } from "../tutor/types.js";

export const SESSION_SIZE = 5;

export interface StartResult {
  sessionId: string;
  due: number;
  fresh: number;
  total: number;
}

export interface QuestionResult {
  done: boolean;
  sessionId: string;
  concept?: string;
  question?: string;
  remaining: number;
}

export interface AnswerResult {
  grade: number;
  feedback: string;
  citation: string;
  nextReviewInDays: number;
  remaining: number;
}

export interface ProgressResult {
  courseId: string;
  learnerId: string;
  conceptsTracked: number;
  conceptsTotal: number;
  dueNow: number;
  mastery: number;
  streakDays: number;
  weakTopics: string[];
  nextDue?: string;
}

export class ReviewService {
  constructor(
    private readonly store: LearnerStore,
    private readonly tutor: Tutor,
    private readonly now: () => Date = () => new Date(),
    private readonly retriever?: Retriever,
  ) {}

  /** Builds a queue: overdue concepts first (most lapses first), then unseen concepts, capped at SESSION_SIZE. */
  async startReview(learnerId: string, courseId: string): Promise<StartResult> {
    const course = getCourse(courseId);
    const now = this.now();
    const records = await this.store.listConcepts(learnerId, courseId);
    const byId = new Map(records.map((r) => [r.conceptId, r]));

    const due = records
      .filter((r) => isDue(r, now))
      .sort((a, b) => b.lapses - a.lapses || a.due.localeCompare(b.due))
      .map((r) => r.conceptId);
    const fresh = course.concepts.map((c) => c.id).filter((id) => !byId.has(id));

    const queue = [...due, ...fresh].slice(0, SESSION_SIZE);
    const session: ReviewSession = {
      sessionId: randomUUID(),
      learnerId,
      courseId,
      queue,
      asked: 0,
      correct: 0,
      startedAt: now.toISOString(),
    };
    await this.store.putSession(session);
    return {
      sessionId: session.sessionId,
      due: Math.min(due.length, queue.length),
      fresh: queue.length - Math.min(due.length, queue.length),
      total: queue.length,
    };
  }

  async nextQuestion(sessionId: string): Promise<QuestionResult> {
    const session = await this.requireSession(sessionId);
    if (session.current) {
      return { done: false, sessionId, concept: session.current.conceptId, question: session.current.question, remaining: session.queue.length };
    }
    const conceptId = session.queue.shift();
    if (!conceptId) return { done: true, sessionId, remaining: 0 };

    const course = getCourse(session.courseId);
    const concept = course.concepts.find((c) => c.id === conceptId)!;
    const history = await this.store.listHistory(session.learnerId, session.courseId);
    const priorGrades = history.filter((h) => h.conceptId === conceptId).map((h) => h.grade);
    const passages = this.retriever ? await this.retriever.notesFor(session.courseId, concept.id) : [];
    const generated = await this.tutor.generateQuestion(concept, priorGrades, passages);

    session.current = { conceptId, question: generated.question, reference: generated.reference, citation: concept.citation };
    await this.store.putSession(session);
    return { done: false, sessionId, concept: concept.name, question: generated.question, remaining: session.queue.length };
  }

  async submitAnswer(sessionId: string, answer: string): Promise<AnswerResult> {
    const session = await this.requireSession(sessionId);
    const current = session.current;
    if (!current) throw new Error("No question pending. Call next_question first.");

    const course = getCourse(session.courseId);
    const concept = course.concepts.find((c) => c.id === current.conceptId)!;
    const grading = await this.tutor.grade(concept, { question: current.question, reference: current.reference }, answer);

    const now = this.now();
    const existing = await this.store.getConcept(session.learnerId, session.courseId, concept.id);
    const state = review(existing ?? newConceptState(now), grading.grade, now);
    const record: ConceptRecord = { learnerId: session.learnerId, courseId: session.courseId, conceptId: concept.id, ...state };
    await this.store.putConcept(record);
    await this.store.appendHistory({
      learnerId: session.learnerId,
      courseId: session.courseId,
      conceptId: concept.id,
      grade: grading.grade,
      at: now.toISOString(),
    });

    session.asked += 1;
    if (grading.grade >= 3) session.correct += 1;
    session.current = undefined;
    await this.store.putSession(session);

    return {
      grade: grading.grade,
      feedback: grading.feedback,
      citation: concept.citation,
      nextReviewInDays: state.intervalDays,
      remaining: session.queue.length,
    };
  }

  async progress(learnerId: string, courseId: string): Promise<ProgressResult> {
    const course = getCourse(courseId);
    const now = this.now();
    const records = await this.store.listConcepts(learnerId, courseId);
    const history = await this.store.listHistory(learnerId, courseId);
    const names = new Map(course.concepts.map((c) => [c.id, c.name]));

    const dueNow = records.filter((r) => isDue(r, now)).length;
    const avgMastery = records.length ? records.reduce((s, r) => s + mastery(r), 0) / records.length : 0;
    const weakTopics = records
      .filter((r) => r.lapses > 0 || (r.lastGrade ?? 5) < 3)
      .sort((a, b) => b.lapses - a.lapses)
      .slice(0, 3)
      .map((r) => names.get(r.conceptId) ?? r.conceptId);
    const upcoming = records.filter((r) => !isDue(r, now)).map((r) => r.due).sort()[0];

    return {
      courseId,
      learnerId,
      conceptsTracked: records.length,
      conceptsTotal: course.concepts.length,
      dueNow,
      mastery: Math.round(avgMastery * 100) / 100,
      streakDays: streak(history.map((h) => h.at), now),
      weakTopics,
      nextDue: upcoming,
    };
  }

  private async requireSession(sessionId: string): Promise<ReviewSession> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    return session;
  }
}

/** Consecutive UTC days ending today (or yesterday) with at least one review. */
export function streak(timestamps: string[], now: Date): number {
  const days = new Set(timestamps.map((t) => t.slice(0, 10)));
  if (days.size === 0) return 0;
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!days.has(day.toISOString().slice(0, 10))) day.setUTCDate(day.getUTCDate() - 1);
  let count = 0;
  while (days.has(day.toISOString().slice(0, 10))) {
    count += 1;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return count;
}
