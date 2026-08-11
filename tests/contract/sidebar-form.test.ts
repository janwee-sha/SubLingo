import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("IINA sidebar bundle contract", () => {
  const html = readFileSync(new URL("../../ui/sidebar.html", import.meta.url), "utf8");
  const sidebarSource = readFileSync(new URL("../../ui/sidebar.ts", import.meta.url), "utf8");
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { targets?: { sidebar?: { publicUrl?: string } } };

  it("uses relative classic-script assets that IINA can load", () => {
    expect(packageJson.targets?.sidebar?.publicUrl).toBe("./");
    expect(html).toContain('<script src="./provider-status.ts"></script>');
    expect(html).toContain('<script src="./sidebar.ts"></script>');
    expect(html).not.toContain('type="module"');
    expect(html.indexOf("./provider-status.ts")).toBeLessThan(html.indexOf("./sidebar.ts"));
  });

  it("offers only active providers and always exposes a required model ID", () => {
    expect(html).toContain('<option value="openai">');
    expect(html).toContain('<option value="ollama">');
    expect(html).not.toContain('<option value="azure">');
    expect(html).toMatch(/id="provider-model"[\s\S]*?required/);
  });

  it("offers profile editing feedback without a Reset Vault control", () => {
    expect(html).toContain('id="operation-status"');
    expect(html).toContain('id="new-profile"');
    expect(html).toContain('id="request-url"');
    expect(html).toContain('id="provider-proxy-mode"');
    expect(html).toContain('<option value="direct">');
    expect(html).not.toContain('id="reset-vault"');
    expect(html).not.toContain("Reset vault");
  });

  it("keeps selection consent separate from credential and connection verification", () => {
    expect(sidebarSource).toContain("Profile selected for translation.");
    expect(sidebarSource).not.toContain("Profile selected. Translation is authorized.");
    expect(sidebarSource).toContain("window.sublingoCredentialStatusMessage");
    expect(html).toContain("private local file (mode 0600)");
    expect(html).toContain("not macOS Keychain");
    expect(html).not.toMatch(/encrypted locally/i);
    expect(sidebarSource).toContain('type ProfileTestState = "not tested" | "passed" | "failed"');
    expect(sidebarSource).toContain('" · no key saved"');
  });
});
