#!/usr/bin/env bash
# ==============================================================================
# OEOS v6 — Gauntlet Validation Runner
# Canonical runner that executes gauntlet.sh with pipefail and captures the
# true Gauntlet exit code AND tee logging status to guarantee evidence retention.
# Usage: ./tools/run-gauntlet.sh [log_file] [extra_gauntlet_args...]
# Default log: logs/gauntlet-ph5.log
# ==============================================================================
set -u

LOG_FILE="${1:-logs/gauntlet-ph5.log}"
shift || true

EVIDENCE_FILE="${OEOS_GAUNTLET_EVIDENCE:-logs/coverage-evidence.json}"
RECEIPT_FILE="${OEOS_GAUNTLET_RECEIPT:-logs/gauntlet-receipt.json}"
if ! node - "$LOG_FILE" "$EVIDENCE_FILE" "$RECEIPT_FILE" <<'NODE'
const fs=require("fs"),path=require("path"),values=process.argv.slice(2),seen=new Set(),root=fs.realpathSync(".");
for(const value of values){
  if(!value||path.isAbsolute(value)||value.includes("\\")||path.posix.normalize(value)!==value||!value.startsWith("logs/")||value.startsWith("../")||seen.has(value)){console.error("Gauntlet output paths must be distinct canonical repository-relative files under logs/");process.exit(1)}
  seen.add(value);let cur=root;const parts=value.split("/");
  for(let i=0;i<parts.length;i++){cur=path.join(cur,parts[i]);let st;try{st=fs.lstatSync(cur)}catch(e){if(e.code==="ENOENT")continue;throw e}if(st.isSymbolicLink()||(i<parts.length-1&&!st.isDirectory())||(i===parts.length-1&&!st.isFile())){console.error("Gauntlet output path contains a symlink or invalid file component: "+value);process.exit(1)}}
}
NODE
then
  exit 1
fi
if [ ! -f ./tools/gauntlet.sh ] || [ -L ./tools/gauntlet.sh ] || [ ! -x ./tools/gauntlet.sh ]; then
  echo "[RUNNER ERROR] tools/gauntlet.sh must be an executable regular non-symlink file." >&2
  exit 1
fi

mkdir -p "$(dirname "$LOG_FILE")" || { echo "[RUNNER ERROR] Cannot create log directory." >&2; exit 1; }
rm -f -- "$LOG_FILE" "$EVIDENCE_FILE" "$RECEIPT_FILE" || { echo "[RUNNER ERROR] Cannot clear prior evidence artifacts." >&2; exit 1; }

# Execute gauntlet.sh with pipefail active to guarantee exit code capture
set -o pipefail
./tools/gauntlet.sh "$@" 2>&1 | tee "$LOG_FILE"
PIPELINE_STATUS=("${PIPESTATUS[@]}")
GAUNTLET_RC="${PIPELINE_STATUS[0]}"
TEE_RC="${PIPELINE_STATUS[1]}"

if [ "$GAUNTLET_RC" -ne 0 ]; then
  echo -e "\n[RUNNER] Gauntlet failed with exit code $GAUNTLET_RC. Log preserved at $LOG_FILE" >&2
  exit "$GAUNTLET_RC"
fi

# H-07: Ensure tee succeeded and evidence log was actually created and is non-empty
if [ "$TEE_RC" -ne 0 ] || [ ! -s "$LOG_FILE" ]; then
  echo -e "\n[RUNNER ERROR] Evidence logging failed (tee exit code $TEE_RC, log file empty or missing at $LOG_FILE)." >&2
  exit 1
fi

# Pipeline status is captured explicitly above; all subsequent evidence and
# receipt validation must abort on the first failing command.
set -e

# Bind the exact successful log, structured threshold evidence, candidate
# commit, and production controls in one runner-generated receipt.
if [ ! -f "$EVIDENCE_FILE" ] || [ ! -s "$EVIDENCE_FILE" ] || [ -L "$EVIDENCE_FILE" ] || [ ! -f "$LOG_FILE" ] || [ -L "$LOG_FILE" ]; then
  echo "[RUNNER ERROR] Missing/non-regular Gauntlet evidence or log." >&2
  exit 1
fi
if grep -Eiq 'GAUNTLET FAILED|\[FAIL\]|✘' "$LOG_FILE"; then
  echo "[RUNNER ERROR] Successful log contains a failure marker." >&2
  exit 1
fi
if ! node -e 'const fs=require("fs"),s=fs.readFileSync(process.argv[1],"utf8");if((s.match(/GAUNTLET VERIFICATION COMPLETE/g)||[]).length!==1)process.exit(1)' "$LOG_FILE"; then
  echo "[RUNNER ERROR] Successful log must contain exactly one terminal GAUNTLET VERIFICATION COMPLETE marker." >&2
  exit 1
fi
HEAD_SHA="$(git rev-parse HEAD)"
node - "$EVIDENCE_FILE" "$HEAD_SHA" <<'NODE'
const fs=require("fs"); let e;
try{e=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));}catch(x){console.error("Invalid Gauntlet evidence: "+x.message);process.exit(1)}
const finite=n=>typeof n==="number"&&Number.isFinite(n);
if(e.schema!=="oeos-gauntlet-evidence-v1"||e.headCommit!==process.argv[3]||e.diffRange?.headCommit!==process.argv[3]||e.passed!==true) process.exit(1);
if(!finite(e.coverage?.pct)||!finite(e.mutation?.score)||!finite(e.thresholds?.coverageMinimum)||!finite(e.thresholds?.mutationMinimum)||!Number.isInteger(e.mutation?.total)) process.exit(1);
if(e.coverage.pct<e.thresholds.coverageMinimum||e.mutation.score<e.thresholds.mutationMinimum||e.mutation.total<=0) process.exit(1);
NODE
hash_file() { node -e 'const fs=require("fs"),c=require("crypto");process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$1"; }
LOG_SHA="$(hash_file "$LOG_FILE")"
EVIDENCE_SHA="$(hash_file "$EVIDENCE_FILE")"
RUNNER_SHA="$(hash_file "$0")"
GAUNTLET_SHA="$(hash_file ./tools/gauntlet.sh)"
COMPONENT_EVIDENCE_FILE=""
COMPONENT_EVIDENCE_SHA=""
COMPONENT_CONFIG_SHA=""
COMPONENT_RUNNER_SHA=""
if [ -f docs/validation-components.json ]; then
  if [ ! -s logs/component-validation.json ] || [ -L logs/component-validation.json ] || [ ! -f tools/validate-components.cjs ] || [ -L tools/validate-components.cjs ]; then
    echo "[RUNNER ERROR] Component mode did not produce trusted structured evidence." >&2
    exit 1
  fi
  COMPONENT_EVIDENCE_FILE="logs/component-validation.json"
  COMPONENT_EVIDENCE_SHA="$(hash_file "$COMPONENT_EVIDENCE_FILE")"
  COMPONENT_CONFIG_SHA="$(hash_file docs/validation-components.json)"
  COMPONENT_RUNNER_SHA="$(hash_file tools/validate-components.cjs)"
fi
node - "$RECEIPT_FILE" "$HEAD_SHA" "$LOG_FILE" "$LOG_SHA" "$EVIDENCE_FILE" "$EVIDENCE_SHA" "$RUNNER_SHA" "$GAUNTLET_SHA" "$COMPONENT_EVIDENCE_FILE" "$COMPONENT_EVIDENCE_SHA" "$COMPONENT_CONFIG_SHA" "$COMPONENT_RUNNER_SHA" <<'NODE'
const fs=require("fs"),crypto=require("crypto");const a=process.argv.slice(2);
const tmp=a[0]+".tmp-"+process.pid+"-"+crypto.randomBytes(6).toString("hex");
const receipt={schema:"oeos-gauntlet-receipt-v1",commitSha:a[1],logFile:a[2],logSha256:a[3],evidenceFile:a[4],evidenceSha256:a[5],runnerSha256:a[6],gauntletSha256:a[7],passed:true};
if(a[8]) Object.assign(receipt,{componentEvidenceFile:a[8],componentEvidenceSha256:a[9],componentConfigSha256:a[10],componentRunnerSha256:a[11]});
fs.writeFileSync(tmp,JSON.stringify(receipt,null,2)+"\n",{mode:0o600,flag:"wx"});
fs.renameSync(tmp,a[0]);
NODE

exit 0
