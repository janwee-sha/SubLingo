import type { TranslationProvider } from "./provider.js";
import type { TranslationBatchRequest, TranslationBatchResult } from "./types.js";

export class DeterministicFakeProvider implements TranslationProvider {
  constructor(private readonly prefix = "translated:") {}

  async attempt(request: TranslationBatchRequest): Promise<TranslationBatchResult> {
    return {
      translations: request.items.map((item) => ({
        id: item.id,
        text: `${this.prefix}${item.text}`,
      })),
    };
  }
}
