#!/usr/bin/env bash
# OEOS v6 — trusted-adapter SAST runner for Gate G11.
set -euo pipefail

LOG_FILE="${1:-logs/sast.log}"
SAST_REPORT="${2:-logs/sast-report.json}"
EVIDENCE_FILE="${OEOS_SAST_EVIDENCE:-logs/sast-evidence.json}"
node - "$LOG_FILE" "$SAST_REPORT" "$EVIDENCE_FILE" <<'NODE'
const fs=require("fs"),path=require("path"),values=process.argv.slice(2),seen=new Set(),root=fs.realpathSync(".");
for(const value of values){
  if(!value||path.isAbsolute(value)||value.includes("\\")||path.posix.normalize(value)!==value||!value.startsWith("logs/")||value.startsWith("../")||seen.has(value)){console.error("SAST output paths must be distinct canonical repository-relative files under logs/");process.exit(1)}
  seen.add(value);let cur=root;const parts=value.split("/");
  for(let i=0;i<parts.length;i++){cur=path.join(cur,parts[i]);let st;try{st=fs.lstatSync(cur)}catch(e){if(e.code==="ENOENT")continue;throw e}if(st.isSymbolicLink()||(i<parts.length-1&&!st.isDirectory())||(i===parts.length-1&&!st.isFile())){console.error("SAST output path contains a symlink or invalid file component: "+value);process.exit(1)}}
}
NODE
mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$SAST_REPORT")" "$(dirname "$EVIDENCE_FILE")"
rm -f -- "$LOG_FILE" "$SAST_REPORT" "$EVIDENCE_FILE"
die() { printf '\n[SAST ERROR] %s\n' "$*" | tee -a "$LOG_FILE" >&2; exit 1; }
hash_file() { node -e 'const fs=require("fs"),c=require("crypto");process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$1"; }

COMMIT_SHA="$(git rev-parse HEAD 2>/dev/null)" || { echo "SAST requires a Git commit" >&2; exit 1; }
ADAPTER="${OEOS_SAST_ADAPTER:-}"
case "$ADAPTER" in semgrep|bandit) ;; *) echo "SAST requires OEOS_SAST_ADAPTER=semgrep or bandit" >&2; exit 1 ;; esac
[[ -z "${OEOS_SAST_COMMAND:-}" ]] || { echo "OEOS_SAST_COMMAND is forbidden for Gate G11; configure a pinned adapter" >&2; exit 1; }

BINARY_INPUT="${OEOS_SAST_BINARY:-}"
if [[ -z "$BINARY_INPUT" ]]; then BINARY_INPUT="$(command -v "$ADAPTER" || true)"; fi
[[ -n "$BINARY_INPUT" ]] || { echo "Pinned $ADAPTER executable not found" >&2; exit 1; }
BINARY_REAL="$(node -e 'const fs=require("fs");process.stdout.write(fs.realpathSync(process.argv[1]))' "$BINARY_INPUT" 2>/dev/null)" || { echo "Cannot resolve SAST binary" >&2; exit 1; }
[[ -f "$BINARY_REAL" && -x "$BINARY_REAL" ]] || { echo "SAST binary is not an executable regular file" >&2; exit 1; }
BINARY_SHA="$(hash_file "$BINARY_REAL")"
[[ "${OEOS_SAST_BINARY_SHA256:-}" =~ ^[0-9a-f]{64}$ && "$BINARY_SHA" == "$OEOS_SAST_BINARY_SHA256" ]] || { echo "SAST binary hash is missing or does not match OEOS_SAST_BINARY_SHA256" >&2; exit 1; }
set +e
VERSION_OUTPUT="$("$BINARY_REAL" --version 2>&1)"; VERSION_RC=$?
set -e
SCANNER_VERSION="${VERSION_OUTPUT%%$'\n'*}"
[[ "$VERSION_RC" -eq 0 && -n "$SCANNER_VERSION" && "${#SCANNER_VERSION}" -le 200 ]] || { echo "SAST scanner did not provide a valid --version identity" >&2; exit 1; }

CONFIG="${OEOS_SAST_CONFIG:-}"
[[ -n "$CONFIG" && -f "$CONFIG" && ! -L "$CONFIG" ]] || { echo "OEOS_SAST_CONFIG must name a regular, non-symlink rules/config file" >&2; exit 1; }
CONFIG_REAL="$(node -e 'const fs=require("fs");process.stdout.write(fs.realpathSync(process.argv[1]))' "$CONFIG")"
CONFIG_SHA="$(hash_file "$CONFIG_REAL")"
[[ "${OEOS_SAST_CONFIG_SHA256:-}" =~ ^[0-9a-f]{64}$ && "$CONFIG_SHA" == "$OEOS_SAST_CONFIG_SHA256" ]] || { echo "SAST config hash is missing or does not match OEOS_SAST_CONFIG_SHA256" >&2; exit 1; }
REPO_ROOT="$(git rev-parse --show-toplevel)"
case "$CONFIG_REAL" in
  "$REPO_ROOT"/*)
    CONFIG_REL="${CONFIG_REAL#"$REPO_ROOT"/}"
    git ls-files --error-unmatch -- "$CONFIG_REL" >/dev/null 2>&1 || { echo "In-repository SAST config must be tracked" >&2; exit 1; }
    git diff --quiet HEAD -- "$CONFIG_REL" && git diff --cached --quiet -- "$CONFIG_REL" || { echo "In-repository SAST config must be clean at HEAD" >&2; exit 1; }
    ;;
esac

printf '%s\n' "============================================================" "OEOS v6 Static Application Security Testing (Gate G11)" "Commit SHA: $COMMIT_SHA" "Adapter: $ADAPTER" "Scanner version: $SCANNER_VERSION" "Binary: $BINARY_REAL" "Binary SHA-256: $BINARY_SHA" "Config SHA-256: $CONFIG_SHA" "============================================================" | tee "$LOG_FILE"

TARGETS_FILE="$(mktemp)"
trap 'rm -f "$TARGETS_FILE"' EXIT
git ls-files --stage -z | node -e '
  const fs=require("fs"),path=require("path"); const adapter=process.argv[1],root=process.argv[2];
  const records=fs.readFileSync(0).toString("utf8").split("\0").filter(Boolean);
  const exts=adapter==="bandit"?[".py"]:[".js",".mjs",".cjs",".jsx",".ts",".tsx",".mts",".cts",".py",".go",".java",".rb",".php",".rs",".cs"];
  const out=[];
  for(const record of records){
    const m=record.match(/^(\d{6}) [0-9a-f]+ (\d)\t([\s\S]+)$/);
    if(!m||m[2]!=="0")throw new Error("unmerged or malformed Git index entry in SAST inventory");
    const mode=m[1],p=m[3];
    if(!exts.some(e=>p.toLowerCase().endsWith(e))||/(^|\/)(test|tests|__tests__|node_modules|vendor|dist|build)(\/|$)/i.test(p)||/\.(test|spec)\.[^.]+$/i.test(p)||/\.d\.(ts|mts|cts)$/i.test(p))continue;
    if(mode!=="100644"&&mode!=="100755")throw new Error("production SAST target is not a regular Git blob: "+JSON.stringify(p));
    const full=path.join(root,p),st=fs.lstatSync(full),real=fs.realpathSync(full);
    if(st.isSymbolicLink()||!st.isFile()||(real!==root&&!real.startsWith(root+path.sep)))throw new Error("production SAST target is not a contained regular file: "+JSON.stringify(p));
    out.push(p);
  }
  out.sort();
  for(const p of out) process.stdout.write(p+"\0");
' "$ADAPTER" "$REPO_ROOT" > "$TARGETS_FILE"
TARGETS=()
while IFS= read -r -d '' target; do TARGETS+=("$target"); done < "$TARGETS_FILE"
[[ "${#TARGETS[@]}" -gt 0 ]] || die "No tracked production targets were found for adapter $ADAPTER"
git diff --quiet HEAD -- "${TARGETS[@]}" || die "Tracked production targets must be clean at HEAD before SAST evidence is issued"
TARGETS_SHA="$(hash_file "$TARGETS_FILE")"
printf 'Target count: %s\nTarget inventory SHA-256: %s\n' "${#TARGETS[@]}" "$TARGETS_SHA" | tee -a "$LOG_FILE"

if [[ "$ADAPTER" == "semgrep" ]]; then
  CMD=("$BINARY_REAL" --config "$CONFIG_REAL" --json --output "$SAST_REPORT" --quiet -- "${TARGETS[@]}")
else
  CMD=("$BINARY_REAL" -ll -f json -o "$SAST_REPORT" -c "$CONFIG_REAL" -- "${TARGETS[@]}")
fi
set +e
set -o pipefail
"${CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
PIPE_STATUS=("${PIPESTATUS[@]}")
set -e
[[ "${PIPE_STATUS[1]}" -eq 0 ]] || { echo "SAST evidence logging failed" >&2; exit 1; }
[[ "${PIPE_STATUS[0]}" -eq 0 ]] || die "Scanner returned ${PIPE_STATUS[0]}"
[[ -s "$SAST_REPORT" && ! -L "$SAST_REPORT" ]] || die "Scanner did not create a non-empty regular JSON report"

PARSED="$(node - "$ADAPTER" "$SAST_REPORT" "$TARGETS_FILE" <<'NODE'
const fs=require("fs"),path=require("path");
const adapter=process.argv[2], reportPath=process.argv[3], targetsPath=process.argv[4];
let d; try{d=JSON.parse(fs.readFileSync(reportPath,"utf8"));}catch(e){console.error("Malformed report: "+e.message);process.exit(1)}
const norm=p=>path.posix.normalize(String(p).replace(/\\/g,"/").replace(/^\.\//,""));
const expected=fs.readFileSync(targetsPath,"utf8").split("\0").filter(Boolean).map(norm).sort();
let actual=[],critical=0,high=0,medium=0,low=0,total=0;
if(adapter==="semgrep"){
  if(!Array.isArray(d.results)||!d.paths||!Array.isArray(d.paths.scanned)){console.error("Invalid Semgrep schema");process.exit(1)}
  actual=d.paths.scanned.map(norm).sort();
  for(const r of d.results){const s=String(r?.extra?.severity||"").toUpperCase();if(!["ERROR","WARNING","INFO"].includes(s)){console.error("Unknown Semgrep severity");process.exit(1)}total++;if(s==="ERROR")high++;else if(s==="WARNING")medium++;else low++;}
}else{
  if(!Array.isArray(d.results)||!d.metrics||typeof d.metrics!=="object"){console.error("Invalid Bandit schema");process.exit(1)}
  actual=Object.keys(d.metrics).filter(k=>k!=="_totals").map(norm).sort();
  for(const r of d.results){const s=String(r.issue_severity||"").toUpperCase();if(!["HIGH","MEDIUM","LOW"].includes(s)){console.error("Unknown Bandit severity");process.exit(1)}total++;if(s==="HIGH")high++;else if(s==="MEDIUM")medium++;else low++;}
}
actual=[...new Set(actual)]; const exp=[...new Set(expected)];
if(JSON.stringify(actual)!==JSON.stringify(exp)){console.error("Scanner target inventory does not exactly match orchestrator inventory\nexpected="+JSON.stringify(exp)+"\nactual="+JSON.stringify(actual));process.exit(1)}
process.stdout.write(JSON.stringify({critical,high,medium,low,total,scannedCount:actual.length}));
NODE
)" || die "Report validation failed"
CRITICAL="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).critical))' "$PARSED")"
HIGH="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).high))' "$PARSED")"
MEDIUM="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).medium))' "$PARSED")"
TOTAL="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).total))' "$PARSED")"
[[ "$CRITICAL" -eq 0 && "$HIGH" -eq 0 && "$MEDIUM" -eq 0 ]] || die "Detected $CRITICAL Critical, $HIGH High, and $MEDIUM Medium findings"
REPORT_SHA="$(hash_file "$SAST_REPORT")"
printf 'Findings: %s Critical, %s High, %s Medium, %s total\n✔ SAST SCAN PASSED: pinned adapter, exact target inventory, zero Critical/High/Medium.\n' "$CRITICAL" "$HIGH" "$MEDIUM" "$TOTAL" | tee -a "$LOG_FILE"
LOG_SHA="$(hash_file "$LOG_FILE")"
RUNNER_SHA="$(hash_file "$0")"
node - "$EVIDENCE_FILE" "$COMMIT_SHA" "$ADAPTER" "$SCANNER_VERSION" "$BINARY_REAL" "$BINARY_SHA" "$CONFIG_REAL" "$CONFIG_SHA" "$TARGETS_SHA" "${#TARGETS[@]}" "$SAST_REPORT" "$REPORT_SHA" "$LOG_FILE" "$LOG_SHA" "$RUNNER_SHA" "$PARSED" <<'NODE'
const fs=require("fs"); const a=process.argv.slice(2); const counts=JSON.parse(a[15]);
const evidence={schema:"oeos-sast-evidence-v1",commitSha:a[1],adapter:a[2],scannerVersion:a[3],binaryRealpath:a[4],binarySha256:a[5],configRealpath:a[6],configSha256:a[7],targetsSha256:a[8],scannedCount:Number(a[9]),reportFile:a[10],reportSha256:a[11],logFile:a[12],logSha256:a[13],runnerSha256:a[14],criticalFindings:counts.critical,highFindings:counts.high,mediumFindings:counts.medium,lowFindings:counts.low,totalFindings:counts.total,passed:true};
fs.writeFileSync(a[0],JSON.stringify(evidence,null,2)+"\n",{mode:0o600});
NODE
