import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerTools(server: McpServer): void {
  server.registerTool(
    "progress",
    {
      title: "Learner progress",
      description:
        "Mastery, streak, weak topics and next due review for a learner in a course. Use when the learner asks how they are doing.",
      inputSchema: {
        course_id: z.string().describe("Course identifier, e.g. mit-6.0001"),
        learner_id: z.string().describe("Learner identifier"),
      },
    },
    async ({ course_id, learner_id }) => {
      // Stub until the learner store lands.
      const summary = {
        course_id,
        learner_id,
        concepts_tracked: 0,
        due_today: 0,
        streak_days: 0,
        weak_topics: [] as string[],
      };
      return {
        content: [
          { type: "text", text: `No reviews yet for ${learner_id} in ${course_id}. Say "start a review" to begin.` },
        ],
        structuredContent: summary,
      };
    },
  );
}
