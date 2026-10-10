#!/usr/bin/env node
"use strict";

// OEOS cumulative approved-test ledger. The manifest is a hash-linked,
// append-only chain; every entry is checked against both its originating Git
// commit and the current regular file. No shell parsing is used, so spaces and
// newlines in valid Git paths are preserved.

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

function die(message) {
  console.error(`APPROVED-TEST ERROR: ${message}`);
  process.exit(1);
}
function git(args, options = {}) {
  try {
    return cp.execFileSync("git", args, { encoding: options.encoding === null ? null : "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    if (e && e.status === 0 && e.stdout !== undefined) {
      if (options.encoding === null) return Buffer.isBuffer(e.stdout) ? e.stdout : Buffer.from(String(e.stdout));
      return Buffer.isBuffer(e.stdout) ? e.stdout.toString("utf8") : String(e.stdout);
    }
    die(`git ${args.join(" ")} failed: ${(e.stderr || e.message).toString().trim()}`);
  }
}
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function canonicalRepoPath(value, label) {
  if (typeof value !== "string" || !value || value.includes("\0")) die(`${label} must be a non-empty repository-relative path`);
  if (path.isAbsolute(value) || value.includes("\\")) die(`${label} must use canonical repository-relative '/' syntax: ${JSON.stringify(value)}`);
  const norm = path.posix.normalize(value);
  if (norm !== value || norm === ".." || norm.startsWith("../") || norm.startsWith("./")) die(`${label} escapes or aliases the repository: ${JSON.stringify(value)}`);
  return value;
}
function repoRoot() { return git(["rev-parse", "--show-toplevel"]).trim(); }
function assertRegularNoSymlink(repo, rel, mustExist = true) {
  canonicalRepoPath(rel, "path");
  let cur = repo;
  for (const part of rel.split("/")) {
    cur = path.join(cur, part);
    if (!fs.existsSync(cur)) {
      if (mustExist) die(`missing file ${JSON.stringify(rel)}`);
      return;
    }
    const st = fs.lstatSync(cur);
    if (st.isSymbolicLink()) die(`symlink path is forbidden: ${JSON.stringify(rel)}`);
  }
  if (mustExist && !fs.lstatSync(path.join(repo, rel)).isFile()) die(`not a regular file: ${JSON.stringify(rel)}`);
}
function parseManifest(raw, label) {
  let m;
  try { m = JSON.parse(raw.toString("utf8")); } catch (e) { die(`${label} is not valid JSON: ${e.message}`); }
  if (!m || m.schema !== "oeos-approved-tests-v1" || !Array.isArray(m.entries)) die(`${label} must use schema oeos-approved-tests-v1 with an entries array`);
  if (m.previous !== null && (!m.previous || typeof m.previous !== "object" || !/^[0-9a-f]{40}$/.test(m.previous.commit || "") || !/^[0-9a-f]{40}$/.test(m.previous.blobSha || ""))) {
    die(`${label}.previous must be null or {commit,blobSha}`);
  }
  // The only unlinked ledger state is the empty manifest created by `init`.
  // Without this root invariant an attacker could discard the entire chain,
  // retain an arbitrary subset of entries, and reset `previous` to null.
  if (m.previous === null && m.entries.length !== 0) {
    die(`${label} has entries but no predecessor; only the empty initialized ledger may be a chain root`);
  }
  const seen = new Set();
  for (let i = 0; i < m.entries.length; i++) {
    const e = m.entries[i];
    if (!e || typeof e !== "object") die(`${label}.entries[${i}] must be an object`);
    canonicalRepoPath(e.path, `${label}.entries[${i}].path`);
    if (!/^[0-9a-f]{40}$/.test(e.blobSha || "")) die(`${label}.entries[${i}].blobSha must be 40 lowercase hex characters`);
    if (!/^[0-9a-f]{40}$/.test(e.testCommit || "")) die(`${label}.entries[${i}].testCommit must be 40 lowercase hex characters`);
    if (typeof e.taskId !== "string" || !e.taskId.trim() || /[\x00-\x1f\x7f]/.test(e.taskId)) die(`${label}.entries[${i}].taskId is invalid`);
    const folded = e.path.normalize("NFC").toLocaleLowerCase("en-US");
    if (seen.has(folded)) die(`${label} contains a duplicate/case-alias path: ${JSON.stringify(e.path)}`);
    seen.add(folded);
    const keys = Object.keys(e).sort().join(",");
    if (keys !== "blobSha,path,taskId,testCommit") die(`${label}.entries[${i}] contains missing or unknown fields`);
  }
  const keys = Object.keys(m).sort().join(",");
  if (keys !== "entries,previous,schema") die(`${label} contains missing or unknown top-level fields`);
  return m;
}
function blobAt(commit, rel) {
  git(["cat-file", "-e", `${commit}^{commit}`]);
  const raw = git(["ls-tree", "-z", commit, "--", rel], { encoding: null });
  const records = raw.toString("utf8").split("\0").filter(Boolean);
  if (records.length !== 1) die(`${JSON.stringify(rel)} does not resolve to exactly one tree entry at ${commit}`);
  const match = records[0].match(/^(\d+) blob ([0-9a-f]{40})\t([\s\S]+)$/);
  if (!match || !["100644", "100755"].includes(match[1]) || match[3] !== rel) die(`${JSON.stringify(rel)} was not a regular file at ${commit}`);
  return { mode: match[1], sha: match[2] };
}
function sameEntry(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function verifyChain(manifestPath, current, head) {
  let newer = current;
  let newerCommit = head;
  const visited = new Set();
  while (newer.previous) {
    const predecessorCommit = newer.previous.commit;
    const id = `${newer.previous.commit}:${newer.previous.blobSha}`;
    if (visited.has(id)) die("manifest history contains a cycle");
    visited.add(id);
    if (git(["merge-base", "--is-ancestor", newer.previous.commit, head], { encoding: null }) === undefined) die("unreachable manifest predecessor");
    const transitionCommits = git(["log", "--format=%H", `${newer.previous.commit}..${newerCommit}`, "--", manifestPath]).trim().split(/\s+/).filter(Boolean);
    if (transitionCommits.length !== 1) die(`manifest predecessor skips or combines ledger transitions (${transitionCommits.length} manifest changes found)`);
    const tree = blobAt(newer.previous.commit, manifestPath);
    if (tree.sha !== newer.previous.blobSha) die(`predecessor blob mismatch at ${newer.previous.commit}`);
    const olderRaw = git(["show", `${newer.previous.commit}:${manifestPath}`], { encoding: null });
    const older = parseManifest(olderRaw, `manifest at ${newer.previous.commit}`);
    if (older.entries.length >= newer.entries.length) die("manifest transition did not append at least one entry");
    for (let i = 0; i < older.entries.length; i++) if (!sameEntry(older.entries[i], newer.entries[i])) die(`manifest transition rewrote or removed entry ${i}`);
    newer = older;
    newerCommit = predecessorCommit;
  }
}
function verifyEntries(repo, manifest) {
  const head = git(["rev-parse", "HEAD"]).trim();
  for (const e of manifest.entries) {
    if (git(["merge-base", "--is-ancestor", e.testCommit, head], { encoding: null }) === undefined) die(`test commit is not an ancestor of HEAD for ${JSON.stringify(e.path)}`);
    const origin = blobAt(e.testCommit, e.path);
    if (origin.sha !== e.blobSha) die(`recorded blob does not match test commit for ${JSON.stringify(e.path)}`);
    const changed = git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", e.testCommit], { encoding: null }).toString("utf8").split("\0");
    if (!changed.includes(e.path)) die(`${JSON.stringify(e.path)} was not introduced or changed by its recorded test commit`);
    assertRegularNoSymlink(repo, e.path);
    const now = git(["hash-object", "--", e.path]).trim();
    if (now !== e.blobSha) die(`approved test content changed: ${JSON.stringify(e.path)}`);
    const currentTree = blobAt(head, e.path);
    if (currentTree.mode !== origin.mode || currentTree.sha !== origin.sha) die(`approved test path/content/mode changed in Git history: ${JSON.stringify(e.path)}`);
  }
}
function loadCurrent(repo, manifestPath) {
  assertRegularNoSymlink(repo, manifestPath);
  return parseManifest(fs.readFileSync(path.join(repo, manifestPath)), manifestPath);
}
function verify(repo, manifestPath) {
  if (git(["status", "--porcelain=v1", "--", manifestPath]).trim()) die("manifest must be tracked and clean during verification");
  const manifest = loadCurrent(repo, manifestPath);
  const head = git(["rev-parse", "HEAD"]).trim();
  verifyChain(manifestPath, manifest, head);
  verifyEntries(repo, manifest);
  if (manifest.entries.length === 0) die("approved-test manifest is empty");
  return manifest;
}
function atomicWrite(file, value) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(tmp, file);
}

const [mode, rawManifest, taskId, testCommitArg, ...newPaths] = process.argv.slice(2);
if (!mode || !rawManifest || !["verify", "append", "init"].includes(mode)) die("usage: verify-approved-tests.cjs init|verify <manifest> OR append <manifest> <task-id> <test-commit> <path>...");
const repo = repoRoot();
const manifestPath = canonicalRepoPath(rawManifest, "manifest path");
if (!/^docs\/(?:features|bugs)\/[A-Za-z0-9][A-Za-z0-9._-]*\/approved-tests\.json$/.test(manifestPath)) {
  die("manifest path must be docs/features/<slug>/approved-tests.json or docs/bugs/<slug>/approved-tests.json");
}
process.chdir(repo);

if (mode === "init") {
  assertRegularNoSymlink(repo, manifestPath, false);
  if (fs.existsSync(path.join(repo, manifestPath))) die("manifest already exists");
  fs.mkdirSync(path.dirname(path.join(repo, manifestPath)), { recursive: true });
  atomicWrite(path.join(repo, manifestPath), { schema: "oeos-approved-tests-v1", previous: null, entries: [] });
  console.log(`Initialized ${manifestPath}`);
  process.exit(0);
}

if (mode === "verify") {
  verify(repo, manifestPath);
  console.log(`Approved tests verified: ${manifestPath}`);
  process.exit(0);
}

if (!taskId || !testCommitArg || newPaths.length === 0) die("append requires task-id, test-commit, and at least one path");
if (!/^[0-9a-f]{40}$/.test(testCommitArg)) die("test-commit must be a full lowercase SHA");
const current = loadCurrent(repo, manifestPath);
const head = git(["rev-parse", "HEAD"]).trim();
verifyChain(manifestPath, current, head);
if (git(["status", "--porcelain=v1", "--", manifestPath]).trim()) die("manifest must be tracked and clean before append");
const prior = blobAt(head, manifestPath);
const next = { schema: "oeos-approved-tests-v1", previous: { commit: head, blobSha: prior.sha }, entries: current.entries.slice() };
for (const rawPath of newPaths) {
  const rel = canonicalRepoPath(rawPath, "approved-test path");
  if (next.entries.some((e) => e.path.normalize("NFC").toLocaleLowerCase("en-US") === rel.normalize("NFC").toLocaleLowerCase("en-US"))) die(`duplicate/case-alias approved-test path: ${JSON.stringify(rel)}`);
  const origin = blobAt(testCommitArg, rel);
  assertRegularNoSymlink(repo, rel);
  const now = git(["hash-object", "--", rel]).trim();
  if (now !== origin.sha) die(`working file differs from test commit: ${JSON.stringify(rel)}`);
  next.entries.push({ path: rel, blobSha: origin.sha, testCommit: testCommitArg, taskId });
}
parseManifest(Buffer.from(JSON.stringify(next)), "new manifest");
verifyEntries(repo, next);
atomicWrite(path.join(repo, manifestPath), next);
console.log(`Appended ${newPaths.length} approved test(s) to ${manifestPath}`);
