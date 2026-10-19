import { buildApp } from "./app.js";
import { listCourses } from "./course/catalog.js";
import { loadCourseChunks } from "./ingest/load.js";
import { HashEmbedder } from "./retrieval/embedder.js";
import { LocalVectorIndex } from "./retrieval/local.js";
import { Retriever } from "./retrieval/retriever.js";
import { ReviewService } from "./review/service.js";
import { DynamoStore } from "./store/dynamo.js";
import { MemoryStore } from "./store/memory.js";
import type { LearnerStore } from "./store/types.js";
import { BedrockTutor } from "./tutor/bedrock.js";
import { KeywordTutor } from "./tutor/keyword.js";
import type { Tutor } from "./tutor/types.js";

const PORT = Number(process.env.PORT ?? 3000);

async function buildStore(): Promise<LearnerStore> {
  if (process.env.STORE === "memory") return new MemoryStore();
  const store = DynamoStore.fromEnv();
  if (process.env.DYNAMODB_ENDPOINT) await store.ensureTable();
  return store;
}

async function buildRetriever(): Promise<Retriever> {
  const retriever = new Retriever(new LocalVectorIndex(), new HashEmbedder());
  for (const course of listCourses()) {
    const chunks = await loadCourseChunks(course.id);
    await retriever.ingest(chunks);
    console.log(`Indexed ${chunks.length} chunks for ${course.id}`);
  }
  return retriever;
}

function buildTutor(): Tutor {
  if (process.env.TUTOR === "bedrock") return new BedrockTutor();
  console.log("TUTOR not set to bedrock, using KeywordTutor");
  return new KeywordTutor();
}

// Demo only: shifts "now" so a recording can jump ahead to the next due review against the same data.
const clockOffsetMs = Number(process.env.CLOCK_OFFSET_DAYS ?? 0) * 86_400_000;

const retriever = await buildRetriever();
const service = new ReviewService(await buildStore(), buildTutor(), () => new Date(Date.now() + clockOffsetMs), retriever);
const stateless = process.env.MCP_STATELESS === "1";
const app = buildApp({ service, retriever, stateless, bearerToken: process.env.MCP_BEARER_TOKEN || undefined });

app.listen(PORT, () => {
  console.log(`Scholia MCP server listening on http://0.0.0.0:${PORT}/mcp (${stateless ? "stateless" : "sessions"})`);
});
