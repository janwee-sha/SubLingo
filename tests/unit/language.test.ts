import { describe, expect, it } from "vitest";
import {
  normalizeLanguageTag,
  resolveSourceLanguage,
  shouldTranslate,
} from "../../src/domain/language.js";

describe("language gate", () => {
  it("normalizes common BCP 47 casing and rejects unsafe/unknown tags", () => {
    expect(normalizeLanguageTag("ZH-hans-cn")).toBe("zh-Hans-CN");
    expect(normalizeLanguageTag("en_us")).toBe("en-US");
    expect(normalizeLanguageTag("und")).toBeNull();
    expect(normalizeLanguageTag("not a tag")).toBeNull();
  });

  it("treats base-language equality as native unless a regional override is explicit", () => {
    expect(shouldTranslate("en-US", "en-GB", false)).toBe(false);
    expect(shouldTranslate("en-US", "en-GB", true)).toBe(true);
    expect(shouldTranslate("en", "zh-Hans", false)).toBe(true);
  });

  it("uses manual source only in manual mode and reports reliable track origin", () => {
    expect(
      resolveSourceLanguage({ mode: "track", trackLanguage: "ja-JP", manualLanguage: "en" }),
    ).toEqual({ language: "ja-JP", origin: "track" });
    expect(
      resolveSourceLanguage({ mode: "manual", trackLanguage: "ja", manualLanguage: "ko-kr" }),
    ).toEqual({ language: "ko-KR", origin: "manual" });
    expect(
      resolveSourceLanguage({ mode: "track", trackLanguage: null, manualLanguage: null }),
    ).toEqual({ language: null, origin: "unknown" });
  });
});
