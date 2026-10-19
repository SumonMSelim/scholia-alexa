import { describe, expect, it } from "vitest";
import type { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { getCourse } from "../course/catalog.js";
import { BedrockTutor, parseJson } from "./bedrock.js";

const concept = getCourse("mit-6.0001").concepts.find((c) => c.id === "recursion")!;

function fake(reply: string) {
  const calls: ConverseCommand[] = [];
  const client = {
    async send(cmd: ConverseCommand) {
      calls.push(cmd);
      return { output: { message: { content: [{ text: reply }] } } };
    },
  };
  return { client, calls };
}

describe("parseJson", () => {
  it("accepts bare JSON and fenced JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("returns undefined on garbage", () => {
    expect(parseJson("no json here")).toBeUndefined();
    expect(parseJson("{broken")).toBeUndefined();
  });
});

describe("BedrockTutor", () => {
  it("generates a question with notes in the prompt and maxTokens set", async () => {
    const { client, calls } = fake('{"question":"What stops a recursive function?","reference":"A base case. It answers directly."}');
    const tutor = new BedrockTutor(client, "test-model");
    const q = await tutor.generateQuestion(concept, [], ["Every recursive call must move towards a base case."]);
    expect(q.question).toBe("What stops a recursive function?");
    const input = calls[0].input;
    expect(input.modelId).toBe("test-model");
    expect(input.inferenceConfig?.maxTokens).toBe(300);
    const text = input.messages?.[0].content?.[0].text ?? "";
    expect(text).toContain("base case");
    expect(text).toContain("introductory");
  });

  it("asks harder questions once prior grades are high", async () => {
    const { client, calls } = fake('{"question":"q","reference":"r"}');
    await new BedrockTutor(client, "m").generateQuestion(concept, [5, 4, 5]);
    expect(calls[0].input.messages?.[0].content?.[0].text).toContain("harder");
  });

  it("grades and clamps to the schema", async () => {
    const { client } = fake('```json\n{"grade":4,"feedback":"Right idea. You missed the base case."}\n```');
    const g = await new BedrockTutor(client, "m").grade(concept, { question: "q", reference: "r" }, "it calls itself");
    expect(g).toEqual({ grade: 4, feedback: "Right idea. You missed the base case." });
  });

  it("falls back when the model returns junk", async () => {
    const { client } = fake("Sorry, I cannot do that.");
    const tutor = new BedrockTutor(client, "m");
    const q = await tutor.generateQuestion(concept, []);
    expect(q.reference).toBe(concept.summary);
    const g = await tutor.grade(concept, q, "whatever");
    expect(g.grade).toBe(0);
    expect(g.feedback).toContain(concept.summary);
  });
});
