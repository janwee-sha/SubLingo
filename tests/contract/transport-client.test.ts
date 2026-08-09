import { describe, expect, it } from "vitest";
import { parseReadyFrame } from "../../src/adapters/iina/transport-process.js";
import { TransportClient, type LocalHttpBridge } from "../../src/transport/client.js";

class FakeBridge implements LocalHttpBridge {
  readonly calls: Array<{ url: string; token: string; body: unknown }> = [];
  unavailable = false;

  async post<T>(url: string, token: string, body: unknown): Promise<T> {
    if (this.unavailable) throw new Error("connection refused with private body");
    this.calls.push({ url, token, body });
    const path = new URL(url).pathname;
    if (path === "/v1/random") return { bytesB64: "AQID" } as T;
    if (path === "/v1/cancel") return { state: "cancelled" } as T;
    if (path === "/v1/shutdown") return { state: "shutting-down" } as T;
    return {
      jobId: "job-1",
      transportState: "completed",
      statusCode: 200,
      headers: { "x-request-id": "safe-id" },
      bodyText: "{}",
    } as T;
  }
}

describe("transport helper client", () => {
  it("accepts only one exact framed ready object", () => {
    expect(
      parseReadyFrame('{"type":"ready","port":49152,"token":"abcDEF123_-","protocolVersion":1}\n'),
    ).toEqual({
      type: "ready",
      port: 49152,
      token: "abcDEF123_-",
      protocolVersion: 1,
    });
    expect(() => parseReadyFrame("debug\n{}")).toThrow();
    expect(() =>
      parseReadyFrame('{"type":"ready","port":80,"token":"x","protocolVersion":2}'),
    ).toThrow();
  });

  it("sends bearer-authenticated random/request/cancel RPC to loopback", async () => {
    const bridge = new FakeBridge();
    const client = new TransportClient({ port: 49152, token: "session-token" }, bridge);
    await expect(client.random(3, "vault-nonce")).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    await expect(
      client.request({
        jobId: "job-1",
        method: "POST",
        url: "https://example.test",
        headers: {},
        body: {},
        timeoutMs: 1_000,
        maxResponseBytes: 1_024,
      }),
    ).resolves.toMatchObject({ statusCode: 200 });
    await expect(client.cancel("job-1")).resolves.toBe("cancelled");
    expect(bridge.calls.every((call) => call.token === "session-token")).toBe(true);
    expect(bridge.calls.every((call) => call.url.startsWith("http://127.0.0.1:49152/"))).toBe(true);
  });

  it("normalizes unavailable-helper failures without leaking bridge messages", async () => {
    const bridge = new FakeBridge();
    bridge.unavailable = true;
    const client = new TransportClient({ port: 49152, token: "secret-token" }, bridge);
    await expect(client.cancel("job-1")).rejects.toMatchObject({ code: "HELPER_UNAVAILABLE" });
    await expect(client.cancel("job-1")).rejects.not.toThrow(/private body|secret-token/);
  });
});
