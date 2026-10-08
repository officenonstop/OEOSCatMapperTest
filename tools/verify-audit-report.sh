#!/usr/bin/env bash
# OEOS Milestone Audit Report Verifier and Registration Control (G14)
# Used in production by Gate 14 and directly by test harnesses.
#
# Trust invariants (V7):
# - H-04/M-10 G14-only boundary: --register binds the report only (boundary
#   report path/hash plus receipt). It never advances last-audit.sha.
#   Only an explicit post-G14 --approve transaction revalidates pack, report,
#   HEAD, ancestry and the expected prior boundary, then advances atomically
#   once. Rejection/reassembly, drift, stale boundary, concurrency/repeat and
#   skipped ranges all fail closed.
# - H-09 exact set: the manifested and actual pack member sets are compared
#   one-for-one (portable Node, no sha256sum); extra/missing/duplicate/unsafe/
#   non-regular/symlink members are rejected. Exempt boundary metadata
#   (MANIFEST.sha256, boundary.json) is protected by equivalent outer
#   integrity (regular-file, non-symlink, hash-bound).
# - M-06 canonical report: exactly one strict metadata block; duplicates and
#   contradictions are rejected; verdict/count consistency is enforced
#   (zero Critical/High/Medium for an approvable PASS verdict).
# - M-03 concern schema: one strict row schema (Concern | Disposition |
#   Owner | Fixed By | Human Initials). Registration requires concern,
#   disposition, owner and ISO fix-by; G14 verification/approval additionally
#   requires human initials. Prose, missing/extra fields, duplicates, invalid
#   dates and template rows are rejected.
set -euo pipefail

REGISTER_MODE=false
APPROVE_MODE=false
REPORT_PATH=""
AUDIT_DIR="docs/reviews/opus-audit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --register)
      REGISTER_MODE=true
      shift
      ;;
    --approve)
      APPROVE_MODE=true
      shift
      ;;
    *)
      if [[ -z "$REPORT_PATH" && ( -f "$1" || "$1" == *.md ) ]]; then
        REPORT_PATH="$1"
      elif [[ -d "$1" || "$1" == */* ]]; then
        AUDIT_DIR="$1"
      elif [[ -z "$REPORT_PATH" ]]; then
        REPORT_PATH="$1"
      else
        AUDIT_DIR="$1"
      fi
      shift
      ;;
  esac
done

if [[ "$REGISTER_MODE" == "true" && "$APPROVE_MODE" == "true" ]]; then
  echo "ERROR: --register and --approve are mutually exclusive." >&2
  exit 1
fi
MODE="verify"
if [[ "$REGISTER_MODE" == "true" ]]; then MODE="register"; fi
if [[ "$APPROVE_MODE" == "true" ]]; then MODE="approve"; fi

node - "$AUDIT_DIR" <<'NODE'
const fs=require("fs"),path=require("path"),value=process.argv[2],root=fs.realpathSync(".");
if(!value||path.isAbsolute(value)||value.includes("\\")||path.posix.normalize(value)!==value||value===".."||value.startsWith("../")){console.error("ERROR: audit directory must be a canonical repository-relative path");process.exit(1)}
let cur=root;for(const part of value.split("/")){cur=path.join(cur,part);let st;try{st=fs.lstatSync(cur)}catch(e){console.error("ERROR: audit directory does not exist: "+value);process.exit(1)}if(st.isSymbolicLink()||!st.isDirectory()){console.error("ERROR: audit directory contains a symlink or non-directory: "+value);process.exit(1)}}
NODE

PACK_DIR="$AUDIT_DIR/pack"
BOUNDARY_FILE="$PACK_DIR/boundary.json"
BOUNDARY_HASH_FILE="$PACK_DIR/boundary.sha256"
MANIFEST_FILE="$PACK_DIR/MANIFEST.sha256"
LAST_AUDIT_FILE="$AUDIT_DIR/last-audit.sha"
RECEIPT_FILE="$AUDIT_DIR/audit-receipt.json"

if [[ ! -f "$BOUNDARY_FILE" || ! -f "$BOUNDARY_HASH_FILE" ]]; then
  echo "ERROR: Milestone boundary file $BOUNDARY_FILE is missing. Re-assemble pack before verification." >&2
  exit 1
fi
if [[ ! -f "$MANIFEST_FILE" ]]; then
  echo "ERROR: Milestone pack manifest $MANIFEST_FILE is missing." >&2
  exit 1
fi
# H-09 outer integrity for exempt metadata: regular files, never symlinks.
if [[ -L "$BOUNDARY_FILE" || -L "$BOUNDARY_HASH_FILE" ]]; then
  echo "ERROR: Boundary metadata $BOUNDARY_FILE is a symlink (rejected)." >&2
  exit 1
fi
if [[ -L "$MANIFEST_FILE" ]]; then
  echo "ERROR: Pack manifest $MANIFEST_FILE is a symlink (rejected)." >&2
  exit 1
fi
if [[ ! -f "$BOUNDARY_FILE" || ! -f "$MANIFEST_FILE" ]]; then
  echo "ERROR: Boundary metadata must be regular files." >&2
  exit 1
fi

# 2. Execute authoritative Node validation of boundary and audit report
node -e '
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");
  const cp = require("child_process");
  function git(args, encoding = null) {
    try { return cp.execFileSync("git", args, { encoding, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (err) {
      if (err && err.status === 0 && err.stdout !== undefined) {
        if (encoding) return Buffer.isBuffer(err.stdout) ? err.stdout.toString(encoding) : String(err.stdout);
        return Buffer.isBuffer(err.stdout) ? err.stdout : Buffer.from(String(err.stdout));
      }
      throw err;
    }
  }

  const boundaryFile = process.argv[1];
  const manifestFile = process.argv[2];
  const passedReport = process.argv[3] || "";
  const mode = process.argv[4] || "verify";
  const registerMode = mode === "register";
  const approveMode = mode === "approve";
  const lastAuditFile = process.argv[5];
  const receiptFile = process.argv[6];
  const packDir = path.dirname(boundaryFile);

  const boundaryHashFile = process.argv[7];
  const b = JSON.parse(fs.readFileSync(boundaryFile, "utf8"));
  const boundaryHash = crypto.createHash("sha256").update(fs.readFileSync(boundaryFile)).digest("hex");
  const sealedBoundaryHash = fs.readFileSync(boundaryHashFile,"utf8").trim();
  if (!/^[0-9a-f]{64}$/.test(sealedBoundaryHash) || boundaryHash !== sealedBoundaryHash) {
    console.error("ERROR: boundary.json outer hash mismatch"); process.exit(1);
  }
  if (b.schema !== "oeos-audit-boundary-v1" || !/^[0-9a-f]{64}$/.test(b.featureDiffSha256 || "")) {
    console.error("ERROR: Invalid audit boundary schema/diff binding"); process.exit(1);
  }
  if (!b.fromSha || !/^[0-9a-f]{40}$/i.test(b.fromSha)) {
    console.error("ERROR: Missing or invalid fromSha in boundary.json");
    process.exit(1);
  }
  if (!b.toSha || !/^[0-9a-f]{40}$/i.test(b.toSha)) {
    console.error("ERROR: Missing or invalid toSha in boundary.json");
    process.exit(1);
  }
  if (!b.packManifestSha256 || !/^[0-9a-f]{64}$/i.test(b.packManifestSha256)) {
    console.error("ERROR: Missing or invalid packManifestSha256 in boundary.json");
    process.exit(1);
  }

  // Verify fromSha and toSha in git
  try {
    git(["rev-parse","--verify",`${b.fromSha}^{commit}`]);
    git(["rev-parse","--verify",`${b.toSha}^{commit}`]);
  } catch (e) {
    console.error("ERROR: fromSha or toSha commit does not exist in git history");
    process.exit(1);
  }

  // Verify ancestry relationship
  try {
    git(["merge-base","--is-ancestor",b.fromSha,b.toSha]);
  } catch (e) {
    console.error("ERROR: fromSha is not an ancestor of toSha");
    process.exit(1);
  }

  // Verify HEAD matches toSha
  const headSha = git(["rev-parse","HEAD"], "utf8").trim();
  if (headSha !== b.toSha) {
    console.error(`ERROR: Repository HEAD (${headSha}) has drifted from audited boundary To SHA (${b.toSha}). Drift detected.`);
    process.exit(1);
  }
  const expectedDiff = git(["diff", `${b.fromSha}..${b.toSha}`]);
  const packedDiff = fs.readFileSync(path.join(packDir,"feature.diff"));
  const diffHash = crypto.createHash("sha256").update(packedDiff).digest("hex");
  if (!expectedDiff.equals(packedDiff) || diffHash !== b.featureDiffSha256) {
    console.error("ERROR: feature.diff does not exactly match the declared audit boundary"); process.exit(1);
  }

  // H-09: exact pack-set verification (portable, no sha256sum). The
  // manifested set and the actual directory set must match one-for-one:
  // extra, missing, duplicate, unsafe, non-regular and symlink members fail.
  function walkPack(dir, base, out) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(base, full).replace(/\\/g, "/");
      if (rel === "MANIFEST.sha256" || rel === "boundary.json" || rel === "boundary.sha256") continue;
      let st;
      try { st = fs.lstatSync(full); } catch (err) { console.error(`ERROR: Cannot inspect pack member: ${rel}`); process.exit(1); }
      if (st.isSymbolicLink()) { console.error(`ERROR: Pack member is a symlink (rejected, unmanifested injection surface): ${rel}`); process.exit(1); }
      if (st.isDirectory()) { walkPack(full, base, out); continue; }
      if (!st.isFile()) { console.error(`ERROR: Pack member is not a regular file (rejected): ${rel}`); process.exit(1); }
      if (!rel || rel.startsWith("/") || rel.startsWith("../") || rel.indexOf("\0") >= 0) { console.error(`ERROR: Unsafe pack member name (rejected): ${JSON.stringify(rel)}`); process.exit(1); }
      out.push(rel);
    }
  }
  const manifestRaw = fs.readFileSync(manifestFile, "utf8");
  const manifested = new Map();
  for (const rawLine of manifestRaw.split("\n")) {
    if (!rawLine.trim()) continue;
    const m = rawLine.match(/^([0-9a-f]{64})[ \t][ \t*](".*")$/i);
    if (!m) { console.error(`ERROR: Malformed MANIFEST.sha256 line (rejected): ${rawLine.slice(0, 80)}`); process.exit(1); }
    let rel; try { rel=JSON.parse(m[2]); } catch(e) { console.error("ERROR: malformed JSON-encoded manifest path"); process.exit(1); }
    if(typeof rel!=="string") { console.error("ERROR: manifest path must decode to a string"); process.exit(1); }
    if (!rel || rel.startsWith("/") || rel.startsWith("../") || rel === "MANIFEST.sha256" || rel === "boundary.json" || rel === "boundary.sha256") { console.error(`ERROR: Unsafe manifested member (rejected): ${JSON.stringify(rel)}`); process.exit(1); }
    if (manifested.has(rel)) { console.error(`ERROR: Duplicate manifested member (rejected): ${rel}`); process.exit(1); }
    manifested.set(rel, m[1].toLowerCase());
  }
  const actual = [];
  walkPack(packDir, packDir, actual);
  const actualSet = new Set(actual);
  if (actualSet.size !== actual.length) { console.error("ERROR: Duplicate actual pack member paths detected."); process.exit(1); }
  for (const rel of actual) {
    if (!manifested.has(rel)) { console.error(`ERROR: Unmanifested pack member (injection rejected): ${rel}. Listed hashes do not prove an exact directory set.`); process.exit(1); }
  }
  for (const rel of manifested.keys()) {
    if (!actualSet.has(rel)) { console.error(`ERROR: Manifested pack member missing from directory (deletion rejected): ${rel}`); process.exit(1); }
  }
  for (const entry of manifested.entries()) {
    const rel = entry[0];
    const hex = entry[1];
    const full = path.join(packDir, rel);
    let st;
    try { st = fs.lstatSync(full); } catch (err) { console.error(`ERROR: Cannot inspect pack member: ${rel}`); process.exit(1); }
    if (st.isSymbolicLink() || !st.isFile()) { console.error(`ERROR: Pack member is not a regular file at verification: ${rel}`); process.exit(1); }
    const real = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    if (real.toLowerCase() !== hex) { console.error(`ERROR: Pack manifest checksum verification failed for ${rel}: recorded ${hex} vs actual ${real}`); process.exit(1); }
  }

  // Verify pack manifest hash against boundary.json
  const realManifestHash = crypto.createHash("sha256").update(fs.readFileSync(manifestFile)).digest("hex");
  if (realManifestHash.toLowerCase() !== b.packManifestSha256.toLowerCase()) {
    console.error(`ERROR: Pack manifest checksum verification failed: recorded ${b.packManifestSha256} vs actual ${realManifestHash}`);
    process.exit(2);
  }

  let registeredReceipt = null;
  if (fs.existsSync(receiptFile)) {
    const rs=fs.lstatSync(receiptFile);
    if (!rs.isFile() || rs.isSymbolicLink()) { console.error("ERROR: audit receipt must be a regular non-symlink file"); process.exit(3); }
    try { registeredReceipt=JSON.parse(fs.readFileSync(receiptFile,"utf8")); } catch(e) { console.error("ERROR: malformed audit receipt"); process.exit(3); }
  }
  if (approveMode && !registeredReceipt) { console.error("ERROR: --approve requires a prior --register receipt"); process.exit(3); }
  // Registration is the only operation that chooses a report. Approval must
  // consume that exact registered path/hash, never an unregistered substitute.
  const reportPath = approveMode ? registeredReceipt.reportPath : (passedReport || registeredReceipt?.reportPath || "");
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error(`ERROR: Audit report does not exist: ${reportPath || "none"}. Pass report path or register report first.`);
    process.exit(3);
  }
  const auditRoot=fs.realpathSync(path.dirname(packDir));
  const reportAbs=path.resolve(reportPath);
  let reportStat,reportReal;
  try{reportStat=fs.lstatSync(reportPath);reportReal=fs.realpathSync(reportPath);}catch(e){console.error("ERROR: cannot inspect audit report");process.exit(3);}
  if(!reportStat.isFile()||reportStat.isSymbolicLink()||reportReal!==reportAbs||(reportReal!==auditRoot&&!reportReal.startsWith(auditRoot+path.sep))){console.error("ERROR: audit report must be a regular non-symlink file inside the audit directory");process.exit(3);}
  if (approveMode && passedReport && path.resolve(passedReport) !== path.resolve(registeredReceipt.reportPath)) {
    console.error(`ERROR: Passed report path (${passedReport}) does not match registered report (${registeredReceipt.reportPath})`);
    process.exit(3);
  }

  const realReportHash = crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex");
  if (registeredReceipt && !registerMode && realReportHash !== registeredReceipt.reportSha256) {
    console.error(`ERROR: Registered audit report hash mismatch: recorded ${registeredReceipt.reportSha256} vs actual ${realReportHash}`);
    process.exit(3);
  }

  const reportContent = fs.readFileSync(reportPath, "utf8");
  if (/USAGE INSTRUCTIONS:/i.test(reportContent) || /^\s*-\s*\[\s\]\s+/m.test(reportContent) || /\[(?:[^\]\n]*(?:placeholder|unassigned|name\/version|final-auditor|fromsha|tosha|packmanifest|git diff summary|details if any concerns|issue|what to do|when|fix description|concern|owner|initials at g14|actionable recommendation|yyyy-mm-dd|f-01)[^\]\n]*)\](?!\()/i.test(reportContent)) {
    console.error("ERROR: Audit report contains unfinished template instructions, checkboxes, or placeholders.");
    process.exit(4);
  }

  // M-06: exactly one canonical metadata block. Duplicates and
  // contradictions are rejected; verdict/count consistency is enforced.
  function countMatches(re) {
    const m = reportContent.match(re);
    return m ? m.length : 0;
  }
  const fromCount = countMatches(/\*\*Boundary From SHA:\*\*/gi);
  const toCount = countMatches(/\*\*Boundary To SHA:\*\*/gi);
  const manifestCount = countMatches(/\*\*Pack Manifest SHA-256:\*\*/gi);
  const verdictCount = countMatches(/\*\*Verdict:\*\*/gi);
  const severityLabels=["Critical Findings","High Findings","Medium Findings","Low Findings"];
  const severityCount=severityLabels.map(label=>countMatches(new RegExp(`\\*\\*${label}:\\*\\*`,"gi")));
  if (fromCount !== 1 || toCount !== 1 || manifestCount !== 1 || verdictCount !== 1 || severityCount.some(n=>n!==1)) {
    console.error(`ERROR: Audit report must contain exactly one canonical metadata block including mandatory Critical/High/Medium/Low counts. Duplicates or missing headers are rejected.`);
    process.exit(4);
  }
  const fromMatch = reportContent.match(/\*\*Boundary From SHA:\*\*\s*([0-9a-fA-F]+)/);
  const toMatch = reportContent.match(/\*\*Boundary To SHA:\*\*\s*([0-9a-fA-F]+)/);
  const manifestMatch = reportContent.match(/\*\*Pack Manifest SHA-256:\*\*\s*([0-9a-fA-F]+)/);

  if (!fromMatch || !/^[0-9a-f]{40}$/i.test(fromMatch[1]) || fromMatch[1].toLowerCase() !== b.fromSha.toLowerCase()) {
    console.error(`ERROR: Audit report Boundary From SHA mismatch: ${fromMatch ? fromMatch[1] : "missing"} vs ${b.fromSha}`);
    process.exit(4);
  }
  if (!toMatch || !/^[0-9a-f]{40}$/i.test(toMatch[1]) || toMatch[1].toLowerCase() !== b.toSha.toLowerCase()) {
    console.error(`ERROR: Audit report Boundary To SHA mismatch: ${toMatch ? toMatch[1] : "missing"} vs ${b.toSha}`);
    process.exit(5);
  }
  if (!manifestMatch || !/^[0-9a-f]{64}$/i.test(manifestMatch[1]) || manifestMatch[1].toLowerCase() !== b.packManifestSha256.toLowerCase()) {
    console.error(`ERROR: Audit report Pack Manifest SHA-256 mismatch: ${manifestMatch ? manifestMatch[1] : "missing"} vs ${b.packManifestSha256}`);
    process.exit(6);
  }
  const headerSlice = reportContent.slice(0, reportContent.indexOf("## "));
  if (/\[(?:\.\.\.|placeholder|unassigned)\]|^\[.*\]$/im.test(headerSlice) || /\bYYYY-MM-DD\b/.test(headerSlice) || /\bTODO\b|\bFIXME\b|\bTBD\b/.test(headerSlice)) {
    console.error("ERROR: Audit report header contains placeholder text (rejected).");
    process.exit(7);
  }

  // Parse exact verdict (single canonical block already enforced).
  const verdictMatch = reportContent.match(/\*\*Verdict:\*\*\s*([A-Za-z\s]+?)(?:\r?\n|$)/);
  if (!verdictMatch) {
    console.error("ERROR: Audit report missing **Verdict:** header");
    process.exit(7);
  }
  const rawVerdict = verdictMatch[1].trim();

  // Allowed verdicts: exact PASS or exact PASS WITH CONCERNS
  if (rawVerdict !== "PASS" && rawVerdict !== "PASS WITH CONCERNS") {
    console.error("ERROR: Verdict must be \x27PASS\x27 or \x27PASS WITH CONCERNS\x27. Found: " + rawVerdict);
    process.exit(8);
  }
  if (approveMode && rawVerdict !== "PASS") {
    console.error("ERROR: G14 approval requires PASS with zero open Critical/High/Medium findings; PASS WITH CONCERNS remains blocking.");
    process.exit(8);
  }
  const counts={};
  for(const label of severityLabels){const m=reportContent.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(\\d+)\\s*$`,"im"));if(!m){console.error(`ERROR: invalid ${label} count`);process.exit(8)}counts[label.split(" ")[0].toLowerCase()]=Number(m[1]);}
  if(counts.critical!==0||counts.high!==0||(rawVerdict==="PASS"&&counts.medium!==0)){
    console.error(`ERROR: ${rawVerdict} is inconsistent with C/H/M counts ${counts.critical}/${counts.high}/${counts.medium}`);process.exit(8);
  }
  // Findings outside the canonical metadata cannot contradict a passing
  // verdict. Canonical count lines are removed before this conservative scan.
  const prose=reportContent.replace(/^\*\*(?:Critical|High|Medium|Low) Findings:\*\*.*$/gim,"");
  if(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:Critical|High|Medium)(?:\s+Finding)?(?:\*\*)?\s*:/im.test(prose)){
    console.error("ERROR: severity finding appears outside the canonical findings metadata");process.exit(8);
  }
  for(const line of prose.split(/\r?\n/)){
    if(/^\s*(?:[-*]\s+|\d+\.\s+)(?:\*\*)?(Critical|High|Medium)\b/i.test(line)){
      console.error("ERROR: severity finding appears outside the canonical findings metadata");process.exit(8);
    }
    if(line.trim().startsWith("|")&&!/^\|[\s:\-|]+\|?\s*$/.test(line.trim())){
      const cells=line.split("|").map(x=>x.trim().replace(/^\*\*|\*\*$/g,"").toLowerCase());
      for(const sev of ["critical","high","medium"]){if(cells.includes(sev)&&counts[sev]===0){console.error(`ERROR: table declares ${sev} while canonical count is zero`);process.exit(8)}}
    }
  }

  // M-06 verdict/count consistency: passing verdicts require zero
  // Critical/High/Medium, from explicit counters when present and from the
  // Technical Debt table severity column.
  (function checkPassConsistency() {
    const critRe = /\*\*Critical(?: Findings)?:\*\*\s*(\d+)/;
    const highRe = /\*\*High(?: Findings)?:\*\*\s*(\d+)/;
    const cm = reportContent.match(critRe);
    if (cm && parseInt(cm[1], 10) > 0) {
      console.error(`ERROR: Report declares ${cm[1]} Critical findings but verdict is ${rawVerdict}. PASS requires zero Critical/High/Medium.`);
      process.exit(8);
    }
    const hm = reportContent.match(highRe);
    if (hm && parseInt(hm[1], 10) > 0) {
      console.error(`ERROR: Report declares ${hm[1]} High findings but verdict is ${rawVerdict}. PASS requires zero Critical/High/Medium.`);
      process.exit(8);
    }
    const debtIdx = reportContent.search(/## Technical Debt/i);
    if (debtIdx >= 0) {
      const nextH2 = reportContent.indexOf("\n## ", debtIdx + 1);
      const debtSlice = nextH2 >= 0 ? reportContent.slice(debtIdx, nextH2) : reportContent.slice(debtIdx);
      for (const line of debtSlice.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("|")) continue;
        if (/^\|\s*Item\s*\|/i.test(t) || /^\|[\s:\-|]+\|?\s*$/.test(t)) continue;
        const rawCells = t.split("|").map((c) => c.trim());
        if (rawCells.length && rawCells[0] === "") rawCells.shift();
        if (rawCells.length && rawCells[rawCells.length - 1] === "") rawCells.pop();
        if (rawCells.length >= 2) {
          const sev = (rawCells[1] || "").toLowerCase();
          if (sev === "critical" || sev === "high" || (sev === "medium" && rawVerdict === "PASS")) {
            console.error(`ERROR: Technical Debt lists a ${rawCells[1]} item but verdict is ${rawVerdict}. PASS requires zero Critical/High/Medium.`);
            process.exit(8);
          }
        }
      }
    }
  })();

  // M-03: one strict concern row schema across template/agent/verifier:
  // | Concern | Disposition | Owner | Fixed By (date) | Human Initials |
  // Registration requires concern, disposition, owner and ISO fix-by date.
  // Verification and approval (G14) additionally require human initials.
  // Prose, missing/extra fields, duplicates, invalid dates and template rows
  // are rejected.
  if (rawVerdict === "PASS WITH CONCERNS") {
    const concernsSectionMatch = reportContent.match(/(?:## PASS WITH CONCERNS Dispositions|### Concerns and Dispositions)[\s\S]*?(?=\n## |$)/i);
    if (!concernsSectionMatch) {
      console.error("ERROR: Verdict is PASS WITH CONCERNS but Concerns and Dispositions section is missing");
      process.exit(9);
    }
    const sectionText = concernsSectionMatch[0];
    const tableLines = sectionText.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
    if (tableLines.length < 3) {
      console.error("ERROR: PASS WITH CONCERNS requires a strict markdown table (header + separator + at least one data row with Concern | Disposition | Owner | Fixed By | Human Initials). Prose dispositions are rejected.");
      process.exit(10);
    }
    const headerCells = tableLines[0].split("|").map((c) => c.trim()).filter(Boolean).map((c) => c.toLowerCase());
    const needCols = ["concern", "disposition", "owner", "fixed by", "human initials"];
    const colIndex = needCols.map((n) => headerCells.findIndex((h) => h.includes(n)));
    if (colIndex.some((i) => i < 0)) {
      console.error("ERROR: Concerns table header must contain Concern | Disposition | Owner | Fixed By | Human Initials columns.");
      process.exit(10);
    }
    const placeholderRegex = /\b(?:TODO|FIXME|TBD|WIP)\b|\[(?:\.\.\.|placeholder|unassigned)\]|^\[.*\]$/i;
    const seenConcerns = new Set();
    let dataRows = 0;
    for (let li = 2; li < tableLines.length; li++) {
      const line = tableLines[li];
      if (/^\|[\s:\-|]+\|?\s*$/.test(line)) continue;
      const rawCells = line.split("|").map((c) => c.trim());
      if (rawCells.length && rawCells[0] === "") rawCells.shift();
      if (rawCells.length && rawCells[rawCells.length - 1] === "") rawCells.pop();
      if (rawCells.length !== headerCells.length) {
        console.error(`ERROR: Concerns table row has ${rawCells.length} fields, expected ${headerCells.length}: "${line}"`);
        process.exit(10);
      }
      const get = (n) => (rawCells[colIndex[needCols.indexOf(n)]] || "").trim();
      const concern = get("concern");
      const disposition = get("disposition");
      const owner = get("owner");
      const fixedBy = get("fixed by");
      const initials = get("human initials");
      dataRows++;
      const requiredPairs = [["Concern", concern], ["Disposition", disposition], ["Owner", owner], ["Fixed By", fixedBy]];
      for (const pair of requiredPairs) {
        if (!pair[1]) { console.error(`ERROR: Concerns table row ${dataRows} is missing ${pair[0]}.`); process.exit(10); }
        if (placeholderRegex.test(pair[1])) { console.error(`ERROR: Concerns table row ${dataRows} contains placeholder text in ${pair[0]}: "${pair[1]}"`); process.exit(11); }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fixedBy)) { console.error(`ERROR: Concerns table row ${dataRows} Fixed By date must be ISO YYYY-MM-DD, found "${fixedBy}".`); process.exit(10); }
      const dt = new Date(fixedBy + "T00:00:00Z");
      if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== fixedBy) { console.error(`ERROR: Concerns table row ${dataRows} Fixed By date is not a valid calendar date: "${fixedBy}".`); process.exit(10); }
      if (!registerMode) {
        if (!initials || placeholderRegex.test(initials) || initials === "-" || initials.length < 2) { console.error(`ERROR: Concerns table row ${dataRows} requires human initials at G14 (found "${initials || "empty"}").`); process.exit(10); }
      } else if (initials && placeholderRegex.test(initials)) { console.error(`ERROR: Concerns table row ${dataRows} contains placeholder text in Human Initials: "${initials}"`); process.exit(11); }
      const dupKey = concern.toLowerCase();
      if (seenConcerns.has(dupKey)) { console.error(`ERROR: Duplicate concern entry (rejected): "${concern}"`); process.exit(10); }
      seenConcerns.add(dupKey);
    }
    if (dataRows === 0) {
      console.error("ERROR: Verdict is PASS WITH CONCERNS but concerns table has no data rows");
      process.exit(10);
    }
  }

  // Mode transactions.
  if (registerMode) {
    let expectedPrior = null;
    try { expectedPrior = fs.existsSync(lastAuditFile) ? fs.readFileSync(lastAuditFile, "utf8").trim() : null; } catch (e) { expectedPrior = null; }
    if (expectedPrior && expectedPrior !== b.fromSha) { console.error("ERROR: registration boundary does not continue current last-audit.sha"); process.exit(12); }
    if (!expectedPrior) {
      const roots=git(["rev-list","--max-parents=0",b.toSha],"utf8").trim().split(/\s+/);
      if (!roots.includes(b.fromSha)) { console.error("ERROR: first audit must begin at a repository root commit"); process.exit(12); }
    }
    const receipt = {
      schema: "oeos-audit-receipt-v1",
      auditedToSha: b.toSha,
      auditedFromSha: b.fromSha,
      packManifestSha256: b.packManifestSha256,
      boundarySha256: boundaryHash,
      expectedPriorBoundary: expectedPrior,
      reportPath: reportPath,
      reportSha256: realReportHash,
      verdict: rawVerdict,
      registeredAt: new Date().toISOString()
    };
    const receiptTmp=receiptFile+".tmp."+process.pid+"."+crypto.randomBytes(6).toString("hex");
    fs.writeFileSync(receiptTmp, JSON.stringify(receipt, null, 2) + "\n", {flag:"wx",mode:0o600});
    fs.renameSync(receiptTmp,receiptFile);
  } else if (approveMode) {
    // G14 approval transaction: revalidate the expected prior boundary, then
    // advance atomically exactly once. Rejection/reassembly output, drift,
    // stale boundaries, concurrency/repeat and skipped ranges fail closed.
    let currentPrior = null;
    try { currentPrior = fs.existsSync(lastAuditFile) ? fs.readFileSync(lastAuditFile, "utf8").trim() : null; } catch (e) { currentPrior = null; }
    const receiptOk=registeredReceipt.schema==="oeos-audit-receipt-v1"&&registeredReceipt.auditedToSha===b.toSha&&registeredReceipt.auditedFromSha===b.fromSha&&registeredReceipt.packManifestSha256===b.packManifestSha256&&registeredReceipt.boundarySha256===boundaryHash&&registeredReceipt.reportPath===reportPath&&registeredReceipt.reportSha256===realReportHash&&registeredReceipt.verdict===rawVerdict&&registeredReceipt.expectedPriorBoundary===(currentPrior||null)&&typeof registeredReceipt.registeredAt==="string";
    if(!receiptOk){console.error("ERROR: registration receipt does not exactly bind boundary, prior state, report, and verdict");process.exit(12);}
    if (currentPrior) {
      if (currentPrior === b.toSha) {
        console.error(`ERROR: Milestone boundary is already at ${b.toSha} (repeat approval rejected).`);
        process.exit(12);
      }
      if (currentPrior !== b.fromSha) {
        console.error(`ERROR: Expected prior boundary ${b.fromSha} does not match current last-audit.sha ${currentPrior} (stale boundary, concurrency, or skipped range). Re-assemble the pack for the current boundary.`);
        process.exit(12);
      }
    } else {
      const roots=git(["rev-list","--max-parents=0",b.toSha],"utf8").trim().split(/\s+/);
      if(!roots.includes(b.fromSha)){console.error("ERROR: first approval must begin at a repository root commit");process.exit(12);}
    }

    const lockFile=lastAuditFile+".lock";let lock;
    try{fs.mkdirSync(path.dirname(lastAuditFile),{recursive:true});lock=fs.openSync(lockFile,"wx");}catch(e){console.error("ERROR: another audit approval transaction is active");process.exit(12);}
    const tmpTarget = lastAuditFile + ".tmp." + process.pid;
    try{
      const priorAfterLock=fs.existsSync(lastAuditFile)?fs.readFileSync(lastAuditFile,"utf8").trim():null;
      if((priorAfterLock||null)!==(registeredReceipt.expectedPriorBoundary||null))throw new Error("prior boundary changed during approval");
      fs.writeFileSync(tmpTarget,b.toSha+"\n",{flag:"wx"});fs.renameSync(tmpTarget,lastAuditFile);
    }catch(e){try{fs.unlinkSync(tmpTarget)}catch(_){};console.error("ERROR: atomic approval failed: "+e.message);process.exitCode=12;}
    finally{try{fs.closeSync(lock)}catch(_){};try{fs.unlinkSync(lockFile)}catch(_){}}
    if(process.exitCode)process.exit(process.exitCode);
  }

  console.log(b.toSha);
  process.exit(0);
' "$BOUNDARY_FILE" "$MANIFEST_FILE" "$REPORT_PATH" "$MODE" "$LAST_AUDIT_FILE" "$RECEIPT_FILE" "$BOUNDARY_HASH_FILE"
