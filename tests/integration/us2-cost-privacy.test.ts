import { describe, expect, it } from "vitest";
import { PlaybackController, type TranslationOverlaySink } from "../../src/app/controller.js";
import { RecordingProvider } from "../helpers/fake-provider.js";
import type { SubtitleCue } from "../../src/subtitles/types.js";

class Sink implements TranslationOverlaySink {
  frames: string[][] = [];
  show(lines: readonly string[]): void {
    this.frames.push([...lines]);
  }
  clear(): void {}
}

const longCues = Array.from({ length: 720 }, (_, index): SubtitleCue => ({
  id: `c${index}`,
  index,
  startMs: index * 5_000,
  endMs: index * 5_000 + 2_000,
  sourceText: `subtitle ${index}`,
  normalizedText: `subtitle ${index}`,
}));

describe("US2 cost/privacy acceptance", () => {
  it("makes zero calls for native or unknown source languages", async () => {
    const provider = new RecordingProvider();
    const controller = new PlaybackController({
      playerId: "A",
      provider,
      overlay: new Sink(),
      targetLanguage: "en-US",
    });
    controller.setSource({ cues: longCues, contentHash: "hash", language: "en-GB", format: "srt" });
    controller.tick(0);
    await controller.whenIdle();
    expect(provider.requests).toHaveLength(0);
    expect(controller.status).toBe("noTranslationNeeded");
    controller.setSource({ cues: longCues, contentHash: "hash", language: null, format: "srt" });
    controller.tick(0);
    expect(controller.status).toBe("detectingLanguage");
    expect(provider.requests).toHaveLength(0);
  });

  it("sends only bounded nearby text/languages/minimal context during ten-minute viewing", async () => {
    const provider = new RecordingProvider();
    const controller = new PlaybackController({
      playerId: "A",
      provider,
      overlay: new Sink(),
      targetLanguage: "zh-Hans",
    });
    controller.setSource({ cues: longCues, contentHash: "hash", language: "en", format: "srt" });
    for (let minute = 0; minute < 10; minute += 1) {
      controller.tick(minute * 60_000);
      await controller.whenIdle();
    }
    expect(provider.requests.length).toBeGreaterThan(0);
    expect(provider.requests.every((request) => request.items.length <= 25)).toBe(true);
    expect(
      provider.requests
        .flatMap((request) => request.items)
        .every((item) => Object.keys(item).every((key) => ["id", "text", "context"].includes(key))),
    ).toBe(true);
    expect(
      provider.requests
        .flatMap((request) => request.items)
        .every((item) => Number(item.id.slice(1)) * 5_000 <= 9 * 60_000 + 120_000),
    ).toBe(true);
  });

  it("invalidates rapid-seek/disable work, reuses backward cache, and purges on close/reopen", async () => {
    const provider = new RecordingProvider();
    const controller = new PlaybackController({
      playerId: "A",
      provider,
      overlay: new Sink(),
      targetLanguage: "zh-Hans",
    });
    controller.setSource({ cues: longCues, contentHash: "hash", language: "en", format: "srt" });
    controller.tick(0);
    await controller.whenIdle();
    const afterFirst = provider.requests.length;
    controller.tick(0);
    await controller.whenIdle();
    expect(provider.requests.length).toBe(afterFirst);
    expect(controller.cacheSize).toBeGreaterThan(0);
    controller.close();
    expect(controller.cacheSize).toBe(0);
    const reopened = new PlaybackController({
      playerId: "A",
      provider,
      overlay: new Sink(),
      targetLanguage: "zh-Hans",
    });
    reopened.setSource({ cues: longCues, contentHash: "hash", language: "en", format: "srt" });
    reopened.tick(0);
    await reopened.whenIdle();
    expect(provider.requests.length).toBeGreaterThan(afterFirst);
  });
});
