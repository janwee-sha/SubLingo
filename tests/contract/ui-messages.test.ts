import { describe, expect, it } from "vitest";
import {
  parseProfileSelection,
  parseSecretSet,
  sanitizedProfileView,
} from "../../src/domain/messages.js";

describe("Sidebar/Main/Global security messages", () => {
  const profile = {
    profileId: "00000000-0000-4000-8000-000000000001",
    revision: 2,
    displayName: "Remote",
    kind: "openai" as const,
    endpoint: "https://api.example.test/v1",
    endpointFingerprint: "fingerprint",
    model: "model",
    credential: { apiKey: "secret-value" },
  };

  it("returns sanitized views with exact kind/address and write-only credential state", () => {
    expect(sanitizedProfileView(profile)).toEqual({
      profileId: profile.profileId,
      revision: 2,
      displayName: "Remote",
      kind: "openai",
      endpoint: "https://api.example.test/v1",
      endpointFingerprint: "fingerprint",
      model: "model",
      credentialConfigured: true,
    });
    expect(JSON.stringify(sanitizedProfileView(profile))).not.toContain("secret-value");
  });

  it("accepts fresh write-only secrets and exact selection authorization only", () => {
    expect(
      parseSecretSet({
        profileId: profile.profileId,
        expectedRevision: 2,
        fields: { apiKey: "new-secret" },
      }),
    ).toEqual({
      profileId: profile.profileId,
      expectedRevision: 2,
      fields: { apiKey: "new-secret" },
    });
    expect(() =>
      parseSecretSet({
        profileId: profile.profileId,
        expectedRevision: 2,
        fields: { apiKey: "••••••" },
      }),
    ).toThrow(/MASKED_SECRET/);
    expect(
      parseProfileSelection({
        profileId: profile.profileId,
        revision: 2,
        endpointFingerprint: "fingerprint",
      }),
    ).toMatchObject({ revision: 2 });
  });
});
