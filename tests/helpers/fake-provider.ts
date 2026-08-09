import type { TranslationProvider } from "../../src/providers/provider.js";
import type { TranslationBatchRequest, TranslationBatchResult } from "../../src/providers/types.js";

export class RecordingProvider implements TranslationProvider {
  readonly requests: TranslationBatchRequest[] = [];
  private readonly responders: Array<
    (request: TranslationBatchRequest) => Promise<TranslationBatchResult>
  > = [];

  enqueue(responder: (request: TranslationBatchRequest) => Promise<TranslationBatchResult>): void {
    this.responders.push(responder);
  }

  async attempt(request: TranslationBatchRequest): Promise<TranslationBatchResult> {
    this.requests.push(structuredClone(request));
    const responder = this.responders.shift();
    return responder
      ? responder(request)
      : {
          translations: request.items.map((item) => ({
            id: item.id,
            text: `translated:${item.text}`,
          })),
        };
  }
}
