import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Retriever } from "../retrieval/retriever.js";
import type { ReviewService } from "../review/service.js";

const courseId = z.string().describe("Course identifier, e.g. mit-6.0001");
const learnerId = z.string().describe("Stable learner identifier");
const sessionId = z.string().describe("Review session id returned by start_review");

export function registerTools(server: McpServer, svc: ReviewService, retriever: Retriever): void {
  server.registerTool(
    "start_review",
    {
      title: "Start a review session",
      description:
        "Begin a short spaced-repetition review. Picks concepts that are due (forgotten soonest first) and a few new ones. Returns a session_id to pass to next_question.",
      inputSchema: { course_id: courseId, learner_id: learnerId },
    },
    async ({ course_id, learner_id }) => {
      const r = await svc.startReview(learner_id, course_id);
      const text =
        r.total === 0
          ? "Nothing is due right now and you have seen every concept. Come back later."
          : `Let's review. ${r.due} due, ${r.fresh} new. ${r.total} questions total.`;
      return { content: [{ type: "text", text }], structuredContent: { session_id: r.sessionId, due: r.due, fresh: r.fresh, total: r.total } };
    },
  );

  server.registerTool(
    "next_question",
    {
      title: "Next question",
      description: "Get the next question in the session. Read it to the learner, then call submit_answer with their reply. done=true means the session is over.",
      inputSchema: { session_id: sessionId },
    },
    async ({ session_id }) => {
      const r = await svc.nextQuestion(session_id);
      const text = r.done ? "That's the end of this review. Ask for your progress to see how you did." : r.question!;
      return { content: [{ type: "text", text }], structuredContent: { done: r.done, concept: r.concept, question: r.question, remaining: r.remaining } };
    },
  );

  server.registerTool(
    "submit_answer",
    {
      title: "Submit the learner's answer",
      description: "Grade the learner's spoken answer to the current question, update their memory schedule, and return feedback with a course citation.",
      inputSchema: { session_id: sessionId, answer: z.string().describe("The learner's answer, transcribed") },
    },
    async ({ session_id, answer }) => {
      const r = await svc.submitAnswer(session_id, answer);
      const when = r.nextReviewInDays === 1 ? "tomorrow" : `in ${r.nextReviewInDays} days`;
      const text = `${r.feedback} Source: ${r.citation}. I'll ask again ${when}.`;
      return { content: [{ type: "text", text }], structuredContent: { grade: r.grade, feedback: r.feedback, citation: r.citation, next_review_in_days: r.nextReviewInDays, remaining: r.remaining } };
    },
  );

  server.registerTool(
    "progress",
    {
      title: "Learner progress",
      description: "Mastery, streak, weak topics and what is due for a learner in a course. Use when the learner asks how they are doing.",
      inputSchema: { course_id: courseId, learner_id: learnerId },
    },
    async ({ course_id, learner_id }) => {
      const p = await svc.progress(learner_id, course_id);
      const pct = Math.round(p.mastery * 100);
      const weak = p.weakTopics.length ? ` Weak spots: ${p.weakTopics.join(", ")}.` : "";
      const text =
        p.conceptsTracked === 0
          ? `No reviews yet in ${course_id}. Say "start a review" to begin.`
          : `You've covered ${p.conceptsTracked} of ${p.conceptsTotal} concepts at ${pct}% mastery. ${p.dueNow} due now. Streak: ${p.streakDays} days.${weak}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          course_id: p.courseId,
          learner_id: p.learnerId,
          concepts_tracked: p.conceptsTracked,
          concepts_total: p.conceptsTotal,
          due_now: p.dueNow,
          mastery: p.mastery,
          streak_days: p.streakDays,
          weak_topics: p.weakTopics,
          next_due: p.nextDue,
        },
      };
    },
  );

  server.registerTool(
    "explain",
    {
      title: "Explain a concept from the course",
      description:
        "Short grounded explanation of a concept, taken from the course notes with a citation. Use when the learner asks what something means or gets a question wrong and wants to understand why.",
      inputSchema: { course_id: courseId, concept: z.string().describe("Concept name or the learner's question, e.g. 'recursion' or 'why does my while loop never stop'") },
    },
    async ({ course_id, concept }) => {
      const hits = await retriever.explain(course_id, concept);
      if (hits.length === 0) return { content: [{ type: "text", text: `I have no notes for ${concept} in ${course_id}.` }], structuredContent: { passages: [] } };
      const text = hits.map((h) => `${h.text} (${h.citation})`).join(" ");
      return {
        content: [{ type: "text", text }],
        structuredContent: { passages: hits.map((h) => ({ concept: h.conceptId, heading: h.heading, text: h.text, citation: h.citation })) },
      };
    },
  );
}
