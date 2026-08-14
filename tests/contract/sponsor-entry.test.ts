import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const aifadianUrl =
  "https://www.ifdian.net/item/ea1ff37a97ed11f19a9f52540025c377?utm_source=copylink&utm_medium=link";
const kofiUrl = "https://ko-fi.com/ianhsia";
const readmePaths = [
  "README.md",
  "docs/readme/README.zh-CN.md",
  "docs/readme/README.ko.md",
  "docs/readme/README.ja.md",
  "docs/readme/README.ru.md",
  "docs/readme/README.ar.md",
  "docs/readme/README.fr.md",
];

function readRepositoryFile(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

describe("public sponsor entry", () => {
  it("publishes both canonical funding destinations", () => {
    const funding = readRepositoryFile(".github/FUNDING.yml");

    expect(funding).toContain("ko_fi: ianhsia");
    expect(funding).toContain(aifadianUrl);
    expect(funding.match(/https?:\/\//g)).toHaveLength(1);
  });

  it.each(readmePaths)("keeps both destinations and support boundaries in %s", (path) => {
    const readme = readRepositoryFile(path);

    expect(readme).toContain(aifadianUrl);
    expect(readme).toContain(kofiUrl);
    expect(readme).toMatch(/coffee|咖啡|커피|コーヒー|кофе|قهوة|café/i);
    expect(readme).toContain("SubLingo");
    expect(readme).toMatch(/free|免费|무료|無料|бесплат|مجاني|gratuit/i);
    expect(readme).toMatch(/feature|功能|기능|機能|функц|ميزات|fonctionnalité/i);
    expect(readme).toMatch(/API|额度|크레딧|クレジット|кредит|رصيد|crédit/i);
    expect(readme).toMatch(/provider|服务|서비스|サービス|провайдер|المزوّد|fournisseur/i);
  });

  it("keeps the Afdian QR code only in the Simplified Chinese README", () => {
    const assetPath = "docs/readme/assets/aifadian-sponsor.jpeg";
    expect(existsSync(`${root}${assetPath}`)).toBe(true);
    expect(readRepositoryFile("docs/readme/README.zh-CN.md")).toContain(
      "assets/aifadian-sponsor.jpeg",
    );

    for (const path of readmePaths.filter((path) => path !== "docs/readme/README.zh-CN.md")) {
      expect(readRepositoryFile(path)).not.toContain("aifadian-sponsor.jpeg");
    }
  });

  it("does not retain temporary sponsor account material", () => {
    expect(existsSync(`${root}docs/sponsor`)).toBe(false);
  });
});
