import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { StartStreamTranscriptionCommand, TranscribeStreamingClient } from "@aws-sdk/client-transcribe-streaming";

export const SAMPLE_RATE = 16000;

const polly = new PollyClient({});
const transcribe = new TranscribeStreamingClient({});

/** Neural Polly voice, mp3 bytes. */
export async function synthesize(text: string, voiceId = process.env.POLLY_VOICE ?? "Joanna"): Promise<Uint8Array> {
  const res = await polly.send(new SynthesizeSpeechCommand({ Text: text, OutputFormat: "mp3", VoiceId: voiceId as "Joanna", Engine: "neural" }));
  return res.AudioStream ? await res.AudioStream.transformToByteArray() : new Uint8Array();
}

/** Push-to-talk transcription: feed PCM 16 kHz mono chunks, end with close(), await the final text. */
export class Transcription {
  private readonly queue: (Uint8Array | null)[] = [];
  private wake: (() => void) | undefined;
  private finalParts: string[] = [];
  readonly done: Promise<string>;

  constructor(private readonly onPartial: (text: string) => void) {
    this.done = this.run();
  }

  push(chunk: Uint8Array): void {
    this.queue.push(chunk);
    this.wake?.();
  }

  close(): void {
    this.queue.push(null);
    this.wake?.();
  }

  private async *audio(): AsyncGenerator<{ AudioEvent: { AudioChunk: Uint8Array } }> {
    for (;;) {
      if (this.queue.length === 0) await new Promise<void>((r) => (this.wake = r));
      const chunk = this.queue.shift();
      if (chunk === null) return;
      if (chunk) yield { AudioEvent: { AudioChunk: chunk } };
    }
  }

  private async run(): Promise<string> {
    const res = await transcribe.send(
      new StartStreamTranscriptionCommand({
        LanguageCode: "en-US",
        MediaEncoding: "pcm",
        MediaSampleRateHertz: SAMPLE_RATE,
        AudioStream: this.audio(),
      }),
    );
    for await (const event of res.TranscriptResultStream ?? []) {
      for (const r of event.TranscriptEvent?.Transcript?.Results ?? []) {
        const text = r.Alternatives?.[0]?.Transcript ?? "";
        if (!text) continue;
        if (r.IsPartial) this.onPartial([...this.finalParts, text].join(" "));
        else this.finalParts.push(text);
      }
    }
    return this.finalParts.join(" ").trim();
  }
}
