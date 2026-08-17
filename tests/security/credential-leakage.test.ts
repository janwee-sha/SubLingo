import { describe, expect, it } from "vitest";
import { diagnostic } from "../../src/domain/logging.js";
import { sanitizedProfileView } from "../../src/domain/messages.js";
import { SubtitlePreparationCoordinator } from "../../src/app/subtitle-preparation.js";
import { SubtitleExtractorError } from "../../src/adapters/iina/subtitle-extractor.js";

describe("credential and content leakage boundaries", () => {
  it("keeps credentials, local paths, loopback tokens, auth headers and bodies out of views/diagnostics", () => {
    const sensitive = [
      "provider-secret",
      "/private/plugin-data/credentials.json",
      "loopback-token",
      "Bearer private",
      "private subtitle",
      "private translation",
    ];
    const profileView = sanitizedProfileView({
      profileId: "p",
      revision: 1,
      displayName: "p",
      kind: "openai",
      endpoint: "https://example.test",
      endpointFingerprint: "f",
      credential: { apiKey: sensitive[0]! },
    });
    const output = JSON.stringify({
      preferences: { targetLanguage: "zh-Hans" },
      profileView,
      diagnostic: diagnostic({
        code: "FAIL",
        authorization: sensitive[3],
        body: sensitive[4],
        translation: sensitive[5],
        token: sensitive[2],
        key: sensitive[1],
      }),
    });
    for (const value of sensitive) expect(output).not.toContain(value);
  });

  it("keeps media paths, subtitle text, job IDs and native details out of preparation views", async () => {
    const sensitive = [
      "/private/media/private-title.mkv",
      "private subtitle body",
      "7a90a4e6-cc4f-4f59-99b7-8ff522f887ae",
      "libavformat private failure",
    ];
    const coordinator = new SubtitlePreparationCoordinator({
      playerId: "player-A",
      extractor: {
        prepare: async () => {
          throw new SubtitleExtractorError("EXTRACTION_FAILED");
        },
        cancel: async () => "unknown",
        release: async () => undefined,
        shutdown: async () => undefined,
      },
      readResult: () => new TextEncoder().encode(sensitive[1]),
      createId: () => sensitive[2]!,
    });
    await coordinator.prepare(
      {
        playerId: "player-A",
        mediaEpoch: 1,
        localPath: sensitive[0]!,
        isNetworkResource: false,
      },
      { trackId: 7, origin: "embedded", codec: "ass", ffIndex: 3 },
    );
    const output = JSON.stringify(coordinator.view);
    expect(coordinator.view).toEqual({
      state: "failed",
      origin: "embedded",
      codec: "ass",
      canRetry: true,
      canReselect: true,
    });
    for (const value of sensitive) expect(output).not.toContain(value);
  });
});
