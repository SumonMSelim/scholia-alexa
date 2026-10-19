import { randomUUID } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Retriever } from "./retrieval/retriever.js";
import type { ReviewService } from "./review/service.js";
import { registerTools } from "./tools/index.js";
import { registerCards } from "./ui/cards.js";

export interface AppOptions {
  service: ReviewService;
  retriever: Retriever;
  /** Stateless: no Mcp-Session-Id, JSON responses, fresh server per request. Needed on Lambda. */
  stateless?: boolean;
  /** When set, every /mcp request must carry `Authorization: Bearer <token>`. */
  bearerToken?: string;
}

export function buildApp({ service, retriever, stateless = false, bearerToken }: AppOptions): express.Express {
  const buildServer = (): McpServer => {
    const server = new McpServer({ name: "scholia", version: "0.1.0" });
    registerTools(server, service, retriever);
    registerCards(server);
    return server;
  };

  const app = express();
  app.use(express.json());
  app.get("/healthz", (_req, res) => res.json({ ok: true, name: "scholia" }));

  if (bearerToken) {
    app.use("/mcp", (req, res, next) => {
      if (req.header("authorization") === `Bearer ${bearerToken}`) return next();
      // Alexa+ expects a bare 401 (no WWW-Authenticate) for unauthenticated calls.
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
    });
  }

  if (stateless) {
    app.post("/mcp", async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => transport.close());
      await buildServer().connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
    const reject: express.RequestHandler = (_req, res) => {
      res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed in stateless mode" }, id: null });
    };
    app.get("/mcp", reject);
    app.delete("/mcp", reject);
    return app;
  }

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

  return app;
}
