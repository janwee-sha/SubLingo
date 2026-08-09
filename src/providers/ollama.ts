import type { TranslationProvider } from "./provider.js";
import type { TranslationBatchRequest, TranslationBatchResult } from "./types.js";
import type { ProviderTransport, ProviderTransportResponse } from "./transport.js";
import { providerHttpError, protocolError } from "./errors.js";
import { normalizeProviderEndpoint } from "./profiles.js";
import { validateIdOutput } from "./validation.js";

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["translations"],
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "text"],
        properties: { id: { type: "string" }, text: { type: "string" } },
      },
    },
  },
} as const;

export class OllamaProvider implements TranslationProvider {
  private readonly endpoint: string;
  constructor(
    private readonly config: { endpoint: string; model: string },
    private readonly transport: ProviderTransport,
  ) {
    this.endpoint = normalizeProviderEndpoint("ollama", config.endpoint);
    if (!config.model.trim()) throw new Error("MODEL_REQUIRED");
  }

  async probe(): Promise<{ version: string; model: string }> {
    const versionResponse = await this.get("probe-version", "/api/version");
    if (versionResponse.statusCode !== 200)
      throw providerHttpError(versionResponse.statusCode, versionResponse.headers);
    const version = this.json(versionResponse.bodyText).version;
    const tagsResponse = await this.get("probe-tags", "/api/tags");
    if (tagsResponse.statusCode !== 200)
      throw providerHttpError(tagsResponse.statusCode, tagsResponse.headers);
    const models = this.json(tagsResponse.bodyText).models;
    if (
      !Array.isArray(models) ||
      !models.some(
        (model) =>
          model &&
          typeof model === "object" &&
          (model as Record<string, unknown>).name === this.config.model,
      )
    ) {
      throw protocolError("OLLAMA_MODEL_MISSING", "model");
    }
    const response = await this.chat(
      "probe-schema",
      [{ id: "probe", text: "hello" }],
      "en",
      "es",
      15_000,
    );
    if (response.statusCode !== 200) throw providerHttpError(response.statusCode, response.headers);
    this.parse(["probe"], response);
    return { version: typeof version === "string" ? version : "unknown", model: this.config.model };
  }

  async attempt(request: TranslationBatchRequest): Promise<TranslationBatchResult> {
    const response = await this.chat(
      request.requestId,
      request.items,
      request.sourceLanguage,
      request.targetLanguage,
      60_000,
    );
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw providerHttpError(response.statusCode, response.headers);
    return this.parse(
      request.items.map((item) => item.id),
      response,
    );
  }

  private get(jobId: string, path: string): Promise<ProviderTransportResponse> {
    return this.transport.request({
      jobId,
      method: "GET",
      url: `${this.endpoint}${path}`,
      headers: {},
      timeoutMs: 10_000,
      maxResponseBytes: 1_048_576,
    });
  }

  private chat(
    jobId: string,
    items: Array<{ id: string; text: string; context?: string }>,
    sourceLanguage: string,
    targetLanguage: string,
    timeoutMs: number,
  ): Promise<ProviderTransportResponse> {
    return this.transport.request({
      jobId,
      method: "POST",
      url: `${this.endpoint}/api/chat`,
      headers: { "Content-Type": "application/json" },
      body: {
        model: this.config.model,
        stream: false,
        think: false,
        format: OUTPUT_SCHEMA,
        options: { temperature: 0 },
        messages: [
          {
            role: "system",
            content: `Translate JSON subtitle items from ${sourceLanguage} to ${targetLanguage}. Return only matching IDs.`,
          },
          { role: "user", content: JSON.stringify({ items }) },
        ],
      },
      timeoutMs,
      maxResponseBytes: 1_048_576,
    });
  }

  private json(text: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      return parsed as Record<string, unknown>;
    } catch {
      throw protocolError("OLLAMA_MALFORMED_JSON");
    }
  }

  private parse(
    requestedIds: string[],
    response: ProviderTransportResponse,
  ): TranslationBatchResult {
    const parsed = this.json(response.bodyText);
    const message = parsed.message as Record<string, unknown> | undefined;
    if (typeof message?.content !== "string") throw protocolError("OLLAMA_MALFORMED_OUTPUT");
    const validated = validateIdOutput(requestedIds, message.content);
    return {
      translations: validated.translations,
      usage: {
        ...(typeof parsed.prompt_eval_count === "number"
          ? { input: parsed.prompt_eval_count }
          : {}),
        ...(typeof parsed.eval_count === "number" ? { output: parsed.eval_count } : {}),
      },
    };
  }
}
