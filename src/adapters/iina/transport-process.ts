import type { TransportSession } from "../../transport/client.js";

export interface ReadyFrame {
  type: "ready";
  port: number;
  token: string;
  protocolVersion: 1;
}

export function parseReadyFrame(output: string): ReadyFrame {
  if (output.split("\n").filter(Boolean).length !== 1) throw new Error("Unexpected helper output");
  let value: unknown;
  try {
    value = JSON.parse(output.trim());
  } catch {
    throw new Error("Malformed helper frame");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed helper frame");
  const frame = value as Record<string, unknown>;
  if (
    Object.keys(frame).sort().join(",") !== "port,protocolVersion,token,type" ||
    frame.type !== "ready" ||
    frame.protocolVersion !== 1 ||
    !Number.isInteger(frame.port) ||
    (frame.port as number) < 1024 ||
    (frame.port as number) > 65535 ||
    typeof frame.token !== "string" ||
    !/^[A-Za-z0-9_-]{8,512}$/.test(frame.token)
  ) {
    throw new Error("Invalid helper ready frame");
  }
  return frame as unknown as ReadyFrame;
}

export interface ProcessLauncher {
  launch(
    executable: string,
    args: string[],
    onStdout: (data: string) => void,
  ): Promise<{ status: number }>;
}

export class TransportProcess {
  static async bootstrap(
    launcher: ProcessLauncher,
    executable = "@plugin/dist/native/sublingo-transport",
    parentPid?: number,
  ): Promise<TransportSession> {
    let stdout = "";
    const completion = launcher.launch(
      executable,
      parentPid === undefined ? [] : ["--parent-pid", String(parentPid)],
      (data) => {
        stdout += data;
      },
    );
    for (let tries = 0; tries < 100 && !stdout.includes("\n"); tries += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    if (!stdout.includes("\n")) {
      void completion;
      throw new Error("Helper startup timed out");
    }
    const frame = parseReadyFrame(stdout.slice(0, stdout.indexOf("\n") + 1));
    return { port: frame.port, token: frame.token };
  }
}

export interface HelperExecutableLocator {
  exists(path: string): boolean;
}

export function discoverHelperExecutable(locator: HelperExecutableLocator): string {
  const candidates = ["dist/native/sublingo-transport", "@plugin/dist/native/sublingo-transport"];
  for (const candidate of candidates) {
    try {
      if (locator.exists(candidate)) return candidate;
    } catch {
      /* Continue through IINA 1.4 path variants. */
    }
  }
  throw new Error("PACKAGED_HELPER_NOT_FOUND");
}
