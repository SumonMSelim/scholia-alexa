import { randomUUID } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadCourseChunks } from "./ingest/load.js";
import { listCourses } from "./course/catalog.js";
import { HashEmbedder } from "./retrieval/embedder.js";
import { LocalVectorIndex } from "./retrieval/local.js";
import { Retriever } from "./retrieval/retriever.js";
import { ReviewService } from "./review/service.js";
import { DynamoStore } from "./store/dynamo.js";
import { MemoryStore } from "./store/memory.js";
import type { LearnerStore } from "./store/types.js";
import { registerTools } from "./tools/index.js";
import { KeywordTutor } from "./tutor/keyword.js";

const PORT = Number(process.env.PORT ?? 3000);

async function buildStore(): Promise<LearnerStore> {
  if (process.env.STORE === "memory") return new MemoryStore();
  const store = DynamoStore.fromEnv();
  if (process.env.DYNAMODB_ENDPOINT) await store.ensureTable();
  return store;
}

const service = new ReviewService(await buildStore(), new KeywordTutor());

async function buildRetriever(): Promise<Retriever> {
  const retriever = new Retriever(new LocalVectorIndex(), new HashEmbedder());
  for (const course of listCourses()) {
    const chunks = await loadCourseChunks(course.id);
    await retriever.ingest(chunks);
    console.log(`Indexed ${chunks.length} chunks for ${course.id}`);
  }
  return retriever;
}
const retriever = await buildRetriever();

function buildServer(): McpServer {
  const server = new McpServer({ name: "scholia", version: "0.1.0" });
  registerTools(server, service, retriever);
  return server;
}

const app = express();
app.use(express.json());

// One transport per MCP session, keyed by Mcp-Session-Id.
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.header("mcp-session-id");
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    if (sessionId || !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session. Send initialize first." },
        id: null,
      });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport!);
      },
    });
    transport.onclose = () => {
      if (transport?.sessionId) transports.delete(transport.sessionId);
    };
    await buildServer().connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

// GET opens the server-to-client SSE stream; DELETE ends the session.
const handleSessionRequest: express.RequestHandler = async (req, res) => {
  const transport = transports.get(req.header("mcp-session-id") ?? "");
  if (!transport) {
    res.status(400).send("Invalid or missing Mcp-Session-Id");
    return;
  }
  await transport.handleRequest(req, res);
};
app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.get("/healthz", (_req, res) => res.json({ ok: true, name: "scholia" }));

app.listen(PORT, () => {
  console.log(`Scholia MCP server listening on http://0.0.0.0:${PORT}/mcp`);
});
