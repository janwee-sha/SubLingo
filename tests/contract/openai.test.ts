import { describe, expect, it } from "vitest";
import { OpenAICompatibleProvider } from "../../src/providers/openai.js";
import type { ProviderTransport } from "../../src/providers/transport.js";
import { makeProviderRequest } from "./provider-test-helpers.js";

describe("OpenAI-compatible provider", () => {
  it("probes strict schema then persists the working capability", async () => {
    const modes: string[] = [];
    const transport: ProviderTransport = {
      request: async (request) => {
        modes.push(
          (request.body as { response_format?: { type?: string } }).response_format?.type ??
            "prompt-json",
        );
        if (modes.length === 1) return { statusCode: 400, headers: {}, bodyText: "unsupported" };
        return {
          statusCode: 200,
          headers: {},
          bodyText: JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: '{"translations":[{"id":"probe","text":"hola"}]}' },
              },
            ],
          }),
        };
      },
    };
    const provider = new OpenAICompatibleProvider(
      { endpoint: "https://example.test/v1", model: "model", apiKey: "key" },
      transport,
    );
    await expect(provider.probe()).resolves.toBe("json-object");
    expect(modes).toEqual(["json_schema", "json_object"]);
  });

  it("uses non-stream chat, model/auth and strict local ID mapping without real-batch fallback", async () => {
    const calls: unknown[] = [];
    const provider = new OpenAICompatibleProvider(
      {
        endpoint: "https://example.test/v1/",
        model: "model",
        apiKey: "key",
        capability: "strict-json-schema",
      },
      {
        request: async (request) => {
          calls.push(request);
          return {
            statusCode: 200,
            headers: {},
            bodyText: JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content:
                      '{"translations":[{"id":"c1","text":"一"},{"id":"unknown","text":"x"}]}',
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 2 },
            }),
          };
        },
      },
    );
    const result = await provider.attempt(makeProviderRequest());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://example.test/v1/chat/completions",
      headers: { Authorization: "Bearer key" },
      body: { model: "model", stream: false },
    });
    expect(result.translations).toEqual([{ id: "c1", text: "一" }]);
  });

  it("classifies refusal, length/filter, quota and malformed output as permanent", async () => {
    for (const response of [
      { choices: [{ finish_reason: "content_filter", message: { content: "" } }] },
      { choices: [{ finish_reason: "length", message: { content: "{}" } }] },
      { choices: [{ finish_reason: "stop", message: { content: "not-json" } }] },
    ]) {
      const provider = new OpenAICompatibleProvider(
        { endpoint: "https://example.test/v1", model: "m", capability: "prompt-json" },
        {
          request: async () => ({
            statusCode: 200,
            headers: {},
            bodyText: JSON.stringify(response),
          }),
        },
      );
      await expect(provider.attempt(makeProviderRequest())).rejects.toMatchObject({
        retryable: false,
      });
    }
  });
});
