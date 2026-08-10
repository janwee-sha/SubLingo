import { describe, expect, it } from "vitest";
import {
  SIDEBAR_MESSAGE_NAMES,
  parseProfileSelection,
  parseSecretSet,
  sanitizedProfileView,
} from "../../src/domain/messages.js";
import { normalizeProviderError } from "../../src/domain/errors.js";
import "../../ui/provider-status.js";

const providerTestStatusMessage = (
  globalThis as typeof globalThis & {
    sublingoProviderTestStatusMessage(result: {
      ok?: boolean;
      category?: string;
      userAction?: string;
    }): string;
  }
).sublingoProviderTestStatusMessage;

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

  it("uses a Main-owned reset request and preserves only allowlisted provider errors", () => {
    expect(SIDEBAR_MESSAGE_NAMES).toContain("vault:reset-request");
    expect(SIDEBAR_MESSAGE_NAMES).not.toContain("vault:reset");
    expect(
      normalizeProviderError({
        category: "authentication",
        retryable: false,
        statusCode: 401,
        providerCode: "invalid_api_key",
        userAction: "CHECK_CREDENTIALS",
        privateBody: "must-not-cross-rpc",
      }),
    ).toEqual({
      category: "authentication",
      retryable: false,
      statusCode: 401,
      providerCode: "invalid_api_key",
      userAction: "CHECK_CREDENTIALS",
    });
    expect(
      normalizeProviderError({
        category: "made-up",
        retryable: false,
        providerCode: "bad code with spaces",
        userAction: "LEAK_SECRET",
      }),
    ).toMatchObject({ providerCode: "UNKNOWN_PROVIDER_ERROR" });
  });

  it("turns safe provider classifications into actionable sidebar guidance", () => {
    expect(
      providerTestStatusMessage({
        ok: false,
        category: "authentication",
        userAction: "CHECK_CREDENTIALS",
      }),
    ).toMatch(/API key/i);
    expect(
      providerTestStatusMessage({ ok: false, category: "model", userAction: "CHECK_MODEL" }),
    ).toMatch(/model/i);
    expect(
      providerTestStatusMessage({ ok: false, category: "quota", userAction: "CHECK_QUOTA" }),
    ).toMatch(/quota|billing/i);
    expect(
      providerTestStatusMessage({ ok: false, category: "timeout", userAction: "CHECK_NETWORK" }),
    ).toMatch(/timed out/i);
  });
});
