import { describe, expect, it } from "vitest";
import { normalizeProviderEndpoint, ProviderProfiles } from "../../src/providers/profiles.js";

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
    expect(first).toMatchObject({ revision: 1, endpoint: "https://api.example.test/v1/" });
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

  it("treats the network route as selected profile identity", () => {
    const profiles = new ProviderProfiles(() => "route-profile");
    const system = profiles.save({
      displayName: "Remote",
      kind: "openai",
      endpoint: "https://api.example.test/v1",
      model: "model",
      proxyMode: "system",
    });
    const direct = profiles.save({
      profileId: system.profileId,
      expectedRevision: 1,
      displayName: "Remote",
      kind: "openai",
      endpoint: "https://api.example.test/v1",
      model: "model",
      proxyMode: "direct",
    });

    expect(system.proxyMode).toBe("system");
    expect(direct.proxyMode).toBe("direct");
    expect(direct.endpointFingerprint).not.toBe(system.endpointFingerprint);
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
        kind: "openai",
        endpoint: "https://user:pass@example.test",
        model: "m",
      }),
    ).toThrow();
    const valid = profiles.save({
      displayName: "Remote",
      kind: "openai",
      endpoint: "https://api.example.test/v1",
      model: "m",
    });
    expect(() => profiles.select("window", valid.profileId, 1, "forged")).toThrow(
      /SELECTION_MISMATCH/,
    );
  });

  it("preserves every OpenAI endpoint as a literal API root", () => {
    expect(
      normalizeProviderEndpoint("openai", "https://api.example.test/v1/chat/completions/"),
    ).toBe("https://api.example.test/v1/chat/completions/");

    const profiles = new ProviderProfiles(() => "unused");
    const root = profiles.save({
      profileId: "root",
      expectedRevision: 0,
      displayName: "Root",
      kind: "openai",
      endpoint: "https://api.example.test/v1",
      model: "model",
    });
    const full = profiles.save({
      profileId: "full",
      expectedRevision: 0,
      displayName: "Full",
      kind: "openai",
      endpoint: "https://api.example.test/v1/chat/completions",
      model: "model",
    });
    expect(root.endpoint).toBe("https://api.example.test/v1");
    expect(full.endpoint).toBe("https://api.example.test/v1/chat/completions");
    expect(full.endpointFingerprint).not.toBe(root.endpointFingerprint);
  });

  it("clears every window selection and lease without deleting profile metadata", () => {
    const profiles = new ProviderProfiles(() => "00000000-0000-4000-8000-000000000001");
    const saved = profiles.save({
      displayName: "Remote",
      kind: "openai",
      endpoint: "https://api.example.test/v1",
      model: "model",
    });
    profiles.select("window-A", saved.profileId, saved.revision, saved.endpointFingerprint);
    profiles.select("window-B", saved.profileId, saved.revision, saved.endpointFingerprint);
    profiles.lease("window-A", saved.profileId, saved.revision);

    expect(profiles.clearAuthorizations()).toEqual(["window-A", "window-B"]);
    expect(profiles.selection("window-A")).toBeNull();
    expect(profiles.selection("window-B")).toBeNull();
    expect(profiles.get(saved.profileId, saved.revision)).toEqual(saved);
  });

  it("deletes every revision and reports only windows using that profile", () => {
    let sequence = 0;
    const profiles = new ProviderProfiles(() => `profile-${++sequence}`);
    const deleted = profiles.save({
      displayName: "Delete me",
      kind: "openai",
      endpoint: "https://delete.example/v1",
      model: "model",
    });
    profiles.save({
      profileId: deleted.profileId,
      expectedRevision: 1,
      displayName: "Delete me",
      kind: "openai",
      endpoint: "https://delete.example/v2",
      model: "model",
    });
    const retained = profiles.save({
      displayName: "Keep me",
      kind: "ollama",
      endpoint: "http://127.0.0.1:11434",
      model: "qwen",
    });
    profiles.select(
      "window-A",
      deleted.profileId,
      2,
      profiles.get(deleted.profileId, 2)!.endpointFingerprint,
    );
    profiles.select("window-B", retained.profileId, 1, retained.endpointFingerprint);
    profiles.lease("window-C", deleted.profileId, 1);

    expect(profiles.delete(deleted.profileId)).toEqual(["window-A", "window-C"]);
    expect(profiles.get(deleted.profileId, 1)).toBeNull();
    expect(profiles.get(deleted.profileId, 2)).toBeNull();
    expect(profiles.selection("window-A")).toBeNull();
    expect(profiles.selection("window-B")).toMatchObject({ profileId: retained.profileId });
    expect(profiles.listLatest()).toEqual([retained]);
    expect(() => profiles.delete(deleted.profileId)).toThrow(/PROFILE_NOT_FOUND/);
  });
});
