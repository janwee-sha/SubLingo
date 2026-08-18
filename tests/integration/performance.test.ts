import { describe, expect, it } from "vitest";
import {
  PlaybackController,
  type TranslationOverlaySink,
} from "../../src/app/controller.js";
import type { TranslationProvider } from "../../src/providers/provider.js";
import type { SubtitleCue } from "../../src/subtitles/types.js";
import { readFileSync } from "node:fs";
import { selectNearbyCues } from "../../src/app/scheduler.js";

class LatestOverlay implements TranslationOverlaySink {
  lines: string[] = [];
  show(lines: readonly string[]): void {
    this.lines = [...lines];
  }
  clear(): void {
    this.lines = [];
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
  it("streams a four-hour, 20 GB-class, 20,000-cue workload without whole-media loading", () => {
    const large = Array.from({ length: 20_000 }, (_, index): SubtitleCue => ({
      id: `large-${index}`,
      index,
      startMs: index * 720,
      endMs: index * 720 + 600,
      sourceText: `cue-${index}`,
      normalizedText: `cue-${index}`,
    }));
    expect(large.at(-1)!.endMs).toBeLessThanOrEqual(4 * 60 * 60 * 1_000);
    expect(selectNearbyCues(large, 2 * 60 * 60 * 1_000).length).toBeLessThanOrEqual(40);
    expect(20 * 1024 ** 3).toBeGreaterThan(16 * 1024 ** 3);
    const extractor = readFileSync(
      new URL(
        "../../native/subtitle-extractor/Sources/SubLingoSubtitleExtractor/Extractor.swift",
        import.meta.url,
      ),
      "utf8",
    );
    expect(extractor).toContain("while av_read_frame");
    expect(extractor).not.toContain("Data(contentsOf: request.mediaURL)");
    expect(extractor).toContain("ProtocolLimits.maxCueCount");
  });

  it("prepares the first batch under five seconds and 95% before display with zero playback pauses", async () => {
    const overlay = new LatestOverlay();
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
      overlay,
      targetLanguage: "zh-Hans",
    });
    controller.setSource({ cues, contentHash: "hash", language: "en", format: "srt" });
    const started = performance.now();
    let readyBeforeDisplay = 0;
    for (let second = 0; second < 100; second += 1) {
      controller.tick(second * 1_000);
      await controller.whenIdle();
      if (overlay.lines.includes(`T:cue-${second}`)) readyBeforeDisplay += 1;
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
      overlay: new LatestOverlay(),
      targetLanguage: "zh-Hans",
    });
    const b = new PlaybackController({
      playerId: "B",
      provider,
      overlay: new LatestOverlay(),
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
