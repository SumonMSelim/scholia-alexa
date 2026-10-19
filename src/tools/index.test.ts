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

async function endAfter(answer: string) {
  const server = new McpServer({ name: "t", version: "0" });
  registerTools(server, new ReviewService(new MemoryStore(), new KeywordTutor()), new Retriever(new LocalVectorIndex(), new HashEmbedder()));
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(c);
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
