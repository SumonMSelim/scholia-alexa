import { describe, expect, it } from "vitest";
import { isDue, mastery, newConceptState, review, MIN_EASE } from "./sm2.js";

const now = new Date("2026-10-08T00:00:00Z");

describe("SM-2", () => {
  it("new concept is due immediately", () => {
    expect(isDue(newConceptState(now), now)).toBe(true);
  });

  it("first pass -> 1 day, second pass -> 6 days, third -> interval * ease", () => {
    let s = review(newConceptState(now), 4, now);
    expect(s.intervalDays).toBe(1);
    s = review(s, 4, now);
    expect(s.intervalDays).toBe(6);
    s = review(s, 4, now);
    expect(s.intervalDays).toBe(Math.round(6 * s.ease));
    expect(s.reps).toBe(3);
  });

  it("fail resets reps, counts lapse, interval back to 1 day", () => {
    let s = review(newConceptState(now), 5, now);
    s = review(s, 5, now);
    s = review(s, 1, now);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.intervalDays).toBe(1);
  });

  it("ease never drops below floor", () => {
    let s = newConceptState(now);
    for (let i = 0; i < 20; i++) s = review(s, 0, now);
    expect(s.ease).toBe(MIN_EASE);
  });

  it("grade 5 raises ease, grade 3 lowers it", () => {
    const up = review(newConceptState(now), 5, now);
    const down = review(newConceptState(now), 3, now);
    expect(up.ease).toBeGreaterThan(2.5);
    expect(down.ease).toBeLessThan(2.5);
  });

  it("due is now + interval", () => {
    const s = review(newConceptState(now), 4, now);
    expect(s.due).toBe("2026-10-09T00:00:00.000Z");
    expect(isDue(s, now)).toBe(false);
    expect(isDue(s, new Date("2026-10-09T00:00:00Z"))).toBe(true);
  });

  it("rejects invalid grades", () => {
    expect(() => review(newConceptState(now), 6, now)).toThrow(RangeError);
    expect(() => review(newConceptState(now), 2.5, now)).toThrow(RangeError);
  });

  it("mastery grows with interval and is 0 for unreviewed", () => {
    let s = newConceptState(now);
    expect(mastery(s)).toBe(0);
    s = review(s, 5, now);
    const m1 = mastery(s);
    s = review(s, 5, now);
    s = review(s, 5, now);
    expect(mastery(s)).toBeGreaterThan(m1);
    expect(mastery(s)).toBeLessThanOrEqual(1);
  });
});
