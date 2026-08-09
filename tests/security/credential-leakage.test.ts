import { describe, expect, it } from "vitest";
import { diagnostic } from "../../src/domain/logging.js";
import { sanitizedProfileView } from "../../src/domain/messages.js";

describe("credential and content leakage boundaries", () => {
  it("keeps credentials, DEKs, loopback tokens, auth headers and bodies out of views/diagnostics", () => {
    const sensitive = [
      "provider-secret",
      "dek-material",
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
});
