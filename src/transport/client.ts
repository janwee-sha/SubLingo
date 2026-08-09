import { base64Decode } from "../domain/codec.js";
import { SubLingoError } from "../domain/errors.js";

export interface LocalHttpBridge {
  post<T>(url: string, bearerToken: string, body: unknown): Promise<T>;
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
    } catch {
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
