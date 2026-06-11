import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectDiffSummary, parseArgs, renderSummary, summarizeNumstat } from "./pr-size-check.mjs";

function git(cwd, args) {
  return execFileSync("git", ["-c", "user.name=PR Size Test", "-c", "user.email=pr-size@example.test", ...args], { cwd, encoding: "utf8" });
}

test("parses base and caps", () => {
  assert.deepEqual(parseArgs(["--base=origin/master", "--max-files=7", "--max-net-loc=300"]), {
    baseRef: "origin/master",
    maxFiles: 7,
    maxNetLoc: 300,
  });
});

test("summarizes under-cap and docs-only diffs", () => {
  const summary = summarizeNumstat("10\t4\tsrc/index.js\n2\t3\tREADME.md\n");
  assert.equal(summary.changedFiles, 2);
  assert.equal(summary.additions, 12);
  assert.equal(summary.deletions, 7);
  assert.equal(summary.netLoc, 5);
  assert.equal(summary.scope, "single-layer");
  assert.equal(summary.capStatus, "under-cap");

  assert.equal(summarizeNumstat("1\t0\tdocs/runbook.md\n").scope, "docs-only");
});

test("reports over-cap cross-layer diffs without product scoring", () => {
  const summary = summarizeNumstat("260\t0\tsrc/server.js\n1\t0\tapps/web/src/App.tsx\n", { maxFiles: 5, maxNetLoc: 250 });
  const output = renderSummary(summary, "base");
  assert.equal(summary.scope, "cross-layer");
  assert.deepEqual(summary.overCapReasons, ["net-loc"]);
  assert.match(output, /advisory only/i);
  assert.doesNotMatch(output, /product fit|contract correctness/i);
});

test("collects committed diff totals from a temporary git fixture", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pr-size-check-"));
  try {
    git(cwd, ["init"]);
    writeFileSync(join(cwd, "README.md"), "one\n");
    git(cwd, ["add", "."]);
    git(cwd, ["commit", "-m", "base"]);
    const baseRef = git(cwd, ["rev-parse", "HEAD"]).trim();

    mkdirSync(join(cwd, "scripts"));
    writeFileSync(join(cwd, "README.md"), "one\ntwo\n");
    writeFileSync(join(cwd, "scripts", "gate.js"), "console.log('gate');\n");
    git(cwd, ["add", "."]);
    git(cwd, ["commit", "-m", "candidate"]);

    const summary = collectDiffSummary({ cwd, baseRef });
    assert.equal(summary.changedFiles, 2);
    assert.equal(summary.additions, 2);
    assert.equal(summary.deletions, 0);
    assert.equal(summary.scope, "single-layer");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
