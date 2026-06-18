import { execFileSync } from "node:child_process";

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_NET_LOC = 250;

function toInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

export function parseArgs(args = []) {
  const out = { baseRef: "", maxFiles: DEFAULT_MAX_FILES, maxNetLoc: DEFAULT_MAX_NET_LOC };
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") continue;
    if (arg === "--base") out.baseRef = args[++i] ?? "";
    else if (arg.startsWith("--base=")) out.baseRef = arg.slice(7);
    else if (arg.startsWith("--max-files=")) out.maxFiles = toInt(arg.slice(12), "--max-files");
    else if (arg.startsWith("--max-net-loc=")) out.maxNetLoc = toInt(arg.slice(14), "--max-net-loc");
    else if (arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    else positionals.push(arg);
  }

  if (positionals.length > 1 || (positionals.length === 1 && out.baseRef)) {
    throw new Error("Expected exactly one base ref");
  }
  out.baseRef = out.baseRef || positionals[0] || "";
  if (!out.baseRef.trim()) throw new Error("Missing base ref");
  return out;
}

function layerFor(path) {
  if (path === "README.md" || path.startsWith("docs/") || path.startsWith("specs/") || /^[^/]+\.md$/.test(path)) return "docs";
  if (path.startsWith("apps/web/")) return "web";
  if (path.startsWith("src/") || path.startsWith("tests/")) return "backend";
  if (path.startsWith("scripts/")) return "scripts";
  if (path.startsWith(".github/")) return "ci";
  if (path === "package.json") return "repo-config";
  return "other";
}

export function parseNumstat(text = "") {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const [add, del, ...rest] = line.split("\t");
    const additions = add === "-" ? 0 : Number(add);
    const deletions = del === "-" ? 0 : Number(del);
    if (!Number.isFinite(additions) || !Number.isFinite(deletions) || rest.length === 0) {
      throw new Error(`Invalid git numstat line: ${line}`);
    }
    return { additions, deletions, filePath: rest.join("\t").replaceAll("\\", "/").replace(/^\.\//, "") };
  });
}

export function summarizeNumstat(text, { maxFiles = DEFAULT_MAX_FILES, maxNetLoc = DEFAULT_MAX_NET_LOC } = {}) {
  const files = parseNumstat(text);
  const filePaths = files.map((f) => f.filePath).sort();
  const additions = files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = files.reduce((sum, f) => sum + f.deletions, 0);
  const netLoc = additions - deletions;
  const layers = [...new Set(files.map((f) => layerFor(f.filePath)).filter((l) => l !== "docs"))].sort();
  const overCapReasons = [files.length > maxFiles && "files", netLoc > maxNetLoc && "net-loc"].filter(Boolean);
  return {
    changedFiles: files.length,
    filePaths,
    additions,
    deletions,
    netLoc,
    maxFiles,
    maxNetLoc,
    scope: files.length === 0 ? "empty" : layers.length === 0 ? "docs-only" : layers.length === 1 ? "single-layer" : "cross-layer",
    layers,
    capStatus: overCapReasons.length ? "over-cap" : "under-cap",
    overCapReasons,
  };
}

export function collectDiffSummary({ cwd = process.cwd(), baseRef, maxFiles, maxNetLoc } = {}) {
  let text;
  try {
    text = execFileSync("git", ["diff", "--numstat", "--diff-filter=ACDMRTUXB", `${baseRef}...HEAD`, "--"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new Error(`git diff failed for base ref "${baseRef}": ${String(err.stderr ?? err.message).trim()}`);
  }
  return summarizeNumstat(text, { maxFiles, maxNetLoc });
}

function cap(current, max) {
  return `${current}/${max} ${Number(current) > max ? "over" : "ok"}`;
}

function guidanceFor(summary) {
  if (summary.capStatus === "over-cap") {
    return "split the PR or document why it must stay together.";
  }

  return "still run required CI and manual semantic review.";
}

export function renderSummary(s, baseRef) {
  const net = s.netLoc > 0 ? `+${s.netLoc}` : String(s.netLoc);
  return [
    "PR size advisory",
    `base ref: ${baseRef}`,
    `changed files: ${cap(s.changedFiles, s.maxFiles)}`,
    ...s.filePaths.map((filePath, index) => `file ${index + 1}/${s.filePaths.length}: ${filePath}`),
    `additions: ${s.additions}`,
    `deletions: ${s.deletions}`,
    `net LOC: ${cap(net, s.maxNetLoc)}`,
    `scope: ${s.scope}${s.layers.length ? ` (${s.layers.join(", ")})` : ""}`,
    `cap status: ${s.capStatus}${s.overCapReasons.length ? ` (${s.overCapReasons.join(", ")})` : ""}`,
    `guidance: ${guidanceFor(s)}`,
    "note: advisory only; not a required check result or product score.",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    console.log(renderSummary(collectDiffSummary({ cwd: process.cwd(), ...options }), options.baseRef));
  } catch (err) {
    console.error(`${err.message}\n\nUsage: node scripts/pr-size-check.mjs --base=<ref> [--max-files=5] [--max-net-loc=250]`);
    process.exit(1);
  }
}
