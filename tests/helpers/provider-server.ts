import { createServer, type Server } from "node:http";

export interface SimulatedResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
}

export class ProviderSimulator {
  readonly calls: Array<{
    path: string;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }> = [];
  private readonly responses: SimulatedResponse[] = [];
  private server: Server | null = null;
  url = "";

  enqueue(response: SimulatedResponse): void {
    this.responses.push(response);
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        this.calls.push({
          path: request.url ?? "/",
          headers: request.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        const next = this.responses.shift() ?? { status: 200, body: {} };
        setTimeout(() => {
          response.writeHead(next.status, { "Content-Type": "application/json", ...next.headers });
          response.end(typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {}));
        }, next.delayMs ?? 0);
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("SIMULATOR_START_FAILED");
    this.url = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    if (!this.server) return;
    if (!this.server.listening) {
      this.server = null;
      return;
    }
    await new Promise<void>((resolve, reject) =>
      this.server!.close((error) => (error ? reject(error) : resolve())),
    );
    this.server = null;
  }
}
