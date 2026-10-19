import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { HashEmbedder } from "./retrieval/embedder.js";
import { LocalVectorIndex } from "./retrieval/local.js";
import { Retriever } from "./retrieval/retriever.js";
import { ReviewService } from "./review/service.js";
import { MemoryStore } from "./store/memory.js";
import { KeywordTutor } from "./tutor/keyword.js";

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
const LIST = { jsonrpc: "2.0", id: 2, method: "tools/list" };

function listen(opts: { stateless?: boolean; bearerToken?: string }) {
  const retriever = new Retriever(new LocalVectorIndex(), new HashEmbedder());
  const app = buildApp({ service: new ReviewService(new MemoryStore(), new KeywordTutor()), retriever, ...opts });
  const server = app.listen(0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
  return { server, post };
}

describe("stateless mode (Lambda)", () => {
  const { server, post } = listen({ stateless: true });
  afterAll(() => server.close());

  it("answers tools/list as plain JSON with no session header", async () => {
    const res = await post(LIST);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toContain("start_review");
  });

  it("rejects GET and DELETE", async () => {
    const { server: s, post: _p } = listen({ stateless: true });
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/mcp`;
    expect((await fetch(url)).status).toBe(405);
    expect((await fetch(url, { method: "DELETE" })).status).toBe(405);
    s.close();
  });
});

describe("bearer token", () => {
  const { server, post } = listen({ stateless: true, bearerToken: "s3cret" });
  afterAll(() => server.close());

  it("401 without WWW-Authenticate when missing or wrong", async () => {
    for (const headers of [{}, { authorization: "Bearer nope" }] as Record<string, string>[]) {
      const res = await post(INIT, headers);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBeNull();
    }
  });

  it("passes with the right token", async () => {
    const res = await post(INIT, { authorization: "Bearer s3cret" });
    expect(res.status).toBe(200);
    expect((await res.json()).result.serverInfo.name).toBe("scholia");
  });
});
