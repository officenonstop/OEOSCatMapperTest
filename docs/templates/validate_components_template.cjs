#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync, execFileSync } = require("child_process");

const root = fs.realpathSync(process.cwd());
const configPath = process.argv[2] || "docs/validation-components.json";
const validateOnly = process.argv.includes("--validate-only");
const checkFallback = process.argv.includes("--check-fallback");
const excluded = new Set([".git", "node_modules", "vendor", "target", "build", "dist", ".gradle", ".venv"]);
const markers = new Set(["package.json", "pyproject.toml", "setup.py", "Cargo.toml", "settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"]);
const requiredCommands = ["build", "test", "static", "lint", "dependencyAudit", "interaction"];

function fail(message) { console.error(`[COMPONENT VALIDATION] ${message}`); process.exit(1); }
function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function execText(file, args) {
  try { return execFileSync(file, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) {
    if (error?.status === 0 && error.stdout !== undefined) return Buffer.isBuffer(error.stdout) ? error.stdout.toString("utf8") : String(error.stdout);
    throw error;
  }
}
function safeRelative(value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\") || path.posix.normalize(value) !== value || value === ".." || value.startsWith("../")) fail(`${label} must be a canonical repository-relative path`);
  const absolute = path.resolve(root, value);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) fail(`${label} escapes the repository`);
  return absolute;
}
function regular(file, label) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  return stat;
}
function argv(value, label) {
  if (!Array.isArray(value) || !value.length || value.some((part) => typeof part !== "string" || !part || part.includes("\0"))) fail(`${label} must be a non-empty argv array`);
  if (["sh", "bash", "node", "python", "python3"].includes(path.basename(value[0])) && ["-c", "-e", "--eval"].includes(value[1])) fail(`${label} may not use inline interpreter code`);
}
function discoverInventory(dir = root, relative = ".", found = new Map(), insideGradleBuild = false) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  const filenames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const ownsGradleBuild = filenames.has("settings.gradle") || filenames.has("settings.gradle.kts");
  const present = entries.filter((entry) => entry.isFile() && markers.has(entry.name) && !(insideGradleBuild && ["build.gradle", "build.gradle.kts"].includes(entry.name))).map((entry) => entry.name).sort();
  if (present.length) found.set(relative, present);
  for (const entry of entries) {
    if (!entry.isDirectory() || excluded.has(entry.name)) continue;
    discoverInventory(path.join(dir, entry.name), relative === "." ? entry.name : `${relative}/${entry.name}`, found, insideGradleBuild || ownsGradleBuild);
  }
  return found;
}
function discover() { return new Set(discoverInventory().keys()); }
function markerFamilies(markerNames) {
  const families = new Set();
  for (const marker of markerNames) {
    if (marker === "package.json") families.add("web");
    else if (["pyproject.toml", "setup.py"].includes(marker)) families.add("python");
    else if (marker === "Cargo.toml") families.add("rust");
    else if (["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"].includes(marker)) families.add("gradle");
  }
  return [...families].sort();
}
function platformFamily(platform) {
  if (["web", "node"].includes(platform)) return "web";
  if (platform === "python") return "python";
  if (platform === "rust") return "rust";
  if (["android", "jvm"].includes(platform)) return "gradle";
  return null;
}
function inventoryComponents(inventory) {
  const result = [];
  for (const [componentRoot, markerNames] of inventory.entries()) {
    for (const family of markerFamilies(markerNames)) result.push({ root: componentRoot, family, markers: markerNames.filter((marker) => markerFamilies([marker]).includes(family)) });
  }
  return result.sort((a, b) => `${a.root}\0${a.family}`.localeCompare(`${b.root}\0${b.family}`));
}
function componentKey(componentRoot, family) { return `${componentRoot}\0${family}`; }
function pointer(object, expression) {
  if (typeof expression !== "string" || !expression.startsWith("/")) fail("JSON metric pointers must use /segment form");
  return expression.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~")).reduce((value, key) => value?.[key], object);
}
function metric(report, kind, startedMs) {
  const file = safeRelative(report.path, `${kind} report path`);
  const stat = regular(file, `${kind} report`);
  if (stat.mtimeMs < startedMs) fail(`${kind} report is stale: ${report.path}`);
  const text = fs.readFileSync(file, "utf8");
  let value;
  let total = kind === "mutation" ? NaN : 1;
  if (report.format === "json") {
    const data = JSON.parse(text);
    value = Number(pointer(data, report.pointer));
    if (kind === "mutation") total = Number(pointer(data, report.totalPointer));
  } else if (report.format === "jacoco-xml") {
    const matches = [...text.matchAll(/<counter\s+type="LINE"\s+missed="(\d+)"\s+covered="(\d+)"\s*\/?>/g)];
    if (!matches.length) fail("JaCoCo report has no LINE counter");
    const [, missed, covered] = matches.at(-1).map(Number);
    total = missed + covered; value = total ? covered * 100 / total : 100;
  } else if (report.format === "pit-xml") {
    const mutations = [...text.matchAll(/<mutation\b[^>]*detected="(true|false)"/g)];
    if (!mutations.length) fail("PIT report has no mutation records");
    total = mutations.length; value = mutations.filter((match) => match[1] === "true").length * 100 / total;
  } else fail(`Unsupported ${kind} report format: ${report.format}`);
  if (!Number.isFinite(value) || value < 0 || value > 100 || !Number.isFinite(total) || total <= 0 || (kind === "mutation" && !Number.isInteger(total))) fail(`${kind} report produced an invalid metric`);
  return { pct: value, score: value, total, path: report.path, sha256: sha(file), format: report.format };
}

if (checkFallback) {
  const inventory = discoverInventory();
  const roots = [...inventory.keys()].sort();
  const rootMarkers = inventory.get(".") || [];
  const rootFamilies = markerFamilies(rootMarkers);
  const safeFamily = rootFamilies.length === 1 && ["web", "python"].includes(rootFamilies[0]);
  if (roots.length > 0 && (roots.length !== 1 || roots[0] !== "." || !safeFamily)) {
    fail(`This repository requires docs/validation-components.json; the fallback supports only one root-level web/Node or Python build root. Discovered ${JSON.stringify(Object.fromEntries(inventory))}. Copy and adapt a VALIDATION_COMPONENTS_* example.`);
  }
  console.log(JSON.stringify({ status: "FALLBACK_COMPATIBLE", roots, markers: rootMarkers }));
  process.exit(0);
}

let config;
try { regular(safeRelative(configPath, "component config"), "component config"); config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch (error) { fail(`Cannot read component config: ${error.message}`); }
if (config.schema !== "oeos-validation-components-v1" || !Array.isArray(config.components) || !config.components.length) fail("Config must contain a non-empty oeos-validation-components-v1 component array");
const discovered = [...discover()].sort();
const inventory = discoverInventory();
const requiredComponents = inventoryComponents(inventory);
const configured = new Set();
const configuredIds = new Set();
for (const component of config.components) {
  if (!component || typeof component.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(component.id)) fail("Each component needs a stable id");
  if (configuredIds.has(component.id)) fail(`Duplicate component id: ${component.id}`);
  configuredIds.add(component.id);
  safeRelative(component.root, `components.${component.id}.root`);
  if (!["web", "node", "python", "rust", "android", "jvm", "native", "other"].includes(component.platform)) fail(`Unsupported platform for ${component.id}`);
  let family = platformFamily(component.platform);
  if (!family) {
    const candidates = requiredComponents.filter((item) => item.root === component.root).map((item) => item.family);
    if (typeof component.markerFamily === "string" && candidates.includes(component.markerFamily)) family = component.markerFamily;
    else if (candidates.length === 1) family = candidates[0];
    else fail(`${component.id} platform '${component.platform}' requires markerFamily because its root has ${candidates.length} detected toolchains`);
  }
  const key = componentKey(component.root, family);
  if (configured.has(key)) fail(`Duplicate component mapping for root '${component.root}' and ${family} toolchain`);
  configured.add(key);
  for (const name of requiredCommands) argv(component.commands?.[name], `${component.id}.commands.${name}`);
  argv(component.commands?.coverage, `${component.id}.commands.coverage`);
  argv(component.commands?.mutation, `${component.id}.commands.mutation`);
  if (component.platform === "android") {
    argv(component.commands?.instrumentedTest, `${component.id}.commands.instrumentedTest`);
    if (!/^(device|emulator)$/.test(component.interactionKind || "")) fail(`${component.id} must run Android interaction checks on a device or emulator`);
  }
  if (!component.coverageReport || !component.mutationReport) fail(`${component.id} needs coverageReport and mutationReport adapters`);
  for (const [kind, report] of [["coverage", component.coverageReport], ["mutation", component.mutationReport]]) {
    if (!report || typeof report.path !== "string" || !["json", "jacoco-xml", "pit-xml"].includes(report.format)) fail(`${component.id}.${kind}Report is invalid`);
    safeRelative(report.path, `${component.id}.${kind}Report.path`);
    safeRelative(path.posix.join(component.root === "." ? "" : component.root, report.path), `${component.id}.${kind}Report.path`);
    if (report.format === "json" && (typeof report.pointer !== "string" || !report.pointer.startsWith("/"))) fail(`${component.id}.${kind}Report.pointer must be a JSON pointer`);
    if (kind === "mutation" && report.format === "json" && (typeof report.totalPointer !== "string" || !report.totalPointer.startsWith("/"))) fail(`${component.id}.mutationReport.totalPointer is required for JSON mutation evidence`);
  }
  const coverageMinimum = Number(component.thresholds?.coverageMinimum ?? 100);
  const mutationMinimum = Number(component.thresholds?.mutationMinimum ?? 100);
  if (!Number.isFinite(coverageMinimum) || coverageMinimum < 0 || coverageMinimum > 100 || !Number.isFinite(mutationMinimum) || mutationMinimum < 0 || mutationMinimum > 100) fail(`${component.id} thresholds must be finite numbers in [0,100]`);
  if (!Array.isArray(component.releaseArtifacts) || !component.releaseArtifacts.length) fail(`${component.id} needs at least one release artifact path`);
  for (const artifact of component.releaseArtifacts) {
    safeRelative(artifact, `${component.id} release artifact`);
    safeRelative(path.posix.join(component.root === "." ? "" : component.root, artifact), `${component.id} release artifact`);
  }
}
const requiredKeys = new Set(requiredComponents.map((item) => componentKey(item.root, item.family)));
const missing = requiredComponents.filter((item) => !configured.has(componentKey(item.root, item.family)));
const unknown = [...configured].filter((item) => !requiredKeys.has(item)).map((item) => { const [componentRoot, family] = item.split("\0"); return { root: componentRoot, family }; });
if (missing.length || unknown.length) fail(`Component inventory mismatch; missing=[${missing.map((item) => item.root).join(", ")}], unknown=[${unknown.map((item) => item.root).join(", ")}], details=${JSON.stringify({ missing, unknown })}`);
if (validateOnly) { console.log(JSON.stringify({ status: "VALID", components: config.components.map(({ id, root: componentRoot, platform }) => ({ id, root: componentRoot, platform })), discovered, discoveredComponents: requiredComponents }, null, 2)); process.exit(0); }

const startedMs = Date.now();
const results = [];
for (const component of config.components) {
  const cwd = safeRelative(component.root, `${component.id}.root`);
  const commands = [...requiredCommands, "coverage", "mutation", ...(component.platform === "android" ? ["instrumentedTest"] : [])];
  const executions = [];
  for (const name of commands) {
    const command = component.commands[name];
    const run = spawnSync(command[0], command.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 10 * 1024 * 1024 });
    process.stdout.write(run.stdout || ""); process.stderr.write(run.stderr || "");
    executions.push({ capability: name, argv: command, exitCode: run.status, signal: run.signal || null });
    if (run.error || run.status !== 0) fail(`${component.id} ${name} failed`);
  }
  const coverage = metric({ ...component.coverageReport, path: path.posix.join(component.root === "." ? "" : component.root, component.coverageReport.path) }, "coverage", startedMs);
  const mutation = metric({ ...component.mutationReport, path: path.posix.join(component.root === "." ? "" : component.root, component.mutationReport.path) }, "mutation", startedMs);
  const coverageMinimum = Number(component.thresholds?.coverageMinimum ?? 100);
  const mutationMinimum = Number(component.thresholds?.mutationMinimum ?? 100);
  if (coverage.pct < coverageMinimum || mutation.score < mutationMinimum) fail(`${component.id} coverage/mutation thresholds failed`);
  const artifacts = component.releaseArtifacts.map((relative) => {
    const joined = path.posix.join(component.root === "." ? "" : component.root, relative);
    const file = safeRelative(joined, `${component.id} release artifact`); const stat = regular(file, `${component.id} release artifact`);
    if (stat.mtimeMs < startedMs) fail(`${component.id} release artifact is stale: ${joined}`);
    return { path: joined, sha256: sha(file), size: stat.size };
  });
  results.push({ id: component.id, root: component.root, platform: component.platform, interactionKind: component.interactionKind || "public-interface", executions, coverage, mutation, thresholds: { coverageMinimum, mutationMinimum }, releaseArtifacts: artifacts, passed: true });
}
const head = execText("git", ["rev-parse", "HEAD"]).trim();
const resolverPath = path.join(root, "tools", "resolve-tracker-context.cjs");
regular(resolverPath, "tracker context resolver");
const base = require(resolverPath).resolveTrackerContext().baseBranch;
const baseCommit = execText("git", ["merge-base", base, "HEAD"]).trim();
const coveragePct = Math.min(...results.map((item) => item.coverage.pct));
const mutationScore = Math.min(...results.map((item) => item.mutation.score));
const mutationTotal = results.reduce((sum, item) => sum + item.mutation.total, 0);
fs.mkdirSync(path.join(root, "logs"), { recursive: true });
fs.writeFileSync(path.join(root, "logs/component-validation.json"), JSON.stringify({ schema: "oeos-component-validation-v1", timestamp: new Date().toISOString(), headCommit: head, configPath, configSha256: sha(path.join(root, configPath)), discovered, discoveredComponents: requiredComponents, components: results, passed: true }, null, 2) + "\n");
fs.writeFileSync(path.join(root, "logs/coverage-evidence.json"), JSON.stringify({ schema: "oeos-gauntlet-evidence-v1", timestamp: new Date().toISOString(), baseCommit, headCommit: head, diffRange: { baseCommit, headCommit: head }, coverage: { pct: coveragePct, components: results.map((item) => ({ id: item.id, ...item.coverage })) }, mutation: { score: mutationScore, total: mutationTotal, components: results.map((item) => ({ id: item.id, ...item.mutation })) }, thresholds: { coverageMinimum: Math.min(...results.map((item) => item.thresholds.coverageMinimum)), mutationMinimum: Math.min(...results.map((item) => item.thresholds.mutationMinimum)) }, exclusions: [], passed: true }, null, 2) + "\n");
console.log(`[COMPONENT VALIDATION] ${results.length} component(s) passed all configured capabilities`);
