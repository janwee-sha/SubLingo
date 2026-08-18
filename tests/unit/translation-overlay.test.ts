import { describe, expect, it } from "vitest";
import { encodeTranslationOverlayData } from "../../src/adapters/iina/subtitle-overlay.js";
import { selectActiveTranslations } from "../../src/subtitles/active-translations.js";
import type { SubtitleCue } from "../../src/subtitles/types.js";

function cue(id: string, index: number, startMs: number, endMs: number): SubtitleCue {
  return {
    id,
    index,
    startMs,
    endMs,
    sourceText: id,
    normalizedText: id,
  };
}

describe("active translations", () => {
  const cues = [
    cue("overlap-first", 3, 500, 1_500),
    cue("overlap-second", 1, 750, 1_500),
    cue("zero", 2, 1_000, 1_000),
    cue("future", 4, 2_000, 3_000),
  ];
  const translations = new Map([
    ["overlap-first", "first"],
    ["overlap-second", "second\nline"],
    ["zero", "zero"],
    ["future", "future"],
  ]);

  it("uses half-open cue ranges and preserves source cue order", () => {
    expect(selectActiveTranslations(cues, translations, 750)).toEqual(["first", "second\nline"]);
    expect(selectActiveTranslations(cues, translations, 1_500)).toEqual([]);
    expect(selectActiveTranslations(cues, translations, 2_000)).toEqual(["future"]);
  });

  it("ignores zero-duration, future, expired, missing and empty translations", () => {
    const values = new Map(translations);
    values.set("overlap-first", " \r\n ");
    values.delete("overlap-second");

    expect(selectActiveTranslations(cues, values, null)).toEqual([]);
    expect(selectActiveTranslations(cues, values, 1_000)).toEqual([]);
  });
});

describe("translation overlay text encoding", () => {
  it("uses the fixed Default reset and 720p top-center style", () => {
    const data = encodeTranslationOverlayData(["styled"]);

    expect(data).toBe(
      String.raw`{\rDefault\an8\q0\fs40\fscx100\fscy100\b0\i0\u0\s0\1c&HFFFFFF&\1a&H00&\3c&H000000&\3a&H00&\bord2\shad0\4a&HFF&\blur0}styled`,
    );
  });

  it("preserves semantic line breaks without raw CR or LF", () => {
    const data = encodeTranslationOverlayData(["first\r\nsecond\rthird", "fourth"]);

    expect(data).toContain("first\\Nsecond\\Nthird\\Nfourth");
    expect(data).not.toMatch(/[\r\n]/);
  });

  it("neutralizes ASS braces and literal backslash control sequences", () => {
    const data = encodeTranslationOverlayData([String.raw`{\an7} \N \p1 \rDefault`]);

    expect(data).toContain(String.raw`\{\⁠an7} \⁠N \⁠p1 \⁠rDefault`);
    expect(data).not.toContain(String.raw`{\an7}`);
  });

  it("preserves leading spaces, replaces NUL and leaves Unicode text intact", () => {
    const data = encodeTranslationOverlayData(["  字幕 مرحبا 👩🏽‍💻 e\u0301\0"]);

    expect(data).toContain(String.raw`\h 字幕 مرحبا 👩🏽‍💻 é�`);
    expect(data).not.toContain("\0");
  });

  it("does not truncate or shrink very tall content", () => {
    const longText = "长".repeat(10_000);
    const data = encodeTranslationOverlayData([longText]);

    expect(data.endsWith(longText)).toBe(true);
    expect(data).toContain(String.raw`\fs40`);
  });
});
