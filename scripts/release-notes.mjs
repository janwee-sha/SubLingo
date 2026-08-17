import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";

const stableSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const noUserChangeBody = "本版本没有面向用户的行为变化。";
const allowedSectionNames = ["新功能", "功能改进", "问题修复", "升级与兼容提醒"];
const forbiddenEvidenceTerms = [
  "触发提交",
  "包内版本",
  "精确大小",
  "自动化门禁",
  "最终归档清单",
  "签名摘要",
  "构建文件",
  "IINA 图形界面验收边界",
  "真实安装：CI 未覆盖",
  "真实卸载：CI 未覆盖",
  "实际播放：CI 未覆盖",
];

function assertStableVersion(version) {
  if (!stableSemverPattern.test(version)) {
    throw new Error(`Release notes version is not stable SemVer: ${version}`);
  }
}

function containsInvalidTextCharacters(text) {
  return Array.from(text).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint === 0 ||
      codePoint === 0x7f ||
      (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d)
    );
  });
}

export function releaseNotesRelativePath(version) {
  assertStableVersion(version);
  return `docs/releases/v${version}.md`;
}

export function normalizeReleaseBody(body) {
  return (body ?? "").replaceAll("\r\n", "\n").trimEnd();
}

export function parseReleaseNotes(rawContent, version) {
  assertStableVersion(version);
  const normalizedBody = normalizeReleaseBody(rawContent);
  const lines = normalizedBody.split("\n");
  const expectedTitle = `# SubLingo v${version}`;
  if (lines[0] !== expectedTitle) {
    throw new Error(`Release notes title must be exactly: ${expectedTitle}`);
  }

  const bodyLines = lines.slice(1);
  while (bodyLines[0] === "") {
    bodyLines.shift();
  }
  while (bodyLines.at(-1) === "") {
    bodyLines.pop();
  }
  if (bodyLines.length === 1 && bodyLines[0] === noUserChangeBody) {
    return {
      version,
      tag: `v${version}`,
      title: expectedTitle,
      mode: "no-user-change",
      sections: [],
      normalizedBody,
    };
  }

  const sections = [];
  let currentSection;
  let previousSectionIndex = -1;
  for (const line of bodyLines) {
    if (line === "") {
      continue;
    }
    if (line.startsWith("## ")) {
      const name = line.slice(3);
      const sectionIndex = allowedSectionNames.indexOf(name);
      if (sectionIndex < 0) {
        throw new Error(`Unknown release notes section: ${name}`);
      }
      if (sectionIndex <= previousSectionIndex) {
        throw new Error(`Release notes section is duplicated or out of order: ${name}`);
      }
      previousSectionIndex = sectionIndex;
      currentSection = { name, items: [] };
      sections.push(currentSection);
      continue;
    }
    if (line.startsWith("- ") && currentSection) {
      const item = line.slice(2);
      if (!item) {
        throw new Error("Release notes items must not be empty");
      }
      if (!/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(item)) {
        throw new Error("Each release notes entry must contain Chinese text");
      }
      if (forbiddenEvidenceTerms.some((term) => item.includes(term)) || /sha-?256/i.test(item)) {
        throw new Error("Release notes entries must not contain technical release evidence");
      }
      currentSection.items.push(item);
      continue;
    }
    throw new Error("Release notes body does not match the allowed structure or mode");
  }
  if (sections.length === 0 || sections.some((section) => section.items.length === 0)) {
    throw new Error("Release notes change mode requires non-empty sections");
  }

  return {
    version,
    tag: `v${version}`,
    title: expectedTitle,
    mode: "changes",
    sections,
    normalizedBody,
  };
}

export function readReleaseNotesFile(filePath, version) {
  const absolutePath = resolve(filePath);
  let fileStatus;
  try {
    fileStatus = lstatSync(absolutePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Release notes file is missing: ${filePath}`);
    }
    throw error;
  }
  if (!fileStatus.isFile()) {
    throw new Error(`Release notes path must be a regular file: ${filePath}`);
  }
  const rawBytes = readFileSync(absolutePath);
  if (rawBytes.length === 0) {
    throw new Error(`Release notes file is empty: ${filePath}`);
  }
  if (rawBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    throw new Error("Release notes must not contain a UTF-8 BOM");
  }
  let rawContent;
  try {
    rawContent = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  } catch {
    throw new Error("Release notes must contain valid UTF-8 text");
  }
  if (containsInvalidTextCharacters(rawContent)) {
    throw new Error("Release notes contain invalid text characters");
  }
  const parsed = parseReleaseNotes(rawContent, version);
  return {
    ...parsed,
    rawContent,
    rawSha256: createHash("sha256").update(rawBytes).digest("hex"),
  };
}

export function readReleaseNotes(rootDirectory, version) {
  const sourcePath = releaseNotesRelativePath(version);
  return {
    ...readReleaseNotesFile(resolve(rootDirectory, sourcePath), version),
    sourcePath,
  };
}
