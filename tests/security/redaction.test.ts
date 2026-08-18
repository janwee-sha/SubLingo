import { describe, expect, it } from "vitest";
import { diagnostic, safeRequestId } from "../../src/domain/logging.js";
import { SubtitleExtractorError } from "../../src/adapters/iina/subtitle-extractor.js";
import { PlaybackController, type TranslationOverlaySink } from "../../src/app/controller.js";
import type { TranslationProvider } from "../../src/providers/provider.js";
import { parseTargetLanguageSave } from "../../src/domain/messages.js";

describe("allowlist-only diagnostics", () => {
  it("copies safe metadata and drops bodies, headers, credentials and subtitle text", () => {
    const output = diagnostic({
      code: "PROVIDER_HTTP",
      category: "http",
      statusCode: 503,
      requestId: "req-123",
      authorization: "Bearer secret",
      body: "private subtitle",
      credential: "key-value",
    });
    expect(output).toEqual({
      code: "PROVIDER_HTTP",
      category: "http",
      statusCode: 503,
      requestId: "req-123",
    });
    expect(JSON.stringify(output)).not.toContain("secret");
    expect(JSON.stringify(output)).not.toContain("subtitle");
  });

  it("sanitizes provider request IDs", () => {
    expect(safeRequestId("safe_Request-42.abc")).toBe("safe_Request-42.abc");
    expect(safeRequestId("bad\nAuthorization: secret")).toBeUndefined();
  });

  it("exposes only fixed extractor error codes", () => {
    const error = new SubtitleExtractorError("TRACK_IDENTITY_MISMATCH");
    expect(JSON.stringify({ name: error.name, code: error.code, message: error.message })).toBe(
      '{"name":"SubtitleExtractorError","code":"TRACK_IDENTITY_MISMATCH","message":"TRACK_IDENTITY_MISMATCH"}',
    );
  });

  it("does not expose overlay failures or translated bodies through controller state", async () => {
    const sensitive = "PRIVATE_TRANSLATION_ASS_DATA /private/media/title.mkv";
    const overlay: TranslationOverlaySink = {
      show: () => {
        throw new Error(sensitive);
      },
      clear: () => undefined,
    };
    const provider: TranslationProvider = {
      attempt: async (request) => ({
        translations: request.items.map((item) => ({ id: item.id, text: sensitive })),
      }),
    };
    const controller = new PlaybackController({
      playerId: "player-A",
      provider,
      overlay,
      targetLanguage: "zh-Hans",
    });
    controller.setSource({
      cues: [
        {
          id: "cue-1",
          index: 0,
          startMs: 0,
          endMs: 1_000,
          sourceText: "PRIVATE_SOURCE_SUBTITLE",
          normalizedText: "PRIVATE_SOURCE_SUBTITLE",
        },
      ],
      contentHash: "hash",
      language: "en",
      format: "srt",
    });
    controller.tick(0);
    await controller.whenIdle();

    const state = JSON.stringify({
      status: controller.status,
      providerError: controller.providerError,
    });
    expect(state).not.toContain("PRIVATE_TRANSLATION_ASS_DATA");
    expect(state).not.toContain("PRIVATE_SOURCE_SUBTITLE");
    expect(state).not.toContain("/private/media/title.mkv");
  });

  it("rejects legacy source preferences before they can cross the language RPC", () => {
    expect(() =>
      parseTargetLanguageSave({
        requestId: "save",
        revision: 1,
        payload: {
          targetLanguage: "en",
          sourceLanguage: "PRIVATE_OLD_SOURCE_LANGUAGE",
          sourceLanguageMode: "manual",
        },
      }),
    ).toThrow(/INVALID_TARGET_LANGUAGE/);
  });
});
