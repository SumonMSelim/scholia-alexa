import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HashEmbedder } from "../retrieval/embedder.js";
import { LocalVectorIndex } from "../retrieval/local.js";
import { Retriever } from "../retrieval/retriever.js";
import { ReviewService } from "../review/service.js";
import { MemoryStore } from "../store/memory.js";
import { registerTools } from "../tools/index.js";
import { KeywordTutor } from "../tutor/keyword.js";
import { MIME, PROGRESS_CARD, SESSION_CARD, registerCards } from "./cards.js";

async function connect() {
  const server = new McpServer({ name: "t", version: "0" });
  const svc = new ReviewService(new MemoryStore(), new KeywordTutor());
  registerTools(server, svc, new Retriever(new LocalVectorIndex(), new HashEmbedder()));
  registerCards(server);
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(c);
  return client;
}

describe("MCP Apps cards", () => {
  it("lists both ui:// resources with the mcp-app mime type", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual([PROGRESS_CARD, SESSION_CARD]);
    for (const r of resources) expect(r.mimeType).toBe(MIME);
  });

  it("serves self-contained HTML with the postMessage bridge", async () => {
    const client = await connect();
    const { contents } = await client.readResource({ uri: PROGRESS_CARD });
    const html = (contents[0] as { text: string }).text;
    expect(contents[0].mimeType).toBe(MIME);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('"ui/initialize"');
    expect(html).toContain("ui/notifications/tool-result");
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  it("links progress and end_review tools to their cards and tags results", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const meta = Object.fromEntries(tools.map((t) => [t.name, (t._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri]));
    expect(meta.progress).toBe(PROGRESS_CARD);
    expect(meta.end_review).toBe(SESSION_CARD);
    expect(meta.next_question).toBeUndefined();

    const start = await client.callTool({ name: "start_review", arguments: { course_id: "mit-6.0001", learner_id: "l1" } });
    const sessionId = (start.structuredContent as { session_id: string }).session_id;
    await client.callTool({ name: "next_question", arguments: { session_id: sessionId } });
    await client.callTool({ name: "submit_answer", arguments: { session_id: sessionId, answer: "a name bound to a value with a type like int" } });
    const end = await client.callTool({ name: "end_review", arguments: { session_id: sessionId } });
    expect((end._meta as { ui: { resourceUri: string } }).ui.resourceUri).toBe(SESSION_CARD);
    const sc = end.structuredContent as { asked: number; concepts: { name: string; grade: number }[] };
    expect(sc.asked).toBe(1);
    expect(sc.concepts[0].name).toBe("variables and types");

    const done = await client.callTool({ name: "next_question", arguments: { session_id: sessionId } });
    expect((done.structuredContent as { done: boolean }).done).toBe(true);
  });
});
