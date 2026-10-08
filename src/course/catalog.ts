import type { Course } from "./types.js";
import mit6_0001 from "./mit-6.0001.json" with { type: "json" };

const courses: Record<string, Course> = { [mit6_0001.id]: mit6_0001 as Course };

export function getCourse(courseId: string): Course {
  const course = courses[courseId];
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  return course;
}

export function listCourses(): Course[] {
  return Object.values(courses);
}
