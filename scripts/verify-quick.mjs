import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const lanes = new Set(["docs", "backend", "web-api", "ui", "smoke"]);
const laneArg = process.argv.slice(2).find((arg) => arg.startsWith("--lane="));
const lane = laneArg?.slice("--lane=".length);

function usage() {
  console.error("Usage: pnpm verify:quick -- --lane=<docs|backend|web-api|ui|smoke>");
  console.error("  docs: git diff --check");
  console.error("  backend: docs + pnpm backend:test");
  console.error("  web-api: docs + focused API Vitest + pnpm web:typecheck");
  console.error("  ui: docs + focused UI Vitest when present + pnpm web:typecheck");
  console.error("  smoke: docs + pnpm web:test:browser-smoke:live-evidence");
}

if (!lanes.has(lane)) {
  usage();
  process.exit(1);
}

const webTestCandidates = [
  "src/App.test.tsx",
  "src/aitown/DetailsPanel.test.tsx",
  "src/aitown/WorldScene.test.tsx",
  "src/aitown/sourceGapSignals.test.ts",
  "src/aitown/sourceHealth.test.ts",
  "src/sourceHealthWorldBadges.test.ts",
];

const existingWebTests = webTestCandidates.filter((testPath) =>
  existsSync(resolve("apps/web", testPath)),
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

const steps = [["git", ["diff", "--check"]], ...stepsByLane[lane]];

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

console.error(`[verify:quick] lane=${lane}`);
if (lane === "ui" && existingWebTests.length === 0) {
  console.error("[verify:quick] no focused UI tests found; running typecheck only");
}

const startedAt = Date.now();
let completed = 0;

for (const [command, args] of steps) {
  const label = formatCommand(command, args);
  console.error(`[verify:quick] run: ${label}`);
  const result = await runStep(command, args);
  if (!result.ok) {
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    const reason = result.error
      ? result.error.message
      : `exit ${result.code ?? `signal ${result.signal}`}`;
    console.error(`[verify:quick] failed after ${completed}/${steps.length} steps (${elapsedSeconds}s): ${label}`);
    console.error(`[verify:quick] reason: ${reason}`);
    process.exit(result.code ?? 1);
  }
  completed += 1;
}

const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.error(`[verify:quick] ok: ${completed}/${steps.length} steps (${elapsedSeconds}s)`);
