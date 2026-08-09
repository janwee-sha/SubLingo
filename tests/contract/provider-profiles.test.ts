import { describe, expect, it } from "vitest";
import { ProviderProfiles } from "../../src/providers/profiles.js";

describe("immutable provider profile revisions", () => {
  it("normalizes endpoints, fingerprints semantic fields and creates immutable revisions", () => {
    const profiles = new ProviderProfiles(() => "00000000-0000-4000-8000-000000000001");
    const first = profiles.save({
      displayName: "OpenAI",
      kind: "openai",
      endpoint: "https://api.example.test/v1/",
      model: "model-a",
    });
    const second = profiles.save({
      profileId: first.profileId,
      expectedRevision: 1,
      displayName: "OpenAI",
      kind: "openai",
      endpoint: "https://api.example.test/v2",
      model: "model-a",
    });
    expect(first).toMatchObject({ revision: 1, endpoint: "https://api.example.test/v1" });
    expect(second.revision).toBe(2);
    expect(second.endpointFingerprint).not.toBe(first.endpointFingerprint);
    expect(profiles.get(first.profileId, 1)).toEqual(first);
    expect(() =>
      profiles.save({
        profileId: first.profileId,
        expectedRevision: 1,
        displayName: "stale",
        kind: "openai",
        endpoint: "https://api.example.test",
        model: "m",
      }),
    ).toThrow(/STALE_PROFILE_REVISION/);
  });

  it("requires exact per-window selection and leases old revisions independently", () => {
    const profiles = new ProviderProfiles(() => "00000000-0000-4000-8000-000000000001");
    const first = profiles.save({
      displayName: "Local",
      kind: "ollama",
      endpoint: "127.0.0.1:11434",
      model: "qwen",
    });
    expect(first.endpoint).toBe("http://127.0.0.1:11434");
    profiles.select("window-A", first.profileId, 1, first.endpointFingerprint);
    profiles.select("window-B", first.profileId, 1, first.endpointFingerprint);
    profiles.lease("window-B", first.profileId, 1);
    profiles.save({
      profileId: first.profileId,
      expectedRevision: 1,
      editingWindowId: "window-A",
      displayName: "Local",
      kind: "ollama",
      endpoint: "http://localhost:11434",
      model: "qwen",
    });
    expect(profiles.selection("window-A")).toBeNull();
    expect(profiles.selection("window-B")).toMatchObject({ revision: 1 });
    expect(profiles.get(first.profileId, 1)).not.toBeNull();
    profiles.release("window-B", first.profileId, 1);
  });

  it("rejects remote HTTP, URL credentials and stale/forged selection fingerprints", () => {
    const profiles = new ProviderProfiles(() => "00000000-0000-4000-8000-000000000001");
    expect(() =>
      profiles.save({
        displayName: "bad",
        kind: "openai",
        endpoint: "http://remote.example",
        model: "m",
      }),
    ).toThrow();
    expect(() =>
      profiles.save({
        displayName: "bad",
        kind: "azure",
        endpoint: "https://user:pass@example.test",
      }),
    ).toThrow();
    const valid = profiles.save({
      displayName: "Azure",
      kind: "azure",
      endpoint: "https://api.cognitive.microsofttranslator.com",
    });
    expect(() => profiles.select("window", valid.profileId, 1, "forged")).toThrow(
      /SELECTION_MISMATCH/,
    );
  });
});
