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
```

## Layout

- `src/server.ts` Express host, one Streamable HTTP transport per MCP session
- `src/tools/` MCP tools (`progress`, more coming)
- `src/scheduler/sm2.ts` SM-2 spaced repetition
