import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("IINA sidebar bundle contract", () => {
  const html = readFileSync(new URL("../../ui/sidebar.html", import.meta.url), "utf8");
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
});
