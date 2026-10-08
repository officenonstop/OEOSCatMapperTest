#!/usr/bin/env node
/**
 * OEOS Canonical Changed Production Manifest Extractor
 * Provides unified, NUL-safe diff extraction and production classification
 * for JS/TS coverage, Python coverage, JS/TS mutation, and Python mutation.
 *
 * Trust invariants (V7):
 * - H-06/M-04: single shared executable/declaration extension table used by
 *   manifest, coverage, mutation, EOL probes and tests. Includes
 *   js/mjs/cjs/jsx/ts/tsx/mts/cts and declaration d.ts/d.mts/d.cts.
 *   Language-aware executable classification (JS/TS vs Python).
 * - M-09: directives are recognized only from real standalone comments proven
 *   by a minimal lexer tracking block comments, strings and template literals.
 *   Directives inside template literals, strings or block-comment bodies are
 *   never honored. A file whose every executable changed line is excluded
 *   fails closed (requires a separately reviewed disposition, never
 *   self-certified 100%).
 * - M-02: new/modified directives are validated against the current diff;
 *   unchanged historic bindings outside the current diff are preserved and
 *   never block unrelated later edits. A historic binding whose target
 *   changes is revalidated (resealed) as a new directive.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");

function execFileText(file, args) {
  try { return cp.execFileSync(file, args, { encoding: "utf8" }); }
  catch (err) {
    // Some constrained runners report a post-spawn EPERM even though the
    // child completed successfully; retain the successful, complete stdout.
    if (err && err.status === 0 && err.stdout !== undefined) return Buffer.isBuffer(err.stdout) ? err.stdout.toString("utf8") : String(err.stdout);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Shared language manifest (H-06). Single source of truth for every consumer.
// ---------------------------------------------------------------------------
const EXECUTABLE_JS_EXTS = ["js", "mjs", "cjs", "jsx", "ts", "tsx", "mts", "cts"];
const DECLARATION_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"];

function getFileExt(normPath) {
  const base = path.basename(normPath).toLowerCase();
  const idx = base.lastIndexOf(".");
  if (idx < 0) return "";
  return base.slice(idx + 1);
}

function normalizePath(p) {
  return path.normalize(p).replace(/\\/g, "/").replace(/^\.\//, "");
}

function isTestPath(normPath, lang) {
  const parts = normPath.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i].toLowerCase();
    if (p === "test" || p === "tests" || p === "__tests__" || p.startsWith("test_") || p.startsWith("tests_") || p.endsWith("_test") || p.endsWith("_tests")) {
      return true;
    }
  }
  const base = parts[parts.length - 1].toLowerCase();
  if (base.includes(".test.") || base.includes(".spec.")) return true;
  if (base.startsWith("test.") || base.startsWith("spec.")) return true;
  if (base.startsWith("test_") || base.startsWith("tests_")) return true;
  if (base.includes("_test.") || base.includes("_spec.")) return true;
  if (lang === "py") {
    if (base.startsWith("test_") || base.endsWith("_test.py") || base === "conftest.py") {
      return true;
    }
  }
  return false;
}

function isProductionExtension(normPath, lang) {
  const lower = normPath.toLowerCase();
  // Declaration files are never production-executable (handled separately).
  for (const suffix of DECLARATION_SUFFIXES) {
    if (lower.endsWith(suffix)) return false;
  }
  if (lang === "js" || lang === "ts") {
    const ext = getFileExt(normPath);
    return EXECUTABLE_JS_EXTS.includes(ext);
  } else if (lang === "py") {
    return lower.endsWith(".py");
  }
  return false;
}

function isDeclarationOnly(normPath, lang) {
  const lower = normPath.toLowerCase();
  if (lang === "js" || lang === "ts") {
    for (const suffix of DECLARATION_SUFFIXES) {
      if (lower.endsWith(suffix)) return true;
    }
    // Legacy single-suffix check preserved.
    if (lower.endsWith(".d.ts")) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Language-aware executable classification (V7-M-04).
// Conservative: unknown constructs stay executable (fail closed).
// ---------------------------------------------------------------------------
function isExecutableLineJsTs(lineText, fileExt, erasedDeclarationLine = false) {
  if (lineText === undefined) return false;
  const trimmed = lineText.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
  if (/^[\{\}\(\)\[\];,]+$/.test(trimmed)) return false;
  if (/^(else|try|finally|do)\s*\{?$/.test(trimmed)) return false;
  // Dynamic and side-effect imports execute module initialization.
  if (/^import\s*\(/.test(trimmed)) return true;
  if (/^import\s+["']/.test(trimmed)) return true;
  // Function and class declarations create runtime bindings. Istanbul also
  // maps function declaration lines through fnMap, so retaining them makes an
  // uncalled new API fail coverage instead of disappearing from the manifest.
  if (/^(?:export\s+)?(?:interface|type)\s+[\w$]+/.test(trimmed)) return false;

  const isTs = ["ts", "tsx", "mts", "cts"].includes((fileExt || "").toLowerCase());
  if (isTs) {
    // Interfaces and type aliases erase at compile time. Enums, namespaces,
    // and decorators can emit/execute runtime JavaScript and stay executable.
    if (/^(?:export\s+)?interface\b/.test(trimmed)) return false;
    if (/^(?:export\s+)?type\s+[\w$]+\s*[=<]/.test(trimmed)) return false;
    if (/^@[\w$]/.test(trimmed)) return true;
    // A property-shaped line is erased only when the file-level structural
    // scanner proved that it belongs to an interface or object type. At top
    // level or inside a runtime object it is executable. Ambiguous syntax is
    // deliberately retained in verification scope.
    if (erasedDeclarationLine && /^[\w$]+\s*\??:\s*[^=(){};]+;?\s*$/.test(trimmed)) return false;
  }
  return true;
}

// Mark lines that are unambiguously inside an erased TypeScript interface or
// object-type declaration. This is intentionally a small structural lexer, not
// a permissive line regex: when it cannot prove erased context it returns
// false, which keeps the line in coverage and mutation scope.
function computeTsErasedDeclarationMask(allLines, fileExt) {
  const mask = new Array(allLines.length).fill(false);
  if (!["ts", "tsx", "mts", "cts"].includes(String(fileExt || "").toLowerCase())) return mask;

  let blockComment = false;
  let quote = null;
  let escaped = false;
  let braceDepth = 0;
  const erasedDepths = [];
  let pendingErased = false;

  function structuralText(line) {
    let out = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i], next = line[i + 1] || "";
      if (blockComment) {
        if (ch === "*" && next === "/") { blockComment = false; i++; }
        out += " ";
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        out += " ";
        continue;
      }
      if (ch === "/" && next === "*") { blockComment = true; out += "  "; i++; continue; }
      if (ch === "/" && next === "/") break;
      if (ch === "'" || ch === '"' || ch === "`") { quote = ch; out += " "; continue; }
      out += ch;
    }
    // Ordinary quote state does not span source lines. Template literals can,
    // but treating their following text as ambiguous/executable is safer.
    if (quote !== "`") quote = null;
    escaped = false;
    return out;
  }

  for (let index = 0; index < allLines.length; index++) {
    const code = structuralText(allLines[index]);
    const trimmed = code.trim();
    const insideErased = erasedDepths.length > 0;
    const startsInterface = /^(?:export\s+)?(?:declare\s+)?interface\b/.test(trimmed);
    const startsObjectType = /^(?:export\s+)?(?:declare\s+)?type\s+[\w$]+(?:\s*<[^;=]+>)?\s*=/.test(trimmed);
    if (startsInterface || startsObjectType) pendingErased = true;
    if (insideErased || pendingErased || /^(?:export\s+)?(?:declare\s+)?(?:interface|type)\b/.test(trimmed)) mask[index] = true;

    for (const ch of code) {
      if (ch === "{") {
        braceDepth++;
        if (pendingErased) { erasedDepths.push(braceDepth); pendingErased = false; }
      } else if (ch === "}") {
        if (erasedDepths.at(-1) === braceDepth) erasedDepths.pop();
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }
    if (pendingErased && /;\s*$/.test(trimmed) && !trimmed.includes("{")) pendingErased = false;
  }
  return mask;
}

function isExecutableLinePy(lineText) {
  if (lineText === undefined) return false;
  const trimmed = lineText.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return false;
  // Triple-quoted docstring delimiters and single-line docstrings.
  if (trimmed.startsWith('"""') || trimmed.startsWith("'''") || trimmed === '"""' || trimmed === "'''") return false;
  if (/^[\{\}\(\)\[\];,]+$/.test(trimmed)) return false;
  // Imports, definitions, decorators and structural statements execute at
  // module/function runtime. Conservatively include them in the denominator.
  return true;
}

// Comment/string-aware Python executable mask. This deliberately favors false
// positives over false negatives: only whitespace/comments, standalone string
// literals (including docstrings), and their payload lines are excluded.
function computePyExecutableMask(allLines) {
  const executable = new Array(allLines.length).fill(false);
  let triple = null;
  let tripleRuntime = false;
  function findUnescaped(text, delimiter, start) {
    let at = start;
    while ((at = text.indexOf(delimiter, at)) >= 0) {
      let slashes = 0;
      for (let j = at - 1; j >= 0 && text[j] === "\\"; j--) slashes++;
      if (slashes % 2 === 0) return at;
      at += delimiter.length;
    }
    return -1;
  }
  for (let li = 0; li < allLines.length; li++) {
    const line = allLines[li];
    let i = 0;
    let hasCode = false;
    while (i < line.length) {
      if (triple) {
        if (tripleRuntime) hasCode = true;
        const end = findUnescaped(line, triple, i);
        if (end < 0) { i = line.length; break; }
        i = end + 3;
        triple = null;
        tripleRuntime = false;
        continue;
      }
      if (/\s/.test(line[i])) { i++; continue; }
      if (line[i] === "#") break;

      const sm = line.slice(i).match(/^([rRuUbBfF]{0,2})("""|'''|"|')/);
      if (sm) {
        const prefix = sm[1];
        const delimiter = sm[2];
        // f-strings may evaluate expressions even when otherwise standalone.
        if (/[fF]/.test(prefix)) hasCode = true;
        i += sm[0].length;
        if (delimiter.length === 3) {
          const end = findUnescaped(line, delimiter, i);
          if (end < 0) { triple = delimiter; tripleRuntime = /[fF]/.test(prefix); i = line.length; break; }
          i = end + 3;
          continue;
        }
        while (i < line.length) {
          if (line[i] === "\\") { i += 2; continue; }
          if (line[i] === delimiter) { i++; break; }
          i++;
        }
        continue;
      }

      if (!/^[\{\}\(\)\[\];,]$/.test(line[i])) hasCode = true;
      i++;
    }
    executable[li] = hasCode;
  }
  return executable;
}

function isExecutableLine(lineText, fileExtOrLang) {
  const key = (fileExtOrLang || "").toLowerCase();
  if (key === "py" || key === "python") return isExecutableLinePy(lineText);
  if (key === "js" || key === "javascript") return isExecutableLineJsTs(lineText, "js");
  if (key === "ts" || key === "typescript") return isExecutableLineJsTs(lineText, "ts");
  // File-extension form (preferred): route Python vs JS/TS explicitly.
  if (key === "py") return isExecutableLinePy(lineText);
  if (["js", "mjs", "cjs", "jsx", "ts", "tsx", "mts", "cts"].includes(key)) {
    return isExecutableLineJsTs(lineText, key);
  }
  // Fallback preserves historic single-regex behavior for unknown callers,
  // minus the Python-docstring hole (docstrings are never executable).
  const trimmed = (lineText || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
  if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) return false;
  if (/^[\{\}\(\)\[\];,]+$/.test(trimmed)) return false;
  if (/^(else|try|finally|do)\s*\{?$/.test(trimmed)) return false;
  if (/^(?:export\s+)?(?:interface|type)\s+[\w$]+/.test(trimmed)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Minimal lexer for directive authenticity (V7 M-09).
// Recognizes a directive only when its leading `//` (JS/TS) or `#` (Python)
// is a real standalone comment: not inside a string, template literal, or
// block/triple-quoted comment. `${}` interpolation inside templates is
// treated as string content (fail-closed: a valid directive hidden inside an
// interpolation is ignored rather than honored as a bypass).
// ---------------------------------------------------------------------------
function computeJsLineCommentAuth(allLines) {
  // Returns boolean[]: true when the line's leading `//` (if any) is authentic.
  const authentic = new Array(allLines.length).fill(true);
  let inBlock = false;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  for (let li = 0; li < allLines.length; li++) {
    const line = allLines[li];
    let i = 0;
    let lineHasRealLineCommentStart = false;
    // Find first non-whitespace index for leading-comment analysis.
    let firstNonWs = -1;
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (ch !== " " && ch !== "\t" && ch !== "\r") { firstNonWs = k; break; }
    }
    while (i < line.length) {
      const ch = line[i];
      const nxt = i + 1 < line.length ? line[i + 1] : "";
      if (inBlock) {
        if (ch === "*" && nxt === "/") { inBlock = false; i += 2; continue; }
        // If this line's leading `//` falls inside a block comment, inauthentic.
        if (firstNonWs >= 0 && i === firstNonWs && ch === "/" && nxt === "/") {
          authentic[li] = false;
        }
        i++;
        continue;
      }
      if (inSingle) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === "'") inSingle = false;
        if (firstNonWs >= 0 && i === firstNonWs) authentic[li] = false;
        i++;
        continue;
      }
      if (inDouble) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === '"') inDouble = false;
        if (firstNonWs >= 0 && i === firstNonWs) authentic[li] = false;
        i++;
        continue;
      }
      if (inTemplate) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === "`") inTemplate = false;
        if (firstNonWs >= 0 && i === firstNonWs) authentic[li] = false;
        i++;
        continue;
      }
      // Code mode.
      if (ch === "/" && nxt === "*") { inBlock = true; i += 2; continue; }
      if (ch === "/" && nxt === "/") {
        lineHasRealLineCommentStart = (firstNonWs === i);
        break; // Rest of line is comment.
      }
      if (ch === "'") { inSingle = true; i++; continue; }
      if (ch === '"') { inDouble = true; i++; continue; }
      if (ch === "`") { inTemplate = true; i++; continue; }
      i++;
    }
    // A line starting inside a template/block/single/double string whose first
    // non-whitespace is not code is inauthentic for directive purposes when we
    // entered the line already inside such a construct and never saw code.
    if ((inBlock || inSingle || inDouble || inTemplate) && firstNonWs >= 0) {
      // If we never broke on a real `//` at firstNonWs, the leading token is
      // string/block content, not a standalone comment.
      if (!lineHasRealLineCommentStart) {
        // Check whether the line's leading chars were consumed as string/block:
        // authentic stays true only for genuine code lines; directive lines
        // beginning with `//` inside strings were already marked false above.
        // For lines like `dangerousOperation();` inside a template, keep the
        // executable heuristic (conservative) - authenticity only gates
        // directive recognition, not executability.
      }
    }
    // Single/double line comments do not span lines; block/template persist.
    inSingle = false;
    inDouble = false;
  }
  return authentic;
}

function computePyLineCommentAuth(allLines) {
  const authentic = new Array(allLines.length).fill(true);
  let inTripleSingle = false;
  let inTripleDouble = false;
  let inSingle = false;
  let inDouble = false;
  for (let li = 0; li < allLines.length; li++) {
    const line = allLines[li];
    let firstNonWs = -1;
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (ch !== " " && ch !== "\t" && ch !== "\r") { firstNonWs = k; break; }
    }
    let i = 0;
    let foundRealHash = false;
    while (i < line.length) {
      const ch = line[i];
      const nxt = i + 1 < line.length ? line[i + 1] : "";
      const nxt2 = i + 2 < line.length ? line[i + 2] : "";
      if (inTripleSingle) {
        if (ch === "'" && nxt === "'" && nxt2 === "'") { inTripleSingle = false; i += 3; continue; }
        if (firstNonWs >= 0 && i === firstNonWs) authentic[li] = false;
        i++;
        continue;
      }
      if (inTripleDouble) {
        if (ch === '"' && nxt === '"' && nxt2 === '"') { inTripleDouble = false; i += 3; continue; }
        if (firstNonWs >= 0 && i === firstNonWs) authentic[li] = false;
        i++;
        continue;
      }
      if (inSingle) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === "'") inSingle = false;
        i++;
        continue;
      }
      if (inDouble) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === '"') inDouble = false;
        i++;
        continue;
      }
      if (ch === "'" && nxt === "'" && nxt2 === "'") { inTripleSingle = true; i += 3; continue; }
      if (ch === '"' && nxt === '"' && nxt2 === '"') { inTripleDouble = true; i += 3; continue; }
      if (ch === "'") { inSingle = true; i++; continue; }
      if (ch === '"') { inDouble = true; i++; continue; }
      if (ch === "#") {
        foundRealHash = (firstNonWs === i);
        break;
      }
      i++;
    }
    if ((inTripleSingle || inTripleDouble || inSingle || inDouble) && !foundRealHash && firstNonWs >= 0) {
      // Entered the line inside a string and never found a real `#`: leading
      // content is string payload, not a comment. Directive lines starting
      // with `#` inside docstrings were handled above per-character; ensure
      // they stay inauthentic.
      if (line.trim().startsWith("#") && (inTripleSingle || inTripleDouble)) {
        authentic[li] = false;
      }
    }
    inSingle = false;
    inDouble = false;
  }
  return authentic;
}

function extractManifest(baseCommit, lang, headCommit = "HEAD") {
  let rawNames = "";
  try {
    const args = ["diff", "-z", "--name-only", "--diff-filter=ACMR"];
    if (baseCommit) {
      args.push(baseCommit, headCommit);
    } else {
      args.push("HEAD");
    }
    rawNames = execFileText("git", args);
  } catch (err) {
    console.error(`Git diff extraction failed: ${err.message}`);
    process.exit(1);
  }

  const fileList = rawNames.split("\0").filter(Boolean);
  const productionFiles = [];
  const nonExecutableFiles = [];
  const testFiles = [];
  const exclusions = [];

  const directivePattern = (lang === "py")
    ? /^#\s*gauntlet-exclude-next-line:\s*(\S.*?)$/
    : /^\/\/\s*gauntlet-exclude-next-line:\s*(\S.*?)$/;

  for (const rawFile of fileList) {
    const normFile = normalizePath(rawFile);

    if (!fs.existsSync(normFile) || !fs.statSync(normFile).isFile()) {
      continue; // Deleted or not a regular file
    }

    if (isTestPath(normFile, lang)) {
      testFiles.push(normFile);
      continue;
    }

    if (isDeclarationOnly(normFile, lang)) {
      nonExecutableFiles.push({
        path: normFile,
        reason: "declaration file (.d.ts/.d.mts/.d.cts)",
        isExecutable: false
      });
      continue;
    }

    if (!isProductionExtension(normFile, lang)) {
      continue;
    }

    const rawContent = fs.readFileSync(normFile, "utf8");
    const contentSha256 = crypto.createHash("sha256").update(rawContent).digest("hex");
    const allLines = rawContent.split("\n");
    const fileExt = getFileExt(normFile);

    // Extract changed lines using git diff -U0 --diff-filter=ACMR
    const changedLines = new Set();
    try {
      const diffArgs = ["diff", "-U0", "--diff-filter=ACMR"];
      if (baseCommit) {
        diffArgs.push(baseCommit, headCommit);
      } else {
        diffArgs.push("HEAD");
      }
      diffArgs.push("--", normFile);
      const diffText = execFileText("git", diffArgs);
      for (const line of diffText.split("\n")) {
        if (line.startsWith("@@ ")) {
          const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
          if (m) {
            const start = parseInt(m[1], 10);
            const count = m[2] !== undefined ? parseInt(m[2], 10) : 1;
            for (let i = 0; i < count; i++) {
              changedLines.add(start + i);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Git diff extraction failed for ${normFile}: ${err.message}`);
      process.exit(1);
    }

    // Directive authenticity per line (M-09 lexer).
    const authLines = (lang === "py")
      ? computePyLineCommentAuth(allLines)
      : computeJsLineCommentAuth(allLines);

    const pyExecutable = lang === "py" ? computePyExecutableMask(allLines) : null;
    const tsErased = lang === "py" ? null : computeTsErasedDeclarationMask(allLines, fileExt);

    function isExecForFile(lineText, lineIdx1) {
      if (lang === "py") {
        return pyExecutable[lineIdx1 - 1] && isExecutableLinePy(lineText);
      }
      return isExecutableLineJsTs(lineText, fileExt, Boolean(tsErased?.[lineIdx1 - 1]));
    }

    // Directives scan (authentic standalone comments only).
    const fileDirectives = [];
    const excludedTargets = new Set();

    for (let i = 0; i < allLines.length; i++) {
      const lineText = allLines[i];
      const trimmed = lineText.trim();
      const looksLikeComment = trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*");
      if (!looksLikeComment) continue;
      // Lexer gate (M-09): ignore comment-looking payload inside strings,
      // template literals and block/triple-quoted bodies.
      if (!authLines[i]) continue;
      if (trimmed.includes("gauntlet-exclude")) {
        const m = trimmed.match(directivePattern);
        if (!m || !m[1].trim()) {
          console.error(`ERROR: Invalid gauntlet-exclude directive syntax on ${normFile}:${i + 1}. Directive must be a standalone comment on its own line: // gauntlet-exclude-next-line: <concrete reason> (or # for Python). Line: "${trimmed}"`);
          process.exit(1);
        }
        const reason = m[1].trim();
        const targetLine = i + 2; // 1-indexed next line
        fileDirectives.push({ directiveLine: i + 1, targetLine, reason });
      }
    }

    // Validate directives (M-02 historic preservation + strict new checks).
    for (const d of fileDirectives) {
      const directiveIsChanged = changedLines.has(d.directiveLine);
      const targetIsChanged = d.targetLine <= allLines.length && changedLines.has(d.targetLine);
      // Historic binding outside the current diff: both directive and target
      // are untouched by this diff. Preserve without blocking unrelated edits.
      if (!directiveIsChanged && !targetIsChanged) {
        continue;
      }
      if (d.targetLine > allLines.length) {
        console.error(`ERROR: gauntlet-exclude-next-line at ${normFile}:${d.directiveLine} targets non-existent line ${d.targetLine}`);
        process.exit(1);
      }
      if (!changedLines.has(d.targetLine)) {
        console.error(`ERROR: Unused gauntlet-exclude-next-line directive at ${normFile}:${d.directiveLine} targeting unchanged line ${d.targetLine}`);
        process.exit(1);
      }
      const targetText = allLines[d.targetLine - 1];
      if (!isExecForFile(targetText, d.targetLine)) {
        console.error(`ERROR: gauntlet-exclude-next-line at ${normFile}:${d.directiveLine} targets non-executable line ${d.targetLine}: "${targetText.trim()}"`);
        process.exit(1);
      }
      if (excludedTargets.has(d.targetLine)) {
        console.error(`ERROR: Duplicate gauntlet-exclude-next-line directive targeting line ${d.targetLine} in ${normFile}`);
        process.exit(1);
      }
      excludedTargets.add(d.targetLine);
      exclusions.push({
        file: normFile,
        directiveLine: d.directiveLine,
        targetLine: d.targetLine,
        reason: d.reason,
        baseSha: baseCommit,
        headSha: headCommit
      });
    }

    // Determine executable changed lines (pre-exclusion count for M-09).
    const preExclusionExecutable = [];
    for (const l of changedLines) {
      const lineText = allLines[l - 1];
      if (lineText === undefined) continue;
      if (isExecForFile(lineText, l)) {
        preExclusionExecutable.push(l);
      }
    }
    const executableChangedLines = preExclusionExecutable.filter((l) => !excludedTargets.has(l));

    // M-09: excluding every executable changed line self-certifies 100% and
    // unlocks the aggregate-mutation path. Fail closed instead.
    if (preExclusionExecutable.length > 0 && executableChangedLines.length === 0) {
      console.error(`ERROR: All executable changed lines in ${normFile} are excluded by gauntlet-exclude directives. Excluding 100% of changed executable code self-certifies coverage and unlocks aggregate mutation evidence. Add tests for the changed code or obtain a separately reviewed disposition; blanket self-exclusion is prohibited.`);
      process.exit(1);
    }

    if (executableChangedLines.length > 0) {
      productionFiles.push({
        path: normFile,
        changedLines: Array.from(changedLines).sort((a, b) => a - b),
        executableChangedLines: executableChangedLines.sort((a, b) => a - b),
        isExecutable: true,
        contentSha256
      });
    } else {
      nonExecutableFiles.push({
        path: normFile,
        changedLines: Array.from(changedLines).sort((a, b) => a - b),
        executableChangedLines: [],
        isExecutable: false,
        contentSha256,
        reason: "No changed executable lines (declarations or comments only)"
      });
    }
  }

  return {
    productionFiles,
    nonExecutableFiles,
    testFiles,
    exclusions
  };
}

if (require.main === module) {
  const baseCommit = process.argv[2] || "";
  const lang = process.argv[3] || "js";
  const headCommit = process.argv[4] || "HEAD";
  const manifest = extractManifest(baseCommit, lang, headCommit);
  console.log(JSON.stringify(manifest, null, 2));
}

module.exports = {
  extractManifest,
  normalizePath,
  isTestPath,
  isProductionExtension,
  isDeclarationOnly,
  isExecutableLine,
  isExecutableLineJsTs,
  isExecutableLinePy,
  computePyExecutableMask,
  computeTsErasedDeclarationMask,
  getFileExt,
  EXECUTABLE_JS_EXTS,
  DECLARATION_SUFFIXES
};
