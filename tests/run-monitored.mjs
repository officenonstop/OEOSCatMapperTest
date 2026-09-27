#!/usr/bin/env node
/**
 * Monitored Playwright test runner — guarantees tests pass/fail, never hang.
 *
 * Usage:
 *   node tests/run-monitored.mjs [playwright args...]
 *   npm run test:monitored -- [playwright args...]
 *
 * Behaviour:
 *   - Spawns playwright, streams every line to stdout.
 *   - Detects test‑run completion (reads "N passed / N failed" from output).
 *   - After completion, waits at most 60 s for graceful shutdown, then kills tree.
 *   - If NO line appears for 120 s mid‑run, force‑kills (detected hang).
 *   - Reports totals and writes full log to test-run.log.
 *   - Exit code 1 on any failure or timeout.
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { writeFileSync } from "node:fs";

const LOG_FILE = "test-run.log";
const IDLE_TIMEOUT_S = 120;
const SHUTDOWN_GRACE_S = 60;
const npxCmd = platform() === "win32" ? "npx.cmd" : "npx";

const args = [
  "playwright",
  "test",
  "--project=chromium",
  "--reporter=list",
  ...process.argv.slice(2),
];

console.log(`[runner] ${npxCmd} ${args.join(" ")}`);
console.log(`[runner] idle timeout = ${IDLE_TIMEOUT_S}s, shutdown grace = ${SHUTDOWN_GRACE_S}s`);

const child = spawn(npxCmd, args, {
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env },
});

let lastActivity = Date.now();
let timer = null;
let testsDone = false;
const outputLog = [];

function killTree(pid) {
  if (platform() === "win32") {
    spawn("taskkill", ["/F", "/T", "/PID", String(pid ?? child.pid ?? "")], { stdio: "ignore", shell: true });
  } else {
    try { child.kill("SIGKILL"); } catch {}
  }
  // Fallback: kill all node
  setTimeout(() => {
    if (platform() === "win32") {
      spawn("taskkill", ["/F", "/IM", "node.exe"], { stdio: "ignore", shell: true });
    }
  }, 5000);
}

function finalize(wasHung) {
  if (timer) clearTimeout(timer);
  timer = null;

  const full = outputLog.join("");
  const passed = (full.match(/^\s*✓/gm) || []).length;
  const failed = (full.match(/^\s*✘/gm) || []).length;
  const skipped = (full.match(/^\s*\-/gm) || []).length;
  const match = full.match(/(\d+)\s+passed/);
  const matchedPassed = match ? parseInt(match[1], 10) : passed;

  console.log("\n--- Runner Summary ---");
  console.log(`  passed:  ${matchedPassed}`);
  console.log(`  failed:  ${failed}`);
  console.log(`  skipped: ${skipped}`);
  if (wasHung) console.log(`  ⚠ HUNG — force-killed after idle timeout.`);
  console.log(`  log:     ${LOG_FILE}`);

  try { writeFileSync(LOG_FILE, full); } catch {}

  process.exit(wasHung || failed > 0 ? 1 : 0);
}

function onOutput(text) {
  process.stdout.write(text);
  outputLog.push(text);
  lastActivity = Date.now();

  // Detect test-run completion
  if (!testsDone && /\d+\s+passed/.test(text) && /\d+\s+failed/.test(text)) {
    testsDone = true;
    console.log("[runner] test run complete — waiting for graceful shutdown...");
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.log("[runner] shutdown timed out – killing process tree.");
      try { killTree(child.pid); } catch {}
    }, SHUTDOWN_GRACE_S * 1000);
    return; // don't reset the timer — we're in shutdown mode
  }

  if (!testsDone) {
    // Reset idle watch
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const idleSec = Math.round((Date.now() - lastActivity) / 1000);
      console.error(`\n[runner] HUNG — no output for ${idleSec}s. Force-killing...`);
      try { killTree(child.pid); } catch {}
    }, IDLE_TIMEOUT_S * 1000);
  }
}

child.stdout?.on("data", (chunk) => onOutput(chunk.toString()));
child.stderr?.on("data", (chunk) => onOutput(chunk.toString()));

child.on("close", (code, signal) => {
  const wasKilled = signal === "SIGTERM" || signal === "SIGKILL"
    || (testsDone && Date.now() - lastActivity > IDLE_TIMEOUT_S * 500);
  finalize(wasKilled && !testsDone);
});

// Initial idle watcher
if (timer) clearTimeout(timer);
timer = setTimeout(() => {
  console.error(`\n[runner] HUNG — no output at all for ${IDLE_TIMEOUT_S}s.`);
  try { killTree(child.pid); } catch {}
}, IDLE_TIMEOUT_S * 1000);
