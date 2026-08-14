import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const stableSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateReleaseMetadata(input) {
  const version = input.infoVersion;
  if (!stableSemverPattern.test(version)) {
    throw new Error(`Info.json version is not stable SemVer: ${version}`);
  }

  const sources = [
    ["package.json", input.packageVersion],
    ["package-lock.json", input.lockVersion],
    ['package-lock.json packages[""].version', input.lockRootVersion],
  ];
  for (const [source, sourceVersion] of sources) {
    if (sourceVersion !== version) {
      throw new Error(`Project version mismatch: Info.json=${version}, ${source}=${sourceVersion}`);
    }
  }

  const packVersions = Array.from(
    input.packScript.matchAll(/SubLingo-([0-9A-Za-z.+-]+)\.iinaplgz/g),
    (match) => match[1],
  );
  if (packVersions.length < 2 || packVersions.some((value) => value !== version)) {
    throw new Error(
      `The pack script must use SubLingo-${version}.iinaplgz for the artifact and safety boundary`,
    );
  }

  const artifactName = `SubLingo-${version}.iinaplgz`;
  return {
    version,
    tag: `v${version}`,
    artifactName,
    artifactPath: `build/package/${artifactName}`,
  };
}

export function readReleaseMetadata(rootDirectory) {
  const info = JSON.parse(readFileSync(resolve(rootDirectory, "Info.json"), "utf8"));
  const packageManifest = JSON.parse(readFileSync(resolve(rootDirectory, "package.json"), "utf8"));
  const packageLock = JSON.parse(readFileSync(resolve(rootDirectory, "package-lock.json"), "utf8"));
  const packScript = readFileSync(resolve(rootDirectory, "scripts/pack.sh"), "utf8");

  return validateReleaseMetadata({
    infoVersion: info.version,
    packageVersion: packageManifest.version,
    lockVersion: packageLock.version,
    lockRootVersion: packageLock.packages?.[""]?.version,
    packScript,
  });
}

function parseArguments(argumentsList) {
  const options = { root: process.cwd() };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--root") {
      options.root = argumentsList[index + 1];
      index += 1;
    } else if (argument === "--github-output") {
      options.githubOutput = argumentsList[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const metadata = readReleaseMetadata(resolve(options.root));
  if (options.githubOutput) {
    writeFileSync(
      options.githubOutput,
      [
        `version=${metadata.version}`,
        `tag=${metadata.tag}`,
        `artifact_name=${metadata.artifactName}`,
        `artifact_path=${metadata.artifactPath}`,
        "",
      ].join("\n"),
      { flag: "a" },
    );
  }
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
