import type { TranslationProvider } from "./provider.js";
import type {
  ProviderAttemptError,
  TranslationBatchRequest,
  TranslationBatchResult,
  TranslationProgressHandler,
} from "./types.js";
import type { ProviderTransport, ProviderTransportResponse } from "./transport.js";
import { providerHttpError, protocolError } from "./errors.js";
import { normalizeProviderEndpoint } from "./profiles.js";
import { validateIdOutput } from "./validation.js";
import { encodeWireItems, providerOutputSchema } from "./wire-items.js";

const MAX_ITEMS_PER_CHAT_REQUEST = 2;

export class OllamaProvider implements TranslationProvider {
  private readonly endpoint: string;
  private readonly activeJobs = new Set<string>();
  private readonly activeRequests = new Set<string>();
  private readonly cancelledRequests = new Set<string>();
  constructor(
    private readonly config: {
      endpoint: string;
      model: string;
      proxyMode?: "system" | "direct";
    },
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

  async attempt(
    request: TranslationBatchRequest,
    onProgress?: TranslationProgressHandler,
  ): Promise<TranslationBatchResult> {
    this.cancelledRequests.delete(request.requestId);
    this.activeRequests.add(request.requestId);
    try {
      const wire = encodeWireItems(request.items);
      const combined: TranslationBatchResult = { translations: [] };
      for (let offset = 0; offset < wire.items.length; offset += MAX_ITEMS_PER_CHAT_REQUEST) {
        this.throwIfCancelled(request.requestId);
        const items = wire.items.slice(offset, offset + MAX_ITEMS_PER_CHAT_REQUEST);
        const part = Math.floor(offset / MAX_ITEMS_PER_CHAT_REQUEST) + 1;
        const response = await this.chat(
          `${request.requestId}-part-${part}`,
          items,
          request.sourceLanguage,
          request.targetLanguage,
          60_000,
        );
        this.throwIfCancelled(request.requestId);
        if (response.statusCode < 200 || response.statusCode >= 300)
          throw providerHttpError(response.statusCode, response.headers);
        const parsed = this.parse(
          items.map((item) => item.id),
          response,
        );
        this.throwIfCancelled(request.requestId);
        const progress = wire.restore(parsed);
        if (progress.translations.length > 0) onProgress?.(progress);
        combined.translations.push(...parsed.translations);
        for (const key of ["input", "output", "characters"] as const) {
          const value = parsed.usage?.[key];
          if (value === undefined) continue;
          combined.usage ??= {};
          combined.usage[key] = (combined.usage[key] ?? 0) + value;
        }
      }
      this.throwIfCancelled(request.requestId);
      return wire.restore(combined);
    } finally {
      this.activeRequests.delete(request.requestId);
      this.cancelledRequests.delete(request.requestId);
    }
  }

  async cancel(requestId: string): Promise<void> {
    if (this.activeRequests.has(requestId)) this.cancelledRequests.add(requestId);
    const jobs = [...this.activeJobs].filter(
      (jobId) =>
        jobId === requestId || jobId.startsWith(`${requestId}-part-`) || jobId.startsWith("probe-"),
    );
    await Promise.allSettled(jobs.map((jobId) => this.transport.cancel?.(jobId)));
  }

  private throwIfCancelled(requestId: string): void {
    if (!this.cancelledRequests.has(requestId)) return;
    throw {
      category: "cancelled",
      retryable: false,
      providerCode: "REQUEST_CANCELLED",
      userAction: "RETRY",
    } satisfies ProviderAttemptError;
  }

  private async get(jobId: string, path: string): Promise<ProviderTransportResponse> {
    this.activeJobs.add(jobId);
    try {
      return await this.transport.request({
        jobId,
        method: "GET",
        url: `${this.endpoint}${path}`,
        headers: {},
        proxyMode: this.config.proxyMode ?? "system",
        timeoutMs: 10_000,
        maxResponseBytes: 1_048_576,
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async chat(
    jobId: string,
    items: Array<{ id: string; text: string; context?: string }>,
    sourceLanguage: string,
    targetLanguage: string,
    timeoutMs: number,
  ): Promise<ProviderTransportResponse> {
    this.activeJobs.add(jobId);
    try {
      return await this.transport.request({
        jobId,
        method: "POST",
        url: `${this.endpoint}/api/chat`,
        headers: { "Content-Type": "application/json" },
        proxyMode: this.config.proxyMode ?? "system",
        body: {
          model: this.config.model,
          stream: false,
          think: false,
          format: providerOutputSchema(items.map((item) => item.id)),
          options: { temperature: 0 },
          messages: [
            {
              role: "system",
              content: `Translate every JSON subtitle item from ${sourceLanguage} to ${targetLanguage}. Each input ID must appear exactly once in translations. Return JSON only.`,
            },
            { role: "user", content: JSON.stringify({ items }) },
          ],
        },
        timeoutMs,
        maxResponseBytes: 1_048_576,
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
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
