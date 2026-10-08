/**
 * SM-2 spaced repetition (Wozniak, 1990) adapted for voice review.
 * Grade 0..5: 0-2 = fail (reset interval), 3-5 = pass.
 */
export interface ConceptState {
  ease: number; // easiness factor, min 1.3
  intervalDays: number; // current interval
  reps: number; // consecutive successful reviews
  lapses: number; // total failures
  due: string; // ISO date when next review is due
  lastGrade?: number;
}

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

export function newConceptState(now: Date = new Date()): ConceptState {
  return { ease: DEFAULT_EASE, intervalDays: 0, reps: 0, lapses: 0, due: now.toISOString() };
}

export function review(state: ConceptState, grade: number, now: Date = new Date()): ConceptState {
  if (!Number.isInteger(grade) || grade < 0 || grade > 5) {
    throw new RangeError(`grade must be an integer 0..5, got ${grade}`);
  }

  let { ease, intervalDays, reps, lapses } = state;

  if (grade < 3) {
    reps = 0;
    lapses += 1;
    intervalDays = 1;
  } else {
    reps += 1;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * ease);
  }

  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

  const due = new Date(now.getTime() + intervalDays * 86_400_000).toISOString();
  return { ease, intervalDays, reps, lapses, due, lastGrade: grade };
}

export function isDue(state: ConceptState, now: Date = new Date()): boolean {
  return new Date(state.due).getTime() <= now.getTime();
}

/** 0..1 mastery estimate for a progress card. */
export function mastery(state: ConceptState): number {
  if (state.reps === 0) return 0;
  const intervalScore = Math.min(1, state.intervalDays / 30);
  const easeScore = (state.ease - MIN_EASE) / (DEFAULT_EASE + 0.5 - MIN_EASE);
  return Math.round(((intervalScore * 0.7 + easeScore * 0.3) * 100)) / 100;
}
