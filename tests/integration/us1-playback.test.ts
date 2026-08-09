import { describe, expect, it } from "vitest";
import { PlaybackController } from "../../src/app/controller.js";
import type { GeneratedTrackSink } from "../../src/app/controller.js";
import { DeterministicFakeProvider } from "../../src/providers/fake.js";
import { parseSrt } from "../../src/subtitles/srt.js";

class TrackSink implements GeneratedTrackSink {
  revisions: string[] = [];
  cleaned = 0;
  async swap(content: string): Promise<void> {
    this.revisions.push(content);
  }
  cleanup(): void {
    this.cleaned += 1;
  }
}

describe("US1 playback acceptance", () => {
  const cues = parseSrt(
    "1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n",
  ).cues;

  it("publishes first translations without placeholders or playback control", async () => {
    const track = new TrackSink();
    const controller = new PlaybackController({
      playerId: "A",
      provider: new DeterministicFakeProvider("ZH:"),
      track,
    });
    controller.setSource({ cues, contentHash: "hash", language: "en", format: "srt" });
    controller.tick(0);
    await controller.whenIdle();
    expect(track.revisions.at(-1)).toContain("ZH:Hello");
    expect(track.revisions.at(-1)).toContain("ZH:World");
    expect(track.revisions.at(-1)).not.toContain("pending");
    expect(controller.status).toBe("running");
  });

  it("ignores delayed output after disable and removes the owned track", async () => {
    let resolve!: (value: { translations: Array<{ id: string; text: string }> }) => void;
    const provider = {
      attempt: () =>
        new Promise<{ translations: Array<{ id: string; text: string }> }>(
          (done) => (resolve = done),
        ),
    };
    const track = new TrackSink();
    const controller = new PlaybackController({ playerId: "A", provider, track });
    controller.setSource({ cues, contentHash: "hash", language: "en", format: "srt" });
    controller.tick(0);
    controller.setEnabled(false);
    resolve({ translations: [{ id: cues[0]!.id, text: "late" }] });
    await controller.whenIdle();
    expect(track.revisions).toEqual([]);
    expect(track.cleaned).toBe(1);
  });

  it("isolates result, status and generated track state across two windows", async () => {
    const aTrack = new TrackSink();
    const bTrack = new TrackSink();
    const a = new PlaybackController({
      playerId: "A",
      provider: new DeterministicFakeProvider("A:"),
      track: aTrack,
    });
    const b = new PlaybackController({
      playerId: "B",
      provider: new DeterministicFakeProvider("B:"),
      track: bTrack,
    });
    a.setSource({ cues, contentHash: "same", language: "en", format: "srt" });
    b.setSource({ cues, contentHash: "same", language: "en", format: "srt" });
    a.tick(0);
    b.tick(0);
    await Promise.all([a.whenIdle(), b.whenIdle()]);
    expect(aTrack.revisions.at(-1)).toContain("A:Hello");
    expect(aTrack.revisions.at(-1)).not.toContain("B:Hello");
    expect(bTrack.revisions.at(-1)).toContain("B:Hello");
    a.setEnabled(false);
    expect(b.status).toBe("running");
    expect(bTrack.cleaned).toBe(0);
  });
});
