import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** MCP Apps (SEP-1865) UI resources. Hosts that lack the extension ignore them and use the text result. */
export const MIME = "text/html;profile=mcp-app";
export const PROGRESS_CARD = "ui://scholia/progress-card";
export const SESSION_CARD = "ui://scholia/session-card";

/** Tool-result metadata that tells Alexa+ which card to render and what to say while it loads. */
export function uiMeta(resourceUri: string, invoking: string, invoked: string) {
  return { ui: { resourceUri, invoking, invoked } };
}

export function registerCards(server: McpServer): void {
  const config = { mimeType: MIME, _meta: { ui: { prefersBorder: true } } };
  server.registerResource("progress-card", PROGRESS_CARD, { ...config, description: "Mastery, streak and weak spots for a learner" }, async () => ({
    contents: [{ uri: PROGRESS_CARD, mimeType: MIME, text: progressCard() }],
  }));
  server.registerResource("session-card", SESSION_CARD, { ...config, description: "Summary of one review session" }, async () => ({
    contents: [{ uri: SESSION_CARD, mimeType: MIME, text: sessionCard() }],
  }));
}

/* Plain postMessage bridge: ui/initialize handshake, render on tool-result, report size. No SDK, no network. */
const BRIDGE = `
const send = (m) => window.parent.postMessage(Object.assign({ jsonrpc: "2.0" }, m), "*");
const INIT_ID = 1;
window.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.jsonrpc !== "2.0") return;
  if (m.id === INIT_ID && !m.method) {
    send({ method: "ui/notifications/initialized" });
    applyTheme(m.result && m.result.hostContext);
    return;
  }
  if (m.method === "ui/notifications/tool-result") render(m.params.structuredContent || {});
  else if (m.method === "ui/notifications/host-context-changed") applyTheme(m.params);
  else if (m.id !== undefined && (m.method === "ui/resource-teardown" || m.method === "ping")) send({ id: m.id, result: {} });
});
function applyTheme(ctx) { if (ctx && ctx.theme) document.documentElement.dataset.theme = ctx.theme; }
new ResizeObserver(() => send({ method: "ui/notifications/size-changed", params: { width: document.body.scrollWidth, height: document.body.scrollHeight } })).observe(document.body);
send({ id: INIT_ID, method: "ui/initialize", params: { appInfo: { name: "scholia", version: "0.1.0" }, appCapabilities: {} } });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
`;

const STYLE = `
:root { --bg: #fffdf7; --fg: #1f1b16; --muted: #6b645b; --accent: #b4532a; --ok: #2f7d4f; --warn: #c9a227; --bad: #b4532a; --ring: #e8e2d6; }
:root[data-theme="dark"], :root:not([data-theme="light"]) { }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #1b1814; --fg: #f3ede3; --muted: #a39b8f; --ring: #2e2a24; } }
:root[data-theme="dark"] { --bg: #1b1814; --fg: #f3ede3; --muted: #a39b8f; --ring: #2e2a24; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 16px/1.4 Georgia, "Times New Roman", serif; }
h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
.sub { color: var(--muted); font-size: 14px; margin-bottom: 12px; }
.row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.stat { min-width: 72px; }
.stat b { display: block; font-size: 26px; line-height: 1; }
.stat span { color: var(--muted); font-size: 13px; }
.ring { width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--accent) calc(var(--pct) * 1%), var(--ring) 0); }
.ring div { width: 64px; height: 64px; border-radius: 50%; background: var(--bg); display: grid; place-items: center; font-weight: 600; }
ul { list-style: none; padding: 0; margin: 12px 0 0; }
li { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid var(--ring); }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
.ok { background: var(--ok); } .warn { background: var(--warn); } .bad { background: var(--bad); }
.foot { margin-top: 12px; color: var(--muted); font-size: 13px; }
`;

function page(title: string, body: string, script: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${STYLE}</style></head><body><div id="root"><h1>${title}</h1><p class="sub">Waiting for data</p></div><script>${BRIDGE}${script}</script></body></html>`;
}

function progressCard(): string {
  return page(
    "Scholia progress",
    "",
    `
function render(d) {
  const pct = Math.round((d.mastery || 0) * 100);
  const weak = (d.weak_topics || []).map((t) => '<li><span><i class="dot warn"></i>' + esc(t) + '</span><span>needs work</span></li>').join("");
  const next = d.next_due ? new Date(d.next_due).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "nothing scheduled";
  document.getElementById("root").innerHTML =
    '<h1>' + esc(d.course_title || d.course_id || "Course") + '</h1><p class="sub">' + esc(d.concepts_tracked || 0) + ' of ' + esc(d.concepts_total || 0) + ' concepts started</p>' +
    '<div class="row"><div class="ring" style="--pct:' + pct + '"><div>' + pct + '%</div></div>' +
    '<div class="stat"><b>' + esc(d.due_now || 0) + '</b><span>due now</span></div>' +
    '<div class="stat"><b>' + esc(d.streak_days || 0) + '</b><span>day streak</span></div></div>' +
    (weak ? '<ul>' + weak + '</ul>' : '') +
    '<p class="foot">Next review: ' + esc(next) + '</p>';
}`,
  );
}

function sessionCard(): string {
  return page(
    "Review summary",
    "",
    `
function render(d) {
  const cls = (g) => (g >= 4 ? "ok" : g >= 3 ? "warn" : "bad");
  const items = (d.concepts || []).map((c) => '<li><span><i class="dot ' + cls(c.grade) + '"></i>' + esc(c.name) + '</span><span>' + esc(c.grade) + '/5</span></li>').join("");
  const when = d.next_review_in_days === 1 ? "tomorrow" : "in " + esc(d.next_review_in_days) + " days";
  document.getElementById("root").innerHTML =
    '<h1>Review done</h1><p class="sub">' + esc(d.correct || 0) + ' of ' + esc(d.asked || 0) + ' answered well</p>' +
    '<ul>' + items + '</ul>' +
    '<p class="foot">Scholia will ask again ' + when + '.</p>';
}`,
  );
}
