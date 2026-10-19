import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HashEmbedder } from "../retrieval/embedder.js";
import { LocalVectorIndex } from "../retrieval/local.js";
import { Retriever } from "../retrieval/retriever.js";
import { ReviewService } from "../review/service.js";
import { MemoryStore } from "../store/memory.js";
import { KeywordTutor } from "../tutor/keyword.js";
import { registerTools } from "./index.js";

async function connect() {
  const server = new McpServer({ name: "t", version: "0" });
  registerTools(server, new ReviewService(new MemoryStore(), new KeywordTutor()), new Retriever(new LocalVectorIndex(), new HashEmbedder()));
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(c);
  return client;
}

async function endAfter(answer: string) {
  const client = await connect();
  const start = await client.callTool({ name: "start_review", arguments: { course_id: "mit-6.0001", learner_id: "l1" } });
  const sessionId = (start.structuredContent as { session_id: string }).session_id;
  await client.callTool({ name: "next_question", arguments: { session_id: sessionId } });
  await client.callTool({ name: "submit_answer", arguments: { session_id: sessionId, answer } });
  const end = await client.callTool({ name: "end_review", arguments: { session_id: sessionId } });
  return (end.content as { text: string }[])[0].text;
}

describe("end_review wording", () => {
  it("praises a mostly correct session", async () => {
    expect(await endAfter("a name bound to a value with a type like int")).toMatch(/^Nice work\. 1 of 1/);
  });

  it("does not praise a session with no good answers", async () => {
    expect(await endAfter("no idea")).toMatch(/^Good effort, these will stick with practice\. 0 of 1/);
  });
});

describe("progress", () => {
  it("names the course by title, not id, in speech and card data", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "progress", arguments: { course_id: "mit-6.0001", learner_id: "new" } });
    expect((r.content as { text: string }[])[0].text).toMatch(/^Nothing reviewed yet in MIT 6\.0001 Introduction/);
    expect((r.structuredContent as { course_title: string }).course_title).toBe("MIT 6.0001 Introduction to Computer Science and Programming in Python");
  });

  it("says 1 day, not 1 days, for a one-day streak", async () => {
    const client = await connect();
    const start = await client.callTool({ name: "start_review", arguments: { course_id: "mit-6.0001", learner_id: "s1" } });
    const sessionId = (start.structuredContent as { session_id: string }).session_id;
    await client.callTool({ name: "next_question", arguments: { session_id: sessionId } });
    await client.callTool({ name: "submit_answer", arguments: { session_id: sessionId, answer: "a name bound to a value with a type like int" } });
    const r = await client.callTool({ name: "progress", arguments: { course_id: "mit-6.0001", learner_id: "s1" } });
    expect((r.content as { text: string }[])[0].text).toContain("Streak: 1 day.");
  });
});
