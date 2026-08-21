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
    expect(html).toContain('<script src="./sidebar-state.ts"></script>');
    expect(html).not.toContain('type="module"');
    expect(html.indexOf("./provider-status.ts")).toBeLessThan(html.indexOf("./sidebar.ts"));
    expect(html.indexOf("./sidebar-state.ts")).toBeLessThan(html.indexOf("./sidebar.ts"));
  });

  it("offers both supported providers and always exposes a required model ID", () => {
    expect(html).toContain('<option value="openai">');
    expect(html).toContain('<option value="ollama">');
    expect(html).toMatch(/id="provider-model"[\s\S]*?required/);
  });

  it("uses an accessible icon-only model refresh control", () => {
    const button = html.match(/<button[\s\S]*?id="refresh-models"[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(button).toContain('aria-label="Refresh model list"');
    expect(button).toContain('class="refresh-icon"');
    expect(button).not.toMatch(/>\s*Refresh\s*</);
  });

  it("uses one accessible vertical write-only API key field for both services", () => {
    expect(html).toMatch(
      /id="credential-row"[\s\S]*?<span>API key<\/span>[\s\S]*?id="provider-key"[\s\S]*?aria-describedby="credential-hint"[\s\S]*?<small\s+id="credential-hint"[^>]*>/,
    );
    expect(html).not.toContain('id="credential-row" class="field" hidden');
    expect(sidebarSource).toContain(
      'document.querySelector<HTMLElement>("#credential-row")!.hidden = false',
    );
  });

  it("uses the visible Service type as the savable default without a generic fallback", () => {
    expect(html).toContain('<option value="openai">OpenAI</option>');
    expect(html).toContain('id="profile-name" type="text" value="OpenAI"');
    expect(html).not.toContain("OpenAI-compatible");
    expect(sidebarSource).toContain("selectedServiceTypeLabel");
    expect(sidebarSource).toContain("inputProfileName");
    expect(sidebarSource).toContain("changeServiceTypeLabel");
    expect(sidebarSource).not.toContain('profileName.value.trim() || "Provider"');
  });

  it("offers profile editing and request-correlated feedback", () => {
    expect(html).not.toContain('id="operation-status"');
    expect(html).toContain('id="new-profile"');
    expect(html).toContain('id="request-url"');
    expect(html).toContain('id="provider-proxy-mode"');
    expect(html).toContain('<option value="direct">');
  });

  it("places an independent accessible status directly after each non-row operation control", () => {
    for (const [control, status] of [
      ['id="enabled"', 'id="translation-status"'],
      ['id="save-languages"', 'id="language-status"'],
      ['class="form-actions"', 'id="profile-editor-status"'],
      ['id="retry-subtitle"', 'id="subtitle-retry-status"'],
    ]) {
      expect(html.indexOf(control)).toBeGreaterThan(-1);
      expect(html.indexOf(status)).toBeGreaterThan(html.indexOf(control));
    }
    for (const status of [
      "translation-status",
      "language-status",
      "profile-editor-status",
      "subtitle-retry-status",
    ])
      expect(html).toMatch(new RegExp(`id="${status}"[^>]*role="status"[^>]*aria-live="polite"`));
    expect(html).not.toMatch(/id="profiles"[^>]*aria-live/);
    expect(sidebarSource).toContain('className = "operation-status profile-operation-status"');
    expect(html).toMatch(
      /id="profile-editor-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*>\s*<\/p>/,
    );
    expect(sidebarSource).not.toContain('profileEditorStatus.textContent = "Ready');
    expect(sidebarSource).not.toContain("profileEditorStatus.textContent = `Editing");
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
