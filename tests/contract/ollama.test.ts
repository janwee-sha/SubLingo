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
    const request = makeProviderRequest();
    request.items[0]!.id = "srt:0:0:1000";
    request.items[1]!.id = "srt:1:1000:2000";
    const result = await provider.attempt(request);
    expect(calls[0]).toMatchObject({
      url: "http://localhost:11434/api/chat",
      timeoutMs: 60_000,
      body: { stream: false, think: false, options: { temperature: 0 } },
    });
    const userMessage = (
      calls[0] as { body: { messages: Array<{ content: string }> } }
    ).body.messages.at(-1)?.content;
    expect(userMessage).toContain('"id":"c1"');
    expect(userMessage).not.toContain("srt:0:0:1000");
    expect(result.translations).toEqual([{ id: "srt:0:0:1000", text: "一" }]);
  });

  it("sends larger batches as two-item chats without dropping or duplicating cues", async () => {
    const calls: Array<{ jobId: string; items: Array<{ id: string; text: string }> }> = [];
    const provider = new OllamaProvider(
      { endpoint: "http://127.0.0.1:11434", model: "translategemma:12b" },
      {
        request: async (request) => {
          const messages = (request.body as { messages: Array<{ content: string }> }).messages;
          const payload = JSON.parse(messages.at(-1)!.content) as {
            items: Array<{ id: string; text: string }>;
          };
          calls.push({ jobId: request.jobId, items: payload.items });
          return {
            statusCode: 200,
            headers: {},
            bodyText: JSON.stringify({
              message: {
                content: JSON.stringify({
                  translations: payload.items.map((item) => ({
                    id: item.id,
                    text: `T:${item.text}`,
                  })),
                }),
              },
              prompt_eval_count: 3,
              eval_count: 2,
            }),
          };
        },
      },
    );
    const request = makeProviderRequest();
    request.items.push(
      { id: "c3", text: "three" },
      { id: "c4", text: "four" },
      { id: "c5", text: "five" },
      { id: "c6", text: "six" },
    );

    const result = await provider.attempt(request);

    expect(calls.map((call) => call.jobId)).toEqual([
      "request-part-1",
      "request-part-2",
      "request-part-3",
    ]);
    expect(calls.map((call) => call.items.length)).toEqual([2, 2, 2]);
    expect(calls.flatMap((call) => call.items.map((item) => item.text))).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
    ]);
    expect(result.translations).toHaveLength(6);
    expect(result.usage).toEqual({ input: 9, output: 6 });
  });

  it("publishes each validated wire result with restored IDs before returning the aggregate", async () => {
    const provider = new OllamaProvider(
      { endpoint: "http://127.0.0.1:11434", model: "qwen" },
      {
        request: async (request) => {
          const messages = (request.body as { messages: Array<{ content: string }> }).messages;
          const payload = JSON.parse(messages.at(-1)!.content) as {
            items: Array<{ id: string; text: string }>;
          };
          return {
            statusCode: 200,
            headers: {},
            bodyText: JSON.stringify({
              message: {
                content: JSON.stringify({
                  translations: payload.items.map((item) => ({
                    id: item.id,
                    text: `T:${item.text}`,
                  })),
                }),
              },
            }),
          };
        },
      },
    );
    const request = makeProviderRequest();
    request.items = Array.from({ length: 5 }, (_, index) => ({
      id: `source-${index + 1}`,
      text: `text-${index + 1}`,
    }));
    const progress: Array<Array<{ id: string; text: string }>> = [];

    const result = await provider.attempt(request, (increment) => {
      progress.push(increment.translations);
    });

    expect(progress.map((items) => items.map((item) => item.id))).toEqual([
      ["source-1", "source-2"],
      ["source-3", "source-4"],
      ["source-5"],
    ]);
    expect(result.translations.map((item) => item.id)).toEqual([
      "source-1",
      "source-2",
      "source-3",
      "source-4",
      "source-5",
    ]);
  });

  it("does not publish invalid output", async () => {
    const progress: unknown[] = [];
    const provider = new OllamaProvider(
      { endpoint: "http://127.0.0.1:11434", model: "qwen" },
      {
        request: async () => ({
          statusCode: 200,
          headers: {},
          bodyText:
            '{"message":{"content":"{\\"translations\\":[{\\"id\\":\\"unknown\\",\\"text\\":\\"x\\"}]}"}}',
        }),
      },
    );

    await expect(
      provider.attempt(makeProviderRequest(), (value) => progress.push(value)),
    ).resolves.toMatchObject({ translations: [] });
    expect(progress).toEqual([]);
  });

  it("cancels every active split chat for the logical batch", async () => {
    const cancelled: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = new OllamaProvider(
      { endpoint: "http://127.0.0.1:11434", model: "qwen" },
      {
        request: async () => {
          await gate;
          return {
            statusCode: 200,
            headers: {},
            bodyText: JSON.stringify({
              message: { content: '{"translations":[{"id":"c1","text":"一"}]}' },
            }),
          };
        },
        cancel: (jobId) => {
          cancelled.push(jobId);
        },
      },
    );
    const progress: unknown[] = [];
    const attempt = provider.attempt(makeProviderRequest(), (value) => progress.push(value));
    await Promise.resolve();

    await provider.cancel("request");
    release?.();
    await expect(attempt).rejects.toMatchObject({ category: "cancelled" });

    expect(cancelled).toEqual(["request-part-1"]);
    expect(progress).toEqual([]);
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
