#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

function fail(message) { console.error(`RELEASE CANDIDATE ERROR: ${message}`); process.exit(1); }
function git(args, encoding = "utf8") {
  try { return cp.execFileSync("git", args, { encoding: encoding === null ? null : "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) { fail(`git ${args.join(" ")} failed: ${String(error.stderr || error.message).trim()}`); }
}
const [candidate, tracker] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/.test(candidate || "")) fail("usage: verify-release-candidate.cjs <validated-candidate-sha> <tracker-path>");
if (!/^docs\/(?:features|bugs)\/[A-Za-z0-9][A-Za-z0-9._-]*\/tracker\.md$/.test(tracker || "")) fail("tracker path is not canonical");
git(["cat-file", "-e", `${candidate}^{commit}`]);
const head = git(["rev-parse", "HEAD"]).trim();
try { cp.execFileSync("git", ["merge-base", "--is-ancestor", candidate, head], { stdio: "ignore" }); }
catch { fail(`${candidate} is not an ancestor of release HEAD ${head}`); }

const itemDir = path.posix.dirname(tracker);
const allowedExact = new Set([
  tracker,
  `${itemDir}/evidence.md`,
  "docs/reviews/opus-audit/last-audit.sha",
  "docs/reviews/opus-audit/audit-receipt.json",
]);
const allowedPrefixes = ["docs/reviews/opus-audit/pack/", "docs/reviews/opus-audit/AUDIT_REPORT_"];
function forbiddenPaths(names) {
  return names.filter(name => !allowedExact.has(name) && !allowedPrefixes.some(prefix => name.startsWith(prefix)));
}
// Inspect every descendant, including merged side branches. A final tree diff
// alone would accept production/control changes that a later commit reverted.
// Disable rename detection so both the removed and added paths are checked.
const descendants = git(["rev-list", `${candidate}..${head}`]).trim().split(/\s+/).filter(Boolean);
for (const commit of descendants) {
  const changed = git(["diff-tree", "--root", "-m", "--no-commit-id", "--name-only", "--no-renames", "-r", "-z", commit], null).toString("utf8").split("\0").filter(Boolean);
  const forbidden = forbiddenPaths(changed);
  if (forbidden.length) fail(`commit ${commit} contains non-evidence changes after validated candidate ${candidate}: ${forbidden.map(JSON.stringify).join(", ")}`);
}
const names = git(["diff", "--name-only", "--no-renames", "-z", candidate, head], null).toString("utf8").split("\0").filter(Boolean);
const forbidden = forbiddenPaths(names);
if (forbidden.length) fail(`release HEAD contains non-evidence changes after validated candidate ${candidate}: ${forbidden.map(JSON.stringify).join(", ")}`);

const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], null).toString("utf8").split("\0").filter(Boolean);
const dirty = status.filter(record => {
  const name = record.slice(3);
  return !name.startsWith("logs/");
});
if (dirty.length) fail(`working tree has non-log changes: ${dirty.map(JSON.stringify).join(", ")}`);

process.stdout.write(`${JSON.stringify({ schema: "oeos-release-candidate-v1", validatedCandidateSha: candidate, releaseHead: head, evidenceOnlyCommits: candidate !== head, changedEvidencePaths: names })}\n`);
