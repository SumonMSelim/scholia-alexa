# Scholia for Alexa+

> Scholia remembers what you forget, before you forget it.

A course-grounded voice tutor for Alexa+. Say "review with Scholia" and it quizzes you on the concepts you are
about to forget, grades your spoken answer, explains misses from the course notes with a citation, and shows a
progress card. Next session it knows what to ask.

Built for the Alexa+ track as a self-hosted MCP server (spec 2025-11-25, Streamable HTTP), plus a simulated
Alexa+ voice client that drives it end to end through a real MCP client.

## What it does

- **Remembers each learner across sessions.** Per-concept SM-2 schedule (ease, interval, due date, lapses) and
  answer history in DynamoDB. A miss today comes back tomorrow; a strong answer waits longer.
- **Asks grounded questions.** Amazon Nova writes each question from the course notes for that concept and takes
  past grades into account.
- **Grades free-form spoken answers** 0-5 with short feedback meant to be heard, plus a citation
  (MIT OCW 6.0001 lecture, Guttag chapter).
- **Explains any concept** from the course notes, with sources. Answers only from the course.
- **Shows MCP Apps cards.** Progress card (mastery, streak, weak spots, next due) and session summary card as
  `ui://` resources. Hosts without MCP Apps get the same content as text.
- **Runs by voice.** The simulated Alexa+ streams mic audio to Amazon Transcribe, lets Amazon Nova orchestrate the
  MCP tools, and answers with Amazon Polly.

## How it works

```
 Alexa+, or the simulated Alexa+ (web/, src/sim/)
   mic -> Amazon Transcribe -> Amazon Nova, tool use -> Amazon Polly -> speaker
                                    |                \
                                    |                 MCP Apps card in a sandboxed iframe
                                    | MCP Streamable HTTP, POST /mcp, bearer token
                                    v
 Scholia MCP server (src/), on Lambda + Function URL via Lambda Web Adapter
   tools: start_review  next_question  submit_answer  end_review  progress  explain
   |-- review/ + scheduler/sm2.ts -> Amazon DynamoDB (learner model, sessions, history)
   |-- tutor/bedrock.ts           -> Amazon Nova Pro on Bedrock (question generation, grading)
   |-- retrieval/ in-process      <- courses/*.md (cited study notes, indexed at cold start)
   `-- ui/cards.ts                -> ui://scholia/progress-card, ui://scholia/session-card
```

A review: `start_review` queues due concepts (most lapses first, then oldest due) and fills up with new ones; `next_question`
asks Nova for one question plus a hidden reference answer from that concept's notes; `submit_answer` grades the
answer against the reference, applies SM-2, writes history and returns spoken feedback with a citation;
`end_review` returns the summary card; `progress` returns the progress card.

| AWS service | Used for |
|---|---|
| Amazon Bedrock, Nova Pro (Converse API, tool use) | question generation, grading, the "Alexa" brain in the simulator |
| Amazon DynamoDB | learner model, sessions, answer history (single table) |
| AWS Lambda + Function URL + Lambda Web Adapter | hosts the unchanged Express MCP server |
| Amazon Transcribe streaming | push-to-talk speech to text in the simulator |
| Amazon Polly (neural) | spoken replies in the simulator |
| AWS CDK | the whole stack as code (`infra/app.ts`) |

Cost was a design input: no NAT, ALB, OpenSearch or vector service. DynamoDB provisioned 5/5 and Lambda stay in
the free tier; Bedrock calls always set `maxTokens`.

## Run

```sh
# offline, no AWS account: keyword grader, DynamoDB Local
TUTOR=keyword docker compose up dev dynamodb

# full: Nova grading + simulated Alexa+ (needs AWS credentials with Nova, Transcribe and Polly access)
AWS_PROFILE=<your profile> docker compose up
# server: http://localhost:3000/mcp   health: http://localhost:3000/healthz   simulator: http://localhost:3001
```

Jump ahead in time against the same learner data (used in the demo video):
`CLOCK_OFFSET_DAYS=3 docker compose up -d dev`.

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
- `src/retrieval/` local hashed-bag-of-words embedder and in-process cosine index (no vector service to pay for); questions are grounded by concept id, `explain` by similarity
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
| `AWS_PROFILE` | `sumonmselim` (compose) | compose mounts `~/.aws` read-only for AWS credentials; set your own |
| `CLOCK_OFFSET_DAYS` | `0` | demo only: shifts the server clock forward |
| `MCP_STATELESS` | unset | `1`: no MCP sessions, JSON responses (Lambda) |
| `MCP_BEARER_TOKEN` | unset | when set, `/mcp` requires `Authorization: Bearer <token>` |

## Status and limits

- Not registered as a live Alexa+ add-on yet: that needs OAuth 2.1 account linking, which this build does not
  implement (single bearer token, one demo learner). The simulated Alexa+ is the demo path the rules allow.
- One course (MIT 6.0001 subset, 11 concepts). Notes are our own summaries, cited to the public course.

## License

MIT, see [LICENSE](LICENSE).
