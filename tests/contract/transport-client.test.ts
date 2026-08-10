import { describe, expect, it } from "vitest";
import {
  discoverHelperExecutable,
  parseReadyFrame,
  TransportProcess,
} from "../../src/adapters/iina/transport-process.js";
import {
  HelperProviderTransport,
  IinaLocalHttpBridge,
} from "../../src/adapters/iina/provider-transport.js";
import {
  TransportClient,
  TransportRpcError,
  type LocalHttpBridge,
} from "../../src/transport/client.js";

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

  it("derives the absolute installed helper path from IINA's @data directory", () => {
    const helper = discoverHelperExecutable({
      resolvePath: () =>
        "/Users/example/Library/Application Support/com.colliderli.iina/plugins/.data/io.sublingo.iina",
      exists: (path) =>
        path.endsWith("/io.sublingo.iina.iinaplugin/dist/native/sublingo-transport"),
    });
    expect(helper).toBe(
      "/Users/example/Library/Application Support/com.colliderli.iina/plugins/io.sublingo.iina.iinaplugin/dist/native/sublingo-transport",
    );
  });

  it("uses the ready frame and fails promptly when the helper exits during startup", async () => {
    await expect(
      TransportProcess.bootstrap({
        launch: async (_executable, _args, onStdout) => {
          onStdout('{"type":"ready","port":49152,"token":"abcDEF123_-","protocolVersion":1}\n');
          return new Promise<{ status: number }>(() => undefined);
        },
      }),
    ).resolves.toMatchObject({ port: 49152, token: "abcDEF123_-" });

    await expect(
      TransportProcess.bootstrap({ launch: async () => ({ status: 127 }) }),
    ).rejects.toThrow("Helper exited during startup");
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

  it("maps provider request labels to helper-required UUID job IDs", async () => {
    const bridge = new FakeBridge();
    const client = new TransportClient({ port: 49152, token: "session-token" }, bridge);
    const helperJobId = "7a90a4e6-cc4f-4f59-99b7-8ff522f887ae";
    const transport = new HelperProviderTransport(client, () => helperJobId);
    await transport.request({
      jobId: "probe-version",
      method: "GET",
      url: "http://127.0.0.1:11434/api/version",
      headers: {},
      timeoutMs: 1_000,
      maxResponseBytes: 1_024,
    });
    expect(bridge.calls.at(-1)?.body).toMatchObject({ jobId: helperJobId });
  });

  it("normalizes unavailable-helper failures without leaking bridge messages", async () => {
    const bridge = new FakeBridge();
    bridge.unavailable = true;
    const client = new TransportClient({ port: 49152, token: "secret-token" }, bridge);
    await expect(client.cancel("job-1")).rejects.toMatchObject({ code: "HELPER_UNAVAILABLE" });
    await expect(client.cancel("job-1")).rejects.not.toThrow(/private body|secret-token/);
  });

  it("preserves safe upstream timeout and network classifications from the helper", async () => {
    for (const [rpcCode, expected] of [
      [
        "upstream-timeout",
        { code: "PROVIDER_TIMEOUT", category: "timeout", userAction: "CHECK_NETWORK" },
      ],
      [
        "upstream-network",
        { code: "PROVIDER_NETWORK", category: "network", userAction: "CHECK_NETWORK" },
      ],
      [
        "forbidden-destination",
        { code: "FORBIDDEN_DESTINATION", category: "configuration", userAction: "CHECK_ENDPOINT" },
      ],
    ] as const) {
      const bridge: LocalHttpBridge = {
        post: async () => {
          throw new TransportRpcError(rpcCode);
        },
      };
      const client = new TransportClient({ port: 49152, token: "session-token" }, bridge);
      await expect(
        client.request({
          jobId: "job-1",
          method: "POST",
          url: "https://example.test",
          headers: {},
          timeoutMs: 1_000,
          maxResponseBytes: 1_024,
        }),
      ).rejects.toMatchObject(expected);
    }
  });

  it("extracts only the helper's allowlisted RPC error code", async () => {
    const bridge = new IinaLocalHttpBridge({
      post: async () => ({
        statusCode: 504,
        data: { error: "upstream-timeout", detail: "private provider response" },
        text: '{"error":"upstream-timeout","detail":"private provider response"}',
      }),
    } as unknown as IINA.API.HTTP);
    await expect(
      bridge.post("http://127.0.0.1:49152/v1/request", "token", {}),
    ).rejects.toMatchObject({ code: "upstream-timeout" });
    await expect(bridge.post("http://127.0.0.1:49152/v1/request", "token", {})).rejects.not.toThrow(
      /private provider response|token/,
    );
  });
});
