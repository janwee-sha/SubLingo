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
  readonly files = new FakeIinaFileSystem();

  command(...args: string[]): void {
    this.mpvCommands.push(args);
  }
}
