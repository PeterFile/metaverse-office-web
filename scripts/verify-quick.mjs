import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve, sep } from "node:path";

const lanes = new Set(["docs", "backend", "web-api", "ui", "smoke"]);
const webRootPath = "apps/web";

function usage() {
  console.error("Usage:");
  console.error("  pnpm verify:quick -- --lane=<docs|backend|web-api|ui|smoke>");
  console.error("  pnpm verify:quick -- --focused-files <web-package-relative-test> [...]");
  console.error("  docs: git diff --check");
  console.error("  backend: docs + pnpm backend:test");
  console.error("  web-api: docs + focused API Vitest + pnpm web:typecheck");
  console.error("  ui: docs + focused UI Vitest when present + pnpm web:typecheck");
  console.error("  smoke: docs + pnpm web:test:browser-smoke:live-evidence");
  console.error("  focused-files: docs + pnpm --filter @metaverse-office/web exec vitest run <files>");
}

export const webTestCandidates = [
  "src/App.test.tsx",
  "src/aitown/DetailsPanel.test.tsx",
  "src/aitown/WorldScene.test.tsx",
  "src/aitown/sourceGapSignals.test.ts",
  "src/aitown/sourceHealth.test.ts",
  "src/sourceHealthWorldBadges.test.ts",
];

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function runStep(command, args) {
  return new Promise((resolveStep) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", (error) => {
      resolveStep({ ok: false, code: null, error });
    });
    child.on("close", (code, signal) => {
      resolveStep({ ok: code === 0, code, signal });
    });
  });
}

export function parseVerifyQuickArgs(args = []) {
  const forwardedArgs = args[0] === "--" ? args.slice(1) : [...args];
  const laneArgs = forwardedArgs.filter((arg) => arg.startsWith("--lane="));
  const focusedFiles = [];
  let hasFocusedFilesFlag = false;

  if (laneArgs.length > 1) {
    throw new Error("Expected at most one --lane value");
  }

  for (let index = 0; index < forwardedArgs.length; index += 1) {
    const arg = forwardedArgs[index];

    if (arg.startsWith("--focused-files=")) {
      hasFocusedFilesFlag = true;
      focusedFiles.push(...arg.slice("--focused-files=".length).split(","));
      continue;
    }

    if (arg !== "--focused-files") {
      continue;
    }

    hasFocusedFilesFlag = true;
    for (const fileArg of forwardedArgs.slice(index + 1)) {
      if (fileArg.startsWith("--")) {
        throw new Error("--focused-files only accepts explicit test file paths after the flag");
      }
      focusedFiles.push(fileArg);
    }
    break;
  }

  const lane = laneArgs[0]?.slice("--lane=".length) ?? null;

  if (lane && hasFocusedFilesFlag) {
    throw new Error("Use either --lane or --focused-files, not both");
  }

  if (hasFocusedFilesFlag) {
    return { mode: "focused-files", focusedFiles };
  }

  if (!lanes.has(lane)) {
    throw new Error("Unknown or missing verify:quick lane");
  }

  return { mode: "lane", lane };
}

function isWebTestPath(testPath) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(testPath);
}

export function normalizeFocusedWebTestPaths(focusedFiles, { cwd = process.cwd() } = {}) {
  if (focusedFiles.length === 0) {
    throw new Error("--focused-files requires at least one package-relative test file");
  }

  const webRoot = resolve(cwd, webRootPath);
  const seen = new Set();
  const normalizedFiles = [];

  for (const rawFile of focusedFiles) {
    const testPath = rawFile.trim();
    if (!testPath || testPath.startsWith("--") || isAbsolute(testPath) || testPath.includes("://")) {
      throw new Error(`Invalid focused test path "${rawFile}"`);
    }

    const absoluteTestPath = resolve(webRoot, testPath);
    const relativeTestPath = relative(webRoot, absoluteTestPath);
    if (relativeTestPath.startsWith("..") || relativeTestPath === "" || relativeTestPath.includes(`..${sep}`)) {
      throw new Error(`Focused test path escapes the web package: "${rawFile}"`);
    }

    if (!isWebTestPath(relativeTestPath)) {
      throw new Error(`Focused file must be a Vitest test/spec file: "${rawFile}"`);
    }

    if (!existsSync(absoluteTestPath)) {
      throw new Error(`Focused test file does not exist: "${rawFile}"`);
    }

    if (!seen.has(relativeTestPath)) {
      seen.add(relativeTestPath);
      normalizedFiles.push(relativeTestPath);
    }
  }

  return normalizedFiles;
}

export function resolveVerifyQuickSteps(parsedArgs, { cwd = process.cwd() } = {}) {
  const existingWebTests = webTestCandidates.filter((testPath) =>
    existsSync(resolve(cwd, webRootPath, testPath)),
  );

  const stepsByLane = {
    docs: [],
    backend: [["pnpm", ["backend:test"]]],
    "web-api": [
      [
        "pnpm",
        [
          "--filter",
          "@metaverse-office/web",
          "exec",
          "vitest",
          "run",
          "src/api.test.ts",
          "src/api.contract.test.ts",
        ],
      ],
      ["pnpm", ["web:typecheck"]],
    ],
    ui: [
      ...(existingWebTests.length > 0
        ? [["pnpm", ["--filter", "@metaverse-office/web", "exec", "vitest", "run", ...existingWebTests]]]
        : []),
      ["pnpm", ["web:typecheck"]],
    ],
    smoke: [["pnpm", ["web:test:browser-smoke:live-evidence"]]],
  };

  if (parsedArgs.mode === "focused-files") {
    const focusedFiles = normalizeFocusedWebTestPaths(parsedArgs.focusedFiles, { cwd });
    return {
      mode: "focused-files",
      focusedFiles,
      steps: [
        ["git", ["diff", "--check"]],
        ["pnpm", ["--filter", "@metaverse-office/web", "exec", "vitest", "run", ...focusedFiles]],
      ],
    };
  }

  return {
    mode: "lane",
    lane: parsedArgs.lane,
    existingWebTests,
    steps: [["git", ["diff", "--check"]], ...stepsByLane[parsedArgs.lane]],
  };
}

export async function main(cliArgs = process.argv.slice(2)) {
  let plan;
  try {
    plan = resolveVerifyQuickSteps(parseVerifyQuickArgs(cliArgs));
  } catch (error) {
    usage();
    console.error(`[verify:quick] ${error.message}`);
    process.exit(1);
  }

  if (plan.mode === "focused-files") {
    console.error(`[verify:quick] focused-files=${plan.focusedFiles.length}`);
  } else {
    console.error(`[verify:quick] lane=${plan.lane}`);
    if (plan.lane === "ui" && plan.existingWebTests.length === 0) {
      console.error("[verify:quick] no focused UI tests found; running typecheck only");
    }
  }

  const startedAt = Date.now();
  let completed = 0;

  for (const [command, args] of plan.steps) {
    const label = formatCommand(command, args);
    console.error(`[verify:quick] run: ${label}`);
    const result = await runStep(command, args);
    if (!result.ok) {
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      const reason = result.error
        ? result.error.message
        : `exit ${result.code ?? `signal ${result.signal}`}`;
      console.error(`[verify:quick] failed after ${completed}/${plan.steps.length} steps (${elapsedSeconds}s): ${label}`);
      console.error(`[verify:quick] reason: ${reason}`);
      process.exit(result.code ?? 1);
    }
    completed += 1;
  }

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.error(`[verify:quick] ok: ${completed}/${plan.steps.length} steps (${elapsedSeconds}s)`);
}

const isDirectExecution = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
}
