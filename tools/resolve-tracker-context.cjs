#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

function fail(message) {
  console.error(`TRACKER CONTEXT ERROR: ${message}`);
  process.exit(1);
}

function git(args) {
  try { return cp.execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (error) {
    if (error && error.status === 0 && error.stdout !== undefined) return (Buffer.isBuffer(error.stdout) ? error.stdout.toString("utf8") : String(error.stdout)).trim();
    fail(`git ${args.join(" ")} failed: ${String(error.stderr || error.message).trim()}`);
  }
}

function canonicalTracker(value) {
  if (typeof value !== "string" || path.isAbsolute(value) || value.includes("\\") || path.posix.normalize(value) !== value) fail("tracker path must be canonical and repository-relative");
  if (!/^docs\/(?:features|bugs)\/[A-Za-z0-9][A-Za-z0-9._-]*\/tracker\.md$/.test(value)) fail(`unsupported tracker path ${JSON.stringify(value)}`);
  const root = fs.realpathSync(git(["rev-parse", "--show-toplevel"]));
  const absolute = path.join(root, value);
  let stat;
  try { stat = fs.lstatSync(absolute); } catch { fail(`tracker does not exist: ${value}`); }
  if (stat.isSymbolicLink() || !stat.isFile() || fs.realpathSync(absolute) !== absolute) fail(`tracker must be a regular non-symlink file: ${value}`);
  return { root, absolute, relative: value };
}

function oneField(text, name, tracker) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...text.matchAll(new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.+?)\\s*$`, "gim"))];
  if (matches.length !== 1) fail(`${tracker} must contain exactly one ${name} field`);
  const value = matches[0][1].trim().replace(/^`|`$/g, "").trim();
  if (!value || /^\[.*\]$/.test(value) || /<[^>]+>|\b(?:TODO|TBD)\b/i.test(value)) fail(`${tracker} has an unresolved ${name} field`);
  return value;
}

function discover(root) {
  const found = [];
  for (const kind of ["features", "bugs"]) {
    const parent = path.join(root, "docs", kind);
    let names = [];
    try { names = fs.readdirSync(parent); } catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const name of names.sort()) {
      const rel = `docs/${kind}/${name}/tracker.md`;
      const absolute = path.join(root, rel);
      let stat;
      try { stat = fs.lstatSync(absolute); } catch { continue; }
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const text = fs.readFileSync(absolute, "utf8");
      let status;
      try { status = oneField(text, "Status", rel).toUpperCase(); } catch { continue; }
      if (!["DONE", "ABANDONED", "SUPERSEDED", "CANCELLED"].includes(status)) found.push(rel);
    }
  }
  if (found.length !== 1) fail(`expected exactly one active feature/bug tracker, found ${found.length}${found.length ? `: ${found.join(", ")}` : ""}`);
  return found[0];
}

function resolveTrackerContext(trackerArg = null) {
  const repoRoot = fs.realpathSync(git(["rev-parse", "--show-toplevel"]));
  const tracker = canonicalTracker(trackerArg || discover(repoRoot));
  const text = fs.readFileSync(tracker.absolute, "utf8");
  const baseBranch = oneField(text, "Base Branch", tracker.relative);
  const branch = oneField(text, "Branch", tracker.relative);
  git(["check-ref-format", "--branch", baseBranch]);
  git(["check-ref-format", "--branch", branch]);
  git(["rev-parse", "--verify", `${baseBranch}^{commit}`]);
  return { trackerPath: tracker.relative, baseBranch, branch };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let trackerArg = null;
  let field = "json";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tracker" && args[i + 1]) trackerArg = args[++i];
    else if (args[i] === "--field" && args[i + 1]) field = args[++i];
    else fail("usage: resolve-tracker-context.cjs [--tracker <path>] [--field tracker|base|branch|json]");
  }
  const context = resolveTrackerContext(trackerArg);
  if (field === "tracker") process.stdout.write(`${context.trackerPath}\n`);
  else if (field === "base") process.stdout.write(`${context.baseBranch}\n`);
  else if (field === "branch") process.stdout.write(`${context.branch}\n`);
  else if (field === "json") process.stdout.write(`${JSON.stringify(context)}\n`);
  else fail(`unknown field ${JSON.stringify(field)}`);
}

module.exports = { resolveTrackerContext };
