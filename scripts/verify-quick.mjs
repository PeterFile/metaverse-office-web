import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve, sep } from "node:path";

const lanes = new Set(["docs", "backend", "web-api", "ui", "ui-source-gap", "smoke"]);
const webRootPath = "apps/web";

function usage() {
  console.error("Usage:");
  console.error("  pnpm verify:quick -- --lane=<docs|backend|web-api|ui|ui-source-gap|smoke>");
  console.error("  pnpm verify:quick -- --focused-files <web-package-relative-test> [...]");
  console.error("  pnpm verify:quick -- --changed");
  console.error("  pnpm verify:quick -- --since=<ref>");
  console.error("  add --plan or --dry-run to print the routed commands without running them");
  console.error("  docs: git diff --check");
  console.error("  backend: docs + pnpm backend:test");
  console.error("  web-api: docs + focused API Vitest + pnpm web:typecheck");
  console.error("  ui: docs + focused UI Vitest when present + pnpm web:typecheck");
  console.error("  ui-source-gap: docs + bounded source-gap/source-health Vitest + pnpm web:typecheck");
  console.error("  smoke: docs + pnpm web:test:browser-smoke:live-evidence");
  console.error("  focused-files: docs + pnpm --filter @metaverse-office/web exec vitest run <files>");
  console.error("  changed/since: conservative changed-file routing; unknown or cross-layer changes fail");
}

export const webTestCandidates = [
  "src/App.test.tsx",
  "src/aitown/DetailsPanel.test.tsx",
  "src/aitown/WorldScene.test.tsx",
  "src/aitown/sourceGapSignals.test.ts",
  "src/aitown/sourceHealth.test.ts",
  "src/sourceHealthWorldBadges.test.ts",
];

export const sourceGapUiTestCandidates = [
  "src/aitown/sourceGapSignals.test.ts",
  "src/aitown/sourceHealth.test.ts",
  "src/sourceHealthWorldBadges.test.ts",
];

const sourceGapUiChangedPaths = new Set([
  "apps/web/src/aitown/sourceGapSignals.ts",
  "apps/web/src/aitown/sourceGapSignals.test.ts",
  "apps/web/src/aitown/sourceHealth.ts",
  "apps/web/src/aitown/sourceHealth.test.ts",
  "apps/web/src/sourceHealthWorldBadges.ts",
  "apps/web/src/sourceHealthWorldBadges.test.ts",
]);

const liveEvidenceHelperFocusedTestPaths = new Map([
  ["apps/web/src/selectedAgentEvidenceLedger.ts", "apps/web/src/selectedAgentEvidenceLedger.test.ts"],
  ["apps/web/src/evidenceProvenanceBundle.ts", "apps/web/src/evidenceProvenanceBundle.test.ts"],
  ["apps/web/src/aitown/selectedAgentEvidenceGlance.ts", "apps/web/src/aitown/selectedAgentEvidenceGlance.test.ts"],
  ["apps/web/src/aitown/selectedAgentSourceMatrix.ts", "apps/web/src/aitown/selectedAgentSourceMatrix.test.ts"],
]);

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

function normalizeRepoPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function gitNameOnly(args, { cwd }) {
  const output = execFileSync("git", args, { cwd, encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .map((line) => normalizeRepoPath(line.trim()))
    .filter(Boolean);
}

export function listChangedFiles({ cwd = process.cwd(), since = null } = {}) {
  if (since) {
    return uniqueSorted(gitNameOnly(["diff", "--name-only", "--diff-filter=ACDMRTUXB", since, "--"], { cwd }));
  }

  return uniqueSorted([
    ...gitNameOnly(["diff", "--name-only", "--diff-filter=ACDMRTUXB", "HEAD", "--"], { cwd }),
    ...gitNameOnly(["ls-files", "--others", "--exclude-standard"], { cwd }),
  ]);
}

export function parseVerifyQuickArgs(args = []) {
  const forwardedArgs = args[0] === "--" ? args.slice(1) : [...args];
  const planOnly = forwardedArgs.some((arg) => arg === "--plan" || arg === "--dry-run");
  const routableArgs = forwardedArgs.filter((arg) => arg !== "--plan" && arg !== "--dry-run");
  const laneArgs = routableArgs.filter((arg) => arg.startsWith("--lane="));
  const changedArgs = routableArgs.filter((arg) => arg === "--changed");
  const sinceArgs = routableArgs.filter((arg) => arg.startsWith("--since="));
  const focusedFiles = [];
  let hasFocusedFilesFlag = false;

  if (laneArgs.length > 1) {
    throw new Error("Expected at most one --lane value");
  }
  if (changedArgs.length > 1) {
    throw new Error("Expected at most one --changed flag");
  }
  if (sinceArgs.length > 1) {
    throw new Error("Expected at most one --since value");
  }

  for (let index = 0; index < routableArgs.length; index += 1) {
    const arg = routableArgs[index];

    if (arg.startsWith("--focused-files=")) {
      hasFocusedFilesFlag = true;
      focusedFiles.push(...arg.slice("--focused-files=".length).split(","));
      continue;
    }

    if (arg !== "--focused-files") {
      continue;
    }

    hasFocusedFilesFlag = true;
    for (const fileArg of routableArgs.slice(index + 1)) {
      if (fileArg.startsWith("--")) {
        throw new Error("--focused-files only accepts explicit test file paths after the flag");
      }
      focusedFiles.push(fileArg);
    }
    break;
  }

  const lane = laneArgs[0]?.slice("--lane=".length) ?? null;
  const since = sinceArgs[0]?.slice("--since=".length) ?? null;

  if (since === "") {
    throw new Error("--since requires a non-empty ref");
  }

  if (lane && hasFocusedFilesFlag) {
    throw new Error("Use either --lane or --focused-files, not both");
  }

  const selectedModes = [lane ? "lane" : null, hasFocusedFilesFlag ? "focused-files" : null, changedArgs.length > 0 ? "changed" : null, since ? "since" : null].filter(Boolean);
  if (selectedModes.length > 1) {
    throw new Error("Use only one of --lane, --focused-files, --changed, or --since");
  }

  if (hasFocusedFilesFlag) {
    return { mode: "focused-files", focusedFiles, ...(planOnly ? { planOnly: true } : {}) };
  }

  if (changedArgs.length > 0) {
    return { mode: "changed", since: null, ...(planOnly ? { planOnly: true } : {}) };
  }

  if (since) {
    return { mode: "changed", since, ...(planOnly ? { planOnly: true } : {}) };
  }

  if (!lanes.has(lane)) {
    throw new Error("Unknown or missing verify:quick lane");
  }

  return { mode: "lane", lane, ...(planOnly ? { planOnly: true } : {}) };
}

function isWebTestPath(testPath) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(testPath);
}

function isDocsPath(filePath) {
  return filePath === "README.md"
    || filePath.startsWith("docs/")
    || filePath.startsWith("specs/")
    || filePath.startsWith("notes/")
    || /^[^/]+\.md$/.test(filePath);
}

function isBackendPath(filePath) {
  return filePath.startsWith("src/") || filePath.startsWith("tests/");
}

function isSmokePath(filePath) {
  return filePath.startsWith("apps/web/e2e/")
    || filePath === "apps/web/playwright.config.ts"
    || filePath === "apps/web/playwright.config.test.ts"
    || filePath.startsWith("apps/web/scripts/browser-smoke-")
    || filePath === "apps/web/scripts/run-browser-smoke.mjs"
    || filePath === "apps/web/scripts/run-browser-smoke.test.ts";
}

function isWebApiPath(filePath) {
  return filePath === "apps/web/src/api.ts"
    || filePath === "apps/web/src/api.test.ts"
    || filePath === "apps/web/src/api.contract.test.ts"
    || filePath === "apps/web/src/hooks/usePolledResource.ts"
    || filePath === "apps/web/src/hooks/usePolledResource.test.tsx";
}

function isWebVitestPath(filePath) {
  return filePath.startsWith(`${webRootPath}/`)
    && !filePath.startsWith("apps/web/e2e/")
    && isWebTestPath(filePath);
}

function toWebPackagePath(filePath) {
  return filePath.slice(`${webRootPath}/`.length);
}

export function classifyChangedFiles(changedFiles = []) {
  const normalizedFiles = uniqueSorted(
    changedFiles.map((filePath) => normalizeRepoPath(filePath).trim()).filter(Boolean),
  );

  if (normalizedFiles.length === 0) {
    throw new Error("No changed files found for verify:quick routing");
  }

  const nonDocsFiles = normalizedFiles.filter((filePath) => !isDocsPath(filePath));
  if (nonDocsFiles.length === 0) {
    return { mode: "lane", lane: "docs" };
  }

  if (nonDocsFiles.every((filePath) => sourceGapUiChangedPaths.has(filePath))) {
    return { mode: "lane", lane: "ui-source-gap" };
  }

  const categories = new Map();
  const unknownFiles = [];

  for (const filePath of nonDocsFiles) {
    const focusedTestPath = liveEvidenceHelperFocusedTestPaths.get(filePath);
    if (focusedTestPath) {
      categories.set("focused-files", (categories.get("focused-files") ?? []).concat(focusedTestPath));
    } else if (isBackendPath(filePath)) {
      categories.set("backend", (categories.get("backend") ?? []).concat(filePath));
    } else if (isSmokePath(filePath)) {
      categories.set("smoke", (categories.get("smoke") ?? []).concat(filePath));
    } else if (isWebApiPath(filePath)) {
      categories.set("web-api", (categories.get("web-api") ?? []).concat(filePath));
    } else if (isWebVitestPath(filePath)) {
      categories.set("focused-files", (categories.get("focused-files") ?? []).concat(filePath));
    } else if (filePath.startsWith("apps/web/src/")) {
      categories.set("ui", (categories.get("ui") ?? []).concat(filePath));
    } else {
      unknownFiles.push(filePath);
    }
  }

  if (unknownFiles.length > 0) {
    throw new Error(`Cannot safely route changed files: ${unknownFiles.join(", ")}`);
  }

  if (categories.size !== 1) {
    throw new Error(`Cannot safely route cross-layer changed files: ${nonDocsFiles.join(", ")}`);
  }

  const [category, files] = categories.entries().next().value;
  if (category === "focused-files") {
    return {
      mode: "focused-files",
      focusedFiles: uniqueSorted(files).map(toWebPackagePath),
    };
  }

  return { mode: "lane", lane: category };
}

function diffCheckArgsFor(parsedArgs) {
  if (parsedArgs.mode !== "changed") {
    return ["diff", "--check"];
  }

  if (parsedArgs.since) {
    return ["diff", "--check", parsedArgs.since, "--"];
  }

  return ["diff", "--check", "HEAD", "--"];
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

/**
 * @param {object} parsedArgs
 * @param {{ cwd?: string, changedFiles?: string[] | null }} [options]
 */
export function resolveVerifyQuickSteps(parsedArgs, options = {}) {
  const { cwd = process.cwd(), changedFiles = null } = options;
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
    "ui-source-gap": [
      ["pnpm", ["--filter", "@metaverse-office/web", "exec", "vitest", "run", ...sourceGapUiTestCandidates]],
      ["pnpm", ["web:typecheck"]],
    ],
    smoke: [["pnpm", ["web:test:browser-smoke:live-evidence"]]],
  };

  const routedArgs = parsedArgs.mode === "changed"
    ? classifyChangedFiles(changedFiles ?? listChangedFiles({ cwd, since: parsedArgs.since }))
    : parsedArgs;
  const diffCheckStep = ["git", diffCheckArgsFor(parsedArgs)];

  if (routedArgs.mode === "focused-files") {
    const focusedFiles = normalizeFocusedWebTestPaths(routedArgs.focusedFiles, { cwd });
    const plan = {
      mode: "focused-files",
      focusedFiles,
      steps: [
        diffCheckStep,
        ["pnpm", ["--filter", "@metaverse-office/web", "exec", "vitest", "run", ...focusedFiles]],
      ],
    };

    if (parsedArgs.mode === "changed") {
      plan.changed = true;
      plan.since = parsedArgs.since;
    }

    return plan;
  }

  const plan = {
    mode: "lane",
    lane: routedArgs.lane,
    existingWebTests,
    steps: [diffCheckStep, ...stepsByLane[routedArgs.lane]],
  };

  if (parsedArgs.mode === "changed") {
    plan.changed = true;
    plan.since = parsedArgs.since;
  }

  return plan;
}

export function formatVerifyQuickPlanSummary(plan) {
  const selectedLine = plan.mode === "focused-files"
    ? `[verify:quick] selected ${plan.changed ? "changed-files route=focused-files " : ""}focused-files=${plan.focusedFiles.length} steps=${plan.steps.length}`
    : `[verify:quick] selected ${plan.changed ? "changed-files route=lane " : ""}lane=${plan.lane} steps=${plan.steps.length}`;

  const lines = [selectedLine];
  if (plan.mode === "focused-files") {
    lines.push(
      ...plan.focusedFiles.map((filePath, index) =>
        `[verify:quick] focused-file ${index + 1}/${plan.focusedFiles.length}: ${filePath}`,
      ),
    );
  }

  if (plan.mode === "lane" && plan.lane === "ui" && plan.existingWebTests.length === 0) {
    lines.push("[verify:quick] no focused UI tests found; running typecheck only");
  }

  return lines.concat(
    plan.steps.map(([command, args], index) =>
      `[verify:quick] plan ${index + 1}/${plan.steps.length}: ${formatCommand(command, args)}`,
    ),
  );
}

function formatVerifyQuickRoute(plan) {
  if (plan.mode === "focused-files") {
    return `${plan.changed ? "changed-files route=focused-files " : ""}focused-files=${plan.focusedFiles.length}`;
  }

  return `${plan.changed ? "changed-files route=lane " : ""}lane=${plan.lane}`;
}

function formatVerifyQuickResultSummary(plan, { completed, failed, elapsedSeconds }) {
  return `[verify:quick] result ${formatVerifyQuickRoute(plan)} passed-steps=${completed} failed-steps=${failed ? 1 : 0} total-steps=${plan.steps.length} elapsed=${elapsedSeconds}s`;
}

export async function main(cliArgs = process.argv.slice(2)) {
  let parsedArgs;
  let plan;
  try {
    parsedArgs = parseVerifyQuickArgs(cliArgs);
    plan = resolveVerifyQuickSteps(parsedArgs);
  } catch (error) {
    usage();
    console.error(`[verify:quick] ${error.message}`);
    process.exit(1);
  }

  for (const line of formatVerifyQuickPlanSummary(plan)) {
    console.error(line);
  }

  if (plan.mode === "focused-files") {
    console.error(`[verify:quick] focused-files=${plan.focusedFiles.length}`);
    if (parsedArgs.planOnly) {
      console.error(`[verify:quick] focused-file-list=${plan.focusedFiles.join(", ")}`);
    }
  } else {
    console.error(`[verify:quick] lane=${plan.lane}`);
  }

  if (parsedArgs.planOnly) {
    for (const [command, args] of plan.steps) {
      console.error(`[verify:quick] plan: ${formatCommand(command, args)}`);
    }
    console.error(`[verify:quick] dry-run: ${plan.steps.length} steps`);
    return;
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
      console.error(formatVerifyQuickResultSummary(plan, { completed, failed: true, elapsedSeconds }));
      console.error(`[verify:quick] failed after ${completed}/${plan.steps.length} steps (${elapsedSeconds}s): ${label}`);
      console.error(`[verify:quick] reason: ${reason}`);
      process.exit(result.code ?? 1);
    }
    completed += 1;
  }

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.error(formatVerifyQuickResultSummary(plan, { completed, failed: false, elapsedSeconds }));
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
