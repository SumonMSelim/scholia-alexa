import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool as ConverseTool, ToolResultContentBlock } from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export const UI_MIME = "text/html;profile=mcp-app";

/** The MCP Apps capability a host advertises so servers know cards can render. */
export const UI_CAPABILITY = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [UI_MIME] } } };

/** Thin wrapper over the MCP client: the simulated Alexa+ talks to Scholia only through this. */
export class McpSession {
  private readonly cards = new Map<string, string>();

  constructor(private readonly client: Client) {}

  static async connect(url: string, bearerToken?: string): Promise<McpSession> {
    const client = new Client({ name: "scholia-sim-alexa", version: "0.1.0" }, { capabilities: UI_CAPABILITY });
    const requestInit = bearerToken ? { headers: { authorization: `Bearer ${bearerToken}` } } : undefined;
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit }));
    return new McpSession(client);
  }

  async tools(): Promise<Tool[]> {
    return (await this.client.listTools()).tools;
  }

  async call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return (await this.client.callTool({ name, arguments: args })) as CallToolResult;
  }

  /** Card HTML for a ui:// resource, cached per session. */
  async card(uri: string): Promise<string> {
    const hit = this.cards.get(uri);
    if (hit) return hit;
    const { contents } = await this.client.readResource({ uri });
    const html = (contents[0] as { text?: string }).text ?? "";
    this.cards.set(uri, html);
    return html;
  }
}

/** MCP tool definitions already carry JSON Schema, which is what Converse wants. */
export function toConverseTools(tools: Tool[]): ConverseTool[] {
  return tools.map(
    (t): ConverseTool.ToolSpecMember => ({
      toolSpec: {
        name: t.name,
        description: t.description ?? t.title ?? t.name,
        inputSchema: { json: t.inputSchema as DocumentType },
      },
    }),
  );
}

/** The ui:// resource a tool result asks the host to render, if any. */
export function cardUri(result: CallToolResult): string | undefined {
  const ui = (result._meta as { ui?: { resourceUri?: string } } | undefined)?.ui;
  return ui?.resourceUri;
}

/**
 * What the model sees from a tool result: the spoken text plus the structured fields (ids, grades) it must pass on.
 * One text block on purpose: Nova Pro stopped calling tools when given a separate json block.
 */
export function resultBlocks(result: CallToolResult): ToolResultContentBlock[] {
  const text = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const data = result.structuredContent ? `\ndata: ${JSON.stringify(result.structuredContent)}` : "";
  return [{ text: (text || "(no output)") + data }];
}
