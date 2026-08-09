import { describe, expect, it } from "vitest";
import { AzureProvider } from "../../src/providers/azure.js";
import type { ProviderTransport } from "../../src/providers/transport.js";
import { makeProviderRequest } from "./provider-test-helpers.js";

describe("Azure Translator 2026-06-06", () => {
  it("builds standard NMT inputs/auth/region/deadline/request ID and maps positions", async () => {
    const calls: Parameters<ProviderTransport["request"]>[0][] = [];
    const transport: ProviderTransport = {
      request: async (request) => {
        calls.push(request);
        return {
          statusCode: 200,
          headers: { "x-request-id": "azure-req" },
          bodyText: JSON.stringify({
            value: [{ translations: [{ text: "一" }] }, { translations: [{ text: "二" }] }],
          }),
        };
      },
    };
    const provider = new AzureProvider(
      {
        endpoint: "https://api.cognitive.microsofttranslator.com",
        region: "eastasia",
        apiKey: "azure-secret",
      },
      transport,
    );
    const result = await provider.attempt(makeProviderRequest());
    expect(calls[0]).toMatchObject({ method: "POST", timeoutMs: 15_000 });
    expect(calls[0]?.url).toContain("/translate?api-version=2026-06-06");
    expect(calls[0]?.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "azure-secret",
      "Ocp-Apim-Subscription-Region": "eastasia",
    });
    expect(calls[0]?.body).toMatchObject({
      inputs: [{ text: "one" }, { text: "two" }],
      targets: [{ language: "zh-Hans" }],
      deploymentName: "general",
    });
    expect(result.translations).toEqual([
      { id: "c1", text: "一" },
      { id: "c2", text: "二" },
    ]);
    expect(result.providerRequestId).toBe("azure-req");
  });

  it("rejects positional mismatch and classifies auth/rate-limit errors without leaking bodies", async () => {
    const mismatch = new AzureProvider(
      { endpoint: "https://example.test", apiKey: "secret" },
      {
        request: async () => ({
          statusCode: 200,
          headers: {},
          bodyText: JSON.stringify({ value: [] }),
        }),
      },
    );
    await expect(mismatch.attempt(makeProviderRequest())).rejects.toMatchObject({
      category: "protocol",
      retryable: false,
    });
    const limited = new AzureProvider(
      { endpoint: "https://example.test", apiKey: "secret" },
      {
        request: async () => ({
          statusCode: 429,
          headers: { "retry-after": "2" },
          bodyText: "private response",
        }),
      },
    );
    await expect(limited.attempt(makeProviderRequest())).rejects.toMatchObject({
      category: "http",
      retryable: true,
      retryAfterMs: 2_000,
    });
  });
});
