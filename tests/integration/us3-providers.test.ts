import { describe, expect, it } from "vitest";
import { ProviderBroker } from "../../src/providers/broker.js";
import { ProviderProfiles } from "../../src/providers/profiles.js";
import type { TranslationProvider } from "../../src/providers/provider.js";
import { makeProviderRequest } from "../contract/provider-test-helpers.js";

describe("US3 provider broker integration", () => {
  it("routes each provider kind and connection failure to the authoritative window", async () => {
    const profiles = new ProviderProfiles(() => "00000000-0000-4000-8000-000000000001");
    const calls: string[] = [];
    const provider: TranslationProvider = {
      attempt: async (request) => {
        calls.push(request.playerId);
        return { translations: [{ id: "c1", text: String(request.playerId) }] };
      },
    };
    const broker = new ProviderBroker(profiles, () => provider);
    const saved = profiles.save({
      displayName: "OpenAI",
      kind: "openai",
      endpoint: "https://example.test/v1",
      model: "m",
    });
    broker.select("window-A", saved.profileId, saved.revision, saved.endpointFingerprint);
    const request = {
      ...makeProviderRequest(),
      profileId: saved.profileId,
      profileRevision: saved.revision,
      endpointFingerprint: saved.endpointFingerprint,
    };
    const result = await broker.attempt("window-A", {
      ...request,
      playerId: "spoofed" as typeof request.playerId,
    });
    expect(result.translations).toEqual([{ id: "c1", text: "window-A" }]);
    expect(calls).toEqual(["window-A"]);
    await expect(broker.attempt("window-B", request)).rejects.toMatchObject({
      code: "PROFILE_NOT_SELECTED",
    });
  });

  it("requires reselection after endpoint edits while old window leases remain isolated", async () => {
    const profiles = new ProviderProfiles(() => "00000000-0000-4000-8000-000000000001");
    const provider: TranslationProvider = {
      attempt: async (request) => ({
        translations: [{ id: "c1", text: `${request.profileRevision}` }],
      }),
    };
    const broker = new ProviderBroker(profiles, () => provider);
    const first = profiles.save({
      displayName: "Local",
      kind: "ollama",
      endpoint: "http://127.0.0.1:11434",
      model: "m",
    });
    broker.select("A", first.profileId, 1, first.endpointFingerprint);
    broker.select("B", first.profileId, 1, first.endpointFingerprint);
    broker.lease("B", first.profileId, 1);
    const second = profiles.save({
      profileId: first.profileId,
      expectedRevision: 1,
      editingWindowId: "A",
      displayName: "Local",
      kind: "ollama",
      endpoint: "http://localhost:11434",
      model: "m",
    });
    const request = {
      ...makeProviderRequest(),
      profileId: first.profileId,
      profileRevision: 1,
      endpointFingerprint: first.endpointFingerprint,
    };
    await expect(broker.attempt("A", request)).rejects.toMatchObject({
      code: "PROFILE_NOT_SELECTED",
    });
    await expect(broker.attempt("B", request)).resolves.toMatchObject({
      translations: [{ text: "1" }],
    });
    broker.select("A", second.profileId, 2, second.endpointFingerprint);
  });

  it("keeps concurrent window results, errors, cancellation and cache fingerprints independent", async () => {
    const profiles = new ProviderProfiles(() => "00000000-0000-4000-8000-000000000001");
    const broker = new ProviderBroker(profiles, (profile) => ({
      attempt: async (request) => ({
        translations: [{ id: "c1", text: `${request.playerId}:${profile.endpointFingerprint}` }],
      }),
    }));
    const a = profiles.save({
      displayName: "A",
      kind: "azure",
      endpoint: "https://a.example.test",
    });
    const b = profiles.save({
      displayName: "B",
      kind: "openai",
      endpoint: "https://b.example.test/v1",
      model: "m",
    });
    broker.select("A", a.profileId, 1, a.endpointFingerprint);
    broker.select("B", b.profileId, 1, b.endpointFingerprint);
    const [aResult, bResult] = await Promise.all([
      broker.attempt("A", {
        ...makeProviderRequest(),
        profileId: a.profileId,
        profileRevision: 1,
        endpointFingerprint: a.endpointFingerprint,
      }),
      broker.attempt("B", {
        ...makeProviderRequest(),
        profileId: b.profileId,
        profileRevision: 1,
        endpointFingerprint: b.endpointFingerprint,
      }),
    ]);
    expect(aResult.translations[0]?.text).toContain("A:");
    expect(bResult.translations[0]?.text).toContain("B:");
    expect(aResult.translations[0]?.text).not.toBe(bResult.translations[0]?.text);
  });

  it("cancels every in-flight provider job during global shutdown", async () => {
    const profiles = new ProviderProfiles(() => "00000000-0000-4000-8000-000000000001");
    let rejectAttempt: ((reason: unknown) => void) | undefined;
    const cancellations: string[] = [];
    const provider: TranslationProvider = {
      attempt: () =>
        new Promise((_resolve, reject) => {
          rejectAttempt = reject;
        }),
      cancel: async (requestId) => {
        cancellations.push(requestId);
        rejectAttempt?.({ category: "cancelled", retryable: false });
      },
    };
    const broker = new ProviderBroker(profiles, () => provider);
    const saved = profiles.save({
      displayName: "Remote",
      kind: "openai",
      endpoint: "https://example.test/v1",
      model: "m",
    });
    broker.select("window-A", saved.profileId, saved.revision, saved.endpointFingerprint);
    const pending = broker.attempt("window-A", {
      ...makeProviderRequest(),
      requestId: "reset-me" as ReturnType<typeof makeProviderRequest>["requestId"],
      profileId: saved.profileId,
      profileRevision: saved.revision,
      endpointFingerprint: saved.endpointFingerprint,
    });

    await Promise.resolve();
    await broker.cancelAll();
    expect(cancellations).toEqual(["reset-me"]);
    await expect(pending).rejects.toMatchObject({ category: "cancelled" });
  });

  it("cancels only jobs owned by a deleted profile", async () => {
    let sequence = 0;
    const profiles = new ProviderProfiles(() => `profile-${++sequence}`);
    const cancellations: string[] = [];
    const resolvers = new Map<
      string,
      (value: { translations: Array<{ id: string; text: string }> }) => void
    >();
    const broker = new ProviderBroker(profiles, () => ({
      attempt: (request) =>
        new Promise((resolve) => {
          resolvers.set(request.requestId, resolve);
        }),
      cancel: async (requestId) => {
        cancellations.push(requestId);
        resolvers.get(requestId)?.({ translations: [] });
      },
    }));
    const deleted = profiles.save({
      displayName: "Deleted",
      kind: "openai",
      endpoint: "https://deleted.example/v1",
      model: "m",
    });
    const retained = profiles.save({
      displayName: "Retained",
      kind: "openai",
      endpoint: "https://retained.example/v1",
      model: "m",
    });
    broker.select("A", deleted.profileId, 1, deleted.endpointFingerprint);
    broker.select("B", retained.profileId, 1, retained.endpointFingerprint);
    const aRequest = {
      ...makeProviderRequest(),
      requestId: "delete-A" as ReturnType<typeof makeProviderRequest>["requestId"],
      profileId: deleted.profileId,
      endpointFingerprint: deleted.endpointFingerprint,
    };
    const bRequest = {
      ...makeProviderRequest(),
      requestId: "keep-B" as ReturnType<typeof makeProviderRequest>["requestId"],
      profileId: retained.profileId,
      endpointFingerprint: retained.endpointFingerprint,
    };
    const pendingA = broker.attempt("A", aRequest);
    const pendingB = broker.attempt("B", bRequest);
    await Promise.resolve();

    await broker.cancelProfile(deleted.profileId);
    expect(cancellations).toEqual(["delete-A"]);
    resolvers.get("keep-B")?.({ translations: [{ id: "c1", text: "still-running" }] });
    await expect(pendingA).resolves.toEqual({ translations: [] });
    await expect(pendingB).resolves.toMatchObject({
      translations: [{ text: "still-running" }],
    });
  });
});
