import type { LocalHttpBridge, TransportClient } from "../../transport/client.js";
import type {
  ProviderTransport,
  ProviderTransportRequest,
  ProviderTransportResponse,
} from "../../providers/transport.js";
import type { ProcessLauncher } from "./transport-process.js";

export class IinaLocalHttpBridge implements LocalHttpBridge {
  constructor(private readonly http: IINA.API.HTTP) {}

  async post<T>(url: string, bearerToken: string, body: unknown): Promise<T> {
    const response = await this.http.post(url, {
      params: {},
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearerToken}` },
      data: body as Record<string, unknown>,
    });
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw new Error("HELPER_RPC_FAILED");
    if (response.data && typeof response.data === "object") return response.data as T;
    try {
      return JSON.parse(response.text) as T;
    } catch {
      throw new Error("HELPER_RPC_MALFORMED");
    }
  }
}

export class IinaProcessLauncher implements ProcessLauncher {
  constructor(private readonly utils: IINA.API.Utils) {}

  launch(
    executable: string,
    args: string[],
    onStdout: (data: string) => void,
  ): Promise<{ status: number }> {
    return this.utils.exec(executable, args, null, onStdout, () => undefined);
  }
}

export class HelperProviderTransport implements ProviderTransport {
  constructor(private readonly client: TransportClient) {}

  async request(request: ProviderTransportRequest): Promise<ProviderTransportResponse> {
    const response = await this.client.request(request);
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      bodyText: response.bodyText,
    };
  }

  async cancel(jobId: string): Promise<void> {
    await this.client.cancel(jobId);
  }
}
