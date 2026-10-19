import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { Brain } from "./brain.js";
import { McpSession } from "./mcp.js";
import { synthesize, Transcription } from "./speech.js";

const PORT = Number(process.env.SIM_PORT ?? 3001);
const MCP_URL = process.env.MCP_URL ?? "http://localhost:3000/mcp";
const MCP_BEARER_TOKEN = process.env.MCP_BEARER_TOKEN || undefined;
const LEARNER = process.env.LEARNER_ID ?? "demo-learner";
const COURSE = process.env.COURSE_ID ?? "mit-6.0001";

const app = express();
app.use(express.json());
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), "../../web")));

// One Brain (conversation) per browser tab, keyed by a client-chosen id.
const brains = new Map<string, Brain>();
async function brainFor(id: string): Promise<Brain> {
  let b = brains.get(id);
  if (!b) {
    b = new Brain(await McpSession.connect(MCP_URL, MCP_BEARER_TOKEN), LEARNER, COURSE);
    brains.set(id, b);
  }
  return b;
}

app.post("/chat", async (req, res) => {
  const { conversation, text } = req.body as { conversation?: string; text?: string };
  if (!conversation || !text) {
    res.status(400).json({ error: "conversation and text required" });
    return;
  }
  try {
    const turn = await (await brainFor(conversation)).respond(text);
    const audio = Buffer.from(await synthesize(turn.speech)).toString("base64");
    res.json({ ...turn, audio });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

const server = createServer(app);

// Push-to-talk: binary frames are PCM 16 kHz mono; a text frame "end" closes the utterance.
const wss = new WebSocketServer({ server, path: "/stt" });
wss.on("connection", (ws) => {
  const t = new Transcription((partial) => ws.send(JSON.stringify({ partial })));
  ws.on("message", (data, isBinary) => {
    if (isBinary) t.push(new Uint8Array(data as Buffer));
    else if (data.toString() === "end") t.close();
  });
  ws.on("close", () => t.close());
  t.done
    .then((final) => ws.send(JSON.stringify({ final }), () => ws.close()))
    .catch((err) => {
      console.error(err);
      ws.send(JSON.stringify({ error: (err as Error).message }), () => ws.close());
    });
});

server.listen(PORT, () => console.log(`Simulated Alexa+ at http://localhost:${PORT} (MCP: ${MCP_URL})`));
