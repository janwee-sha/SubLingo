import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackController, type GeneratedTrackSink } from "../../src/app/controller.js";
import type { TranslationProvider } from "../../src/providers/provider.js";
import type { TranslationProgressHandler } from "../../src/providers/types.js";
import type { SubtitleCue } from "../../src/subtitles/types.js";

const denseCues = Array.from({ length: 25 }, (_, index): SubtitleCue => ({
  id: `cue-${index + 1}`,
  index,
  startMs: index * 100,
  endMs: index * 100 + 80,
  sourceText: `source-${index + 1}`,
  normalizedText: `source-${index + 1}`,
}));

class ImmediateTrack implements GeneratedTrackSink {
  readonly revisions: string[] = [];
  active = 0;
  maxActive = 0;
  cleaned = 0;

  async swap(content: string): Promise<void> {
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.revisions.push(content);
    this.active -= 1;
  }

  cleanup(): void {
    this.cleaned += 1;
  }
}

class BlockedTrack implements GeneratedTrackSink {
  readonly revisions: string[] = [];
  active = 0;
  maxActive = 0;
  calls = 0;
  content = "";
  cleaned = 0;
  private releaseFirst!: () => void;
  private readonly firstGate = new Promise<void>((resolve) => {
    this.releaseFirst = resolve;
  });
  private signalFirst!: () => void;
  readonly firstStarted = new Promise<void>((resolve) => {
    this.signalFirst = resolve;
  });

  async swap(content: string): Promise<void> {
    this.calls += 1;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.revisions.push(content);
    if (this.calls === 1) {
      this.signalFirst();
      await this.firstGate;
    }
    this.content = content;
    this.active -= 1;
  }

  release(): void {
    this.releaseFirst();
  }

  cleanup(): void {
    this.cleaned += 1;
    this.content = "";
  }
}

function controller(provider: TranslationProvider, track: GeneratedTrackSink): PlaybackController {
  const value = new PlaybackController({
    playerId: "player-A",
    provider,
    track,
    targetLanguage: "zh-Hans",
  });
  value.setSource({ cues: denseCues, contentHash: "dense", language: "en", format: "srt" });
  return value;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("progressive translation output", () => {
  it("publishes the first of thirteen wire results before the logical batch completes", async () => {
    let releaseRest!: () => void;
    const restGate = new Promise<void>((resolve) => {
      releaseRest = resolve;
    });
    let signalFirst!: () => void;
    const firstWireFinished = new Promise<void>((resolve) => {
      signalFirst = resolve;
    });
    let wireRequests = 0;
    const provider: TranslationProvider = {
      attempt: async (request, onProgress) => {
        const aggregate: Array<{ id: string; text: string }> = [];
        for (let offset = 0; offset < request.items.length; offset += 2) {
          wireRequests += 1;
          const translations = request.items.slice(offset, offset + 2).map((item) => ({
            id: item.id,
            text: `T:${item.text}`,
          }));
          aggregate.push(...translations);
          onProgress?.({ translations });
          if (offset === 0) {
            signalFirst();
            await restGate;
          }
        }
        return { translations: aggregate };
      },
    };
    const track = new ImmediateTrack();
    const playback = controller(provider, track);

    playback.tick(0);
    await firstWireFinished;
    await Promise.resolve();
    const firstCacheSize = playback.cacheSize;
    const firstRevisionCount = track.revisions.length;
    const firstStatus = playback.status;
    releaseRest();
    await playback.whenIdle();

    expect(firstCacheSize).toBe(2);
    expect(firstRevisionCount).toBeGreaterThan(0);
    expect(firstStatus).toBe("running");
    expect(wireRequests).toBe(13);
    expect(playback.cacheSize).toBe(25);
  });

  it("coalesces rapid progress into one active swap and the latest pending snapshot", async () => {
    const track = new BlockedTrack();
    const provider: TranslationProvider = {
      attempt: async (request, onProgress) => {
        const aggregate = request.items.map((item) => ({ id: item.id, text: `T:${item.text}` }));
        for (const item of request.items.slice(0, 6)) {
          const translation = { id: item.id, text: `T:${item.text}` };
          onProgress?.({ translations: [translation] });
        }
        return { translations: aggregate };
      },
    };
    const playback = controller(provider, track);

    playback.tick(0);
    await track.firstStarted;
    expect(track.calls).toBe(1);
    expect(track.maxActive).toBe(1);
    track.release();
    await playback.whenIdle();

    expect(track.calls).toBe(2);
    expect(track.maxActive).toBe(1);
    expect(track.content).toContain("T:source-6");
  });

  it("keeps successful progress and retries only unresolved cues", async () => {
    vi.useFakeTimers();
    const requests: string[][] = [];
    let attempt = 0;
    const provider: TranslationProvider = {
      attempt: async (request, onProgress) => {
        requests.push(request.items.map((item) => item.id));
        attempt += 1;
        if (attempt === 1) {
          onProgress?.({
            translations: request.items.slice(0, 2).map((item) => ({
              id: item.id,
              text: `T:${item.text}`,
            })),
          });
          throw { category: "network", retryable: true };
        }
        const translations = request.items.map((item) => ({ id: item.id, text: `T:${item.text}` }));
        onProgress?.({ translations });
        return { translations };
      },
    };
    const track = new ImmediateTrack();
    const playback = controller(provider, track);

    playback.tick(0);
    await Promise.resolve();
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await playback.whenIdle();

    expect(requests).toHaveLength(2);
    expect(requests[0]).toHaveLength(25);
    expect(requests[1]).toHaveLength(23);
    expect(requests[1]).not.toContain("cue-1");
    expect(requests[1]).not.toContain("cue-2");
    expect(playback.cacheSize).toBe(25);
  });

  it("deduplicates progress and terminal results and retains cache on publication failure", async () => {
    let swaps = 0;
    const track: GeneratedTrackSink = {
      swap: async () => {
        swaps += 1;
        throw new Error("TRACK_FAILED");
      },
      cleanup: () => undefined,
    };
    const provider: TranslationProvider = {
      attempt: async (request, onProgress) => {
        const translations = request.items.map((item) => ({ id: item.id, text: item.text }));
        onProgress?.({ translations });
        return { translations };
      },
    };
    const playback = controller(provider, track);

    playback.tick(0);
    await playback.whenIdle();

    expect(playback.cacheSize).toBe(25);
    expect(swaps).toBe(1);
    expect(playback.status).toBe("partialFailure");
  });

  it.each([
    ["seek", (value: PlaybackController) => value.session.onSeek(5_000)],
    [
      "track",
      (value: PlaybackController) =>
        value.setSource({ cues: denseCues, contentHash: "next", language: "en", format: "srt" }),
    ],
    ["file", (value: PlaybackController) => value.endFile()],
    [
      "profile",
      (value: PlaybackController) =>
        value.setProviderSelection({
          profileId: "next-profile",
          revision: 2,
          endpointFingerprint: "next-endpoint",
        }),
    ],
    ["disable", (value: PlaybackController) => value.setEnabled(false)],
    ["close", (value: PlaybackController) => value.close()],
  ])("rejects late progress after %s invalidation", async (_name, invalidate) => {
    let lateProgress: TranslationProgressHandler | undefined;
    const provider: TranslationProvider = {
      attempt: (_request, onProgress) => {
        lateProgress = onProgress;
        return new Promise(() => undefined);
      },
      cancel: () => undefined,
    };
    const track = new ImmediateTrack();
    const playback = controller(provider, track);

    playback.tick(0);
    await Promise.resolve();
    invalidate(playback);
    lateProgress?.({ translations: [{ id: "cue-1", text: "late" }] });
    await playback.whenIdle();

    expect(playback.cacheSize).toBe(0);
    expect(track.revisions).toEqual([]);
  });

  it("cleans a track created by a swap that finishes after the session changes", async () => {
    const track = new BlockedTrack();
    const provider: TranslationProvider = {
      attempt: async (request) => ({
        translations: request.items.map((item) => ({ id: item.id, text: "translated" })),
      }),
    };
    const playback = controller(provider, track);

    playback.tick(0);
    await track.firstStarted;
    playback.setSource({ cues: denseCues, contentHash: "next", language: "en", format: "srt" });
    track.release();
    await playback.whenIdle();

    expect(track.content).toBe("");
    expect(track.cleaned).toBeGreaterThan(0);
    expect(playback.cacheSize).toBe(0);
  });
});
