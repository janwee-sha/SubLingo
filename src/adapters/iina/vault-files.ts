import type { VaultFilePort } from "../../vault/store.js";

export class IinaVaultFiles implements VaultFilePort {
  constructor(private readonly file: IINA.API.File) {}
  read(path: string): string | null {
    try {
      return this.file.read(path) ?? null;
    } catch {
      return null;
    }
  }
  write(path: string, value: string): void {
    this.file.write(path, value);
  }
  delete(path: string): void {
    try {
      if (this.file.exists(path)) this.file.delete(path);
    } catch {
      /* A missing/corrupt slot is equivalent to absent during recovery. */
    }
  }
}
