import { describe, expect, it } from "vitest";
import type { TranscriptResultStream } from "@aws-sdk/client-transcribe-streaming";
import { type StreamingClient, Transcription } from "./speech.js";

const result = (Transcript: string, IsPartial: boolean) =>
  ({ TranscriptEvent: { Transcript: { Results: [{ IsPartial, Alternatives: [{ Transcript }] }] } } }) as TranscriptResultStream;

function fake(events: TranscriptResultStream[]): StreamingClient {
  return {
    async send() {
      return {
        TranscriptResultStream: (async function* () {
          yield* events;
        })(),
      };
    },
  };
}

describe("Transcription", () => {
  it("joins final segments and streams partials", async () => {
    const partials: string[] = [];
    const t = new Transcription((p) => partials.push(p), fake([result("how am", true), result("How am I doing?", false), result("next", true), result("Next one.", false)]));
    t.close();
    expect(await t.done).toBe("How am I doing? Next one.");
    expect(partials).toEqual(["how am", "How am I doing? next"]);
  });

  it("keeps the last partial when the press ends before a final result", async () => {
    const t = new Transcription(() => {}, fake([result("How am", true), result("How am I doing", true)]));
    t.close();
    expect(await t.done).toBe("How am I doing");
  });
});
