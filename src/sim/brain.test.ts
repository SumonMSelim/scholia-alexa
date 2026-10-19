import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConverseCommand, Message } from "@aws-sdk/client-bedrock-runtime";
import { HashEmbedder } from "../retrieval/embedder.js";
import { LocalVectorIndex } from "../retrieval/local.js";
import { Retriever } from "../retrieval/retriever.js";
import { ReviewService } from "../review/service.js";
import { MemoryStore } from "../store/memory.js";
import { registerTools } from "../tools/index.js";
import { KeywordTutor } from "../tutor/keyword.js";
import { PROGRESS_CARD, registerCards } from "../ui/cards.js";
import { Brain, stripThinking } from "./brain.js";
import { McpSession, UI_CAPABILITY, toConverseTools } from "./mcp.js";

async function session(): Promise<McpSession> {
  const server = new McpServer({ name: "t", version: "0" });
  registerTools(server, new ReviewService(new MemoryStore(), new KeywordTutor()), new Retriever(new LocalVectorIndex(), new HashEmbedder()));
  registerCards(server);
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "test", version: "0" }, { capabilities: UI_CAPABILITY });
  await client.connect(c);
  return new McpSession(client);
}

/** Scripted model: each entry is what Nova "says" for one Converse call. */
function scripted(turns: Message[]) {
  const seen: ConverseCommand["input"][] = [];
  const client = {
    async send(cmd: ConverseCommand) {
      seen.push(structuredClone(cmd.input)); // history array is mutated later; keep a snapshot
      const message = turns.shift()!;
      const stopReason = message.content?.some((b) => b.toolUse) ? "tool_use" : "end_turn";
      return { stopReason, output: { message } };
    },
  };
  return { client, seen };
}

describe("toConverseTools", () => {
  it("maps MCP tools to toolSpecs with JSON schema", async () => {
    const tools = toConverseTools(await (await session()).tools());
    const names = tools.map((t) => t.toolSpec!.name).sort();
    expect(names).toEqual(["end_review", "explain", "next_question", "progress", "start_review", "submit_answer"]);
    const start = tools.find((t) => t.toolSpec!.name === "start_review")!.toolSpec!;
    expect((start.inputSchema!.json as { properties: object }).properties).toHaveProperty("learner_id");
  });
});

describe("Brain", () => {
  it("runs the tool loop, feeds results back, and captures the card", async () => {
    const { client, seen } = scripted([
      { role: "assistant", content: [{ toolUse: { toolUseId: "t1", name: "progress", input: { course_id: "mit-6.0001", learner_id: "demo" } } }] },
      { role: "assistant", content: [{ text: "You have not started yet. Want to begin a review?" }] },
    ]);
    const brain = new Brain(await session(), "demo", "mit-6.0001", client, "m");
    const turn = await brain.respond("how am I doing");

    expect(turn.speech).toBe("You have not started yet. Want to begin a review?");
    expect(turn.toolCalls).toEqual([{ name: "progress", args: { course_id: "mit-6.0001", learner_id: "demo" } }]);
    expect(turn.card?.resourceUri).toBe(PROGRESS_CARD);
    expect(turn.card?.html).toContain("<!doctype html>");
    expect((turn.card?.structuredContent as { concepts_total: number }).concepts_total).toBe(11);

    // second Converse call carries the tool result back to the model, with system prompt naming the learner
    const second = seen[1];
    expect(second.system?.[0].text).toContain('"demo"');
    const toolResult = second.messages?.at(-1)?.content?.[0].toolResult;
    expect(toolResult?.toolUseId).toBe("t1");
    expect(toolResult?.content?.[0].text).toMatch(/Nothing reviewed yet/);
    expect(toolResult?.content?.[0].text).toContain('"concepts_total":11');
    expect(toolResult?.content).toHaveLength(1);
    expect(second.inferenceConfig?.maxTokens).toBe(400);
  });

  it("drops thinking blocks from speech", () => {
    expect(stripThinking("<thinking> plan </thinking>\nHere is the question.")).toBe("Here is the question.");
    expect(stripThinking("plain")).toBe("plain");
  });

  it("keeps history across turns", async () => {
    const { client, seen } = scripted([
      { role: "assistant", content: [{ text: "Hi." }] },
      { role: "assistant", content: [{ text: "Still here." }] },
    ]);
    const brain = new Brain(await session(), "demo", "mit-6.0001", client, "m");
    await brain.respond("hello");
    await brain.respond("you there?");
    expect(seen[1].messages).toHaveLength(3);
  });
});
