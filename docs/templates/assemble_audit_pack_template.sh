#!/usr/bin/env bash
# OEOS Milestone Audit Pack Assembler (PH9.1)
# Assembles audit pack inputs, computes recursive SHA-256 manifest, and persists boundary.json.
#
# Trust invariants (V7):
# - H-03/M-11 truthful inputs: no success placeholders are ever synthesized.
#   Architecture, review, Gauntlet and security sources must exist, be fresh,
#   range-bound and passing; test-summary.md and review-summaries.md are
#   compiled verbatim from those artifacts (plus hashes). Anything missing,
#   malformed, stale, failing or out-of-range fails closed.
# - H-09 exact set: the manifest covers every regular pack member (including
#   dotfiles and nesting) one-for-one; symlinks, non-regular files, unsafe
#   names and duplicates are rejected at assembly.
# - M-08 portability: manifest generation and hashing use portable Node
#   (no GNU find -printf, sort -z or sha256sum), so mandatory PH9/G14 controls
#   run on Linux and macOS.
set -euo pipefail

AUDIT_DIR="${1:-docs/reviews/opus-audit}"
PACK_DIR="$AUDIT_DIR/pack"

# The pack is destructively refreshed below, so validate the complete dynamic
# destination before rm/mkdir. Never permit an absolute/out-of-repository path
# or an existing symlink in the audit directory chain.
node - "$AUDIT_DIR" <<'NODE'
const fs=require("fs"),path=require("path");const input=process.argv[2];
if(!input||path.isAbsolute(input)||input.includes("\\")||path.posix.normalize(input)!==input||input===".."||input.startsWith("../")){console.error("ERROR: audit directory must be a canonical repository-relative path");process.exit(1);}
const root=fs.realpathSync(".");let cur=root;
for(const part of input.split("/")){cur=path.join(cur,part);let st;try{st=fs.lstatSync(cur)}catch(e){if(e.code==="ENOENT")continue;throw e}if(st.isSymbolicLink()||!st.isDirectory()){console.error("ERROR: audit directory chain contains a symlink or non-directory: "+cur);process.exit(1);}}
const pack=path.join(root,input,"pack");try{const st=fs.lstatSync(pack);if(st.isSymbolicLink()||!st.isDirectory()){console.error("ERROR: audit pack destination is a symlink or non-directory");process.exit(1)}}catch(e){if(e.code!=="ENOENT")throw e}
NODE
mkdir -p "$AUDIT_DIR"
rm -rf "$PACK_DIR"
mkdir -p "$PACK_DIR"

# 1a/1b. Architecture and ADR sources: verbatim, fail-closed, never symlinks
# or partial shell-glob copies.
node - "$PACK_DIR/overview.md" "$PACK_DIR/adrs.md" <<'NODE'
const fs=require("fs"),path=require("path");const [overviewOut,adrOut]=process.argv.slice(2);
function regularDirect(p,label){let st;try{st=fs.lstatSync(p)}catch(e){throw new Error("missing required "+label+": "+p)}if(st.isSymbolicLink()||!st.isFile()||fs.realpathSync(p)!==path.resolve(p))throw new Error(label+" must be a regular file with no symlink components: "+p);}
regularDirect("docs/architecture/overview.md","architecture overview");
fs.copyFileSync("docs/architecture/overview.md",overviewOut,fs.constants.COPYFILE_EXCL);
let names=[];try{const st=fs.lstatSync("docs/adr");if(st.isSymbolicLink()||!st.isDirectory()||fs.realpathSync("docs/adr")!==path.resolve("docs/adr"))throw new Error("ADR directory must be a regular directory with no symlink components");names=fs.readdirSync("docs/adr").filter(n=>n.toLowerCase().endsWith(".md")).sort((a,b)=>Buffer.from(a).compare(Buffer.from(b)));}catch(e){if(e.code!=="ENOENT")throw e;}
if(!names.length){fs.writeFileSync(adrOut,"# Architectural Decision Records\nNo ADR files were found in docs/adr/ at pack assembly time (verified empty).\n",{flag:"wx"});}
else{const parts=[];for(const name of names){if(path.sep==="/"&&name.includes("\\"))throw new Error("ADR filename contains a non-canonical backslash: "+JSON.stringify(name));const p=path.join("docs/adr",name);regularDirect(p,"ADR");parts.push(fs.readFileSync(p));}fs.writeFileSync(adrOut,Buffer.concat(parts),{flag:"wx"});}
NODE

RAW_SOURCE=""
ACTIVE_REVIEW_SOURCE=""
if [ -f tools/resolve-tracker-context.cjs ]; then
  ACTIVE_TRACKER="$(node tools/resolve-tracker-context.cjs --field tracker 2>/dev/null || true)"
  if [ -n "$ACTIVE_TRACKER" ]; then ACTIVE_REVIEW_SOURCE="$(dirname "$ACTIVE_TRACKER")/reviews"; fi
fi
for candidate in "${2:-}" "$ACTIVE_REVIEW_SOURCE" "$AUDIT_DIR/raw-reviews" "$AUDIT_DIR/raw" "docs/reviews/raw"; do
  if [ -n "$candidate" ] && [ -d "$candidate" ]; then RAW_SOURCE="$candidate"; break; fi
done
if [ -z "$RAW_SOURCE" ]; then
  echo "ERROR: Missing required audit source: no raw review reports found (checked $AUDIT_DIR/raw-reviews, $AUDIT_DIR/raw, docs/reviews/raw). Supply raw reviews before assembling the milestone audit pack." >&2
  exit 1
fi
RAW_HEAD="${OEOS_CANDIDATE_SHA:-$(git rev-parse HEAD)}"
if [ "$(git rev-parse HEAD)" != "$RAW_HEAD" ]; then
  echo "ERROR: Audit assembly must run while HEAD is the exact validated candidate $RAW_HEAD." >&2
  exit 1
fi
# One Node walker owns discovery, validation, copying, hashing and compilation.
# It uses exact path arrays and lstat, so partial copies, symlinks and newline
# filenames cannot silently disappear.
node - "$RAW_SOURCE" "$PACK_DIR/raw-reviews" "$PACK_DIR/review-summaries.md" "$RAW_HEAD" <<'NODE'
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const [src,dst,summary,head]=process.argv.slice(2); const files=[];
const sourceStat=fs.lstatSync(src);if(sourceStat.isSymbolicLink()||!sourceStat.isDirectory()||fs.realpathSync(src)!==path.resolve(src))throw new Error("raw-review source must be a regular directory with no symlink components");
function walk(dir,base){for(const name of fs.readdirSync(dir)){const full=path.join(dir,name),st=fs.lstatSync(full),rawRel=path.relative(base,full);if(path.sep==="/"&&rawRel.includes("\\"))throw new Error("review path contains a non-canonical backslash: "+JSON.stringify(rawRel));const rel=rawRel.replace(/\\/g,"/");if(st.isSymbolicLink()||(!st.isFile()&&!st.isDirectory()))throw new Error("non-regular review member: "+JSON.stringify(rel));if(st.isDirectory())walk(full,base);else files.push({full,rel});}}
walk(src,src); if(!files.length)throw new Error("raw-review directory is empty"); files.sort((a,b)=>Buffer.from(a.rel).compare(Buffer.from(b.rel)));
const one=(text,label)=>{const re=new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`,"gim"),m=[...text.matchAll(re)];if(m.length!==1)throw new Error(`review requires exactly one ${label}`);return m[0][1].trim()};
 function validate(buf,rel){const text=buf.toString("utf8");let commit,verdict,counts,reviewer,isJson=false;
 const countValue=label=>{const value=one(text,label);if(!/^\d+$/.test(value))throw new Error(`review ${JSON.stringify(rel)} has non-canonical ${label}`);return Number(value);};
 if(rel.toLowerCase().endsWith(".json")){isJson=true;const d=JSON.parse(text);if(d.schema!=="oeos-review-v1")throw new Error("invalid JSON review schema");commit=d.reviewedCommit;verdict=d.verdict;counts=d.counts;reviewer=d.reviewer;if(Object.keys(d).sort().join(",")!=="counts,reviewedCommit,reviewer,schema,verdict"||!counts||Object.keys(counts).sort().join(",")!=="critical,high,low,medium")throw new Error("unknown/missing JSON review fields");}
 else {commit=one(text,"Reviewed Commit");verdict=one(text,"Verdict");reviewer=one(text,"Reviewer");counts={critical:countValue("Critical Findings"),high:countValue("High Findings"),medium:countValue("Medium Findings"),low:countValue("Low Findings")};}
 if(!isJson&&(/USAGE INSTRUCTIONS:/i.test(text)||/^\s*-\s*\[\s\]\s+/m.test(text)||/\[(?:[^\]\n]*(?:placeholder|unassigned|document name|model name|full 40-character|path\/to|section|what.?s wrong|exact quote|specific fix|count|approve|revise|escalate|yyyy-mm-dd|finding id)[^\]\n]*)\](?!\()/i.test(text)))throw new Error(`review ${JSON.stringify(rel)} contains unfinished template instructions, checkboxes, or placeholders`);
 if(commit!==head||verdict!=="PASS"||typeof reviewer!=="string"||!reviewer.trim()||/\[(?:\.\.\.|placeholder|unassigned|model[^\]]*)\]|\b(?:TODO|TBD)\b/i.test(reviewer))throw new Error(`review ${JSON.stringify(rel)} is not a PASS bound to exact HEAD with an identified reviewer`);
 if(!counts||!["critical","high","medium","low"].every(k=>Number.isInteger(counts[k])&&counts[k]>=0))throw new Error(`review ${JSON.stringify(rel)} has invalid counts`);
 if(counts.critical||counts.high||counts.medium)throw new Error(`review ${JSON.stringify(rel)} has blocking findings (${counts.critical}/${counts.high}/${counts.medium})`);
 if(!isJson){let prose=text.replace(/^\*\*(?:Critical|High|Medium|Low) Findings:\*\*.*$/gim,"");const summary=/^\s*[-*]\s+\*\*(Critical|High|Medium|Low):\*\*\s*(\d+)\b.*$/gim;for(const m of prose.matchAll(summary)){if(Number(m[2])!==counts[m[1].toLowerCase()])throw new Error(`review ${JSON.stringify(rel)} has contradictory summary counts`);}prose=prose.replace(summary,"");if(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:Critical|High|Medium)(?:\s+Finding)?(?:\*\*)?\s*:/im.test(prose))throw new Error(`review ${JSON.stringify(rel)} contradicts its canonical counts`);for(const line of prose.split(/\r?\n/)){if(line.trim().startsWith("|")){const cells=line.split("|").map(x=>x.trim().replace(/^\*\*|\*\*$/g,"").toLowerCase());if(["critical","high","medium"].some(s=>cells.includes(s)))throw new Error(`review ${JSON.stringify(rel)} contains a blocking severity row`);}}}
}
fs.mkdirSync(dst,{recursive:true});let out="# Milestone Review Summaries\n\n<!-- Verbatim, schema-validated raw reviews. -->\n\n";
for(const f of files){const buf=fs.readFileSync(f.full);validate(buf,f.rel);const target=path.join(dst,...f.rel.split("/"));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f.full,target,fs.constants.COPYFILE_EXCL);const h=crypto.createHash("sha256").update(buf).digest("hex");out+=`--- BEGIN RAW REVIEW: ${JSON.stringify("raw-reviews/"+f.rel)} (sha256: ${h}) ---\n${buf.toString("utf8")}\n--- END RAW REVIEW: ${JSON.stringify("raw-reviews/"+f.rel)} ---\n\n`;}
fs.writeFileSync(summary,out,{flag:"wx"});
NODE

# 2. Determine audit commit range (needed before evidence freshness checks).
if [ -f "$AUDIT_DIR/last-audit.sha" ] && [ -s "$AUDIT_DIR/last-audit.sha" ]; then
  LAST_AUDIT_SHA="$(tr -d '[:space:]' < "$AUDIT_DIR/last-audit.sha")"
elif [ -n "${RELEASE_BASE_COMMIT:-}" ]; then
  LAST_AUDIT_SHA="$RELEASE_BASE_COMMIT"
else
  LAST_AUDIT_SHA="$(git rev-list --max-parents=0 HEAD 2>/dev/null | head -n 1 || git rev-parse HEAD~1)"
fi
CURRENT_AUDIT_SHA="$RAW_HEAD"

# Verify SHAs exist and are commits
if ! git rev-parse --verify "${LAST_AUDIT_SHA}^{commit}" >/dev/null 2>&1; then
  echo "ERROR: Milestone base commit $LAST_AUDIT_SHA does not exist in git history." >&2
  exit 1
fi
if ! git rev-parse --verify "${CURRENT_AUDIT_SHA}^{commit}" >/dev/null 2>&1; then
  echo "ERROR: Current audit commit $CURRENT_AUDIT_SHA does not exist in git history." >&2
  exit 1
fi

# Verify ancestry relationship: LAST_AUDIT_SHA must be ancestor of CURRENT_AUDIT_SHA
if ! git merge-base --is-ancestor "$LAST_AUDIT_SHA" "$CURRENT_AUDIT_SHA"; then
  echo "ERROR: Audit base commit $LAST_AUDIT_SHA is not an ancestor of current commit $CURRENT_AUDIT_SHA." >&2
  exit 1
fi

# 1e. Test summary: compiled verbatim from fresh, passing, range-bound evidence.
# Required sources: a passing Gauntlet log, coverage-evidence.json, sast.log and
# sast-evidence.json. Stale (older than the milestone base commit), malformed,
# failing or out-of-range evidence fails closed; affirmative boilerplate is
# never emitted.
GAUNTLET_LOG=""
for gl in "logs/gauntlet-final.log" "logs/gauntlet-ph5.log"; do
  if [ -f "$gl" ]; then GAUNTLET_LOG="$gl"; break; fi
done
if [ -z "$GAUNTLET_LOG" ]; then
  echo "ERROR: Missing required audit source: no Gauntlet log found (checked logs/gauntlet-final.log, logs/gauntlet-ph5.log). Run ./tools/run-gauntlet.sh before assembling the milestone audit pack." >&2
  exit 1
fi
if ! grep -q "GAUNTLET VERIFICATION COMPLETE" "$GAUNTLET_LOG" && ! grep -q "ALL ACTIVE LAYERS GREEN" "$GAUNTLET_LOG"; then
  echo "ERROR: Gauntlet evidence $GAUNTLET_LOG does not contain a passing marker (GAUNTLET VERIFICATION COMPLETE / ALL ACTIVE LAYERS GREEN). Failing Gauntlet evidence cannot be assembled into a PASS pack." >&2
  exit 1
fi
if [ ! -f "logs/coverage-evidence.json" ]; then
  echo "ERROR: Missing required audit source logs/coverage-evidence.json. Run the Gauntlet before assembling the milestone audit pack." >&2
  exit 1
fi
if ! node -e "const d=require('./logs/coverage-evidence.json'); if(typeof d.coverage!=='object'||typeof d.mutation!=='object') process.exit(1);" 2>/dev/null; then
  echo "ERROR: Malformed logs/coverage-evidence.json (coverage/mutation evidence required)." >&2
  exit 1
fi
if [ ! -f "logs/sast.log" ]; then
  echo "ERROR: Missing required audit source logs/sast.log. Run ./tools/sast.sh before assembling the milestone audit pack." >&2
  exit 1
fi
if ! grep -q "SAST SCAN PASSED" "logs/sast.log"; then
  echo "ERROR: Security evidence logs/sast.log does not contain a passing marker (SAST SCAN PASSED). Failing security evidence cannot be assembled into a PASS pack." >&2
  exit 1
fi
if [ ! -f "logs/sast-evidence.json" ]; then
  echo "ERROR: Missing required audit source logs/sast-evidence.json. Run ./tools/sast.sh before assembling the milestone audit pack." >&2
  exit 1
fi
if [ ! -f "logs/gauntlet-receipt.json" ]; then
  echo "ERROR: Missing runner-generated logs/gauntlet-receipt.json. Re-run ./tools/run-gauntlet.sh." >&2
  exit 1
fi
if ! node -e "const d=require('./logs/sast-evidence.json'); if(d.passed!==true) process.exit(1);" 2>/dev/null; then
  echo "ERROR: Malformed logs/sast-evidence.json (passed:true required)." >&2
  exit 1
fi
# Freshness: evidence must not predate the milestone base commit.
BASE_CT="$(git log -1 --format=%ct "$LAST_AUDIT_SHA" 2>/dev/null || echo 0)"
for ef in "$GAUNTLET_LOG" "logs/coverage-evidence.json" "logs/gauntlet-receipt.json" "logs/sast.log" "logs/sast-evidence.json"; do
  EF_MTIME="$(node -e "const fs=require('fs');console.log(Math.floor(fs.statSync(process.argv[1]).mtimeMs/1000))" "$ef")"
  if [ "$EF_MTIME" -lt "$((BASE_CT - 5))" ]; then
    echo "ERROR: Audit evidence $ef is stale (older than milestone base commit $LAST_AUDIT_SHA). Re-run Gauntlet and SAST for this milestone; out-of-range evidence is prohibited." >&2
    exit 1
  fi
done
# Commit binding: every final evidence record must name the exact frozen
# candidate. Ancestor evidence is stale even when it belongs to the range.
COV_HEAD="$(node -e "try{const d=require('./logs/coverage-evidence.json');console.log(d.headCommit||d.diffRange&&d.diffRange.headCommit||'')}catch(e){console.log('')}" 2>/dev/null || true)"
if [ "$COV_HEAD" != "$CURRENT_AUDIT_SHA" ]; then
  echo "ERROR: coverage-evidence.json must bind exact candidate $CURRENT_AUDIT_SHA; found ${COV_HEAD:-missing}." >&2
  exit 1
fi
SAST_COMMIT="$(node -e "try{const d=require('./logs/sast-evidence.json');console.log(d.commitSha||'')}catch(e){console.log('')}" 2>/dev/null || true)"
if [ "$SAST_COMMIT" != "$CURRENT_AUDIT_SHA" ]; then
  echo "ERROR: sast-evidence.json must bind exact candidate $CURRENT_AUDIT_SHA; found ${SAST_COMMIT:-missing}." >&2
  exit 1
fi

# Authoritative cross-artifact validation: exact HEAD, exact hashes, threshold
# decisions, scanner identity/config, and unmixed successful logs.
node - "$CURRENT_AUDIT_SHA" "$GAUNTLET_LOG" <<'NODE'
const fs=require("fs"),path=require("path"),crypto=require("crypto"),cp=require("child_process");const [head,glog]=process.argv.slice(2);
const read=p=>fs.readFileSync(p);const json=p=>JSON.parse(read(p));const hash=p=>crypto.createHash("sha256").update(read(p)).digest("hex");
const git=args=>cp.execFileSync("git",args,{encoding:null,stdio:["ignore","pipe","pipe"]});
for(const p of [glog,"logs/coverage-evidence.json","logs/gauntlet-receipt.json","logs/sast.log","logs/sast-evidence.json","tools/gauntlet.sh","tools/run-gauntlet.sh","tools/sast.sh"]){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw new Error("evidence/control is not a regular file: "+p);}
const cov=json("logs/coverage-evidence.json"),gr=json("logs/gauntlet-receipt.json");
if(cov.schema!=="oeos-gauntlet-evidence-v1"||cov.headCommit!==head||cov.diffRange?.headCommit!==head||cov.passed!==true)throw new Error("Gauntlet evidence is not bound to exact HEAD");
if(!Number.isFinite(cov.coverage?.pct)||!Number.isFinite(cov.mutation?.score)||!Number.isFinite(cov.thresholds?.coverageMinimum)||!Number.isFinite(cov.thresholds?.mutationMinimum)||cov.coverage.pct<cov.thresholds.coverageMinimum||cov.mutation.score<cov.thresholds.mutationMinimum||!(cov.mutation.total>0))throw new Error("Gauntlet evidence does not prove coverage/mutation thresholds");
if(gr.schema!=="oeos-gauntlet-receipt-v1"||gr.commitSha!==head||gr.passed!==true||gr.logFile!==glog||gr.evidenceFile!=="logs/coverage-evidence.json"||gr.logSha256!==hash(glog)||gr.evidenceSha256!==hash("logs/coverage-evidence.json")||gr.runnerSha256!==hash("tools/run-gauntlet.sh")||gr.gauntletSha256!==hash("tools/gauntlet.sh"))throw new Error("Gauntlet receipt/hash binding mismatch");
const gt=read(glog).toString("utf8");
if(/GAUNTLET FAILED|\[FAIL\]|\[LAYER\s+\d+\/6\s+FAILED\]|✘/i.test(gt)||(gt.match(/GAUNTLET VERIFICATION COMPLETE/g)||[]).length!==1)throw new Error("Gauntlet log is mixed, failing, or missing its unique terminal success marker");
for(let n=1;n<=6;n++){const marker=new RegExp(`\\[LAYER ${n}\\/6 PASSED\\]`,"g");if((gt.match(marker)||[]).length!==1)throw new Error(`Gauntlet log must contain exactly one successful Layer ${n}/6 marker`);}
const componentConfig="docs/validation-components.json";
if(fs.existsSync(componentConfig)){
  for(const p of [componentConfig,"logs/component-validation.json","tools/validate-components.cjs"]){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw new Error("component evidence/control is not a regular file: "+p);}
  if(gr.componentEvidenceFile!=="logs/component-validation.json"||gr.componentEvidenceSha256!==hash(gr.componentEvidenceFile)||gr.componentConfigSha256!==hash(componentConfig)||gr.componentRunnerSha256!==hash("tools/validate-components.cjs"))throw new Error("component receipt/hash binding mismatch");
  const ce=json(gr.componentEvidenceFile),finite=n=>typeof n==="number"&&Number.isFinite(n);
  if(ce.schema!=="oeos-component-validation-v1"||ce.passed!==true||ce.headCommit!==head||ce.configPath!==componentConfig||ce.configSha256!==hash(componentConfig)||!Array.isArray(ce.components)||!ce.components.length)throw new Error("component evidence is incomplete or not bound to exact HEAD");
  for(const c of ce.components){
    if(c.passed!==true||!Array.isArray(c.executions)||!c.executions.length||c.executions.some(x=>x.exitCode!==0)||!finite(c.coverage?.pct)||!finite(c.mutation?.score)||!Number.isInteger(c.mutation?.total)||c.mutation.total<=0||!finite(c.thresholds?.coverageMinimum)||!finite(c.thresholds?.mutationMinimum)||c.coverage.pct<c.thresholds.coverageMinimum||c.mutation.score<c.thresholds.mutationMinimum)throw new Error("component evidence contains a failed or incomplete capability");
    for(const a of c.releaseArtifacts||[]){if(typeof a.path!=="string"||path.isAbsolute(a.path)||path.posix.normalize(a.path)!==a.path||a.path.startsWith("../"))throw new Error("unsafe component artifact path");const s=fs.lstatSync(a.path);if(!s.isFile()||s.isSymbolicLink()||a.sha256!==hash(a.path)||a.size!==s.size)throw new Error("component release artifact hash mismatch: "+a.path);}
  }
}else if(gr.componentEvidenceFile||gr.componentEvidenceSha256||gr.componentConfigSha256||gr.componentRunnerSha256){throw new Error("receipt claims component evidence without a component config");}
const se=json("logs/sast-evidence.json");
for(const p of [se.logFile,se.reportFile,se.binaryRealpath,se.configRealpath]){if(typeof p!=="string"||!p)throw new Error("SAST evidence path missing");const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw new Error("SAST evidence dependency is not a regular non-symlink file: "+p);}
const repoReal=fs.realpathSync("."),reportResolved=path.resolve(se.reportFile),reportReal=fs.realpathSync(se.reportFile);
if(path.isAbsolute(se.reportFile)||se.reportFile.includes("\\")||path.posix.normalize(se.reportFile)!==se.reportFile||!se.reportFile.startsWith("logs/")||reportReal!==reportResolved||!reportReal.startsWith(repoReal+path.sep))throw new Error("SAST report evidence path must be a canonical non-symlink file under repository logs/");
const trustAdapter=process.env.OEOS_SAST_ADAPTER,trustBinary=(process.env.OEOS_SAST_BINARY_SHA256||"").toLowerCase(),trustConfig=(process.env.OEOS_SAST_CONFIG_SHA256||"").toLowerCase();
if(!["semgrep","bandit"].includes(trustAdapter)||!/^[0-9a-f]{64}$/.test(trustBinary)||!/^[0-9a-f]{64}$/.test(trustConfig))throw new Error("audit assembly requires externally supplied OEOS_SAST_ADAPTER and pinned binary/config SHA-256 values");
if(se.adapter!==trustAdapter||se.binarySha256!==trustBinary||se.configSha256!==trustConfig)throw new Error("SAST evidence does not match the external audit trust configuration");
if(se.schema!=="oeos-sast-evidence-v1"||se.commitSha!==head||typeof se.scannerVersion!=="string"||!se.scannerVersion.trim()||se.passed!==true||se.criticalFindings!==0||se.highFindings!==0||se.mediumFindings!==0||!(se.scannedCount>0)||se.logFile!=="logs/sast.log"||se.logSha256!==hash(se.logFile)||se.reportSha256!==hash(se.reportFile)||se.binarySha256!==hash(se.binaryRealpath)||se.configSha256!==hash(se.configRealpath)||se.runnerSha256!==hash("tools/sast.sh"))throw new Error("SAST evidence/hash binding mismatch");
const root=git(["rev-parse","--show-toplevel"]).toString("utf8").trim(),records=git(["ls-files","--stage","-z"]).toString("utf8").split("\0").filter(Boolean);
const exts=se.adapter==="bandit"?[".py"]:[".js",".mjs",".cjs",".jsx",".ts",".tsx",".mts",".cts",".py",".go",".java",".rb",".php",".rs",".cs"],targets=[];
for(const record of records){const m=record.match(/^(\d{6}) [0-9a-f]+ (\d)\t([\s\S]+)$/);if(!m||m[2]!=="0")throw new Error("unmerged or malformed Git index entry in audit SAST inventory");const mode=m[1],p=m[3];if(!exts.some(e=>p.toLowerCase().endsWith(e))||/(^|\/)(test|tests|__tests__|node_modules|vendor|dist|build)(\/|$)/i.test(p)||/\.(test|spec)\.[^.]+$/i.test(p)||/\.d\.(ts|mts|cts)$/i.test(p))continue;if(mode!=="100644"&&mode!=="100755")throw new Error("non-regular production target in SAST inventory: "+JSON.stringify(p));const st=fs.lstatSync(path.join(root,p));if(st.isSymbolicLink()||!st.isFile())throw new Error("non-regular production target in SAST working tree: "+JSON.stringify(p));targets.push(p);}
targets.sort();if(!targets.length)throw new Error("empty production target inventory at audit assembly");
try{git(["diff","--quiet","HEAD","--",...targets]);}catch(e){throw new Error("production targets drifted from audited HEAD after SAST");}
const targetBytes=Buffer.from(targets.join("\0")+"\0"),targetHash=crypto.createHash("sha256").update(targetBytes).digest("hex");
if(se.targetsSha256!==targetHash||se.scannedCount!==targets.length)throw new Error("SAST evidence target inventory is not bound to audited HEAD");
const report=json(se.reportFile),norm=p=>path.posix.normalize(String(p).replace(/\\/g,"/").replace(/^\.\//,""));let actual=[],counts={critical:0,high:0,medium:0,low:0,total:0};
if(se.adapter==="semgrep"){if(!Array.isArray(report.results)||!report.paths||!Array.isArray(report.paths.scanned))throw new Error("invalid Semgrep report schema at audit assembly");actual=report.paths.scanned.map(norm).sort();for(const r of report.results){const s=String(r?.extra?.severity||"").toUpperCase();if(!["ERROR","WARNING","INFO"].includes(s))throw new Error("unknown Semgrep severity at audit assembly");counts.total++;if(s==="ERROR")counts.high++;else if(s==="WARNING")counts.medium++;else counts.low++;}}
else{if(!Array.isArray(report.results)||!report.metrics||typeof report.metrics!=="object")throw new Error("invalid Bandit report schema at audit assembly");actual=Object.keys(report.metrics).filter(k=>k!=="_totals").map(norm).sort();for(const r of report.results){const s=String(r.issue_severity||"").toUpperCase();if(!["HIGH","MEDIUM","LOW"].includes(s))throw new Error("unknown Bandit severity at audit assembly");counts.total++;if(s==="HIGH")counts.high++;else if(s==="MEDIUM")counts.medium++;else counts.low++;}}
actual=[...new Set(actual)];if(JSON.stringify(actual)!==JSON.stringify(targets)||counts.critical!==se.criticalFindings||counts.high!==se.highFindings||counts.medium!==se.mediumFindings||counts.low!==se.lowFindings||counts.total!==se.totalFindings)throw new Error("SAST report targets/findings do not match sealed evidence");
const st=read(se.logFile).toString("utf8");if(/SAST (?:ERROR|SCAN FAILED)|\[SAST ERROR\]|✘/i.test(st)||(st.match(/SAST SCAN PASSED/g)||[]).length!==1)throw new Error("SAST log is mixed, failing, or missing its unique terminal success marker");
NODE
{
  echo "# Milestone Test Summary"
  echo ""
  echo "<!-- Compiled verbatim from Gauntlet and SAST artifacts by assemble-audit-pack.sh; no model-authored summaries. -->"
  echo ""
  echo "Boundary: $LAST_AUDIT_SHA..$CURRENT_AUDIT_SHA"
  echo ""
  echo "## Gauntlet ($GAUNTLET_LOG, sha256: $(node -e "const fs=require('fs'),crypto=require('crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "$GAUNTLET_LOG"))"
  echo '```'
  cat "$GAUNTLET_LOG"
  echo '```'
  echo ""
  echo "## Coverage evidence (logs/coverage-evidence.json, sha256: $(node -e "const fs=require('fs'),crypto=require('crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "logs/coverage-evidence.json"))"
  echo '```json'
  cat "logs/coverage-evidence.json"
  echo '```'
  echo ""
  echo "## Gauntlet receipt (logs/gauntlet-receipt.json)"
  echo '```json'
  cat "logs/gauntlet-receipt.json"
  echo '```'
  echo ""
  echo "## SAST (logs/sast.log, sha256: $(node -e "const fs=require('fs'),crypto=require('crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "logs/sast.log"))"
  echo '```'
  cat "logs/sast.log"
  echo '```'
  echo ""
  echo "## SAST evidence (logs/sast-evidence.json, sha256: $(node -e "const fs=require('fs'),crypto=require('crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "logs/sast-evidence.json"))"
  echo '```json'
  cat "logs/sast-evidence.json"
  echo '```'
  echo ""
  echo "## SAST report"
  echo '```json'
  SAST_REPORT_PATH="$(node -e "process.stdout.write(require('./logs/sast-evidence.json').reportFile)")"
  cat "$SAST_REPORT_PATH"
  echo '```'
} > "$PACK_DIR/test-summary.md"
if [ ! -s "$PACK_DIR/test-summary.md" ]; then
  echo "ERROR: Failed to compile test-summary.md from Gauntlet/SAST artifacts (empty output)." >&2
  exit 1
fi

# 3. Export milestone diff and assert non-empty
git diff "$LAST_AUDIT_SHA..$CURRENT_AUDIT_SHA" > "$PACK_DIR/feature.diff"
if [ ! -s "$PACK_DIR/feature.diff" ]; then
  echo "ERROR: Milestone audit diff is empty! Expected diff between $LAST_AUDIT_SHA and $CURRENT_AUDIT_SHA." >&2
  exit 1
fi

# 4. Generate deterministic manifest with portable Node (M-08). Covers every
# regular pack member one-for-one (dotfiles and nesting included); symlinks,
# non-regular files, unsafe names and duplicates are rejected (H-09).
# Excludes only MANIFEST.sha256 and boundary.json (outer-integrity protected).
node -e '
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");
  const packDir = process.argv[1];
  const outFile = process.argv[2];
  function walk(dir, base, out) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(base, full).replace(/\\/g, "/");
      if (rel === "MANIFEST.sha256" || rel === "boundary.json" || rel === "boundary.sha256") continue;
      let st;
      try { st = fs.lstatSync(full); } catch (err) { console.error("Cannot lstat pack member: " + rel); process.exit(1); }
      if (st.isSymbolicLink()) { console.error("Pack member is a symlink (rejected): " + rel); process.exit(1); }
      if (st.isDirectory()) { walk(full, base, out); continue; }
      if (!st.isFile()) { console.error("Pack member is not a regular file (rejected): " + rel); process.exit(1); }
      if (!rel || rel.startsWith("/") || rel.startsWith("../") || rel.indexOf("\0") >= 0) { console.error("Unsafe pack member name (rejected): " + JSON.stringify(rel)); process.exit(1); }
      const h = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      // JSON-encoded path keeps each manifest record on one line even when a
      // valid repository filename contains whitespace, quotes, or newlines.
      out.push({ rel, row: h + "  " + JSON.stringify(rel) });
    }
  }
  const rows = [];
  walk(packDir, packDir, rows);
  const seen = new Set();
  for (const r of rows) { if (seen.has(r.rel)) { console.error("Duplicate pack member (rejected): " + r.rel); process.exit(1); } seen.add(r.rel); }
  rows.sort((a,b)=>Buffer.from(a.rel).compare(Buffer.from(b.rel)));
  fs.writeFileSync(outFile, rows.length ? rows.map(r=>r.row).join("\n") + "\n" : "");
' "$PACK_DIR" "$PACK_DIR/MANIFEST.sha256"
if [ ! -s "$PACK_DIR/MANIFEST.sha256" ]; then
  echo "ERROR: Pack manifest generation produced an empty MANIFEST.sha256." >&2
  exit 1
fi

# 5. Persist immutable boundary.json plus its outer hash. Registration binds
# this exact boundary hash in the separate audit receipt.
MANIFEST_SHA="$(node -e "const fs=require('fs'),crypto=require('crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "$PACK_DIR/MANIFEST.sha256")"
DIFF_SHA="$(node -e "const fs=require('fs'),crypto=require('crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "$PACK_DIR/feature.diff")"
node -e '
  const fs = require("fs");
  const boundary = {
    schema: "oeos-audit-boundary-v1",
    fromSha: process.argv[1],
    toSha: process.argv[2],
    packManifestSha256: process.argv[3],
    featureDiffSha256: process.argv[4],
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(process.argv[5], JSON.stringify(boundary, null, 2) + "\n");
' "$LAST_AUDIT_SHA" "$CURRENT_AUDIT_SHA" "$MANIFEST_SHA" "$DIFF_SHA" "$PACK_DIR/boundary.json"
node -e 'const fs=require("fs"),c=require("crypto");const h=c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex");fs.writeFileSync(process.argv[2],h+"\n",{flag:"wx"})' "$PACK_DIR/boundary.json" "$PACK_DIR/boundary.sha256"

echo "Audit pack assembled successfully in $PACK_DIR:"
echo "  Boundary: $LAST_AUDIT_SHA..$CURRENT_AUDIT_SHA"
echo "  Manifest SHA-256: $MANIFEST_SHA"
