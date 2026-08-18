export interface FakeTrack {
  id: number;
  isExternal: boolean;
  title?: string;
  lang?: string;
}

export class FakeIinaFileSystem {
  readonly files = new Map<string, Uint8Array>();

  read(path: string): Uint8Array | null {
    const bytes = this.files.get(path);
    return bytes ? bytes.slice() : null;
  }

  write(path: string, bytes: Uint8Array): void {
    this.files.set(path, bytes.slice());
  }

  remove(path: string): void {
    this.files.delete(path);
  }
}

export class FakeIinaPlayer {
  position: number | null = null;
  paused = false;
  primaryId: number | null = null;
  secondId: number | null = null;
  tracks: FakeTrack[] = [];
  readonly mpvCommands: string[][] = [];
  readonly mpvProperties = new Map<string, unknown>();
  readonly files = new FakeIinaFileSystem();
  private readonly commandFailures: unknown[] = [];
  private readonly listeners = new Map<string, Map<string, (...args: unknown[]) => void>>();
  private nextListenerId = 1;

  command(name: string, args: readonly string[] = []): void {
    this.mpvCommands.push([name, ...args]);
    if (this.commandFailures.length > 0) throw this.commandFailures.shift();
  }

  failNextCommand(error: unknown = new Error("FAKE_MPV_COMMAND_FAILED")): void {
    this.commandFailures.push(error);
  }

  getFlag(name: string): boolean {
    return Boolean(this.mpvProperties.get(name));
  }

  getNumber(name: string): number {
    const value = this.mpvProperties.get(name);
    return typeof value === "number" ? value : Number(value);
  }

  getString(name: string): string {
    const value = this.mpvProperties.get(name);
    return value === undefined || value === null ? "" : String(value);
  }

  getNative<T>(name: string): T {
    return this.mpvProperties.get(name) as T;
  }

  set(name: string, value: unknown): void {
    this.mpvProperties.set(name, value);
  }

  on(event: string, callback: (...args: unknown[]) => void): string {
    const id = `fake-listener-${this.nextListenerId++}`;
    const eventListeners = this.listeners.get(event) ?? new Map();
    eventListeners.set(id, callback);
    this.listeners.set(event, eventListeners);
    return id;
  }

  off(event: string, id: string): void {
    const eventListeners = this.listeners.get(event);
    eventListeners?.delete(id);
    if (eventListeners?.size === 0) this.listeners.delete(event);
  }

  trigger(event: string, ...args: unknown[]): void {
    for (const callback of this.listeners.get(event)?.values() ?? []) callback(...args);
  }
}
