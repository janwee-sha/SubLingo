import type { TranslationProvider } from "./provider.js";
import type { TranslationBatchRequest, TranslationBatchResult } from "./types.js";
import type { ProviderTransport } from "./transport.js";
import { providerHttpError, protocolError } from "./errors.js";
import { validateAzureOutput } from "./validation.js";
import { normalizeProviderEndpoint } from "./profiles.js";

export class AzureProvider implements TranslationProvider {
  private readonly endpoint: string;
  constructor(
    private readonly config: { endpoint: string; apiKey: string; region?: string },
    private readonly transport: ProviderTransport,
  ) {
    this.endpoint = normalizeProviderEndpoint("azure", config.endpoint);
    if (!config.apiKey) throw new Error("AZURE_KEY_REQUIRED");
  }

  async attempt(request: TranslationBatchRequest): Promise<TranslationBatchResult> {
    const response = await this.transport.request({
      jobId: request.requestId,
      method: "POST",
      url: `${this.endpoint}/translate?api-version=2026-06-06`,
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": this.config.apiKey,
        ...(this.config.region ? { "Ocp-Apim-Subscription-Region": this.config.region } : {}),
        "X-ClientTraceId": request.requestId,
      },
      body: {
        inputs: request.items.map((item) => ({ text: item.text })),
        targets: [{ language: request.targetLanguage }],
        sourceLanguage: request.sourceLanguage,
        deploymentName: "general",
      },
      timeoutMs: 15_000,
      maxResponseBytes: 1_048_576,
    });
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw providerHttpError(response.statusCode, response.headers);
    try {
      const translations = validateAzureOutput(
        request.items.map((item) => item.id),
        response.bodyText,
      );
      return {
        translations,
        ...(response.headers["x-request-id"]
          ? { providerRequestId: response.headers["x-request-id"] }
          : {}),
        usage: { characters: request.items.reduce((sum, item) => sum + [...item.text].length, 0) },
      };
    } catch {
      throw protocolError("AZURE_POSITIONAL_MISMATCH");
    }
  }
}
