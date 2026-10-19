import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { Concept } from "../course/types.js";
import type { GeneratedQuestion, Grading, Tutor } from "./types.js";

export const DEFAULT_MODEL_ID = "us.amazon.nova-pro-v1:0";

/** Minimal surface so tests can inject a fake. */
export interface ConverseClient {
  send(command: ConverseCommand): Promise<{ output?: { message?: { content?: { text?: string }[] } } }>;
}

const questionSchema = z.object({ question: z.string().min(1), reference: z.string().min(1) });
const gradingSchema = z.object({ grade: z.number().int().min(0).max(5), feedback: z.string().min(1) });

const SYSTEM =
  "You are Scholia, a voice tutor for a university course. The learner hears you through a smart speaker, so write short, plain spoken sentences. Reply with a single JSON object and nothing else: no prose, no markdown, no code fences.";

/** Question generation and grading on Amazon Nova via the Bedrock Converse API. */
export class BedrockTutor implements Tutor {
  constructor(
    private readonly client: ConverseClient = new BedrockRuntimeClient({ maxAttempts: 5, retryMode: "adaptive" }),
    private readonly modelId: string = process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID,
  ) {}

  async generateQuestion(concept: Concept, priorGrades: number[], passages: string[] = []): Promise<GeneratedQuestion> {
    const difficulty = priorGrades.length === 0 ? "introductory" : avg(priorGrades) >= 4 ? "harder, apply the idea to a small scenario" : "basic recall";
    const prompt = [
      `Course concept: ${concept.name}`,
      `Reference summary: ${concept.summary}`,
      passages.length ? `Course notes:\n${passages.join("\n\n")}` : "",
      `Difficulty: ${difficulty}.`,
      `Write one question about ${concept.name} only, answerable out loud in a sentence or two. Do not ask for code.`,
      'Return {"question": "...", "reference": "<the ideal spoken answer, two sentences, grounded in the notes>"}',
    ]
      .filter(Boolean)
      .join("\n");
    const raw = await this.ask(prompt, 300);
    const parsed = questionSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    return { question: `In your own words, explain ${concept.name}.`, reference: concept.summary };
  }

  async grade(concept: Concept, q: GeneratedQuestion, answer: string): Promise<Grading> {
    const prompt = [
      `Concept: ${concept.name}`,
      `Question: ${q.question}`,
      `Reference answer: ${q.reference}`,
      `Learner's spoken answer (transcribed, may contain speech errors): ${answer}`,
      "Grade on the SM-2 scale: 5 perfect, 4 correct with minor gaps, 3 correct but hesitant or incomplete, 2 wrong but close, 1 wrong with a hint of recall, 0 blank or unrelated.",
      "Feedback: one or two spoken sentences. Say what was right, then the one thing that was missing or wrong. Never mention the grade number.",
      'Return {"grade": <0-5>, "feedback": "..."}',
    ].join("\n");
    const raw = await this.ask(prompt, 200);
    const parsed = gradingSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    return { grade: 0, feedback: `I could not grade that. The key idea: ${concept.summary}` };
  }

  private async ask(prompt: string, maxTokens: number): Promise<unknown> {
    const res = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: SYSTEM }],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens, temperature: 0.3 },
      }),
    );
    return parseJson(res.output?.message?.content?.[0]?.text ?? "");
  }
}

/** Nova sometimes wraps JSON in ```json fences despite instructions; take the first {...} block. */
export function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
