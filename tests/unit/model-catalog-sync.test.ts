import { describe, expect, it } from "vitest";
import {
  ModelCatalogSync,
  modelCatalogContextToken,
} from "../../src/adapters/iina/model-catalog-sync.js";

describe("per-window model catalog synchronization", () => {
  it("uses one cache context across trigger sources while isolating profile revisions", () => {
    const base = {
      kind: "openai" as const,
      endpoint: "https://example.test/v1",
      proxyMode: "system" as const,
      profileId: "profile-a",
      profileRevision: 1,
      endpointFingerprint: "fingerprint-a",
    };
    expect(modelCatalogContextToken({ ...base, trigger: "open" })).toBe(
      modelCatalogContextToken({ ...base, trigger: "manual" }),
    );
    expect(modelCatalogContextToken({ ...base, trigger: "profile" })).not.toBe(
      modelCatalogContextToken({ ...base, trigger: "profile", profileRevision: 2 }),
    );
  });

  it("coalesces equivalent automatic requests and lets manual refresh take ownership", () => {
    const sync = new ModelCatalogSync();
    expect(
      sync.begin("window-a", {
        requestId: "auto-1",
        contextToken: "context-a",
        trigger: "endpoint",
      }),
    ).toMatchObject({ forwarded: true, ownerRequestId: "auto-1" });
    expect(
      sync.begin("window-a", {
        requestId: "auto-2",
        contextToken: "context-a",
        trigger: "profile",
      }),
    ).toMatchObject({ forwarded: false, ownerRequestId: "auto-1" });
    expect(
      sync.begin("window-a", {
        requestId: "manual-1",
        contextToken: "context-a",
        trigger: "manual",
      }),
    ).toMatchObject({ forwarded: true, ownerRequestId: "manual-1" });
  });

  it("commits only the latest owner and keeps the last successful catalog on failure", () => {
    const sync = new ModelCatalogSync();
    sync.begin("window-a", {
      requestId: "old",
      contextToken: "context-a",
      trigger: "endpoint",
    });
    sync.begin("window-a", {
      requestId: "new",
      contextToken: "context-a",
      trigger: "manual",
    });
    expect(
      sync.commit("window-a", {
        requestId: "old",
        ok: true,
        contextKey: "opaque-a",
        models: ["stale"],
      }),
    ).toBe(false);
    expect(
      sync.commit("window-a", {
        requestId: "new",
        ok: true,
        contextKey: "opaque-a",
        models: ["current"],
      }),
    ).toBe(true);
    sync.begin("window-a", {
      requestId: "failed",
      contextToken: "context-a",
      trigger: "manual",
    });
    expect(
      sync.commit("window-a", {
        requestId: "failed",
        ok: false,
        contextKey: "opaque-a",
        category: "network",
        retryable: true,
        userAction: "CHECK_NETWORK",
      }),
    ).toBe(true);
    expect(sync.snapshot("window-a").catalog).toEqual({
      contextKey: "opaque-a",
      models: ["current"],
    });
  });

  it("isolates windows and accepts a successful empty catalog", () => {
    const sync = new ModelCatalogSync();
    sync.begin("window-a", { requestId: "a", contextToken: "shared", trigger: "open" });
    sync.begin("window-b", { requestId: "b", contextToken: "shared", trigger: "open" });
    sync.commit("window-a", {
      requestId: "a",
      ok: true,
      contextKey: "opaque-a",
      models: [],
    });
    sync.commit("window-b", {
      requestId: "b",
      ok: true,
      contextKey: "opaque-b",
      models: ["model-b"],
    });
    expect(sync.snapshot("window-a").catalog?.models).toEqual([]);
    expect(sync.snapshot("window-b").catalog?.models).toEqual(["model-b"]);
  });
});
