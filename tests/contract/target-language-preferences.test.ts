import { describe, expect, it } from "vitest";
import {
  TargetLanguagePreferences,
  TargetLanguagePreferenceError,
} from "../../src/adapters/iina/target-language-preferences.js";

class Store {
  values = new Map<string, unknown>();
  failSet = false;
  failSync = false;

  get(key: string): unknown {
    return this.values.get(key);
  }

  set(key: string, value: unknown): void {
    if (this.failSet) throw new Error("private set detail");
    this.values.set(key, value);
  }

  sync(): void {
    if (this.failSync) throw new Error("private sync detail");
  }
}

describe("target language preferences", () => {
  it("restores valid values and uses an in-memory default for missing or invalid values", () => {
    const store = new Store();
    const preferences = new TargetLanguagePreferences(store);
    expect(preferences.read()).toEqual({ targetLanguage: "zh-Hans", source: "default" });
    expect(store.values.has("targetLanguage")).toBe(false);
    store.values.set("targetLanguage", "pt-PT");
    expect(preferences.read()).toEqual({ targetLanguage: "pt-PT", source: "saved" });
    store.values.set("targetLanguage", "made-up");
    expect(preferences.read()).toEqual({ targetLanguage: "zh-Hans", source: "default" });
  });

  it("validates catalog membership before set and sync", () => {
    const store = new Store();
    const preferences = new TargetLanguagePreferences(store);
    expect(() => preferences.save("tl")).toThrowError(TargetLanguagePreferenceError);
    expect(store.values.has("targetLanguage")).toBe(false);
  });

  it("rolls back the previous value and missing state after set or sync failure", () => {
    const store = new Store();
    store.values.set("targetLanguage", "en");
    const preferences = new TargetLanguagePreferences(store);
    store.failSync = true;
    expect(() => preferences.save("ja")).toThrowError(/TARGET_LANGUAGE_SAVE_FAILED/);
    expect(store.values.get("targetLanguage")).toBe("en");
    store.failSync = false;
    store.values.delete("targetLanguage");
    store.failSet = true;
    expect(() => preferences.save("ja")).toThrowError(/TARGET_LANGUAGE_SAVE_FAILED/);
    expect(store.values.has("targetLanguage")).toBe(false);
  });

  it("persists only targetLanguage on success", () => {
    const store = new Store();
    new TargetLanguagePreferences(store).save("kri");
    expect(Object.fromEntries(store.values)).toEqual({ targetLanguage: "kri" });
  });
});
