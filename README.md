# Scholia for Alexa+

Course-grounded voice tutor that remembers the learner. An MCP server (spec 2025-11-25, Streamable HTTP)
that schedules spaced retrieval before you forget, grades answers, and explains misses from course material with citations.

## Run

```sh
docker compose up
# server: http://localhost:3000/mcp   health: http://localhost:3000/healthz
```

## Test

```sh
docker run --rm -v "$PWD":/app -w /app node:22-alpine sh -c "npm install && npm test && npm run typecheck"
# DynamoDB integration test runs when DYNAMODB_ENDPOINT is set (see compose.yml)
```

## Layout

- `src/server.ts` Express host, one Streamable HTTP transport per MCP session
- `src/tools/` MCP tools: `start_review`, `next_question`, `submit_answer`, `progress`
- `src/review/` session flow: queue due concepts, ask, grade, reschedule
- `src/scheduler/sm2.ts` SM-2 spaced repetition
- `src/store/` learner state: DynamoDB single table (`DynamoStore`) or in-memory (`STORE=memory`)
- `src/tutor/` question generation and grading (`KeywordTutor` placeholder, Bedrock Nova next)
- `src/course/` course catalog with concepts and citations (MIT 6.0001 seed)

## Env

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `STORE` | dynamo | `memory` for a stateless local run |
| `DYNAMODB_ENDPOINT` | unset | set for DynamoDB Local; table is auto-created |
| `TABLE_NAME` | `scholia` | |
