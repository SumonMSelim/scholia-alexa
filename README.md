# Scholia for Alexa+

Course-grounded voice tutor that remembers the learner. An MCP server (spec 2025-11-25, Streamable HTTP)
that schedules spaced retrieval before you forget, grades answers, and explains misses from course material with citations.

## Run

```sh
docker compose up
# server: http://localhost:3000/mcp   health: http://localhost:3000/healthz
```

## Simulated Alexa+ (demo client)

`docker compose up` also starts the simulated Alexa+ at http://localhost:3001. Hold the button and talk:
mic audio streams to Amazon Transcribe over a WebSocket, the transcript goes to Amazon Nova (Bedrock Converse,
tool use) which drives the Scholia MCP server through a real Streamable HTTP MCP client, the reply is spoken by
Amazon Polly, and any `_meta.ui` card is rendered in a sandboxed iframe through the MCP Apps bridge.

- `src/sim/mcp.ts` MCP client session, MCP tools -> Converse toolSpecs, card fetch
- `src/sim/brain.ts` the "Alexa" loop: Converse tool-use rounds until the model speaks
- `src/sim/speech.ts` Transcribe streaming (push-to-talk) and Polly
- `src/sim/server.ts` `/chat`, `/stt` WebSocket, static `web/`
- `web/index.html` Echo Show style page with the MCP Apps host bridge

Env for the sim: `MCP_URL` (default `http://localhost:3000/mcp`), `SIM_PORT` (3001), `LEARNER_ID` (`demo-learner`),
`COURSE_ID` (`mit-6.0001`), `POLLY_VOICE` (`Joanna`), `BEDROCK_MODEL_ID`.

## Deploy (AWS, free-tier footprint)

`infra/app.ts` is a CDK stack: one Lambda (Node 22, Lambda Web Adapter layer, Express unchanged, MCP stateless
JSON mode) behind a Function URL, DynamoDB provisioned 5/5, Bedrock Nova invoke rights. Course index is built
in-process at cold start, so no vector service bill. Nothing in the stack costs money at hackathon traffic.

```sh
# keep the token in a gitignored file; the sim and any client need it later
[ -s .mcp-token ] || openssl rand -hex 24 > .mcp-token
# Debian node image (CDK bundling needs bash); ~/.aws mounted read-only for credentials
docker run --rm -v "$PWD":/app -w /app -v ~/.aws:/root/.aws:ro \
  -e AWS_PROFILE=sumonmselim -e AWS_REGION=us-east-1 -e TOKEN="$(command cat .mcp-token)" node:22 \
  sh -c 'npx cdk deploy ScholiaAlexa --require-approval never --parameters BearerToken="$TOKEN" --outputs-file cdk.out/outputs.json'
```

The output `McpUrl` is the Streamable HTTP endpoint. Every call needs `Authorization: Bearer <token>`;
without it the server answers 401 with no `WWW-Authenticate`, as the Alexa+ MCP toolkit expects.
The parameter is required (min 32 chars), so the public URL never runs open and spends Bedrock tokens.

Env added by the stack: `MCP_STATELESS=1` (no session ids, JSON responses), `MCP_BEARER_TOKEN`.
Point the simulated Alexa+ at it: `MCP_URL=https://.../mcp MCP_BEARER_TOKEN="$(command cat .mcp-token)" docker compose up sim`.

## Test

```sh
docker run --rm -v "$PWD":/app -w /app node:22-alpine sh -c "npm install && npm test && npm run typecheck"
# DynamoDB integration test runs when DYNAMODB_ENDPOINT is set (see compose.yml)
```

## Layout

- `src/server.ts` wiring and listen; `src/app.ts` Express app, one Streamable HTTP transport per MCP session, or stateless JSON mode for Lambda, optional bearer token
- `infra/app.ts` CDK stack (Lambda + Function URL + DynamoDB)
- `src/tools/` MCP tools: `start_review`, `next_question`, `submit_answer`, `end_review`, `progress`, `explain`
- `src/ui/` MCP Apps cards (`ui://scholia/progress-card`, `ui://scholia/session-card`): self-contained HTML with a plain postMessage bridge, linked from `progress` and `end_review` via `_meta.ui.resourceUri`. Hosts without the Apps extension fall back to the text result
- `src/review/` session flow: queue due concepts, ask, grade, reschedule
- `src/scheduler/sm2.ts` SM-2 spaced repetition
- `src/store/` learner state: DynamoDB single table (`DynamoStore`) or in-memory (`STORE=memory`)
- `src/tutor/` question generation and grading: `BedrockTutor` (Amazon Nova via Converse, grounded in course notes) or `KeywordTutor` for offline tests
- `src/course/` course catalog with concepts and citations (MIT 6.0001 seed)
- `src/ingest/` course notes (`courses/<id>/*.md`, frontmatter `concept` + `citation`) -> one chunk per `##` section
- `src/retrieval/` local hashed-bag-of-words embedder and in-process cosine index; Titan v2 + S3 Vectors next
- `courses/` own study notes per concept, cited to MIT OCW 6.0001 lectures and Guttag's textbook

## Env

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `STORE` | dynamo | `memory` for a stateless local run |
| `DYNAMODB_ENDPOINT` | unset | set for DynamoDB Local; table is auto-created |
| `TABLE_NAME` | `scholia` | |
| `TUTOR` | keyword | `bedrock` to use Amazon Nova (compose default) |
| `BEDROCK_MODEL_ID` | `us.amazon.nova-pro-v1:0` | any Nova inference profile id |
| `AWS_PROFILE` | `sumonmselim` (compose) | compose mounts `~/.aws` read-only for Bedrock credentials |
