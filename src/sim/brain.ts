import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message, type Tool } from "@aws-sdk/client-bedrock-runtime";
import type { McpSession } from "./mcp.js";
import { cardUri, resultBlocks, toConverseTools } from "./mcp.js";

export interface Card {
  resourceUri: string;
  html: string;
  structuredContent: unknown;
}

export interface Turn {
  /** What Alexa says back. */
  speech: string;
  /** Card to render, from the last tool result that asked for one. */
  card?: Card;
  /** Tool calls made this turn, for the transcript panel. */
  toolCalls: { name: string; args: Record<string, unknown> }[];
}

export interface ConverseClient {
  send(cmd: ConverseCommand): Promise<{ stopReason?: string; output?: { message?: Message } }>;
}

const MAX_TOOL_ROUNDS = 6;

/**
 * Stands in for Alexa+: a Nova model with the Scholia MCP tools, one conversation per browser.
 * It never computes anything about the learner itself; every fact comes from a tool call.
 */
export class Brain {
  private readonly history: Message[] = [];
  private tools?: Tool[];

  constructor(
    private readonly mcp: McpSession,
    private readonly learnerId: string,
    private readonly courseId: string,
    private readonly client: ConverseClient = new BedrockRuntimeClient({ maxAttempts: 5, retryMode: "adaptive" }),
    private readonly modelId: string = process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-pro-v1:0",
  ) {}

  private system(): string {
    return [
      "You are Alexa on an Echo Show, helping a student with the Scholia study add-on.",
      `The learner_id is "${this.learnerId}" and the course_id is "${this.courseId}". Always pass exactly these to tools.`,
      "Use the tools for everything about the course and the learner. Never invent questions, grades or progress.",
      "Flow: start_review, then next_question; read the question aloud and wait. When the learner answers, call submit_answer with their words and then, before replying, call next_question. Reply with the feedback followed by the new question, then wait. If next_question returns done=true, call end_review and read its summary.",
      "If the learner asks what something means, call explain. If they ask how they are doing, call progress.",
      "Speak like a voice assistant: one to three short sentences, no lists, no markdown, no code. Say the question text exactly as the tool returned it, as a question, and never answer it yourself. Shorten explain results to two sentences and name the source.",
    ].join(" ");
  }

  async respond(userText: string): Promise<Turn> {
    this.tools ??= toConverseTools(await this.mcp.tools());
    this.history.push({ role: "user", content: [{ text: userText }] });
    const toolCalls: Turn["toolCalls"] = [];
    let card: Card | undefined;
    // Nova sometimes restates a question as its answer; when this turn fetched one, speak the tool text verbatim.
    let feedback: string | undefined;
    let question: string | undefined;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: this.system() }],
          messages: this.history,
          toolConfig: { tools: this.tools },
          inferenceConfig: { maxTokens: 400, temperature: 0.2 },
        }),
      );
      const message = res.output?.message;
      if (!message) break;
      this.history.push(message);

      const uses = (message.content ?? []).filter((b): b is ContentBlock.ToolUseMember => !!b.toolUse);
      if (res.stopReason !== "tool_use" || uses.length === 0) {
        const said = stripThinking((message.content ?? []).map((b) => b.text ?? "").join(" "));
        const speech = question ? [feedback, question].filter(Boolean).join(" ") : said;
        return { speech: speech || "Sorry, I lost my train of thought. Say that again?", card, toolCalls };
      }

      const results: ContentBlock[] = [];
      for (const { toolUse } of uses) {
        const args = (toolUse.input ?? {}) as Record<string, unknown>;
        toolCalls.push({ name: toolUse.name!, args });
        const result = await this.mcp.call(toolUse.name!, args);
        const sc = result.structuredContent as { done?: boolean; question?: string } | undefined;
        const text = result.content.find((b) => b.type === "text")?.text;
        if (!result.isError && toolUse.name === "submit_answer") feedback = text;
        if (!result.isError && toolUse.name === "next_question") question = sc?.done ? undefined : sc?.question;
        const uri = cardUri(result);
        if (uri) card = { resourceUri: uri, html: await this.mcp.card(uri), structuredContent: result.structuredContent };
        results.push({
          toolResult: { toolUseId: toolUse.toolUseId, content: resultBlocks(result), status: result.isError ? "error" : "success" },
        });
      }
      this.history.push({ role: "user", content: results });
    }
    return { speech: "Something went wrong talking to Scholia. Let's try again.", card, toolCalls };
  }
}

/** Nova Pro sometimes emits <thinking> blocks before the answer; they must not be spoken. */
export function stripThinking(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
}
