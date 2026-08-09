import { describe, expect, it } from "vitest";

import { OllamaProvider } from "../../src/providers/ollama.js";
import { OpenAICompatibleProvider } from "../../src/providers/openai.js";
import type { ProviderTransport, ProviderTransportRequest } from "../../src/providers/transport.js";
import { makeProviderRequest } from "../contract/provider-test-helpers.js";

class FetchTransport implements ProviderTransport {
  async request(request: ProviderTransportRequest) {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    return { statusCode: response.status, headers, bodyText: await response.text() };
  }
}

const live = process.env.SUBLINGO_LIVE_PROVIDER_TEST === "1";

describe.skipIf(!live)("authorized live provider smoke tests", () => {
  it("probes and translates with the configured OpenAI-compatible service", async () => {
    const endpoint = process.env.SUBLINGO_OPENAI_ENDPOINT;
    const model = process.env.SUBLINGO_OPENAI_MODEL;
    const apiKey = process.env.SUBLINGO_OPENAI_KEY;
    expect(endpoint).toBeTruthy();
    expect(model).toBeTruthy();
    const provider = new OpenAICompatibleProvider(
      {
        endpoint: endpoint!,
        model: model!,
        ...(apiKey ? { apiKey } : {}),
      },
      new FetchTransport(),
    );

    await expect(provider.probe()).resolves.toMatch(
      /^(strict-json-schema|json-object|prompt-json)$/,
    );
    const result = await provider.attempt(makeProviderRequest());
    expect(result.translations.map((item) => item.id)).toEqual(["c1", "c2"]);
  }, 90_000);

  it("probes and translates with the configured Ollama service", async () => {
    const endpoint = process.env.SUBLINGO_OLLAMA_ENDPOINT;
    const model = process.env.SUBLINGO_OLLAMA_MODEL;
    expect(endpoint).toBeTruthy();
    expect(model).toBeTruthy();
    const provider = new OllamaProvider(
      { endpoint: endpoint!, model: model! },
      new FetchTransport(),
    );

    await expect(provider.probe()).resolves.toMatchObject({ model });
    const result = await provider.attempt(makeProviderRequest());
    expect(result.translations.map((item) => item.id)).toEqual(["c1", "c2"]);
  }, 180_000);
});
