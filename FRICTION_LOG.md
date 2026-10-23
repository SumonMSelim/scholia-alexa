# Friction log

Kept while building Scholia for Alexa+ during the Build, Ship, Shape hackathon (Oct 2026). One entry per problem: task, steps, expected vs. actual, severity, workaround, suggestion.

## 2026-10-08 Nova 2 Lite ignores "no code fences"

- **Task:** structured JSON from Converse
- **Steps:** system prompt "JSON only, no code fences", user prompt with schema
- **Expected:** bare JSON
- **Actual:** `us.amazon.nova-2-lite-v1:0` wraps in ```json fences; Nova Pro and Micro comply
- **Severity:** minor
- **Workaround:** slice first `{` to last `}` before JSON.parse
- **Suggestion:** honour a response-format / JSON-mode flag in Converse for Nova, or document tool-use as the structured-output path.

## 2026-10-08 Converse via CLI cannot stream

- **Task:** smoke-test voice latency
- **Expected:** `aws bedrock-runtime converse-stream`
- **Actual:** CLI has no streaming op, SDK only
- **Severity:** minor
- **Workaround:** measured full-response latency (Nova Pro ~1.1s, Nova 2 Lite ~0.75s, Micro ~0.45s for ~80 output tokens)
- **Suggestion:** add a streaming CLI op for quick latency checks.

## 2026-10-08 ext-apps 2.x needs MCP SDK v2

- **Task:** add MCP Apps cards with the official helper package
- **Steps:** `npm view @modelcontextprotocol/ext-apps`
- **Expected:** works with current `@modelcontextprotocol/sdk` 1.32
- **Actual:** 2.0.x peers on `@modelcontextprotocol/server` ^2 and React; 1.7.5 still on sdk ^1.29 but pulls React peers for two HTML strings
- **Severity:** minor
- **Workaround:** set `_meta.ui.resourceUri` by hand on `registerTool` and `registerResource`, hand-write the 20-line postMessage bridge
- **Suggestion:** ship a dependency-free `server-helpers` entry point and document the raw `_meta` contract first.

## 2026-10-08 Alexa+ docs: tool-result `_meta.ui` shape undocumented beyond three fields

- **Task:** know what Alexa+ reads from a tool result
- **Steps:** read mcp-toolkit-client-lifecycle page
- **Expected:** schema for `_meta.ui` (resourceUri, invoking, invoked, anything else), mime type, CSP, size limits
- **Actual:** one JSON example, no schema, no mention of `text/html;profile=mcp-app` or the SEP-1865 bridge
- **Severity:** major (cannot verify a card renders on a real device without the add-on)
- **Workaround:** follow SEP-1865 draft spec and simulate the host
- **Suggestion:** link the ext-apps spec from the lifecycle page and list which bridge methods Alexa+ supports.

## 2026-10-08 Nova Pro tool use: separate json toolResult block breaks the loop

- **Task:** pass structured tool output back to the model
- **Steps:** toolResult content `[{text}, {json: structuredContent}]`
- **Expected:** model keeps calling tools with ids from the json
- **Actual:** Nova Pro called one tool, then hallucinated the rest of the review as prose including fake JSON "tool calls"
- **Severity:** major
- **Workaround:** single text block with `data: {...}` appended
- **Suggestion:** document toolResult content shapes Nova is trained on, or make json blocks first class in the Nova tool-use guide.

## 2026-10-08 Nova Pro leaks <thinking> into the final answer

- **Task:** speak the model's reply
- **Steps:** Converse with tools, read `output.message.content[].text`
- **Expected:** answer only
- **Actual:** `<thinking>...</thinking>` prefix in the text block whenever tools were used
- **Severity:** minor
- **Workaround:** regex strip before TTS
- **Suggestion:** return thinking as `reasoningContent` like other models, or strip server side.

## 2026-10-08 Transcribe streaming via WebSocket from the browser

- **Task:** push-to-talk STT
- **Steps:** browser PCM 16k -> ws -> `StartStreamTranscriptionCommand` with an async generator
- **Expected:** works
- **Actual:** works first time; partials arrive within ~300 ms
- **Severity:** none (positive)
- **Suggestion:** the getting-started page only shows a file example; add the async-generator-from-socket pattern since it is the common web case.

## 2026-10-19 CDK NodejsFunction bundling fails on node:alpine with no hint

- **Task:** `cdk deploy` from a Docker container
- **Steps:** `docker run node:22-alpine npx cdk deploy` with a `NodejsFunction` that uses `commandHooks`
- **Expected:** esbuild bundles locally (esbuild is installed)
- **Actual:** `Failed to bundle asset ... Error: spawnSync bash ENOENT`; local bundling shells out to `bash`, which alpine lacks
- **Severity:** major (deploy blocked, error names neither bash as a requirement nor the fix)
- **Workaround:** run CDK in Debian `node:22`
- **Suggestion:** fall back to `sh`, or say "local bundling requires bash on PATH" in the error and the NodejsFunction docs.

## 2026-10-19 Optional CfnParameter for an auth token silently deployed an open endpoint

- **Task:** protect a Lambda Function URL (auth NONE) with an app-level bearer token passed as a NoEcho parameter
- **Steps:** parameter with `default: ""`, deploy from a shell where the token file was missing
- **Expected:** deploy fails or warns
- **Actual:** deploy succeeded with an empty token, the MCP endpoint answered without auth
- **Severity:** major (own design mistake, but easy to make)
- **Workaround:** `minLength: 32`, no default
- **Suggestion:** cdk-nag style warning for Function URLs with auth NONE, and a docs note that NoEcho parameters are best paired with `minLength`.

## 2026-10-23 Nova Pro restates a tool-returned question as its answer

- **Task:** voice host reads the question returned by `next_question`
- **Steps:** system prompt "Say the question text exactly as the tool returned it, as a question, and never answer it yourself", temperature 0.2
- **Expected:** question spoken verbatim
- **Actual:** in 2 of about 8 question turns while recording the demo, Nova Pro turned the question into a statement of the answer ("The purpose of the else clause is to provide a default action... Please answer."), giving the answer away
- **Severity:** major (breaks retrieval practice)
- **Workaround:** host speaks the tool's feedback and question text verbatim whenever a turn fetched a question; the model only routes
- **Suggestion:** a Converse option to return a tool result directly as the final reply (pass-through), or document instruction-following limits for verbatim relay.
