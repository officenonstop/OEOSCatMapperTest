#!/usr/bin/env bash
# ==============================================================================
# OEOS v6 — The Gauntlet Validation Suite
# Single executable entry point for multi-layer project verification.
# Invoked directly by orchestrator (oeos), developer, or CI.
# Pipe output: ./tools/run-gauntlet.sh logs/gauntlet-ph5.log
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TOTAL_LAYERS=6

log_layer() {
  echo -e "\n${BLUE}============================================================${NC}"
  echo -e "${BLUE}[GAUNTLET LAYER $1/$TOTAL_LAYERS] $2${NC}"
  echo -e "${BLUE}============================================================${NC}"
}

pass_layer() {
  echo -e "${GREEN}✔ [LAYER $1/$TOTAL_LAYERS PASSED] $2${NC}"
}

fail_layer() {
  echo -e "${RED}✘ [LAYER $1/$TOTAL_LAYERS FAILED] $2${NC}" >&2
  exit "$3"
}

resolve_base_branch() {
  if [ -n "${GAUNTLET_BASE_BRANCH:-}" ]; then
    if ! git check-ref-format --branch "$GAUNTLET_BASE_BRANCH" >/dev/null 2>&1; then
      echo "ERROR: GAUNTLET_BASE_BRANCH is not a valid branch name." >&2
      return 1
    fi
    echo "$GAUNTLET_BASE_BRANCH"
    return 0
  fi
  if [ ! -f tools/resolve-tracker-context.cjs ]; then
    echo "ERROR: tools/resolve-tracker-context.cjs is required to resolve the active tracker safely." >&2
    return 1
  fi
  node tools/resolve-tracker-context.cjs --field base
}

COMPONENT_MODE=0
if [ -f docs/validation-components.json ]; then
  log_layer "1" "Configured Component and Platform Validation"
  if [ ! -f tools/validate-components.cjs ] || [ -L tools/validate-components.cjs ]; then
    fail_layer "1" "docs/validation-components.json requires tools/validate-components.cjs" 1
  fi
  if node tools/validate-components.cjs docs/validation-components.json; then
    pass_layer "1" "All component build and test commands passed"
    pass_layer "2" "All component static/type checks passed"
    pass_layer "3" "All component lint checks passed"
    pass_layer "4" "All component coverage, mutation, interaction, and release-artifact checks passed"
    pass_layer "5" "All component dependency/security audit commands passed"
    COMPONENT_MODE=1
  else
    fail_layer "1" "Configured component/platform validation failed" 1
  fi
else
  if [ ! -f tools/validate-components.cjs ] || [ -L tools/validate-components.cjs ]; then
    fail_layer "1" "tools/validate-components.cjs is required to verify whether fallback validation is safe" 1
  fi
  if ! node tools/validate-components.cjs --check-fallback >/dev/null; then
    fail_layer "1" "Android, Gradle, Rust, nested-root, and mixed repositories require docs/validation-components.json; copy and adapt a shipped platform example" 1
  fi
fi

if [ "$COMPONENT_MODE" -eq 0 ]; then

# ------------------------------------------------------------------------------
# LAYER 1: Full Automated Test Suite
# ------------------------------------------------------------------------------
log_layer "1" "Test Suite Execution"
if [ -f package.json ]; then
  if npm test; then
    pass_layer "1" "Test suite passed"
  else
    fail_layer "1" "Test suite failed" 1
  fi
elif [ -f pyproject.toml -o -f pytest.ini -o -f setup.py ]; then
  if pytest; then
    pass_layer "1" "Pytest suite passed"
  else
    fail_layer "1" "Pytest suite failed" 1
  fi
elif [ -f Cargo.toml ]; then
  if cargo test; then
    pass_layer "1" "Cargo test suite passed"
  else
    fail_layer "1" "Cargo test suite failed" 1
  fi
else
  fail_layer "1" "No standard test runner detected. Configure Layer 1 with the project's test command." 1
fi

# ------------------------------------------------------------------------------
# LAYER 2: Static Type Checking
# ------------------------------------------------------------------------------
log_layer "2" "Static Type Checking"
if command -v npx >/dev/null 2>&1 && [ -f tsconfig.json ]; then
  if npx tsc --noEmit; then
    pass_layer "2" "Typecheck passed with 0 errors"
  else
    fail_layer "2" "Typecheck failed" 2
  fi
elif command -v mypy >/dev/null 2>&1 && [ -f mypy.ini -o -f pyproject.toml ]; then
  if mypy .; then
    pass_layer "2" "Python mypy typecheck passed"
  else
    fail_layer "2" "Python mypy typecheck failed" 2
  fi
elif [ -f Cargo.toml ]; then
  if cargo check; then
    pass_layer "2" "Cargo check passed"
  else
    fail_layer "2" "Cargo check failed" 2
  fi
else
  fail_layer "2" "No typechecker detected. Configure Layer 2 with the project's typecheck command." 2
fi

# ------------------------------------------------------------------------------
# LAYER 3: Code Style & Static Linting
# ------------------------------------------------------------------------------
log_layer "3" "Code Linting & Formatting"
if [ -f package.json ]; then
  if ! node -e 'const p = require("./package.json"); process.exit(p.scripts?.lint ? 0 : 1)'; then
    fail_layer "3" "package.json must define a lint script" 3
  fi
  if npm run lint --if-present; then
    pass_layer "3" "Linter passed with 0 errors"
  else
    fail_layer "3" "Linter detected errors or warnings" 3
  fi
elif command -v ruff >/dev/null 2>&1 && [ -f pyproject.toml -o -f ruff.toml ]; then
  if ruff check .; then
    pass_layer "3" "Ruff linter passed"
  else
    fail_layer "3" "Ruff linter detected errors" 3
  fi
elif [ -f Cargo.toml ]; then
  if cargo clippy -- -D warnings; then
    pass_layer "3" "Cargo clippy passed"
  else
    fail_layer "3" "Cargo clippy detected warnings" 3
  fi
else
  fail_layer "3" "No linter detected. Configure Layer 3 with the project's lint command." 3
fi

# ------------------------------------------------------------------------------
# LAYER 4: Changed-Line Coverage & Mutation Testing (H-03)
# ------------------------------------------------------------------------------
log_layer "4" "Changed-Line Coverage & Mutation Testing"

CUR_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || git branch --show-current 2>/dev/null || true)"
BASE_BRANCH="$(resolve_base_branch)"
if [ -z "$BASE_BRANCH" ] || (! git rev-parse --verify "$BASE_BRANCH" >/dev/null 2>&1 && ! git rev-parse --verify "origin/$BASE_BRANCH" >/dev/null 2>&1); then
  fail_layer "4" "Unable to resolve valid base branch ('$BASE_BRANCH'). Set GAUNTLET_BASE_BRANCH or record it in tracker." 4
fi

if [ -n "$CUR_BRANCH" ] && [ "$CUR_BRANCH" = "$BASE_BRANCH" ]; then
  if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    BASE_COMMIT="$(git rev-parse HEAD~1)"
  else
    BASE_COMMIT="$(git rev-parse HEAD)"
  fi
else
  BASE_COMMIT="$(git merge-base "$BASE_BRANCH" HEAD 2>/dev/null || git merge-base "origin/$BASE_BRANCH" HEAD 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || echo "")"
fi
HEAD_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo "")"
COVERAGE_MIN="${OEOS_COVERAGE_MIN:-100}"
MUTATION_MIN="${OEOS_MUTATION_MIN:-100}"
# V7-M-05: thresholds must be finite numbers in [0,100]. Blank defaults to 100.
validate_pct_threshold() {
  local v="$1" n="$2"
  if [[ ! "$v" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    fail_layer "4" "Invalid $n '$v': must be a finite number in [0,100] (got '$v')." 4
  fi
  if ! node -e 'const v=parseFloat(process.argv[1]); if(!Number.isFinite(v)||v<0||v>100) process.exit(1);' "$v"; then
    fail_layer "4" "Invalid $n '$v': must be a finite number in [0,100] (got '$v')." 4
  fi
}
validate_pct_threshold "$COVERAGE_MIN" "OEOS_COVERAGE_MIN"
validate_pct_threshold "$MUTATION_MIN" "OEOS_MUTATION_MIN"
mkdir -p logs

if [ -f package.json ]; then
  if ! node -e 'const p = require("./package.json"); process.exit(p.scripts?.["test:coverage"] ? 0 : 1)'; then
    fail_layer "4" "package.json must define test:coverage" 4
  fi
  START_TIME=$(date +%s)
  echo "  Running npm run test:coverage..."
  if ! npm run test:coverage; then
    fail_layer "4" "npm run test:coverage failed" 4
  fi

  # Validate and parse coverage report
  COV_REPORT=""
  for r in "coverage/coverage-final.json" "coverage/lcov.info" "reports/coverage/coverage-final.json" "reports/lcov.info"; do
    if [ -f "$r" ]; then
      COV_REPORT="$r"
      break
    fi
  done

  if [ -z "$COV_REPORT" ]; then
    if [ -f "coverage/coverage-summary.json" ]; then
      fail_layer "4" "Layer 4 failed: summary-only coverage reports (coverage-summary.json) lack line-level mappings and cannot prove 100% changed-line coverage. Provide coverage-final.json, lcov.info, or coverage.json." 4
    fi
    fail_layer "4" "Layer 4 failed: test:coverage completed but no machine-readable line-level report found (coverage/coverage-final.json or lcov.info). Prohibits dummy/bypass test:coverage scripts." 4
  fi

  # Check report freshness
  REPORT_MTIME=$(node -e "const fs = require('fs'); console.log(Math.floor(fs.statSync('$COV_REPORT').mtimeMs / 1000))")
  if [ "$REPORT_MTIME" -lt "$((START_TIME - 5))" ]; then
    fail_layer "4" "Layer 4 failed: Coverage report $COV_REPORT is stale (timestamp older than test run)." 4
  fi

  # Parse changed-line coverage using Node engine
  # Extract canonical changed production manifest
  if [ -f "tools/changed-manifest.cjs" ]; then
    MANIFEST_SCRIPT="tools/changed-manifest.cjs"
  else
    MANIFEST_SCRIPT="$SRC/templates/changed_manifest_template.cjs"
  fi
  MANIFEST_JSON=$(node "$MANIFEST_SCRIPT" "$BASE_COMMIT" "js" "$HEAD_COMMIT" 2>&1) || {
    fail_layer "4" "Failed to extract canonical changed production manifest: $MANIFEST_JSON" 4
  }

  COV_VERIFY_RES=$(node -e '
    const fs = require("fs");
    const path = require("path");

    const covReport = process.argv[1];
    const minPct = (() => { const v = parseFloat(process.argv[2]); if (!Number.isFinite(v) || v < 0 || v > 100) { console.error("Invalid coverage threshold: must be finite in [0,100]"); process.exit(1); } return v; })();
    const baseCommit = process.argv[3];
    const headCommit = process.argv[4];
    const manifest = JSON.parse(process.argv[5]);

    // V7-H-01: canonical repo-relative identity. Exact equality only.
    // Absolute keys are relativized only after containment proof inside the
    // repository root; traversal, outside paths and empty keys fail closed.
    function normalize(p) {
      let k = String(p).replace(/\\/g, "/").trim();
      if (k.startsWith("file://")) k = k.slice(7);
      while (k.startsWith("./")) k = k.slice(2);
      if (!k || k.includes("\0") || k.includes("\n")) {
        console.error(`Unsafe evidence path: ${JSON.stringify(String(p)).slice(0, 120)}`);
        process.exit(1);
      }
      const isAbs = k.startsWith("/") || /^[A-Za-z]:\//.test(k);
      if (isAbs) {
        const repoRoot = path.resolve(process.cwd());
        const resolved = path.resolve(k);
        const rel = path.relative(repoRoot, resolved).replace(/\\/g, "/");
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
          console.error(`Evidence path outside repository: ${k}`);
          process.exit(1);
        }
        k = rel;
      }
      k = path.posix.normalize(k);
      if (k === "." || k === "" || k.startsWith("../") || k === ".." || k.startsWith("/")) {
        console.error(`Evidence path traversal rejected: ${String(p).slice(0, 120)}`);
        process.exit(1);
      }
      if (k.startsWith("./")) k = k.slice(2);
      return k;
    }
    // V7-H-01: duplicate canonical keys (e.g. src/app.js vs ./src/app.js vs
    // absolute-inside) are ambiguous and fail closed.
    function assertNoDuplicateKeys(keys, kind) {
      const seen = new Set();
      for (const k of keys) {
        const c = normalize(k);
        if (seen.has(c)) {
          console.error(`Duplicate evidence key for ${c} in ${kind}: ambiguity rejected.`);
          process.exit(1);
        }
        seen.add(c);
      }
    }

    if (!fs.existsSync(covReport)) {
      console.error(`Coverage report file not found: ${covReport}`);
      process.exit(1);
    }
    const rawReport = fs.readFileSync(covReport, "utf8").trim();
    if (!rawReport || rawReport === "{}" || rawReport === "[]") {
      console.error(`Coverage report is empty or unpopulated: ${covReport}`);
      process.exit(1);
    }

    const productionFiles = manifest.productionFiles || [];
    const exclusions = manifest.exclusions || [];

    let totalExecutable = 0;
    let coveredExecutable = 0;
    const uncovered = [];

    if (covReport.endsWith(".json")) {
      if (covReport.endsWith("coverage-summary.json")) {
        console.error("coverage-summary.json rejected: summary-only reports lack per-file line-level mappings required to verify changed-line coverage.");
        process.exit(1);
      }
      let data;
      try {
        data = JSON.parse(rawReport);
      } catch (err) {
        console.error(`Malformed JSON coverage report: ${err.message}`);
        process.exit(1);
      }

      if (Object.keys(data).length === 0) {
        console.error("Empty coverage object rejected.");
        process.exit(1);
      }

      const fileKeys = Object.keys(data).filter(k => k !== "total");
      assertNoDuplicateKeys(fileKeys, "coverage report");
      const isCoverageFinal = fileKeys.length > 0 && data[fileKeys[0]]?.statementMap;

      if (!isCoverageFinal) {
        console.error("Unrecognized JSON coverage schema: statementMap required. Summary-only coverage reports are rejected.");
        process.exit(1);
      }

      // Verify all changed production source files exist in coverage report
      for (const pf of productionFiles) {
        const normPf = normalize(pf.path);
        const found = fileKeys.some(k => {
          const normK = normalize(k);
          return normK === normPf;
        });
        if (!found) {
          console.error(`Changed source file missing from coverage report: ${pf.path}`);
          process.exit(1);
        }
      }

      for (const pf of productionFiles) {
        const normPf = normalize(pf.path);
        const matchedKey = fileKeys.find(k => {
          const normK = normalize(k);
          return normK === normPf;
        });
        const fileEntry = data[matchedKey];
        const sMap = fileEntry.statementMap || {};
        const sCounts = fileEntry.s || {};
        const fnMap = fileEntry.fnMap || {};
        const fCounts = fileEntry.f || {};
        const linesCoveredInFile = new Map();

        for (const [sId, range] of Object.entries(sMap)) {
          const count = sCounts[sId] || 0;
          for (let l = range.start.line; l <= range.end.line; l++) {
            const prev = linesCoveredInFile.get(l) || 0;
            linesCoveredInFile.set(l, Math.max(prev, count));
          }
        }
        for (const [fId, fnObj] of Object.entries(fnMap)) {
          const count = fCounts[fId] || 0;
          const declL = fnObj.decl?.start?.line || fnObj.line || fnObj.loc?.start?.line;
          if (declL) {
            const prev = linesCoveredInFile.get(declL) || 0;
            linesCoveredInFile.set(declL, Math.max(prev, count));
          }
        }

        for (const l of pf.executableChangedLines) {
          totalExecutable++;
          if (linesCoveredInFile.has(l)) {
            if (linesCoveredInFile.get(l) > 0) {
              coveredExecutable++;
            } else {
              uncovered.push(`${normPf}:${l}`);
            }
          } else {
            uncovered.push(`${normPf}:${l} (unmapped changed executable line)`);
          }
        }
      }

      if (productionFiles.length === 0 && !baseCommit) {
        for (const filePath of fileKeys) {
          const fileEntry = data[filePath];
          const sMap = fileEntry.statementMap || {};
          const sCounts = fileEntry.s || {};
          for (const [sId, range] of Object.entries(sMap)) {
            const count = sCounts[sId] || 0;
            for (let l = range.start.line; l <= range.end.line; l++) {
              totalExecutable++;
              if (count > 0) coveredExecutable++;
              else uncovered.push(`${filePath}:${l}`);
            }
          }
        }
      }
    } else if (covReport.endsWith(".info")) {
      const lines = rawReport.split("\n");
      let currentFile = null;
      const fileLines = new Map();

      for (const line of lines) {
        if (line.startsWith("SF:")) {
          currentFile = line.slice(3).trim();
          fileLines.set(currentFile, new Map());
        } else if (line.startsWith("DA:") && currentFile) {
          const parts = line.slice(3).split(",");
          const l = parseInt(parts[0], 10);
          const c = parseInt(parts[1], 10);
          fileLines.get(currentFile).set(l, c);
        }
      }
      assertNoDuplicateKeys(Array.from(fileLines.keys()), "lcov report");

      for (const pf of productionFiles) {
        const normPf = normalize(pf.path);
        const found = Array.from(fileLines.keys()).some(k => {
          const normK = normalize(k);
          return normK === normPf;
        });
        if (!found) {
          console.error(`Changed source file missing from coverage report: ${pf.path}`);
          process.exit(1);
        }
      }

      for (const pf of productionFiles) {
        const normPf = normalize(pf.path);
        const matchedKey = Array.from(fileLines.keys()).find(k => {
          const normK = normalize(k);
          return normK === normPf;
        });
        const lineMap = fileLines.get(matchedKey) || new Map();
        for (const l of pf.executableChangedLines) {
          totalExecutable++;
          if (lineMap.has(l)) {
            if (lineMap.get(l) > 0) coveredExecutable++;
            else uncovered.push(`${normPf}:${l}`);
          } else {
            uncovered.push(`${normPf}:${l} (unmapped changed executable line)`);
          }
        }
      }
    }

    if (uncovered.length > 0) {
      console.error(`Uncovered changed line(s) detected (${uncovered.length}):\n  - ` + uncovered.slice(0, 10).join("\n  - "));
    }

    if (productionFiles.length > 0 && totalExecutable === 0) {
      console.error(`Changed production source files present (${productionFiles.map(f => f.path).join(", ")}), but 0 executable lines were evaluated in coverage report. Denominator cannot be zero.`);
      process.exit(1);
    }

    const pct = totalExecutable === 0 ? 100 : (coveredExecutable / totalExecutable) * 100;
    if (pct < minPct) {
      console.error(`Coverage (${pct.toFixed(2)}%) below required threshold (${minPct}%)`);
      process.exit(1);
    }

    console.log(JSON.stringify({
      totalExecutable,
      coveredExecutable,
      pct: parseFloat(pct.toFixed(2)),
      uncoveredCount: uncovered.length,
      uncoveredLines: uncovered.slice(0, 50),
      exclusions: exclusions
    }));
  ' "$COV_REPORT" "$COVERAGE_MIN" "$BASE_COMMIT" "$HEAD_COMMIT" "$MANIFEST_JSON") || {
    fail_layer "4" "Coverage verification failed: $COV_VERIFY_RES" 4
  }

  echo "  Coverage verified: $COV_VERIFY_RES"

  # Mutation testing
  if ! node -e 'const p = require("./package.json"); process.exit(p.scripts?.["test:mutation"] ? 0 : 1)'; then
    fail_layer "4" "package.json must define test:mutation" 4
  fi
  MUT_START_TIME=$(date +%s)
  echo "  Running npm run test:mutation..."
  if ! npm run test:mutation; then
    fail_layer "4" "npm run test:mutation failed" 4
  fi

  MUT_REPORT=""
  for m in "reports/mutation/mutation.json" "reports/mutation/stryker-report.json" "reports/mutation/mutation-report.json" "reports/mutation.json"; do
    if [ -f "$m" ]; then
      MUT_REPORT="$m"
      break
    fi
  done

  if [ -z "$MUT_REPORT" ]; then
    fail_layer "4" "Layer 4 failed: test:mutation completed but no machine-readable report found (reports/mutation/mutation.json). Prohibits dummy/bypass test:mutation scripts." 4
  fi

  MUT_REPORT_MTIME=$(node -e "const fs = require('fs'); console.log(Math.floor(fs.statSync('$MUT_REPORT').mtimeMs / 1000))")
  if [ "$MUT_REPORT_MTIME" -lt "$((MUT_START_TIME - 5))" ]; then
    fail_layer "4" "Layer 4 failed: Mutation report $MUT_REPORT is stale (timestamp older than mutation run)." 4
  fi

  MUT_VERIFY_RES=$(node -e '
    const fs = require("fs");
    const path = require("path");
    const mutReport = process.argv[1];
    const cp = require("child_process");
    const headCommit = process.argv[5] || "";
    const minScore = (() => { const v = parseFloat(process.argv[2]); if (!Number.isFinite(v) || v < 0 || v > 100) { console.error("Invalid mutation threshold: must be finite in [0,100]"); process.exit(1); } return v; })();
    const baseCommit = process.argv[3];
    const manifest = JSON.parse(process.argv[4]);

    // V7-H-01: canonical repo-relative identity. Exact equality only.
    // Absolute keys are relativized only after containment proof inside the
    // repository root; traversal, outside paths and empty keys fail closed.
    function normalize(p) {
      let k = String(p).replace(/\\/g, "/").trim();
      if (k.startsWith("file://")) k = k.slice(7);
      while (k.startsWith("./")) k = k.slice(2);
      if (!k || k.includes("\0") || k.includes("\n")) {
        console.error(`Unsafe evidence path: ${JSON.stringify(String(p)).slice(0, 120)}`);
        process.exit(1);
      }
      const isAbs = k.startsWith("/") || /^[A-Za-z]:\//.test(k);
      if (isAbs) {
        const repoRoot = path.resolve(process.cwd());
        const resolved = path.resolve(k);
        const rel = path.relative(repoRoot, resolved).replace(/\\/g, "/");
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
          console.error(`Evidence path outside repository: ${k}`);
          process.exit(1);
        }
        k = rel;
      }
      k = path.posix.normalize(k);
      if (k === "." || k === "" || k.startsWith("../") || k === ".." || k.startsWith("/")) {
        console.error(`Evidence path traversal rejected: ${String(p).slice(0, 120)}`);
        process.exit(1);
      }
      if (k.startsWith("./")) k = k.slice(2);
      return k;
    }
    // V7-H-01: duplicate canonical keys (e.g. src/app.js vs ./src/app.js vs
    // absolute-inside) are ambiguous and fail closed.
    function assertNoDuplicateKeys(keys, kind) {
      const seen = new Set();
      for (const k of keys) {
        const c = normalize(k);
        if (seen.has(c)) {
          console.error(`Duplicate evidence key for ${c} in ${kind}: ambiguity rejected.`);
          process.exit(1);
        }
        seen.add(c);
      }
    }

    if (!fs.existsSync(mutReport)) {
      console.error(`Mutation report file not found: ${mutReport}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(mutReport, "utf8").trim();
    if (!raw || raw === "{}" || raw === "[]") {
      console.error(`Empty mutation report rejected: ${mutReport}`);
      process.exit(1);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error(`Malformed JSON mutation report: ${e.message}`);
      process.exit(1);
    }

    const productionFiles = manifest.productionFiles || [];
    const waiversFile = "reports/mutation/waivers.json";
    let waivers = {};
    if (fs.existsSync(waiversFile)) {
      try {
        waivers = JSON.parse(fs.readFileSync(waiversFile, "utf8"));
      } catch (err) {
        console.error(`Malformed mutation waivers file ${waiversFile}: ${err.message}`);
        process.exit(1);
      }
    }

    // V7-H-02: location-bearing mutant schemas only. A mutant proves
    // changed-code quality only when its location intersects the files
    // executableChangedLines. Missing/malformed locations fail closed.
    function mutantChangedLines(m) {
      if (!m || typeof m !== "object") return null;
      const loc = m.location || m.mutantLocation || null;
      if (loc && typeof loc === "object") {
        const s = loc.start || null;
        const e = loc.end || null;
        const sRaw = s ? (s.line ?? s.lineno ?? s.lineNumber) : null;
        const sLine = typeof sRaw === "string" && /^\d+$/.test(sRaw) ? parseInt(sRaw, 10) : sRaw;
        if (!Number.isInteger(sLine) || sLine <= 0 || sLine > 1000000) return null;
        let eLine = sLine;
        if (e && typeof e === "object") {
          const eRaw = e.line ?? e.lineno ?? e.lineNumber;
          if (eRaw === undefined || eRaw === null) { eLine = sLine; }
          else {
            const eNum = typeof eRaw === "string" && /^\d+$/.test(eRaw) ? parseInt(eRaw, 10) : eRaw;
            if (!Number.isInteger(eNum) || eNum < sLine || eNum > 1000000) return null;
            eLine = eNum;
          }
        }
        const out = [];
        for (let l = sLine; l <= eLine; l++) out.push(l);
        return out;
      }
      for (const k of ["line", "lineno", "lineNumber", "startLine", "mutatedLine"]) {
        const v = m[k];
        if (Number.isInteger(v) && v > 0 && v <= 1000000) return [v];
        if (typeof v === "string" && /^\d+$/.test(v)) { const n = parseInt(v, 10); if (n > 0 && n <= 1000000) return [n]; }
      }
      return null;
    }
    // V7-H-05: trusted dispositions come from a protected versioned policy at
    // the evaluated commit: tracked, clean, bound to source path/hash, reason,
    // approver and approval commit. Untracked, dirty, implementation-authored,
    // stale, malformed or unauthorized entries are rejected.
    const WAIVER_PLACEHOLDER_RE = /\b(?:TODO|FIXME|TBD|WIP)\b|\[(?:\.\.\.|placeholder|unassigned)\]|^\[.*\]$/i;
    function loadTrustedDisposition(normPf, pf) {
      // Fail closed: repository-authored identity strings and ancestor SHAs do
      // not prove independent approval. Until an external signed approval
      // service is configured, zero-mutant changed code cannot be waived.
      console.error(`Zero applicable mutants intersecting changed executable lines for ${normPf}. Repository-local mutation waivers are not accepted as independent approval.`);
      return null;
      /* istanbul ignore next -- retained parser documents the rejected legacy schema */
      if (!waivers || typeof waivers !== "object" || Array.isArray(waivers)) {
        console.error(`Zero applicable mutants intersecting changed executable lines for ${normPf}. No trusted waiver policy present in ${waiversFile}.`);
        return null;
      }
      const normPairs = Object.keys(waivers).map((k) => {
        const c = normalize(k);
        if (!c || c.startsWith("../") || c === ".." || c.startsWith("/")) {
          console.error(`Unsafe waiver key rejected: ${k}`);
          process.exit(1);
        }
        return [k, c];
      });
      const seenW = new Set();
      for (const pair of normPairs) {
        if (seenW.has(pair[1])) { console.error(`Duplicate waiver entry for ${pair[1]}: ambiguity rejected.`); process.exit(1); }
        seenW.add(pair[1]);
      }
      const hit = normPairs.find((pair) => pair[1] === normPf);
      if (!hit) {
        console.error(`Zero applicable mutants intersecting changed executable lines for ${normPf}. No waiver entry for this file in ${waiversFile}.`);
        return null;
      }
      const w = waivers[hit[0]];
      if (!w || typeof w !== "object") { console.error(`Malformed waiver entry for ${normPf}: must be an object.`); return null; }
      const reason = (w.reason || "").trim();
      if (!reason || reason.length < 10 || WAIVER_PLACEHOLDER_RE.test(reason)) { console.error(`Waiver for ${normPf} requires a concrete reason (>=10 chars, no placeholders).`); return null; }
      if (!/^[0-9a-f]{64}$/i.test(w.contentSha256 || "")) { console.error(`Waiver for ${normPf} requires a 64-hex contentSha256.`); return null; }
      if ((w.contentSha256 || "").toLowerCase() !== (pf.contentSha256 || "").toLowerCase()) { console.error(`Waiver for ${normPf} is stale: contentSha256 does not match current source (source changed after approval).`); return null; }
      const approver = (w.approver || "").trim();
      if (!approver || approver.length < 2 || WAIVER_PLACEHOLDER_RE.test(approver)) { console.error(`Waiver for ${normPf} requires an independent approver (not the implementation author, no placeholders).`); return null; }
      const approvalCommit = (w.approvalCommit || "").trim();
      if (!/^[0-9a-f]{40}$/i.test(approvalCommit)) { console.error(`Waiver for ${normPf} requires a full 40-hex approvalCommit.`); return null; }
      try {
        cp.execSync("git ls-files --error-unmatch -- reports/mutation/waivers.json", { stdio: "ignore" });
      } catch (e) { console.error(`Waiver policy ${waiversFile} is untracked. Trusted dispositions must be tracked in git.`); return null; }
      try {
        cp.execSync("git diff --quiet HEAD -- reports/mutation/waivers.json", { stdio: "ignore" });
        cp.execSync("git diff --cached --quiet -- reports/mutation/waivers.json", { stdio: "ignore" });
      } catch (e) { console.error(`Waiver policy ${waiversFile} is dirty (working tree or index differs from HEAD).`); return null; }
      try {
        cp.execSync(`git rev-parse --verify ${approvalCommit}^{commit}`, { stdio: "ignore" });
        cp.execSync(`git merge-base --is-ancestor ${approvalCommit} HEAD`, { stdio: "ignore" });
      } catch (e) { console.error(`Waiver approvalCommit ${approvalCommit} for ${normPf} does not exist or is not an ancestor of HEAD.`); return null; }
      // Independence is a process property enforced at human gates via the
      // sealed approver name and approval commit below; automation guarantees
      // the binding (tracked, clean, hash-bound, ancestor-matched) so any
      // self-authored disposition is attributable in git history.
      // approvalCommit is an auditable pointer: it must exist and be an
      // ancestor of HEAD so reviewers can attribute the disposition in git
      // history. Content binding is enforced at the evaluated commit
      // (tracked, clean, hash equality above); independence of the named
      // approver is judged at human gates from the sealed evidence.
      return { file: normPf, reason, contentSha256: pf.contentSha256, approver, approvalCommit };
    }

    let killed = 0, total = 0, score = null;
    const sealedDispositions = [];

    if (productionFiles.length > 0) {
      if (!data.files || typeof data.files !== "object") {
        console.error("Aggregate mutation reports without per-file mutant mappings cannot verify changed-code mutation quality when executable source files have changed. A location-bearing mutation report schema (with a '\''files'\'' mapping) is required.");
        process.exit(1);
      }
      assertNoDuplicateKeys(Object.keys(data.files), "mutation report");
      let chKilled = 0, chTotal = 0;
      for (const pf of productionFiles) {
        const normPf = normalize(pf.path);
        const matchedKey = Object.keys(data.files).find(k => {
          const normK = normalize(k);
          return normK === normPf;
        });
        const fileEntry = matchedKey ? data.files[matchedKey] : null;
        const mutants = Array.isArray(fileEntry?.mutants) ? fileEntry.mutants : [];

        {
          const execSet = new Set(pf.executableChangedLines || []);
          let fileTotal = 0, fileKilled = 0;
          for (const m of mutants) {
            const status = m.status ?? m.state ?? m.result;
            if (typeof status !== "string" || !["Killed", "Survived", "TimedOut", "NoCoverage", "Ignored", "CompileError", "RuntimeError"].includes(status)) {
              console.error(`Unsupported mutant status for ${normPf}: ${JSON.stringify(status)}.`);
              process.exit(1);
            }
            const lines = mutantChangedLines(m);
            if (!lines) {
              console.error(`Mutant missing valid location for changed source file: ${normPf}. Location-bearing mutation reports are required.`);
              process.exit(1);
            }
            if (!lines.some((l) => execSet.has(l))) continue;
            if (status === "Ignored" || status === "CompileError" || status === "RuntimeError") continue;
            fileTotal++;
            if (status === "Killed" || status === "TimedOut") fileKilled++;
          }
          if (fileTotal > 0) {
            chTotal += fileTotal; chKilled += fileKilled;
          } else {
            const disp = loadTrustedDisposition(normPf, pf);
            if (disp) sealedDispositions.push(disp);
            else process.exit(1);
          }
        }
      }
      killed = chKilled;
      total = chTotal;
      score = total > 0 ? (killed / total) * 100 : (sealedDispositions.length > 0 ? 100 : 0);
    } else {
      if (data.files && typeof data.files === "object") {
        for (const [f, finfo] of Object.entries(data.files)) {
          if (Array.isArray(finfo.mutants)) {
            for (const m of finfo.mutants) {
              total++;
              if (m.status === "Killed" || m.status === "TimedOut") killed++;
            }
          }
        }
        score = total > 0 ? (killed / total) * 100 : 100;
      } else if (data.metrics && typeof data.metrics.mutationScore === "number") {
        score = data.metrics.mutationScore;
        killed = data.metrics.killed || 0;
        total = data.metrics.totalMutants || data.metrics.mutationScoreBasedOn || data.metrics.totalValid || (killed + (data.metrics.survived || 0));
      } else if (typeof data.mutationScore === "number") {
        score = data.mutationScore;
        killed = data.killed || 0;
        total = data.total || 0;
      } else if (typeof data.killed === "number" && typeof data.total === "number") {
        killed = data.killed;
        total = data.total;
        score = total > 0 ? (killed / total) * 100 : 0;
      } else {
        score = 100;
      }
    }

    if (score === null || isNaN(score)) {
      console.error("Mutation score could not be determined from report.");
      process.exit(1);
    }

    if (total <= 0 && sealedDispositions.length === 0) {
      console.error("Zero mutants evaluated in mutation report (total mutants must be > 0). Prohibits dummy zero-mutant reports.");
      process.exit(1);
    }

    if (score < minScore) {
      console.error(`Mutation score (${score.toFixed(2)}%) below required threshold (${minScore}%) [killed: ${killed}/${total}]`);
      process.exit(1);
    }

    console.log(JSON.stringify({ killed, total, score: parseFloat(score.toFixed(2)), dispositions: sealedDispositions }));
  ' "$MUT_REPORT" "$MUTATION_MIN" "$BASE_COMMIT" "$MANIFEST_JSON" "$HEAD_COMMIT") || {
    fail_layer "4" "Mutation verification failed: $MUT_VERIFY_RES" 4
  }

  echo "  Mutation verified: $MUT_VERIFY_RES"

  # Write sealed evidence
  node -e "
    const fs = require('fs');
    const cov = JSON.parse(process.argv[1]);
    const mut = JSON.parse(process.argv[2]);
    fs.writeFileSync('logs/coverage-evidence.json', JSON.stringify({
      schema: 'oeos-gauntlet-evidence-v1',
      timestamp: new Date().toISOString(),
      baseCommit: process.argv[3],
      headCommit: process.argv[4],
      diffRange: {
        baseCommit: process.argv[3],
        headCommit: process.argv[4]
      },
      coverage: cov,
      mutation: mut,
      thresholds: { coverageMinimum: Number(process.argv[5]), mutationMinimum: Number(process.argv[6]) },
      exclusions: cov.exclusions || [],
      passed: cov.pct >= Number(process.argv[5]) && mut.score >= Number(process.argv[6])
    }, null, 2));
  " "$COV_VERIFY_RES" "$MUT_VERIFY_RES" "$BASE_COMMIT" "$HEAD_COMMIT" "$COVERAGE_MIN" "$MUTATION_MIN"

  pass_layer "4" "Coverage (${COVERAGE_MIN}%) & mutation (${MUTATION_MIN}%) verified with machine-readable evidence"

elif command -v pytest >/dev/null 2>&1 && [ -f pyproject.toml -o -f pytest.ini -o -f setup.py ]; then
  if ! pytest --help 2>&1 | grep -q -- '--cov'; then
    fail_layer "4" "pytest-cov is required for Layer 4; configure changed-line coverage explicitly" 4
  fi
  START_TIME=$(date +%s)
  echo "  Running pytest with coverage report generation..."
  if ! pytest --cov=. --cov-report=json:coverage.json; then
    fail_layer "4" "Pytest coverage execution failed" 4
  fi
  if [ ! -f coverage.json ]; then
    fail_layer "4" "Layer 4 failed: pytest completed but coverage.json was not generated" 4
  fi
  # Extract canonical changed production manifest for Python
  if [ -f "tools/changed-manifest.cjs" ]; then
    PY_MANIFEST_SCRIPT="tools/changed-manifest.cjs"
  else
    PY_MANIFEST_SCRIPT="$SRC/templates/changed_manifest_template.cjs"
  fi
  PY_MANIFEST_JSON=$(node "$PY_MANIFEST_SCRIPT" "$BASE_COMMIT" "py" "$HEAD_COMMIT" 2>&1) || {
    fail_layer "4" "Failed to extract canonical changed Python manifest: $PY_MANIFEST_JSON" 4
  }

  # Verify changed-line coverage from coverage.json
  COV_VERIFY_RES=$(node -e '
    const fs = require("fs");
    const path = require("path");
    const raw = fs.readFileSync("coverage.json", "utf8").trim();
    if (!raw || raw === "{}") {
      console.error("Empty coverage.json rejected");
      process.exit(1);
    }
    const data = JSON.parse(raw);
    const minPct = (() => { const v = parseFloat(process.argv[1]); if (!Number.isFinite(v) || v < 0 || v > 100) { console.error("Invalid coverage threshold: must be finite in [0,100]"); process.exit(1); } return v; })();
    const baseCommit = process.argv[2];
    const headCommit = process.argv[3];
    const manifest = JSON.parse(process.argv[4]);

    // V7-H-01: canonical repo-relative identity. Exact equality only.
    // Absolute keys are relativized only after containment proof inside the
    // repository root; traversal, outside paths and empty keys fail closed.
    function normalize(p) {
      let k = String(p).replace(/\\/g, "/").trim();
      if (k.startsWith("file://")) k = k.slice(7);
      while (k.startsWith("./")) k = k.slice(2);
      if (!k || k.includes("\0") || k.includes("\n")) {
        console.error(`Unsafe evidence path: ${JSON.stringify(String(p)).slice(0, 120)}`);
        process.exit(1);
      }
      const isAbs = k.startsWith("/") || /^[A-Za-z]:\//.test(k);
      if (isAbs) {
        const repoRoot = path.resolve(process.cwd());
        const resolved = path.resolve(k);
        const rel = path.relative(repoRoot, resolved).replace(/\\/g, "/");
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
          console.error(`Evidence path outside repository: ${k}`);
          process.exit(1);
        }
        k = rel;
      }
      k = path.posix.normalize(k);
      if (k === "." || k === "" || k.startsWith("../") || k === ".." || k.startsWith("/")) {
        console.error(`Evidence path traversal rejected: ${String(p).slice(0, 120)}`);
        process.exit(1);
      }
      if (k.startsWith("./")) k = k.slice(2);
      return k;
    }
    // V7-H-01: duplicate canonical keys (e.g. src/app.js vs ./src/app.js vs
    // absolute-inside) are ambiguous and fail closed.
    function assertNoDuplicateKeys(keys, kind) {
      const seen = new Set();
      for (const k of keys) {
        const c = normalize(k);
        if (seen.has(c)) {
          console.error(`Duplicate evidence key for ${c} in ${kind}: ambiguity rejected.`);
          process.exit(1);
        }
        seen.add(c);
      }
    }

    const productionFiles = manifest.productionFiles || [];
    const exclusions = manifest.exclusions || [];
    const files = data.files || {};
    assertNoDuplicateKeys(Object.keys(files), "python coverage report");

    // Verify all changed production Python files exist in coverage report
    for (const pf of productionFiles) {
      const normPf = normalize(pf.path);
      const found = Object.keys(files).some(k => {
        const normK = normalize(k);
        return normK === normPf;
      });
      if (!found) {
        console.error(`Changed Python source file missing from coverage report: ${pf.path}`);
        process.exit(1);
      }
    }

    let tot = 0, cov = 0;
    const uncovered = [];

    for (const pf of productionFiles) {
      const normPf = normalize(pf.path);
      const matchedKey = Object.keys(files).find(k => {
        const normK = normalize(k);
        return normK === normPf;
      });
      const finfo = files[matchedKey] || {};
      const execLines = new Set(finfo.executed_lines || []);
      const missLines = new Set(finfo.missing_lines || []);

      for (const l of pf.executableChangedLines) {
        tot++;
        if (execLines.has(l)) {
          cov++;
        } else if (missLines.has(l)) {
          uncovered.push(`${normPf}:${l}`);
        } else {
          uncovered.push(`${normPf}:${l} (unmapped changed executable line)`);
        }
      }
    }

    if (productionFiles.length === 0 && !baseCommit) {
      for (const [fpath, finfo] of Object.entries(files)) {
        const execLines = new Set(finfo.executed_lines || []);
        const missLines = new Set(finfo.missing_lines || []);
        tot += (execLines.size + missLines.size);
        cov += execLines.size;
      }
    }

    if (uncovered.length > 0) {
      console.error(`Uncovered changed line(s) detected (${uncovered.length}):\n  - ` + uncovered.slice(0, 10).join("\n  - "));
    }

    if (productionFiles.length > 0 && tot === 0) {
      console.error(`Changed Python source file(s) present (${productionFiles.map(f => f.path).join(", ")}), but 0 executable lines were evaluated in coverage report. Denominator cannot be zero.`);
      process.exit(1);
    }

    const pct = tot === 0 ? 100 : (cov / tot) * 100;
    if (pct < minPct) {
      console.error(`Python coverage (${pct.toFixed(2)}%) below required threshold (${minPct}%)`);
      process.exit(1);
    }
    console.log(JSON.stringify({
      totalExecutable: tot,
      coveredExecutable: cov,
      pct: parseFloat(pct.toFixed(2)),
      uncoveredCount: uncovered.length,
      uncoveredLines: uncovered.slice(0, 50),
      exclusions: exclusions
    }));
  ' "$COVERAGE_MIN" "$BASE_COMMIT" "$HEAD_COMMIT" "$PY_MANIFEST_JSON") || {
    fail_layer "4" "Python coverage verification failed: $COV_VERIFY_RES" 4
  }
  echo "  Coverage verified: $COV_VERIFY_RES"

  if [ -z "${OEOS_MUTATION_COMMAND:-}" ] && ! command -v mutmut >/dev/null 2>&1 && ! command -v cosmic-ray >/dev/null 2>&1; then
    fail_layer "4" "A Python mutation testing command (mutmut or cosmic-ray) is required for Layer 4" 4
  fi
  if [ -z "${OEOS_MUTATION_COMMAND:-}" ]; then
    fail_layer "4" "Set OEOS_MUTATION_COMMAND to the project's mutation command" 4
  fi

  PY_MUT_START_TIME=$(date +%s)
  echo "  Running Python mutation command..."
  if ! bash -lc "$OEOS_MUTATION_COMMAND"; then
    fail_layer "4" "Python mutation testing failed" 4
  fi

  PY_MUT_REPORT=""
  for m in "${OEOS_MUTATION_REPORT:-}" "reports/mutation/mutation.json" "reports/mutation/stryker-report.json" "reports/mutation/mutation-report.json" "reports/mutation.json" "reports/mutmut.json" "mutmut-report.json" "mutation.json"; do
    if [ -n "$m" ] && [ -f "$m" ]; then
      PY_MUT_REPORT="$m"
      break
    fi
  done

  if [ -z "$PY_MUT_REPORT" ]; then
    fail_layer "4" "Python mutation command succeeded but no machine-readable report was found (reports/mutation/mutation.json or OEOS_MUTATION_REPORT). Machine-readable evidence is required." 4
  fi

  PY_MUT_MTIME=$(node -e "const fs = require('fs'); console.log(Math.floor(fs.statSync('$PY_MUT_REPORT').mtimeMs / 1000))")
  if [ "$PY_MUT_MTIME" -lt "$((PY_MUT_START_TIME - 5))" ]; then
    fail_layer "4" "Layer 4 failed: Python mutation report $PY_MUT_REPORT is stale (timestamp older than mutation run)." 4
  fi

  MUT_VERIFY_RES=$(node -e '
    const fs = require("fs");
    const path = require("path");
    const mutReport = process.argv[1];
    const cp = require("child_process");
    const headCommit = process.argv[5] || "";
    const minScore = (() => { const v = parseFloat(process.argv[2]); if (!Number.isFinite(v) || v < 0 || v > 100) { console.error("Invalid mutation threshold: must be finite in [0,100]"); process.exit(1); } return v; })();
    const baseCommit = process.argv[3];
    const manifest = JSON.parse(process.argv[4]);

    // V7-H-01: canonical repo-relative identity. Exact equality only.
    // Absolute keys are relativized only after containment proof inside the
    // repository root; traversal, outside paths and empty keys fail closed.
    function normalize(p) {
      let k = String(p).replace(/\\/g, "/").trim();
      if (k.startsWith("file://")) k = k.slice(7);
      while (k.startsWith("./")) k = k.slice(2);
      if (!k || k.includes("\0") || k.includes("\n")) {
        console.error(`Unsafe evidence path: ${JSON.stringify(String(p)).slice(0, 120)}`);
        process.exit(1);
      }
      const isAbs = k.startsWith("/") || /^[A-Za-z]:\//.test(k);
      if (isAbs) {
        const repoRoot = path.resolve(process.cwd());
        const resolved = path.resolve(k);
        const rel = path.relative(repoRoot, resolved).replace(/\\/g, "/");
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
          console.error(`Evidence path outside repository: ${k}`);
          process.exit(1);
        }
        k = rel;
      }
      k = path.posix.normalize(k);
      if (k === "." || k === "" || k.startsWith("../") || k === ".." || k.startsWith("/")) {
        console.error(`Evidence path traversal rejected: ${String(p).slice(0, 120)}`);
        process.exit(1);
      }
      if (k.startsWith("./")) k = k.slice(2);
      return k;
    }
    // V7-H-01: duplicate canonical keys (e.g. src/app.js vs ./src/app.js vs
    // absolute-inside) are ambiguous and fail closed.
    function assertNoDuplicateKeys(keys, kind) {
      const seen = new Set();
      for (const k of keys) {
        const c = normalize(k);
        if (seen.has(c)) {
          console.error(`Duplicate evidence key for ${c} in ${kind}: ambiguity rejected.`);
          process.exit(1);
        }
        seen.add(c);
      }
    }

    if (!fs.existsSync(mutReport)) {
      console.error(`Mutation report file not found: ${mutReport}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(mutReport, "utf8").trim();
    if (!raw || raw === "{}" || raw === "[]") {
      console.error(`Empty mutation report rejected: ${mutReport}`);
      process.exit(1);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error(`Malformed JSON mutation report: ${e.message}`);
      process.exit(1);
    }

    const productionFiles = manifest.productionFiles || [];
    const waiversFile = "reports/mutation/waivers.json";
    let waivers = {};
    if (fs.existsSync(waiversFile)) {
      try {
        waivers = JSON.parse(fs.readFileSync(waiversFile, "utf8"));
      } catch (err) {
        console.error(`Malformed mutation waivers file ${waiversFile}: ${err.message}`);
        process.exit(1);
      }
    }

    // V7-H-02: location-bearing mutant schemas only. A mutant proves
    // changed-code quality only when its location intersects the files
    // executableChangedLines. Missing/malformed locations fail closed.
    function mutantChangedLines(m) {
      if (!m || typeof m !== "object") return null;
      const loc = m.location || m.mutantLocation || null;
      if (loc && typeof loc === "object") {
        const s = loc.start || null;
        const e = loc.end || null;
        const sRaw = s ? (s.line ?? s.lineno ?? s.lineNumber) : null;
        const sLine = typeof sRaw === "string" && /^\d+$/.test(sRaw) ? parseInt(sRaw, 10) : sRaw;
        if (!Number.isInteger(sLine) || sLine <= 0 || sLine > 1000000) return null;
        let eLine = sLine;
        if (e && typeof e === "object") {
          const eRaw = e.line ?? e.lineno ?? e.lineNumber;
          if (eRaw === undefined || eRaw === null) { eLine = sLine; }
          else {
            const eNum = typeof eRaw === "string" && /^\d+$/.test(eRaw) ? parseInt(eRaw, 10) : eRaw;
            if (!Number.isInteger(eNum) || eNum < sLine || eNum > 1000000) return null;
            eLine = eNum;
          }
        }
        const out = [];
        for (let l = sLine; l <= eLine; l++) out.push(l);
        return out;
      }
      for (const k of ["line", "lineno", "lineNumber", "startLine", "mutatedLine"]) {
        const v = m[k];
        if (Number.isInteger(v) && v > 0 && v <= 1000000) return [v];
        if (typeof v === "string" && /^\d+$/.test(v)) { const n = parseInt(v, 10); if (n > 0 && n <= 1000000) return [n]; }
      }
      return null;
    }
    // V7-H-05: trusted dispositions come from a protected versioned policy at
    // the evaluated commit: tracked, clean, bound to source path/hash, reason,
    // approver and approval commit. Untracked, dirty, implementation-authored,
    // stale, malformed or unauthorized entries are rejected.
    const WAIVER_PLACEHOLDER_RE = /\b(?:TODO|FIXME|TBD|WIP)\b|\[(?:\.\.\.|placeholder|unassigned)\]|^\[.*\]$/i;
    function loadTrustedDisposition(normPf, pf) {
      // Fail closed: repository-authored identity strings and ancestor SHAs do
      // not prove independent approval. Until an external signed approval
      // service is configured, zero-mutant changed code cannot be waived.
      console.error(`Zero applicable mutants intersecting changed executable lines for ${normPf}. Repository-local mutation waivers are not accepted as independent approval.`);
      return null;
      /* istanbul ignore next -- retained parser documents the rejected legacy schema */
      if (!waivers || typeof waivers !== "object" || Array.isArray(waivers)) {
        console.error(`Zero applicable mutants intersecting changed executable lines for ${normPf}. No trusted waiver policy present in ${waiversFile}.`);
        return null;
      }
      const normPairs = Object.keys(waivers).map((k) => {
        const c = normalize(k);
        if (!c || c.startsWith("../") || c === ".." || c.startsWith("/")) {
          console.error(`Unsafe waiver key rejected: ${k}`);
          process.exit(1);
        }
        return [k, c];
      });
      const seenW = new Set();
      for (const pair of normPairs) {
        if (seenW.has(pair[1])) { console.error(`Duplicate waiver entry for ${pair[1]}: ambiguity rejected.`); process.exit(1); }
        seenW.add(pair[1]);
      }
      const hit = normPairs.find((pair) => pair[1] === normPf);
      if (!hit) {
        console.error(`Zero applicable mutants intersecting changed executable lines for ${normPf}. No waiver entry for this file in ${waiversFile}.`);
        return null;
      }
      const w = waivers[hit[0]];
      if (!w || typeof w !== "object") { console.error(`Malformed waiver entry for ${normPf}: must be an object.`); return null; }
      const reason = (w.reason || "").trim();
      if (!reason || reason.length < 10 || WAIVER_PLACEHOLDER_RE.test(reason)) { console.error(`Waiver for ${normPf} requires a concrete reason (>=10 chars, no placeholders).`); return null; }
      if (!/^[0-9a-f]{64}$/i.test(w.contentSha256 || "")) { console.error(`Waiver for ${normPf} requires a 64-hex contentSha256.`); return null; }
      if ((w.contentSha256 || "").toLowerCase() !== (pf.contentSha256 || "").toLowerCase()) { console.error(`Waiver for ${normPf} is stale: contentSha256 does not match current source (source changed after approval).`); return null; }
      const approver = (w.approver || "").trim();
      if (!approver || approver.length < 2 || WAIVER_PLACEHOLDER_RE.test(approver)) { console.error(`Waiver for ${normPf} requires an independent approver (not the implementation author, no placeholders).`); return null; }
      const approvalCommit = (w.approvalCommit || "").trim();
      if (!/^[0-9a-f]{40}$/i.test(approvalCommit)) { console.error(`Waiver for ${normPf} requires a full 40-hex approvalCommit.`); return null; }
      try {
        cp.execSync("git ls-files --error-unmatch -- reports/mutation/waivers.json", { stdio: "ignore" });
      } catch (e) { console.error(`Waiver policy ${waiversFile} is untracked. Trusted dispositions must be tracked in git.`); return null; }
      try {
        cp.execSync("git diff --quiet HEAD -- reports/mutation/waivers.json", { stdio: "ignore" });
        cp.execSync("git diff --cached --quiet -- reports/mutation/waivers.json", { stdio: "ignore" });
      } catch (e) { console.error(`Waiver policy ${waiversFile} is dirty (working tree or index differs from HEAD).`); return null; }
      try {
        cp.execSync(`git rev-parse --verify ${approvalCommit}^{commit}`, { stdio: "ignore" });
        cp.execSync(`git merge-base --is-ancestor ${approvalCommit} HEAD`, { stdio: "ignore" });
      } catch (e) { console.error(`Waiver approvalCommit ${approvalCommit} for ${normPf} does not exist or is not an ancestor of HEAD.`); return null; }
      // Independence is a process property enforced at human gates via the
      // sealed approver name and approval commit below; automation guarantees
      // the binding (tracked, clean, hash-bound, ancestor-matched) so any
      // self-authored disposition is attributable in git history.
      // approvalCommit is an auditable pointer: it must exist and be an
      // ancestor of HEAD so reviewers can attribute the disposition in git
      // history. Content binding is enforced at the evaluated commit
      // (tracked, clean, hash equality above); independence of the named
      // approver is judged at human gates from the sealed evidence.
      return { file: normPf, reason, contentSha256: pf.contentSha256, approver, approvalCommit };
    }

    let killed = 0, total = 0, score = null;
    const sealedDispositions = [];

    if (productionFiles.length > 0) {
      if (!data.files || typeof data.files !== "object") {
        console.error("Aggregate mutation reports without per-file mutant mappings cannot verify changed-code mutation quality when executable source files have changed. A location-bearing mutation report schema (with a '\''files'\'' mapping) is required.");
        process.exit(1);
      }
      assertNoDuplicateKeys(Object.keys(data.files), "mutation report");
      let chKilled = 0, chTotal = 0;
      for (const pf of productionFiles) {
        const normPf = normalize(pf.path);
        const matchedKey = Object.keys(data.files).find(k => {
          const normK = normalize(k);
          return normK === normPf;
        });
        const fileEntry = matchedKey ? data.files[matchedKey] : null;
        const mutants = Array.isArray(fileEntry?.mutants) ? fileEntry.mutants : [];

        {
          const execSet = new Set(pf.executableChangedLines || []);
          let fileTotal = 0, fileKilled = 0;
          for (const m of mutants) {
            const status = m.status ?? m.state ?? m.result;
            if (typeof status !== "string" || !["Killed", "Survived", "TimedOut", "NoCoverage", "Ignored", "CompileError", "RuntimeError"].includes(status)) {
              console.error(`Unsupported mutant status for ${normPf}: ${JSON.stringify(status)}.`);
              process.exit(1);
            }
            const lines = mutantChangedLines(m);
            if (!lines) {
              console.error(`Mutant missing valid location for changed source file: ${normPf}. Location-bearing mutation reports are required.`);
              process.exit(1);
            }
            if (!lines.some((l) => execSet.has(l))) continue;
            if (status === "Ignored" || status === "CompileError" || status === "RuntimeError") continue;
            fileTotal++;
            if (status === "Killed" || status === "TimedOut") fileKilled++;
          }
          if (fileTotal > 0) {
            chTotal += fileTotal; chKilled += fileKilled;
          } else {
            const disp = loadTrustedDisposition(normPf, pf);
            if (disp) sealedDispositions.push(disp);
            else process.exit(1);
          }
        }
      }
      killed = chKilled;
      total = chTotal;
      score = total > 0 ? (killed / total) * 100 : (sealedDispositions.length > 0 ? 100 : 0);
    } else {
      if (data.files && typeof data.files === "object") {
        for (const [f, finfo] of Object.entries(data.files)) {
          if (Array.isArray(finfo.mutants)) {
            for (const m of finfo.mutants) {
              total++;
              if (m.status === "Killed" || m.status === "TimedOut") killed++;
            }
          }
        }
        score = total > 0 ? (killed / total) * 100 : 100;
      } else if (data.metrics && typeof data.metrics.mutationScore === "number") {
        score = data.metrics.mutationScore;
        killed = data.metrics.killed || 0;
        total = data.metrics.totalMutants || (killed + (data.metrics.survived || 0));
      } else if (typeof data.mutationScore === "number") {
        score = data.mutationScore;
        killed = data.killed || 0;
        total = data.total || 0;
      } else {
        score = 100;
      }
    }

    if (score === null || isNaN(score)) {
      console.error("Mutation score could not be determined from report.");
      process.exit(1);
    }

    if (total <= 0 && sealedDispositions.length === 0) {
      console.error("Zero mutants evaluated in mutation report (total mutants must be > 0). Prohibits dummy zero-mutant reports.");
      process.exit(1);
    }

    if (score < minScore) {
      console.error(`Mutation score (${score.toFixed(2)}%) below required threshold (${minScore}%) [killed: ${killed}/${total}]`);
      process.exit(1);
    }

    console.log(JSON.stringify({ killed, total, score: parseFloat(score.toFixed(2)), dispositions: sealedDispositions }));
  ' "$PY_MUT_REPORT" "$MUTATION_MIN" "$BASE_COMMIT" "$PY_MANIFEST_JSON" "$HEAD_COMMIT") || {
    fail_layer "4" "Python mutation verification failed: $MUT_VERIFY_RES" 4
  }

  echo "  Mutation verified: $MUT_VERIFY_RES"

  # Record sealed evidence
  node -e "
    const fs = require('fs');
    const cov = JSON.parse(process.argv[1]);
    const mut = JSON.parse(process.argv[2]);
    fs.writeFileSync('logs/coverage-evidence.json', JSON.stringify({
      schema: 'oeos-gauntlet-evidence-v1',
      timestamp: new Date().toISOString(),
      baseCommit: process.argv[3],
      headCommit: process.argv[4],
      diffRange: {
        baseCommit: process.argv[3],
        headCommit: process.argv[4]
      },
      coverage: cov,
      mutation: mut,
      thresholds: { coverageMinimum: Number(process.argv[5]), mutationMinimum: Number(process.argv[6]) },
      exclusions: cov.exclusions || [],
      passed: cov.pct >= Number(process.argv[5]) && mut.score >= Number(process.argv[6])
    }, null, 2));
  " "$COV_VERIFY_RES" "$MUT_VERIFY_RES" "$BASE_COMMIT" "$HEAD_COMMIT" "$COVERAGE_MIN" "$MUTATION_MIN"

  pass_layer "4" "Python coverage threshold and mutation verification passed"
else
  fail_layer "4" "No coverage and mutation tooling detected. Configure Layer 4 before release." 4
fi

# ------------------------------------------------------------------------------
# LAYER 5: Dependency & Supply Chain Security
# ------------------------------------------------------------------------------
log_layer "5" "Dependency & Supply Chain Audit"
if [ -f package-lock.json ]; then
  if npm audit --audit-level=moderate; then
    pass_layer "5" "Zero moderate/high/critical npm vulnerabilities"
  else
    fail_layer "5" "Moderate, high, or critical vulnerabilities detected in npm dependencies" 5
  fi
elif [ -f requirements.txt -o -f pyproject.toml ] && command -v pip-audit >/dev/null 2>&1; then
  if pip-audit; then
    pass_layer "5" "Zero python package vulnerabilities"
  else
    fail_layer "5" "Python package vulnerabilities detected" 5
  fi
elif [ -f Cargo.lock ] && command -v cargo-audit >/dev/null 2>&1; then
  if cargo audit; then
    pass_layer "5" "Zero cargo package vulnerabilities"
  else
    fail_layer "5" "Cargo package vulnerabilities detected" 5
  fi
else
  fail_layer "5" "No dependency audit available. Install the project audit tool and provide a lockfile." 5
fi
fi

# ------------------------------------------------------------------------------
# LAYER 6: Secret & Credential Scanning (Branch & Staged)
# ------------------------------------------------------------------------------
log_layer "6" "Secret & Credential Scan (gitleaks)"
if command -v gitleaks >/dev/null 2>&1; then
  BASE_BRANCH="$(resolve_base_branch)"
  if [ -z "$BASE_BRANCH" ] || (! git rev-parse --verify "$BASE_BRANCH" >/dev/null 2>&1 && ! git rev-parse --verify "origin/$BASE_BRANCH" >/dev/null 2>&1); then
    fail_layer "6" "Base branch '$BASE_BRANCH' is unavailable; refusing to downgrade to a working-tree-only scan" 6
  fi
  echo "  Scanning git commits against $BASE_BRANCH..."
  if ! gitleaks detect --source . --log-opts="$BASE_BRANCH..HEAD" --verbose; then
    fail_layer "6" "Gitleaks detected hardcoded secrets in branch commits" 6
  fi

  # Also inspect staged changes if any exist
  if ! git diff --cached --quiet 2>/dev/null; then
    echo "  Scanning staged changes..."
    if ! gitleaks protect --staged --verbose; then
      fail_layer "6" "Gitleaks detected hardcoded secrets in staged files" 6
    fi
  fi
  pass_layer "6" "Gitleaks detected 0 secrets"
else
  fail_layer "6" "Gitleaks is required for Layer 6. Install it before release." 6
fi

echo -e "\n${GREEN}============================================================${NC}"
echo -e "${GREEN}✔ GAUNTLET VERIFICATION COMPLETE — ALL ACTIVE LAYERS GREEN${NC}"
echo -e "${GREEN}============================================================${NC}"
exit 0
