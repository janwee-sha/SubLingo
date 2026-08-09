import { describe, expect, it } from "vitest";
import { OllamaProvider } from "../../src/providers/ollama.js";
import type { ProviderTransport } from "../../src/providers/transport.js";
import { makeProviderRequest } from "./provider-test-helpers.js";

describe("Ollama native provider", () => {
  it("probes version/tags/schema and diagnoses missing model", async () => {
    const paths: string[] = [];
    const transport: ProviderTransport = {
      request: async (request) => {
        paths.push(new URL(request.url).pathname);
        if (request.url.endsWith("/api/version"))
          return { statusCode: 200, headers: {}, bodyText: '{"version":"0.10"}' };
        if (request.url.endsWith("/api/tags"))
          return { statusCode: 200, headers: {}, bodyText: '{"models":[{"name":"qwen"}]}' };
        return {
          statusCode: 200,
          headers: {},
          bodyText:
            '{"message":{"content":"{\\"translations\\":[{\\"id\\":\\"probe\\",\\"text\\":\\"hola\\"}]}"}}',
        };
      },
    };
    const provider = new OllamaProvider(
      { endpoint: "http://127.0.0.1:11434", model: "qwen" },
      transport,
    );
    await expect(provider.probe()).resolves.toMatchObject({ version: "0.10", model: "qwen" });
    expect(paths).toEqual(["/api/version", "/api/tags", "/api/chat"]);
    const missing = new OllamaProvider(
      { endpoint: "http://127.0.0.1:11434", model: "missing" },
      transport,
    );
    await expect(missing.probe()).rejects.toMatchObject({ category: "model", retryable: false });
  });

  it("uses non-stream structured chat, think:false, temperature 0 and cold-start timeout", async () => {
    const calls: unknown[] = [];
    const provider = new OllamaProvider(
      { endpoint: "http://localhost:11434/", model: "qwen" },
      {
        request: async (request) => {
          calls.push(request);
          return {
            statusCode: 200,
            headers: {},
            bodyText:
              '{"message":{"content":"{\\"translations\\":[{\\"id\\":\\"c1\\",\\"text\\":\\"一\\"}]}"},"prompt_eval_count":5,"eval_count":2}',
          };
        },
      },
    );
    const result = await provider.attempt(makeProviderRequest());
    expect(calls[0]).toMatchObject({
      url: "http://localhost:11434/api/chat",
      timeoutMs: 60_000,
      body: { stream: false, think: false, options: { temperature: 0 } },
    });
    expect(result.translations).toEqual([{ id: "c1", text: "一" }]);
  });

  it("rejects non-loopback HTTP endpoints", () => {
    expect(
      () =>
        new OllamaProvider(
          { endpoint: "http://remote.example:11434", model: "qwen" },
          {
            request: async () => {
              throw new Error();
            },
          },
        ),
    ).toThrow();
  });
});
