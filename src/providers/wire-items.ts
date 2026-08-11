import type { TranslationBatchResult } from "./types.js";

export interface WireItems {
  items: Array<{ id: string; text: string; context?: string }>;
  restore(result: TranslationBatchResult): TranslationBatchResult;
}

export function encodeWireItems(
  items: ReadonlyArray<{ id: string; text: string; context?: string }>,
): WireItems {
  const originalIds = new Map<string, string>();
  const wireItems = items.map((item, index) => {
    const wireId = `c${index + 1}`;
    originalIds.set(wireId, item.id);
    return {
      id: wireId,
      text: item.text,
      ...(item.context ? { context: item.context } : {}),
    };
  });
  return {
    items: wireItems,
    restore(result) {
      return {
        ...result,
        translations: result.translations.flatMap((translation) => {
          const originalId = originalIds.get(translation.id);
          return originalId ? [{ id: originalId, text: translation.text }] : [];
        }),
      };
    },
  };
}

export function providerOutputSchema(ids: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["translations"],
    properties: {
      translations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "text"],
          properties: {
            id: { type: "string", enum: [...ids] },
            text: { type: "string" },
          },
        },
      },
    },
  };
}
