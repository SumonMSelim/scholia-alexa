import type { ConceptRecord, HistoryEntry, LearnerStore, ReviewSession } from "./types.js";

const conceptKey = (l: string, c: string, k: string) => `${l}|${c}|${k}`;

/** In-memory store for tests and local runs without DynamoDB. */
export class MemoryStore implements LearnerStore {
  private concepts = new Map<string, ConceptRecord>();
  private sessions = new Map<string, ReviewSession>();
  private history: HistoryEntry[] = [];

  async getConcept(learnerId: string, courseId: string, conceptId: string) {
    return this.concepts.get(conceptKey(learnerId, courseId, conceptId));
  }
  async putConcept(record: ConceptRecord) {
    this.concepts.set(conceptKey(record.learnerId, record.courseId, record.conceptId), { ...record });
  }
  async listConcepts(learnerId: string, courseId: string) {
    return [...this.concepts.values()].filter((r) => r.learnerId === learnerId && r.courseId === courseId);
  }
  async getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }
  async putSession(session: ReviewSession) {
    this.sessions.set(session.sessionId, structuredClone(session));
  }
  async appendHistory(entry: HistoryEntry) {
    this.history.push({ ...entry });
  }
  async listHistory(learnerId: string, courseId: string) {
    return this.history.filter((h) => h.learnerId === learnerId && h.courseId === courseId);
  }
}
