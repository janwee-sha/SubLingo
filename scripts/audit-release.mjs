import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const gateLabels = [
  ["test", "npm run test"],
  ["typecheck", "npm run typecheck"],
  ["lint", "npm run lint"],
  ["buildNative", "npm run build:native"],
  ["testNative", "npm run test:native"],
  ["build", "npm run build"],
  ["verifyPackage", "npm run verify:package"],
  ["pack", "npm run pack"],
];

const forbiddenSegments = new Set([
  ".git",
  ".parcel-cache",
  "@data",
  "@tmp",
  "__macosx",
  "build",
  "coverage",
  "node_modules",
  "specs",
  "src",
  "tests",
]);

function isUnsafePath(name) {
  if (
    name.length === 0 ||
    /[^\x20-\x7e]/.test(name) ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name)
  ) {
    return true;
  }
  const segments = name.split("/");
  return segments.some(
    (segment, index) =>
      segment === "." || segment === ".." || (segment === "" && index !== segments.length - 1),
  );
}

function isForbiddenEntry(name) {
  const lowerName = name.toLowerCase();
  const segments = lowerName.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? "";
  if (segments.some((segment) => forbiddenSegments.has(segment))) {
    return true;
  }
  if (
    segments.some((segment, index) => segment === "native" && segments[index + 1] === "transport")
  ) {
    return true;
  }
  return (
    fileName === "credentials.json" ||
    fileName === ".env" ||
    fileName.startsWith(".env.") ||
    fileName.endsWith(".log") ||
    fileName.endsWith(".map") ||
    fileName.endsWith(".mobileprovision") ||
    fileName.endsWith(".p12") ||
    fileName.endsWith(".pem") ||
    fileName.endsWith(".pfx") ||
    fileName.endsWith(".key")
  );
}

export function validateArchiveEntries(entries, expectedCompliance = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("The release archive is empty");
  }

  const names = new Set();
  for (const entry of entries) {
    if (isUnsafePath(entry.name)) {
      throw new Error(`Unsafe archive path: ${entry.name}`);
    }
    const collisionKey = entry.name.normalize("NFC").toLowerCase();
    if (names.has(collisionKey)) {
      throw new Error(`Duplicate archive entry: ${entry.name}`);
    }
    names.add(collisionKey);
    if (entry.encrypted) {
      throw new Error(`Encrypted archive entry: ${entry.name}`);
    }
    if ((entry.unixMode & 0o170000) === 0o120000) {
      throw new Error(`Archive symbolic link is forbidden: ${entry.name}`);
    }
    if (
      Object.hasOwn(expectedCompliance, entry.name) &&
      entry.content !== expectedCompliance[entry.name]
    ) {
      throw new Error(`Packaged compliance file differs from repository source: ${entry.name}`);
    }

    const allowedRoot =
      entry.name === "Info.json" ||
      entry.name === "README.md" ||
      entry.name === "LICENSE" ||
      entry.name === "THIRD_PARTY_NOTICES.txt" ||
      entry.name === "dist/" ||
      (entry.name.startsWith("dist/") && entry.name.length > "dist/".length);
    if (!allowedRoot) {
      throw new Error(`Unexpected archive root entry: ${entry.name}`);
    }
    if (isForbiddenEntry(entry.name)) {
      throw new Error(`Forbidden archive entry: ${entry.name}`);
    }
  }

  const required = [
    "Info.json",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.txt",
    "dist/main.js",
    "dist/global.js",
    "dist/ui/sidebar.html",
    "dist/native/sublingo-transport",
  ];
  for (const name of required) {
    if (!entries.some((entry) => entry.name === name)) {
      throw new Error(`Required archive entry is missing: ${name}`);
    }
  }

  const helper = entries.find((entry) => entry.name === "dist/native/sublingo-transport");
  if (!helper || (helper.unixMode & 0o111) === 0) {
    throw new Error("The archived native helper is not executable");
  }
  return entries;
}

export function validateArtifactIdentity(input) {
  const expectedName = `SubLingo-${input.expectedVersion}.iinaplgz`;
  if (input.artifactName !== expectedName) {
    throw new Error(
      `Release artifact name mismatch: expected ${expectedName}, received ${input.artifactName}`,
    );
  }
  if (input.packageVersion !== input.expectedVersion) {
    throw new Error(
      `Release package version mismatch: expected ${input.expectedVersion}, received ${input.packageVersion}`,
    );
  }
}

export function validateHelperFacts(label, facts) {
  for (const architecture of ["arm64", "x86_64"]) {
    if (!facts.architectures.includes(architecture)) {
      throw new Error(`${label} is missing ${architecture}`);
    }
  }
  if (!facts.executable) {
    throw new Error(`${label} is not executable`);
  }
  if (!facts.signed) {
    throw new Error(`${label} does not have a valid signature`);
  }
  return facts;
}

function formatHelper(label, helper) {
  return [
    `### ${label}`,
    "",
    `- 架构：${helper.architectures.join("、")}`,
    `- 可执行权限：${helper.executable ? "是" : "否"}`,
    `- 签名验证：${helper.signed ? "有效" : "无效"}`,
    `- 签名摘要：${helper.signature}`,
  ].join("\n");
}

export function buildReleaseNotes(input) {
  const gateLines = gateLabels.map(
    ([key, label]) => `- \`${label}\`：${input.gates[key] ? "通过" : "失败"}`,
  );
  const archiveLines = input.entries.map((entry) => entry);
  return [
    `# SubLingo ${input.version} 发布证据`,
    "",
    `- 触发提交：\`${input.commit}\``,
    `- 产物：\`${input.artifactName}\``,
    `- 包内版本：\`${input.packageVersion}\``,
    `- 精确大小：${input.byteSize} 字节`,
    `- SHA-256：\`${input.sha256}\``,
    "",
    "## 自动化门禁",
    "",
    ...gateLines,
    "",
    "## 最终归档清单",
    "",
    "```text",
    ...archiveLines,
    "```",
    "",
    formatHelper("构建文件 native helper", input.buildHelper),
    "",
    formatHelper("包内 native helper", input.packageHelper),
    "",
    "## IINA 图形界面验收边界",
    "",
    "- 真实安装：CI 未覆盖",
    "- 真实卸载：CI 未覆盖",
    "- 实际播放：CI 未覆盖",
    "",
    "以上宿主行为不属于本自动发布门禁，未标记为已验证，也不阻塞本次正式发布。",
    "",
  ].join("\n");
}

export function readZipEntries(archiveBuffer) {
  const minimumOffset = Math.max(0, archiveBuffer.length - 65_557);
  const endOffsets = [];
  for (let offset = archiveBuffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (
      archiveBuffer.readUInt32LE(offset) === 0x06054b50 &&
      archiveBuffer.readUInt16LE(offset + 20) === archiveBuffer.length - offset - 22
    ) {
      endOffsets.push(offset);
    }
  }
  if (endOffsets.length === 0) {
    throw new Error("ZIP end-of-central-directory record is missing");
  }
  if (endOffsets.length !== 1) {
    throw new Error("ZIP contains ambiguous end-of-central-directory records");
  }
  const [endOffset] = endOffsets;

  const diskNumber = archiveBuffer.readUInt16LE(endOffset + 4);
  const directoryDisk = archiveBuffer.readUInt16LE(endOffset + 6);
  const diskEntryCount = archiveBuffer.readUInt16LE(endOffset + 8);
  const entryCount = archiveBuffer.readUInt16LE(endOffset + 10);
  const directorySize = archiveBuffer.readUInt32LE(endOffset + 12);
  const directoryOffset = archiveBuffer.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntryCount !== entryCount ||
    entryCount === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 release archives are not supported");
  }
  if (directoryOffset + directorySize !== endOffset) {
    throw new Error("ZIP central directory does not end at its directory record");
  }

  const entries = [];
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (archiveBuffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry at index ${index}`);
    }
    const versionMadeBy = archiveBuffer.readUInt16LE(cursor + 4);
    const flags = archiveBuffer.readUInt16LE(cursor + 8);
    const fileNameLength = archiveBuffer.readUInt16LE(cursor + 28);
    const extraLength = archiveBuffer.readUInt16LE(cursor + 30);
    const commentLength = archiveBuffer.readUInt16LE(cursor + 32);
    const externalAttributes = archiveBuffer.readUInt32LE(cursor + 38);
    const localHeaderOffset = archiveBuffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > archiveBuffer.length) {
      throw new Error(`Invalid ZIP filename at index ${index}`);
    }
    const name = archiveBuffer.subarray(nameStart, nameEnd).toString("utf8");
    if (
      localHeaderOffset + 30 > directoryOffset ||
      archiveBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50
    ) {
      throw new Error(`Invalid ZIP local file header at index ${index}`);
    }
    const localFlags = archiveBuffer.readUInt16LE(localHeaderOffset + 6);
    const localNameLength = archiveBuffer.readUInt16LE(localHeaderOffset + 26);
    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    if (localNameEnd > directoryOffset) {
      throw new Error(`Invalid ZIP local filename at index ${index}`);
    }
    const localName = archiveBuffer.subarray(localNameStart, localNameEnd).toString("utf8");
    if (localName !== name || (localFlags & 1) !== (flags & 1)) {
      throw new Error(`ZIP local and central entries differ at index ${index}`);
    }
    const platform = versionMadeBy >>> 8;
    const unixMode = platform === 3 || platform === 19 ? externalAttributes >>> 16 : 0;
    entries.push({
      name,
      unixMode,
      encrypted: (flags & 1) !== 0,
    });
    cursor = nameEnd + extraLength + commentLength;
  }
  if (cursor !== directoryOffset + directorySize) {
    throw new Error("ZIP central directory size does not match its entries");
  }
  return entries;
}

function runCommand(command, argumentsList) {
  const result = spawnSync(command, argumentsList, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function verifyHelper(filePath, label) {
  const lipo = process.env.LIPO_BIN || "lipo";
  const codesign = process.env.CODESIGN_BIN || "codesign";
  const architectureOutput = runCommand(lipo, ["-archs", filePath]).stdout;
  const architectures = architectureOutput.split(/\s+/).filter(Boolean);
  let executable = true;
  try {
    accessSync(filePath, constants.X_OK);
  } catch {
    executable = false;
  }
  const verification = spawnSync(codesign, ["--verify", "--strict", filePath], {
    encoding: "utf8",
  });
  const signed = verification.status === 0;
  let signature = "valid";
  if (signed) {
    const details = runCommand(codesign, ["-dv", "--verbose=4", filePath]);
    const selected = `${details.stdout}\n${details.stderr}`
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^(Identifier|Format|CodeDirectory|Signature|TeamIdentifier)=/.test(line));
    signature = selected.length > 0 ? selected.join("; ") : "valid";
  }
  return validateHelperFacts(label, { architectures, executable, signed, signature });
}

function readGates(filePath) {
  const gates = JSON.parse(readFileSync(filePath, "utf8"));
  for (const [key] of gateLabels) {
    if (gates[key] !== true) {
      throw new Error(`Release gate is not marked successful: ${key}`);
    }
  }
  return Object.fromEntries(gateLabels.map(([key]) => [key, true]));
}

export function auditRelease(options) {
  if (!/^[0-9a-f]{40}$/.test(options.expectedCommit)) {
    throw new Error("Expected commit must be a lowercase 40-character SHA");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(options.expectedVersion)) {
    throw new Error("Expected version must be stable SemVer");
  }

  const artifactPath = resolve(options.artifact);
  const archiveBuffer = readFileSync(artifactPath);
  const entries = validateArchiveEntries(readZipEntries(archiveBuffer));
  const gates = readGates(resolve(options.gates));
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "sublingo-release-"));

  try {
    runCommand(process.env.UNZIP_BIN || "unzip", ["-q", artifactPath, "-d", temporaryDirectory]);
    const packageInfo = JSON.parse(readFileSync(join(temporaryDirectory, "Info.json"), "utf8"));
    for (const complianceFile of ["LICENSE", "THIRD_PARTY_NOTICES.txt"]) {
      const packagedContent = readFileSync(join(temporaryDirectory, complianceFile));
      const repositoryContent = readFileSync(resolve(complianceFile));
      if (!packagedContent.equals(repositoryContent)) {
        throw new Error(
          `Packaged compliance file differs from repository source: ${complianceFile}`,
        );
      }
    }
    validateArtifactIdentity({
      artifactName: basename(artifactPath),
      packageVersion: packageInfo.version,
      expectedVersion: options.expectedVersion,
    });

    const buildHelper = verifyHelper(resolve(options.buildHelper), "Build native helper");
    const packageHelper = verifyHelper(
      join(temporaryDirectory, "dist/native/sublingo-transport"),
      "Packaged native helper",
    );
    const byteSize = statSync(artifactPath).size;
    const sha256 = createHash("sha256").update(archiveBuffer).digest("hex");
    const artifactName = basename(artifactPath);
    const notes = buildReleaseNotes({
      version: options.expectedVersion,
      commit: options.expectedCommit,
      packageVersion: packageInfo.version,
      artifactName,
      byteSize,
      sha256,
      entries: entries.map((entry) => entry.name),
      gates,
      buildHelper,
      packageHelper,
    });
    const audit = {
      version: options.expectedVersion,
      tag: `v${options.expectedVersion}`,
      commit: options.expectedCommit,
      artifactName,
      checksumName: `${artifactName}.sha256`,
      packageVersion: packageInfo.version,
      byteSize,
      sha256,
      gates,
      entries,
      buildHelper,
      packageHelper,
    };

    const outputDirectory = resolve(options.outputDirectory);
    mkdirSync(outputDirectory, { recursive: true });
    const outputArtifact = join(outputDirectory, artifactName);
    if (outputArtifact !== artifactPath) {
      copyFileSync(artifactPath, outputArtifact);
    }
    writeFileSync(join(outputDirectory, `${artifactName}.sha256`), `${sha256}  ${artifactName}\n`);
    writeFileSync(join(outputDirectory, "release-notes.md"), notes);
    writeFileSync(
      join(outputDirectory, "release-audit.json"),
      `${JSON.stringify(audit, null, 2)}\n`,
    );
    return audit;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseArguments(argumentsList) {
  const options = {};
  const names = new Map([
    ["--artifact", "artifact"],
    ["--expected-version", "expectedVersion"],
    ["--expected-commit", "expectedCommit"],
    ["--build-helper", "buildHelper"],
    ["--gates", "gates"],
    ["--output-dir", "outputDirectory"],
  ]);
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = names.get(argumentsList[index]);
    const value = argumentsList[index + 1];
    if (!name || !value) {
      throw new Error(`Invalid argument: ${argumentsList[index] ?? "missing"}`);
    }
    options[name] = value;
  }
  for (const name of names.values()) {
    if (!options[name]) {
      throw new Error(`Missing required option: ${name}`);
    }
  }
  return options;
}

function main() {
  const audit = auditRelease(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(audit)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
