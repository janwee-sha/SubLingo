import type { VaultKeychainPort } from "../../vault/store.js";

export class IinaVaultKeychain implements VaultKeychainPort {
  constructor(
    private readonly utils: IINA.API.Utils,
    private readonly service = "credential-vault",
    private readonly name = "wrapping-key",
  ) {}

  read(): string | null {
    try {
      const value = this.utils.keyChainRead(this.service, this.name);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }

  write(value: string): boolean {
    try {
      return this.utils.keyChainWrite(this.service, this.name, value);
    } catch {
      return false;
    }
  }
}
