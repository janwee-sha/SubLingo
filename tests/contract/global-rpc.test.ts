import { describe, expect, it } from "vitest";
import { GlobalRpcRouter } from "../../src/adapters/iina/global-rpc.js";

describe("authoritative global RPC routing", () => {
  it("uses the host player ID and ignores a spoofed payload ID", async () => {
    const replies: Array<{ playerId: string; name: string; data: unknown }> = [];
    const router = new GlobalRpcRouter((playerId, name, data) =>
      replies.push({ playerId, name, data }),
    );
    router.register("provider:attempt", async (message, context) => ({
      authoritativePlayerId: context.playerId,
      suppliedPlayerId: (message.payload as Record<string, unknown>).playerId,
    }));
    await router.receive("host-player-A", "provider:attempt", {
      requestId: "same-id",
      revision: 1,
      payload: { playerId: "spoofed-player-B" },
    });
    expect(replies[0]).toMatchObject({
      playerId: "host-player-A",
      name: "provider:attempt:result",
    });
    expect(replies[0]?.data).toMatchObject({ authoritativePlayerId: "host-player-A" });
  });

  it("rejects stale revisions and duplicate live request IDs per player", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const replies: unknown[] = [];
    const router = new GlobalRpcRouter((_playerId, _name, data) => replies.push(data));
    router.register("slow", async () => blocked);
    const first = router.receive("A", "slow", { requestId: "r1", revision: 2, payload: {} });
    await router.receive("A", "slow", { requestId: "r1", revision: 2, payload: {} });
    await router.receive("A", "slow", { requestId: "r2", revision: 1, payload: {} });
    release();
    await first;
    expect(replies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error: expect.objectContaining({ code: "DUPLICATE_REQUEST" }) }),
        expect.objectContaining({ error: expect.objectContaining({ code: "STALE_REVISION" }) }),
      ]),
    );
  });

  it("permits colliding IDs and concurrent work across different players", async () => {
    const routed: string[] = [];
    const router = new GlobalRpcRouter((playerId) => routed.push(playerId));
    router.register("work", async (_message, context) => context.playerId);
    await Promise.all([
      router.receive("A", "work", { requestId: "same", revision: 1, payload: {} }),
      router.receive("B", "work", { requestId: "same", revision: 1, payload: {} }),
    ]);
    expect(routed.sort()).toEqual(["A", "B"]);
  });

  it("keeps provider connection tests with the same external ID scoped to their host players", async () => {
    const routed: Array<{ playerId: string; resultPlayerId: unknown }> = [];
    const router = new GlobalRpcRouter((playerId, _name, data) => {
      routed.push({
        playerId,
        resultPlayerId: (data as Record<string, unknown>).playerId,
      });
    });
    router.register("provider:test", async (message, context) => ({
      playerId: context.playerId,
      profileId: (message.payload as Record<string, unknown>).profileId,
    }));

    await Promise.all([
      router.receive("A", "provider:test", {
        requestId: "same-test",
        revision: 3,
        payload: { profileId: "profile-a", revision: 3 },
      }),
      router.receive("B", "provider:test", {
        requestId: "same-test",
        revision: 3,
        payload: { profileId: "profile-b", revision: 3 },
      }),
    ]);

    expect(routed).toEqual([
      { playerId: "A", resultPlayerId: "A" },
      { playerId: "B", resultPlayerId: "B" },
    ]);
  });
});
