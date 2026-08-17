import { describe, expect, it } from "vitest";
import { utf8Encode } from "../../src/domain/codec.js";
import {
  IinaSubtitleSourcePort,
  readSelectedSubtitle,
} from "../../src/adapters/iina/subtitle-source.js";
import { loadSubtitleSource } from "../../src/subtitles/source.js";

describe("selected subtitle source", () => {
  const content = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";

  it("requires an external readable SRT/ASS track and hashes decoded content", () => {
    const loaded = loadSubtitleSource(
      { id: 7, isExternal: true, title: "movie.srt", lang: "en-US" },
      Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8Encode(content)]),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toMatchObject({ trackId: 7, format: "srt", language: "en-US" });
    expect(loaded.source.decode).toMatchObject({ encoding: "utf-8", bom: true });
    expect(loaded.source.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(loaded.source.cues).toHaveLength(1);
  });

  it("returns safe unsupported results for embedded, unreadable, malformed and unknown tracks", () => {
    expect(
      loadSubtitleSource({ id: 1, isExternal: false, title: "a.srt" }, utf8Encode(content)),
    ).toEqual({ ok: false, reason: "not-external" });
    expect(loadSubtitleSource({ id: 1, isExternal: true, title: "a.srt" }, null)).toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(
      loadSubtitleSource({ id: 1, isExternal: true, title: "a.vtt" }, utf8Encode("WEBVTT")),
    ).toEqual({ ok: false, reason: "unsupported-format" });
    expect(
      loadSubtitleSource(
        { id: 1, isExternal: true, title: "a.srt" },
        Uint8Array.from([0xc0, 0xaf]),
      ),
    ).toEqual({ ok: false, reason: "unsupported-encoding" });
  });

  it("recovers from lagging track lists and unavailable binary handles using IINA's current track and text read", () => {
    const subtitle = {
      id: 7,
      tracks: [],
      currentTrack: {
        id: 7,
        title: "movie.srt",
        lang: "en",
        isExternal: true,
      },
    } as unknown as IINA.API.SubtitleAPI;
    const file = {
      handle: () => {
        throw new Error("binary handle not ready");
      },
      read: (path: string) => (path === "@sub/7" ? content : undefined),
    } as unknown as IINA.API.File;

    const loaded = readSelectedSubtitle(new IinaSubtitleSourcePort(subtitle, file));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.source).toMatchObject({ trackId: 7, format: "srt" });
  });
});
