import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { describe, expect, it } from "vitest";
import { newConceptState } from "../scheduler/sm2.js";
import { DynamoStore } from "./dynamo.js";

// Integration test. Runs only when DYNAMODB_ENDPOINT points at DynamoDB Local.
const endpoint = process.env.DYNAMODB_ENDPOINT;

describe.skipIf(!endpoint)("DynamoStore (DynamoDB Local)", () => {
  const client = new DynamoDBClient({ endpoint, region: "us-east-1", credentials: { accessKeyId: "local", secretAccessKey: "local" } });
  const store = new DynamoStore(client, `scholia-test-${Date.now()}`);
  const learner = "dyn-learner";
  const course = "mit-6.0001";

  it("creates the table and round-trips concepts, sessions and history", async () => {
    await store.ensureTable();
    await store.ensureTable(); // idempotent

    const state = newConceptState(new Date("2026-10-08T00:00:00Z"));
    await store.putConcept({ learnerId: learner, courseId: course, conceptId: "recursion", ...state });
    await store.putConcept({ learnerId: learner, courseId: course, conceptId: "tuples", ...state, lapses: 2 });
    await store.putConcept({ learnerId: learner, courseId: "other", conceptId: "x", ...state });

    const one = await store.getConcept(learner, course, "recursion");
    expect(one).toMatchObject({ conceptId: "recursion", ease: 2.5, lapses: 0 });
    expect(one).not.toHaveProperty("PK");

    const list = await store.listConcepts(learner, course);
    expect(list.map((r) => r.conceptId).sort()).toEqual(["recursion", "tuples"]);

    await store.putSession({ sessionId: "s1", learnerId: learner, courseId: course, queue: ["a", "b"], asked: 0, correct: 0, startedAt: "t" });
    const session = await store.getSession("s1");
    expect(session?.queue).toEqual(["a", "b"]);
    expect(session?.current).toBeUndefined();

    await store.appendHistory({ learnerId: learner, courseId: course, conceptId: "recursion", grade: 4, at: "2026-10-08T00:00:01Z" });
    await store.appendHistory({ learnerId: learner, courseId: course, conceptId: "tuples", grade: 1, at: "2026-10-08T00:00:02Z" });
    const hist = await store.listHistory(learner, course);
    expect(hist.map((h) => h.grade)).toEqual([4, 1]);
  });
});
