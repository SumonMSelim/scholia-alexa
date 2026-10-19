import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory.js";
import { KeywordTutor } from "../tutor/keyword.js";
import { ReviewService, SESSION_SIZE, streak } from "./service.js";

const COURSE = "mit-6.0001";
const LEARNER = "test-learner";
const T0 = new Date("2026-10-08T09:00:00Z");

function make(store = new MemoryStore(), clock: { now: Date } = { now: T0 }) {
  return { store, clock, svc: new ReviewService(store, new KeywordTutor(), () => clock.now) };
}

describe("ReviewService", () => {
  it("first session serves fresh concepts up to SESSION_SIZE", async () => {
    const { svc } = make();
    const start = await svc.startReview(LEARNER, COURSE);
    expect(start.due).toBe(0);
    expect(start.fresh).toBe(SESSION_SIZE);
    expect(start.total).toBe(SESSION_SIZE);
  });

  it("asks, grades, schedules and reports progress", async () => {
    const { svc } = make();
    const { sessionId } = await svc.startReview(LEARNER, COURSE);

    const q = await svc.nextQuestion(sessionId);
    expect(q.done).toBe(false);
    expect(q.question).toMatch(/explain/i);

    const good = await svc.submitAnswer(
      sessionId,
      "A variable is a name bound to a value. Each value has a type like int or float. Assignment with = binds the name.",
    );
    expect(good.grade).toBeGreaterThanOrEqual(4);
    expect(good.nextReviewInDays).toBe(1);
    expect(good.citation).toContain("Lecture 1");

    await svc.nextQuestion(sessionId);
    const bad = await svc.submitAnswer(sessionId, "I do not remember.");
    expect(bad.grade).toBeLessThan(3);

    const p = await svc.progress(LEARNER, COURSE);
    expect(p.conceptsTracked).toBe(2);
    expect(p.weakTopics).toHaveLength(1);
    expect(p.streakDays).toBe(1);
  });

  it("rejects submit without a pending question and repeats the same question until answered", async () => {
    const { svc } = make();
    const { sessionId } = await svc.startReview(LEARNER, COURSE);
    await expect(svc.submitAnswer(sessionId, "x")).rejects.toThrow(/next_question/);
    const q1 = await svc.nextQuestion(sessionId);
    const q2 = await svc.nextQuestion(sessionId);
    expect(q2.question).toBe(q1.question);
  });

  it("ends the session when the queue is empty", async () => {
    const { svc } = make();
    const { sessionId, total } = await svc.startReview(LEARNER, COURSE);
    for (let i = 0; i < total; i++) {
      await svc.nextQuestion(sessionId);
      await svc.submitAnswer(sessionId, "answer");
    }
    expect((await svc.nextQuestion(sessionId)).done).toBe(true);
  });

  it("remembers across sessions: failed concept comes back first next day", async () => {
    const { svc, clock } = make();
    const s1 = await svc.startReview(LEARNER, COURSE);
    const q1 = await svc.nextQuestion(s1.sessionId);
    await svc.submitAnswer(s1.sessionId, "no idea"); // fail -> due in 1 day, lapses 1
    await svc.nextQuestion(s1.sessionId);
    await svc.submitAnswer(
      s1.sessionId,
      "Branching chooses a path from a boolean condition using if, elif and else. Indentation marks the block.",
    ); // pass -> due in 1 day

    clock.now = new Date("2026-10-09T09:00:00Z");
    const s2 = await svc.startReview(LEARNER, COURSE);
    expect(s2.due).toBe(2);
    const q2 = await svc.nextQuestion(s2.sessionId);
    expect(q2.concept).toBe(q1.concept); // lapsed concept is asked first
  });

  it("persists through a new service instance over the same store", async () => {
    const store = new MemoryStore();
    const a = make(store);
    const s = await a.svc.startReview(LEARNER, COURSE);
    await a.svc.nextQuestion(s.sessionId);
    await a.svc.submitAnswer(s.sessionId, "answer");

    const b = make(store);
    const p = await b.svc.progress(LEARNER, COURSE);
    expect(p.conceptsTracked).toBe(1);
    const q = await b.svc.nextQuestion(s.sessionId);
    expect(q.done).toBe(false);
  });
});

describe("streak", () => {
  const now = new Date("2026-10-08T20:00:00Z");
  it("counts consecutive days ending today", () => {
    expect(streak(["2026-10-06T01:00:00Z", "2026-10-07T01:00:00Z", "2026-10-08T01:00:00Z"], now)).toBe(3);
  });
  it("still counts when today has no review yet", () => {
    expect(streak(["2026-10-06T01:00:00Z", "2026-10-07T01:00:00Z"], now)).toBe(2);
  });
  it("breaks on a gap", () => {
    expect(streak(["2026-10-05T01:00:00Z", "2026-10-08T01:00:00Z"], now)).toBe(1);
  });
  it("is zero with no history", () => {
    expect(streak([], now)).toBe(0);
  });
});
