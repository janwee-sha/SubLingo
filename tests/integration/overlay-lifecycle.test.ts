import { describe, expect, it } from "vitest";
import { PlaybackController, type TranslationOverlaySink } from "../../src/app/controller.js";
import { DeterministicFakeProvider } from "../../src/providers/fake.js";
import type { SubtitleCue } from "../../src/subtitles/types.js";

class RecordingOverlay implements TranslationOverlaySink {
  readonly frames: string[][] = [];
  clears = 0;

  show(lines: readonly string[]): void {
    this.frames.push([...lines]);
  }

  clear(): void {
    this.clears += 1;
  }
}

const cues: SubtitleCue[] = [
  {
    id: "first",
    index: 0,
    startMs: 0,
    endMs: 1_000,
    sourceText: "first",
    normalizedText: "first",
  },
  {
    id: "second",
    index: 1,
    startMs: 1_000,
    endMs: 2_000,
    sourceText: "second",
    normalizedText: "second",
  },
];

function createController(overlay: RecordingOverlay): PlaybackController {
  const controller = new PlaybackController({
    playerId: "player-A",
    provider: new DeterministicFakeProvider("T:"),
    overlay,
    targetLanguage: "zh-Hans",
  });
  controller.setSource({ cues, contentHash: "lifecycle", language: "en", format: "srt" });
  return controller;
}

describe("translation overlay lifecycle", () => {
  it("keeps a paused cue visible and clears it at the half-open boundary", async () => {
    const overlay = new RecordingOverlay();
    const controller = createController(overlay);

    controller.tick(0);
    await controller.whenIdle();
    expect(overlay.frames.at(-1)).toEqual(["T:first"]);
    controller.session.setPaused(true);
    controller.tick(500);
    expect(overlay.frames.at(-1)).toEqual(["T:first"]);
    controller.tick(1_000);
    expect(overlay.clears).toBeGreaterThan(0);
  });

  it("switches adjacent cues without a double display and redraws cached content after seek", async () => {
    const overlay = new RecordingOverlay();
    const controller = createController(overlay);

    controller.tick(0);
    await controller.whenIdle();
    controller.tick(1_000);
    expect(overlay.frames.at(-1)).toEqual(["T:second"]);

    controller.onSeek(0);
    expect(overlay.clears).toBeGreaterThan(0);
    controller.tick(0);
    expect(overlay.frames.at(-1)).toEqual(["T:first"]);
  });

  it("clears each invalidated window without affecting another window", async () => {
    const firstOverlay = new RecordingOverlay();
    const secondOverlay = new RecordingOverlay();
    const first = createController(firstOverlay);
    const second = new PlaybackController({
      playerId: "player-B",
      provider: new DeterministicFakeProvider("B:"),
      overlay: secondOverlay,
      targetLanguage: "zh-Hans",
    });
    second.setSource({ cues, contentHash: "lifecycle", language: "en", format: "srt" });
    first.tick(0);
    second.tick(0);
    await Promise.all([first.whenIdle(), second.whenIdle()]);
    const secondClears = secondOverlay.clears;

    first.setProviderSelection({
      profileId: "profile",
      revision: 1,
      endpointFingerprint: "endpoint",
    });
    first.setEnabled(false);
    first.endFile();
    first.close();

    expect(firstOverlay.clears).toBeGreaterThan(0);
    expect(secondOverlay.clears).toBe(secondClears);
    expect(secondOverlay.frames.at(-1)).toEqual(["B:first"]);
  });
});
