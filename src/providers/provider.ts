import type { TranslationBatchRequest, TranslationBatchResult } from "./types.js";

export interface TranslationProvider {
  /** Executes exactly one provider attempt. Retry policy belongs to the player session. */
  attempt(request: TranslationBatchRequest): Promise<TranslationBatchResult>;
  cancel?(requestId: string): Promise<void> | void;
}
