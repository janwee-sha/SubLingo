import { describe, expect, it } from "vitest";
import { PlaybackController, type GeneratedTrackSink } from "../../src/app/controller.js";
import type { TranslationProvider } from "../../src/providers/provider.js";
import type { SubtitleCue } from "../../src/subtitles/types.js";

class LatestTrack implements GeneratedTrackSink {
  content = "";
  async swap(content: string): Promise<void> {
    this.content = content;
  }
  cleanup(): void {
    this.content = "";
  }
}

const cues = Array.from({ length: 120 }, (_, index): SubtitleCue => ({
  id: `c${index}`,
  index,
  startMs: index * 1_000,
  endMs: index * 1_000 + 800,
  sourceText: `cue-${index}`,
  normalizedText: `cue-${index}`,
}));

describe("automated acceptance performance", () => {
  it("prepares the first batch under five seconds and 95% before display with zero playback pauses", async () => {
    const track = new LatestTrack();
    let active = 0;
    let maxActive = 0;
    const provider: TranslationProvider = {
      attempt: async (request) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const result = {
          translations: request.items.map((item) => ({ id: item.id, text: `T:${item.text}` })),
        };
        active -= 1;
        return result;
      },
    };
    const controller = new PlaybackController({
      playerId: "A",
      provider,
      track,
      targetLanguage: "zh-Hans",
    });
    controller.setSource({ cues, contentHash: "hash", language: "en", format: "srt" });
    const started = performance.now();
    let readyBeforeDisplay = 0;
    for (let second = 0; second < 100; second += 1) {
      controller.tick(second * 1_000);
      await controller.whenIdle();
      if (track.content.includes(`T:cue-${second}`)) readyBeforeDisplay += 1;
    }
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(readyBeforeDisplay / 100).toBeGreaterThanOrEqual(0.95);
    expect(maxActive).toBe(1);
  });

  it("proves cache hits, bounded calls and independent multi-window progress", async () => {
    const calls: Record<string, number> = { A: 0, B: 0 };
    const provider: TranslationProvider = {
      attempt: async (request) => {
        calls[request.playerId] = (calls[request.playerId] ?? 0) + 1;
        expect(request.items.length).toBeLessThanOrEqual(25);
        expect(
          request.items.reduce((sum, item) => sum + [...item.text].length, 0),
        ).toBeLessThanOrEqual(5_000);
        return { translations: request.items.map((item) => ({ id: item.id, text: item.text })) };
      },
    };
    const a = new PlaybackController({
      playerId: "A",
      provider,
      track: new LatestTrack(),
      targetLanguage: "zh-Hans",
    });
    const b = new PlaybackController({
      playerId: "B",
      provider,
      track: new LatestTrack(),
      targetLanguage: "zh-Hans",
    });
    for (const controller of [a, b])
      controller.setSource({ cues, contentHash: "same", language: "en", format: "srt" });
    a.tick(0);
    b.tick(30_000);
    await Promise.all([a.whenIdle(), b.whenIdle()]);
    a.tick(0);
    await a.whenIdle();
    const beforeReplay = calls.A;
    a.tick(0);
    await a.whenIdle();
    expect(calls.A).toBe(beforeReplay);
    expect(calls.A).toBeGreaterThan(0);
    expect(calls.B).toBeGreaterThan(0);
  });
});
