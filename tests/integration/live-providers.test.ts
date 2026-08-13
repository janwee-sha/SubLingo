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

function makeSixCueProviderRequest() {
  return {
    ...makeProviderRequest(),
    items: [
      { id: "cue-1", text: "Welcome back." },
      { id: "cue-2", text: "This is a translation test." },
      { id: "cue-3", text: "The video must keep playing." },
      { id: "cue-4", text: "Keep every cue in order." },
      { id: "cue-5", text: "Return concise subtitles." },
      { id: "cue-6", text: "The final cue is here." },
    ],
  };
}

async function withSafeProviderDiagnostics<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    const value =
      error && typeof error === "object" && !Array.isArray(error)
        ? (error as Record<string, unknown>)
        : {};
    throw new Error(
      JSON.stringify({
        category: value.category ?? "unknown",
        retryable: value.retryable === true,
        ...(typeof value.statusCode === "number" ? { statusCode: value.statusCode } : {}),
        ...(typeof value.providerCode === "string" ? { providerCode: value.providerCode } : {}),
        ...(typeof value.userAction === "string" ? { userAction: value.userAction } : {}),
      }),
    );
  }
}

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
        sessionId: "live-provider-test",
      },
      new FetchTransport(),
    );

    await expect(withSafeProviderDiagnostics(provider.probe())).resolves.toMatch(
      /^(strict-json-schema|json-object|prompt-json)$/,
    );
    const result = await withSafeProviderDiagnostics(provider.attempt(makeSixCueProviderRequest()));
    expect(result.translations.map((item) => item.id)).toEqual([
      "cue-1",
      "cue-2",
      "cue-3",
      "cue-4",
      "cue-5",
      "cue-6",
    ]);
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

    await expect(withSafeProviderDiagnostics(provider.probe())).resolves.toMatchObject({ model });
    const result = await withSafeProviderDiagnostics(provider.attempt(makeSixCueProviderRequest()));
    expect(result.translations.map((item) => item.id)).toEqual([
      "cue-1",
      "cue-2",
      "cue-3",
      "cue-4",
      "cue-5",
      "cue-6",
    ]);
  }, 180_000);
});
