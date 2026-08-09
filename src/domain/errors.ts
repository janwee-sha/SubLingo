import { diagnostic, type SafeDiagnostic } from "./logging.js";
import type { ProviderAttemptError, ProviderErrorCategory } from "../providers/types.js";

export class SubLingoError extends Error {
  constructor(
    readonly code: string,
    readonly category: ProviderErrorCategory,
    readonly userAction: string,
    readonly retryable = false,
    readonly statusCode?: number,
  ) {
    super(code);
    this.name = "SubLingoError";
  }

  toDiagnostic(): SafeDiagnostic {
    return diagnostic({
      code: this.code,
      category: this.category,
      userAction: this.userAction,
      statusCode: this.statusCode,
    });
  }
}

export function normalizeProviderError(value: unknown): ProviderAttemptError {
  if (value instanceof SubLingoError) {
    return {
      category: value.category,
      retryable: value.retryable,
      ...(value.statusCode === undefined ? {} : { statusCode: value.statusCode }),
      providerCode: value.code,
      userAction: value.userAction,
    };
  }
  return {
    category: "protocol",
    retryable: false,
    providerCode: "UNKNOWN_PROVIDER_ERROR",
    userAction: "CHECK_ENDPOINT",
  };
}
