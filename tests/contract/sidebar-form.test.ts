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

  it("offers both supported providers and always exposes a required model ID", () => {
    expect(html).toContain('<option value="openai">');
    expect(html).toContain('<option value="ollama">');
    expect(html).toMatch(/id="provider-model"[\s\S]*?required/);
  });

  it("offers profile editing and request-correlated feedback", () => {
    expect(html).toContain('id="operation-status"');
    expect(html).toContain('id="new-profile"');
    expect(html).toContain('id="request-url"');
    expect(html).toContain('id="provider-proxy-mode"');
    expect(html).toContain('<option value="direct">');
  });

  it("keeps selection consent separate from credential and connection verification", () => {
    expect(sidebarSource).toContain("Profile selected for translation.");
    expect(sidebarSource).not.toContain("Profile selected. Translation is authorized.");
    expect(sidebarSource).toContain("window.sublingoCredentialStatusMessage");
    expect(html).toContain("private local file (mode 0600)");
    expect(sidebarSource).toContain('type ProfileTestState = "not tested" | "passed" | "failed"');
    expect(sidebarSource).toContain('" · no key saved"');
  });

  it("exposes one catalog-driven Target Language control without source language input", () => {
    expect(html.match(/Target Language/g)).toHaveLength(1);
    expect(html).toContain('id="target-language"');
    expect(html).toContain('id="save-languages"');
    expect(html).toContain("Save Languages");
    expect(html).not.toMatch(/Mother language|Subtitle language|source-language/);
    expect(sidebarSource).toContain("view.targetLanguages");
    expect(sidebarSource).toContain("language.displayName");
  });

  it("keeps committed, dirty and single-pending language form state request-correlated", () => {
    expect(sidebarSource).toContain("committedTargetLanguage");
    expect(sidebarSource).toContain("targetLanguageDirty");
    expect(sidebarSource).toContain("pendingLanguageSaveRequestId");
    expect(sidebarSource).toContain("!targetLanguageDirty && !pendingLanguageSaveRequestId");
    expect(sidebarSource).toContain("result.requestId === pendingLanguageSaveRequestId");
    expect(sidebarSource).not.toContain("sourceLanguageMode");
  });
});
