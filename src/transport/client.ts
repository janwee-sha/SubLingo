import { base64Decode } from "../domain/codec.js";
import { SubLingoError } from "../domain/errors.js";

export interface LocalHttpBridge {
  post<T>(url: string, bearerToken: string, body: unknown): Promise<T>;
}

export const TRANSPORT_RPC_ERROR_CODES = [
  "upstream-timeout",
  "upstream-network",
  "forbidden-destination",
  "duplicate-job",
  "invalid-request",
  "response-too-large",
  "request-cancelled",
  "request-failed",
  "unauthorized",
  "request-too-large",
  "not-found",
  "invalid-random-request",
  "invalid-cancel-request",
  "helper-rpc-failed",
] as const;

export type TransportRpcErrorCode = (typeof TRANSPORT_RPC_ERROR_CODES)[number];

export function isTransportRpcErrorCode(value: unknown): value is TransportRpcErrorCode {
  return (
    typeof value === "string" && TRANSPORT_RPC_ERROR_CODES.includes(value as TransportRpcErrorCode)
  );
}

export class TransportRpcError extends Error {
  constructor(readonly code: TransportRpcErrorCode) {
    super(code);
    this.name = "TransportRpcError";
  }
}

function rpcError(error: TransportRpcError): SubLingoError {
  switch (error.code) {
    case "upstream-timeout":
      return new SubLingoError("PROVIDER_TIMEOUT", "timeout", "CHECK_NETWORK", true, 504);
    case "upstream-network":
      return new SubLingoError("PROVIDER_NETWORK", "network", "CHECK_NETWORK", true, 502);
    case "forbidden-destination":
      return new SubLingoError("FORBIDDEN_DESTINATION", "configuration", "CHECK_ENDPOINT");
    case "request-cancelled":
      return new SubLingoError("REQUEST_CANCELLED", "cancelled", "NONE");
    case "response-too-large":
      return new SubLingoError("HELPER_RESPONSE_TOO_LARGE", "protocol", "CHECK_ENDPOINT");
    default:
      return new SubLingoError("HELPER_PROTOCOL", "protocol", "RESTART_IINA");
  }
}

export interface TransportRequest {
  jobId: string;
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface TransportResponse {
  jobId: string;
  transportState: "completed" | "cancelled" | "timedOut";
  statusCode: number;
  headers: Record<string, string>;
  bodyText: string;
}

export interface TransportSession {
  port: number;
  token: string;
}

export class TransportClient {
  constructor(
    private readonly session: TransportSession,
    private readonly bridge: LocalHttpBridge,
  ) {
    if (!Number.isInteger(session.port) || session.port < 1024 || session.port > 65535) {
      throw new Error("Invalid helper port");
    }
    if (!/^[A-Za-z0-9_-]{8,512}$/.test(session.token)) throw new Error("Invalid helper token");
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      return await this.bridge.post<T>(
        `http://127.0.0.1:${this.session.port}${path}`,
        this.session.token,
        body,
      );
    } catch (error) {
      if (error instanceof SubLingoError) throw error;
      if (error instanceof TransportRpcError) throw rpcError(error);
      throw new SubLingoError("HELPER_UNAVAILABLE", "network", "RESTART_IINA", true);
    }
  }

  async random(bytes: 12 | 32, purpose: "vault-nonce" | "vault-dek"): Promise<Uint8Array> {
    const response = await this.post<{ bytesB64: string }>("/v1/random", { bytes, purpose });
    const decoded = base64Decode(response.bytesB64);
    if (decoded.length !== bytes)
      throw new SubLingoError("HELPER_PROTOCOL", "protocol", "RESTART_IINA");
    return decoded;
  }

  request(request: TransportRequest): Promise<TransportResponse> {
    return this.post("/v1/request", request);
  }

  async cancel(jobId: string): Promise<"cancelled" | "already-completed" | "unknown"> {
    const response = await this.post<{ state: "cancelled" | "already-completed" | "unknown" }>(
      "/v1/cancel",
      { jobId },
    );
    return response.state;
  }

  async shutdown(): Promise<void> {
    await this.post("/v1/shutdown", {});
  }
}
