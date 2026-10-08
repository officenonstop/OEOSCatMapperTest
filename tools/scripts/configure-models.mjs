#!/usr/bin/env node
// ==============================================================================
// OEOS v6 — Interactive Subagent Model Selector
// Consumes OpenCode's resolved model inventory and provides a live search-as-you-type TUI,
// validates reviewer independence, and updates .opencode/agent/oeos-*.md.
// Zero external dependencies (pure Node.js >= 18).
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ANSI styling helpers
const ESC = '\x1B';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RED = `${ESC}[31m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const BLUE = `${ESC}[34m`;
const MAGENTA = `${ESC}[35m`;
const CYAN = `${ESC}[36m`;
const WHITE = `${ESC}[37m`;
const BG_BLUE = `${ESC}[44m`;
const INVERSE = `${ESC}[7m`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_SCREEN = `${ESC}[2J${ESC}[H`;

const ENTER_ALT_SCREEN = `${ESC}[?1049h`;
const EXIT_ALT_SCREEN = `${ESC}[?1049l`;
const REPOSITION_TOP = `${ESC}[H${ESC}[J`;

function restoreTerminal() {
  try {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
  } catch {}
  if (process.stdout.isTTY) {
    process.stdout.write(`${SHOW_CURSOR}${EXIT_ALT_SCREEN}`);
  }
}

process.on('SIGINT', () => {
  restoreTerminal();
  if (process.stdout.isTTY) process.stdout.write('\n');
  process.exit(130);
});

process.on('exit', () => {
  restoreTerminal();
});

// Fallback curated model catalog
const CURATED_MODELS = [
  // OpenCode Go / Zen (Recommended defaults)
  { id: 'opencode-go/muse-spark-1.3-contributor', provider: 'opencode-go', name: 'Muse Spark 1.3 Contributor', recommendedFor: ['oeos-planner', 'oeos-test-planner', 'oeos-adversarial', 'oeos'], note: 'Frontier reasoning at ultra-low cost ($0.10/$0.20)' },
  { id: 'opencode-go/glm-5.3', provider: 'opencode-go', name: 'GLM 5.3', recommendedFor: ['oeos-glm-reviewer'], note: 'Flagship independent security & cross-artifact review' },
  { id: 'opencode-go/glm-5.3-flash', provider: 'opencode-go', name: 'GLM 5.3 Flash', recommendedFor: ['oeos-glm-reviewer'], note: 'Fast independent reviewer ($0.15/$0.50)' },
  { id: 'opencode-go/gpt-5.6-luna', provider: 'opencode-go', name: 'GPT 5.6 Luna', recommendedFor: ['oeos-adversarial', 'oeos-auditor'], note: 'Crisp deductive adversarial logic ($0.20/$1.20)' },
  { id: 'opencode-go/deepseek-v4.1-flash', provider: 'opencode-go', name: 'DeepSeek V4.1 Flash', recommendedFor: ['oeos-coder'], note: 'Rapid autonomous TDD coding ($0.15/$0.60)' },
  { id: 'opencode-go/kimi-k3', provider: 'opencode-go', name: 'Kimi K3 (256k)', recommendedFor: ['oeos-planner', 'oeos-test-planner', 'oeos-adversarial'], note: 'Top-tier architecture, contracts, deep reasoning' },
  { id: 'opencode-go/grok-4.7', provider: 'opencode-go', name: 'Grok 4.7', recommendedFor: ['oeos-adversarial'], note: 'xAI flagship adversarial reasoning ($2.00/$6.00)' },
  { id: 'opencode-go/qwen3.8-max', provider: 'opencode-go', name: 'Qwen3.8 Max', recommendedFor: ['oeos-auditor', 'oeos-planner'], note: 'Alibaba flagship reasoning & audit ($2.00/$6.00)' },
  { id: 'opencode-go/glm-5.2', provider: 'opencode-go', name: 'GLM 5.2', recommendedFor: ['oeos-glm-reviewer'], note: 'Independent verification, security & perf audit' },
  { id: 'opencode-go/glm-4.5', provider: 'opencode-go', name: 'GLM 4.5', recommendedFor: ['oeos-glm-reviewer'], note: 'Fast independent reviewer' },
  { id: 'opencode-go/deepseek-v4-pro', provider: 'opencode-go', name: 'DeepSeek V4 Pro', recommendedFor: ['oeos-coder'], note: 'Premier TDD coding, tests, refactoring' },
  { id: 'opencode-go/deepseek-v3', provider: 'opencode-go', name: 'DeepSeek V3', recommendedFor: ['oeos-coder'], note: 'Rapid autonomous code generation' },
  { id: 'opencode-go/minimax-01', provider: 'opencode-go', name: 'MiniMax 01 (4M context)', recommendedFor: ['oeos-planner'], note: 'Massive context architectural exploration' },

  // OpenCode Zen (Zen Credits)
  { id: 'opencodezen/claude-opus-5', provider: 'opencodezen', name: 'Claude Opus 5 (Zen)', recommendedFor: ['oeos-auditor'], note: 'Dedicated Zen credit milestone auditor' },
  { id: 'opencodezen/claude-3-7-sonnet', provider: 'opencodezen', name: 'Claude 3.7 Sonnet (Zen)', recommendedFor: ['oeos-planner', 'oeos-coder'], note: 'Zen frontier model' },
  { id: 'opencodezen/deepseek-v4-pro', provider: 'opencodezen', name: 'DeepSeek V4 Pro (Zen)', recommendedFor: ['oeos-coder'], note: 'Zen premier coding engine' },
  { id: 'opencodezen/kimi-k3', provider: 'opencodezen', name: 'Kimi K3 (Zen)', recommendedFor: ['oeos-planner'], note: 'Zen planning engine' },

  // Direct OpenRouter
  { id: 'openrouter/moonshotai/kimi-k3', provider: 'openrouter', name: 'Moonshot Kimi K3', recommendedFor: ['oeos-planner'], note: 'OpenRouter Kimi K3' },
  { id: 'openrouter/zhipu/glm-5.2', provider: 'openrouter', name: 'Zhipu GLM 5.2', recommendedFor: ['oeos-glm-reviewer'], note: 'OpenRouter GLM 5.2' },
  { id: 'openrouter/deepseek/deepseek-chat', provider: 'openrouter', name: 'DeepSeek V3 (Chat)', recommendedFor: ['oeos-coder'], note: 'OpenRouter DeepSeek V3' },
  { id: 'openrouter/deepseek/deepseek-r1', provider: 'openrouter', name: 'DeepSeek R1 (Reasoning)', recommendedFor: ['oeos-coder', 'oeos-planner'], note: 'OpenRouter DeepSeek R1' },
  { id: 'openrouter/anthropic/claude-3.7-sonnet', provider: 'openrouter', name: 'Claude 3.7 Sonnet', recommendedFor: ['oeos-planner', 'oeos-coder'], note: 'OpenRouter Sonnet 3.7' },
  { id: 'openrouter/anthropic/claude-3-opus', provider: 'openrouter', name: 'Claude 3 Opus', recommendedFor: ['oeos-auditor'], note: 'OpenRouter Opus 3' },

  // Direct Anthropic
  { id: 'anthropic/claude-3-7-sonnet-latest', provider: 'anthropic', name: 'Claude 3.7 Sonnet', recommendedFor: ['oeos-planner', 'oeos-coder'], note: 'Direct Anthropic API' },
  { id: 'anthropic/claude-3-5-sonnet-latest', provider: 'anthropic', name: 'Claude 3.5 Sonnet', recommendedFor: ['oeos-coder'], note: 'Direct Anthropic API' },
  { id: 'anthropic/claude-3-opus-latest', provider: 'anthropic', name: 'Claude 3 Opus', recommendedFor: ['oeos-auditor'], note: 'Direct Anthropic API' },

  // Direct DeepSeek
  { id: 'deepseek/deepseek-chat', provider: 'deepseek', name: 'DeepSeek V3', recommendedFor: ['oeos-coder'], note: 'Direct DeepSeek API' },
  { id: 'deepseek/deepseek-reasoner', provider: 'deepseek', name: 'DeepSeek R1', recommendedFor: ['oeos-planner', 'oeos-coder'], note: 'Direct DeepSeek API' },

  // Direct OpenAI
  { id: 'openai/gpt-4o', provider: 'openai', name: 'GPT-4o', recommendedFor: ['oeos-adversarial', 'oeos-coder'], note: 'Direct OpenAI API' },
  { id: 'openai/gpt-4.5-preview', provider: 'openai', name: 'GPT-4.5 Preview', recommendedFor: ['oeos-planner', 'oeos-auditor'], note: 'Direct OpenAI API' },
  { id: 'openai/o3-mini', provider: 'openai', name: 'o3-mini', recommendedFor: ['oeos-coder'], note: 'Direct OpenAI Reasoning' }
];

// Presets
const PRESETS = {
  standard: {
    name: 'Standard OEOS Multi-Model (Zero-Quality-Compromise Canonical)',
    description: 'Muse Spark 1.3 (Planning/Adv/Orch) + GLM 5.3 (Independent) + DeepSeek V4 Pro (Code) + Qwen3.8 Max (Audit)',
    models: {
      'oeos-planner': 'opencode-go/muse-spark-1.3-contributor',
      'oeos-test-planner': 'opencode-go/muse-spark-1.3-contributor',
      'oeos-adversarial': 'opencode-go/muse-spark-1.3-contributor',
      'oeos-glm-reviewer': 'opencode-go/glm-5.3',
      'oeos-coder': 'opencode-go/deepseek-v4-pro',
      'oeos-auditor': 'opencode-go/qwen3.8-max',
      'oeos': 'opencode-go/muse-spark-1.3-contributor'
    }
  },
  budget: {
    name: 'Budget & High Speed (4-Lab Synergy)',
    description: 'Muse Spark 1.3 (Plan/Orch) + GPT 5.6 Luna (Adv/Audit) + GLM 5.3 Flash (Review) + DeepSeek V4.1 Flash (Code)',
    models: {
      'oeos-planner': 'opencode-go/muse-spark-1.3-contributor',
      'oeos-test-planner': 'opencode-go/muse-spark-1.3-contributor',
      'oeos-adversarial': 'opencode-go/gpt-5.6-luna',
      'oeos-glm-reviewer': 'opencode-go/glm-5.3-flash',
      'oeos-coder': 'opencode-go/deepseek-v4.1-flash',
      'oeos-auditor': 'opencode-go/gpt-5.6-luna',
      'oeos': 'opencode-go/muse-spark-1.3-contributor'
    }
  },
  frontier: {
    name: 'Frontier High-Precision (Go Flagship Heavyweights)',
    description: 'Kimi K3 (Plan) + Grok 4.7 (Adv) + GLM 5.3 (Review) + DeepSeek V4 Pro (Code) + Qwen3.8 Max (Audit)',
    models: {
      'oeos-planner': 'opencode-go/kimi-k3',
      'oeos-test-planner': 'opencode-go/kimi-k3',
      'oeos-adversarial': 'opencode-go/grok-4.7',
      'oeos-glm-reviewer': 'opencode-go/glm-5.3',
      'oeos-coder': 'opencode-go/deepseek-v4-pro',
      'oeos-auditor': 'opencode-go/qwen3.8-max',
      'oeos': 'opencode-go/muse-spark-1.3-contributor'
    }
  }
};

// Target subagent metadata
const AGENTS = [
  { key: 'oeos-planner', file: 'oeos-planner.md', role: 'Planner / Architect / Tasks', rec: 'Kimi K3' },
  { key: 'oeos-test-planner', file: 'oeos-test-planner.md', role: 'Executable QA / Acceptance Tests', rec: 'Qualified per target' },
  { key: 'oeos-adversarial', file: 'oeos-adversarial.md', role: 'Adversarial Cold Reviewer (Fresh Context)', rec: 'Kimi K3 (Fresh)' },
  { key: 'oeos-glm-reviewer', file: 'oeos-glm-reviewer.md', role: 'Independent Reviewer & Cross-Artifact Audit', rec: 'GLM 5.2' },
  { key: 'oeos-coder', file: 'oeos-coder.md', role: 'TDD Code & Tests Implementation', rec: 'DeepSeek V4 / V3' },
  { key: 'oeos-auditor', file: 'oeos-auditor.md', role: 'Milestone & Pre-Release Auditor', rec: 'Qwen3.8 Max (Go) / Opus 5 (Zen)' },
  { key: 'oeos', file: 'oeos.md', role: 'Primary Process Orchestrator', rec: 'Session Default' }
];

const MODEL_ID_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:/-]+$/;

function isValidModelId(modelId) {
  return typeof modelId === 'string' && MODEL_ID_PATTERN.test(modelId);
}

// ------------------------------------------------------------------------------
// Helpers: File system & Config parsing
// ------------------------------------------------------------------------------

function findAgentDir(args = []) {
  // 1. Explicit CLI flag: --agent-dir <path>
  const dirIdx = args.indexOf('--agent-dir');
  if (dirIdx >= 0 && args[dirIdx + 1]) {
    const explicit = path.resolve(process.cwd(), args[dirIdx + 1]);
    if (fs.existsSync(explicit) && fs.existsSync(path.join(explicit, 'oeos.md'))) {
      return explicit;
    }
    console.error(`ERROR: Specified --agent-dir '${args[dirIdx + 1]}' does not contain oeos.md.`);
    process.exit(1);
  }

  // 2. Explicit environment variable: OEOS_AGENT_DIR
  if (process.env.OEOS_AGENT_DIR) {
    const explicit = path.resolve(process.cwd(), process.env.OEOS_AGENT_DIR);
    if (fs.existsSync(explicit) && fs.existsSync(path.join(explicit, 'oeos.md'))) {
      return explicit;
    }
  }

  // 3. Strictly cwd-anchored candidate locations (never scriptDir fallbacks)
  const candidates = [
    path.resolve(process.cwd(), '.opencode/agent'),
    path.resolve(process.cwd(), 'runbook/agent'),
    path.resolve(process.cwd(), 'agent')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'oeos.md'))) {
      return dir;
    }
  }
  return null;
}

function stripJsonComments(text) {
  let inString = false;
  let inSingleComment = false;
  let inMultiComment = false;
  let isEscaped = false;
  let out = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inSingleComment) {
      if (char === '\n' || char === '\r') {
        inSingleComment = false;
        out += char;
      }
      continue;
    }

    if (inMultiComment) {
      if (char === '*' && nextChar === '/') {
        inMultiComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inSingleComment = true;
      i++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inMultiComment = true;
      i++;
      continue;
    }

    // Outside string & comments: strip trailing commas before } or ]
    if (char === ',') {
      let j = i + 1;
      let isTrailing = false;
      while (j < text.length) {
        const c = text[j];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
          j++;
          continue;
        }
        if (c === '/' && text[j + 1] === '/') {
          j += 2;
          while (j < text.length && text[j] !== '\n' && text[j] !== '\r') j++;
          continue;
        }
        if (c === '/' && text[j + 1] === '*') {
          j += 2;
          while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++;
          j += 2;
          continue;
        }
        if (c === '}' || c === ']') {
          isTrailing = true;
        }
        break;
      }
      if (isTrailing) {
        continue; // skip trailing comma
      }
    }

    out += char;
  }

  return out;
}

function parseOpenCodeConfigs() {
  const homedir = os.homedir();
  const configPaths = [
    path.join(homedir, '.config/opencode/opencode.jsonc'),
    path.join(homedir, '.config/opencode/opencode.json'),
    path.resolve(process.cwd(), '.opencode/opencode.jsonc'),
    path.resolve(process.cwd(), '.opencode/opencode.json'),
    path.resolve(process.cwd(), 'opencode.jsonc'),
    path.resolve(process.cwd(), 'opencode.json')
  ];

  const staticModels = [];

  for (const p of configPaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const clean = stripJsonComments(raw);
        const parsed = JSON.parse(clean);
        if (parsed?.provider && typeof parsed.provider === 'object') {
          for (const [id, prov] of Object.entries(parsed.provider)) {
            if (prov?.models && typeof prov.models === 'object') {
              const entries = Array.isArray(prov.models) ? prov.models : Object.entries(prov.models);
              for (const entry of entries) {
                const mId = typeof entry === 'string' ? entry : (Array.isArray(entry) ? entry[0] : entry.id || entry.name);
                if (mId && isValidModelId(`${id}/${mId}`)) {
                  staticModels.push({
                    id: `${id}/${mId}`,
                    provider: id,
                    name: mId,
                    recommendedFor: [],
                    note: `Declared in opencode config (${id})`
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        // ignore parse failures from comments/syntax
      }
    }
  }

  return { staticModels };
}

// ------------------------------------------------------------------------------
// Dynamic Model Fetching
// ------------------------------------------------------------------------------

function queryResolvedOpenCodeModels(cwd = process.cwd()) {
  try {
    const output = execFileSync(process.env.OEOS_OPENCODE_BINARY || 'opencode', ['models', '--pure'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const ids = [...new Set(output.split(/\r?\n/).map(line => line.trim().split(/\s+/)[0]).filter(isValidModelId))];
    if (!ids.length) return { ok: false, models: [], error: 'OpenCode returned no resolved model IDs' };
    return {
      ok: true,
      models: ids.map(id => ({ id, provider: id.split('/')[0], name: id.slice(id.indexOf('/') + 1), recommendedFor: [], note: 'Resolved by OpenCode' })),
      error: null,
    };
  } catch (error) {
    return { ok: false, models: [], error: String(error.stderr || error.message).trim() };
  }
}

async function discoverAllModels(liveQuery = true) {
  const modelMap = new Map();

  // 1. Seed with curated catalog
  for (const m of CURATED_MODELS) {
    modelMap.set(m.id, { ...m });
  }

  // 2. Include explicitly declared models for cached/offline use. Credentials,
  // aliases, variable expansion, and live provider resolution remain OpenCode's job.
  const { staticModels } = parseOpenCodeConfigs();
  for (const m of staticModels) {
    if (!modelMap.has(m.id)) {
      modelMap.set(m.id, m);
    }
  }

  // OpenCode owns provider aliases, built-in providers, credential resolution,
  // variable substitution and model discovery. Never reproduce its partial
  // authentication or issue provider HTTP requests from this tool.
  if (liveQuery) {
    const resolved = queryResolvedOpenCodeModels();
    for (const m of resolved.models) {
      modelMap.set(m.id, { ...(modelMap.get(m.id) || {}), ...m });
    }
  }

  return Array.from(modelMap.values());
}

// ------------------------------------------------------------------------------
// Agent File Reader & Updater
// ------------------------------------------------------------------------------

function getAgentModel(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');

  // Match frontmatter block
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const activeMatch = fm.match(/^[ \t]*model:[ \t]*([^\r\n#]+)/m);
  if (activeMatch) {
    return activeMatch[1].trim();
  }

  // Check commented line
  const commentMatch = fm.match(/^[ \t]*#[ \t]*model:[ \t]*([^\r\n]+)/m);
  if (commentMatch) {
    return null; // explicitly commented -> unconfigured / session default
  }

  return null;
}

function atomicWriteFileSync(filePath, content) {
  try {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink()) {
      throw new Error(`Security error: Target file cannot be a symbolic link: ${filePath}`);
    }
  } catch (e) {
    if (e.message.startsWith('Security error')) throw e;
  }
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`);
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}

function computeUpdatedAgentContent(content, modelId) {
  if (content.startsWith('---')) {
    const parts = content.split('---');
    if (parts.length >= 3) {
      let fm = parts[1];
      const rest = parts.slice(2).join('---');

      if (modelId) {
        if (/^[ \t]*model:[ \t]*.*/m.test(fm)) {
          fm = fm.replace(/^[ \t]*model:[ \t]*.*/m, `model: ${modelId}`);
        } else if (/^[ \t]*#[ \t]*model:[ \t]*.*/m.test(fm)) {
          fm = fm.replace(/^[ \t]*#[ \t]*model:[ \t]*.*/m, `model: ${modelId}`);
        } else {
          fm = fm + `\nmodel: ${modelId}\n`;
        }
      } else {
        // Comment out model
        if (/^[ \t]*model:[ \t]*.*/m.test(fm)) {
          fm = fm.replace(/^[ \t]*model:[ \t]*.*/m, `# model: <provider_id/model_id>  # inherits session default`);
        }
      }
      return `---${fm}---${rest}`;
    }
  }

  // Fallback: prepend frontmatter
  if (modelId) {
    return `---\nmodel: ${modelId}\n---\n\n` + content;
  }
  return content;
}

function setAgentModel(filePath, modelId) {
  try {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink()) {
      throw new Error(`Security error: Agent file cannot be a symbolic link: ${filePath}`);
    }
  } catch (e) {
    if (e.message.startsWith('Security error')) throw e;
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  if (modelId && !isValidModelId(modelId)) {
    throw new Error(`Invalid model ID '${modelId}'. Expected provider_id/model_id using letters, numbers, '.', '_', ':', '/', and '-'.`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const updated = computeUpdatedAgentContent(content, modelId);
  atomicWriteFileSync(filePath, updated);
}

function recoverPresetJournal(agentDir) {
  const resolvedDir = path.resolve(agentDir);
  const journalPath = path.join(resolvedDir, '.preset_transaction.json');

  if (!fs.existsSync(journalPath)) return;

  // H-08: Check if journal itself is a symlink. Reject and fail safe.
  try {
    const journalLstat = fs.lstatSync(journalPath);
    if (journalLstat.isSymbolicLink()) {
      console.warn('WARNING: Symlinked .preset_transaction.json detected. Removing symlink without following.');
      fs.unlinkSync(journalPath);
      return;
    }
  } catch (err) {
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  } catch (err) {
    console.warn(`WARNING: Corrupted preset transaction journal rejected: ${err.message}`);
    try { fs.unlinkSync(journalPath); } catch (_) {}
    return;
  }

  // H-08: Strictly validate journal structure. Never trust arbitrary serialized paths!
  if (
    typeof data !== 'object' ||
    data === null ||
    data.status !== 'staged' ||
    typeof data.transactionId !== 'string' ||
    !/^tx_[0-9]+_[a-z0-9]+$/.test(data.transactionId) ||
    !Array.isArray(data.agents)
  ) {
    console.warn('WARNING: Malformed or untrusted preset transaction journal detected. Fail-closed: preserving evidence, ignoring raw paths.');
    try {
      const quarantinePath = path.join(resolvedDir, `.preset_transaction.untrusted.${Date.now()}`);
      fs.renameSync(journalPath, quarantinePath);
    } catch (_) {}
    return;
  }

  const txId = data.transactionId;

  for (const agentKey of data.agents) {
    // Only permit allowlisted agent keys
    const agentMeta = AGENTS.find(a => a.key === agentKey);
    if (!agentMeta) continue;

    const targetFile = agentMeta.file;
    if (targetFile.includes('/') || targetFile.includes('\\')) continue;

    const fpath = path.join(resolvedDir, targetFile);
    const bakPath = path.join(resolvedDir, `.${targetFile}.${txId}.bak`);
    const stagedPath = path.join(resolvedDir, `.${targetFile}.${txId}.staged`);

    // H-08: Strict containment checks
    if (
      !path.resolve(fpath).startsWith(resolvedDir + path.sep) ||
      !path.resolve(bakPath).startsWith(resolvedDir + path.sep) ||
      !path.resolve(stagedPath).startsWith(resolvedDir + path.sep)
    ) {
      console.warn(`WARNING: Path containment violation during preset recovery for ${agentKey}. Skipping.`);
      continue;
    }

    // H-08: Check if target agent file is a symlink or escapes real directory
    try {
      const targetLstat = fs.lstatSync(fpath);
      if (targetLstat.isSymbolicLink()) {
        console.warn(`WARNING: Symlinked agent file target detected for ${agentKey}. Removing symlink to prevent external file overwrite.`);
        fs.unlinkSync(fpath);
      }
    } catch (_) {}

    try {
      const realDir = fs.realpathSync(resolvedDir);
      if (fs.existsSync(fpath)) {
        const realFpath = fs.realpathSync(fpath);
        if (!realFpath.startsWith(realDir + path.sep)) {
          console.warn(`WARNING: Realpath containment violation for ${agentKey}. Removing symlinked/divergent target.`);
          fs.unlinkSync(fpath);
        }
      }
    } catch (_) {}

    // Rollback backup file if present and regular file (not symlink)
    try {
      if (fs.existsSync(bakPath)) {
        const bakLstat = fs.lstatSync(bakPath);
        if (bakLstat.isSymbolicLink()) {
          fs.unlinkSync(bakPath);
        } else if (bakLstat.isFile()) {
          // Ensure destination is not a symlink before copying
          try {
            const destLstat = fs.lstatSync(fpath);
            if (destLstat.isSymbolicLink()) {
              fs.unlinkSync(fpath);
            }
          } catch (_) {}
          fs.copyFileSync(bakPath, fpath);
          fs.unlinkSync(bakPath);
        }
      }
    } catch (e) {
      console.warn(`WARNING: Could not restore backup for ${agentKey}: ${e.message}`);
    }

    // Remove staged file if present and regular file (not symlink)
    try {
      if (fs.existsSync(stagedPath)) {
        const stLstat = fs.lstatSync(stagedPath);
        if (stLstat.isSymbolicLink() || stLstat.isFile()) {
          fs.unlinkSync(stagedPath);
        }
      }
    } catch (_) {}
  }

  try { fs.unlinkSync(journalPath); } catch (_) {}
}

function applyPresetTransaction(agentDir, presetKey) {
  const p = PRESETS[presetKey];
  if (!p) throw new Error(`Invalid preset: ${presetKey}`);

  const resolvedDir = path.resolve(agentDir);
  recoverPresetJournal(resolvedDir);

  const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const journalPath = path.join(resolvedDir, '.preset_transaction.json');
  const items = [];

  for (const [agentKey, modelId] of Object.entries(p.models)) {
    const agentMeta = AGENTS.find(a => a.key === agentKey);
    if (agentMeta) {
      const targetFile = agentMeta.file;
      if (targetFile.includes('/') || targetFile.includes('\\')) continue;

      const fpath = path.join(resolvedDir, targetFile);
      if (fs.existsSync(fpath)) {
        // Enforce containment and reject symlinks
        try {
          const st = fs.lstatSync(fpath);
          if (st.isSymbolicLink()) {
            throw new Error(`Security error: Agent file cannot be a symbolic link: ${fpath}`);
          }
        } catch (e) {
          if (e.message.startsWith('Security error')) throw e;
        }
        try {
          const realDir = fs.realpathSync(resolvedDir);
          const realFpath = fs.realpathSync(fpath);
          if (!realFpath.startsWith(realDir + path.sep)) {
            throw new Error(`Security error: Agent file realpath traversal detected: ${fpath}`);
          }
        } catch (e) {
          if (e.message.startsWith('Security error')) throw e;
        }
        if (!path.resolve(fpath).startsWith(resolvedDir + path.sep)) {
          throw new Error(`Security error: Agent file path traversal detected: ${fpath}`);
        }
        const originalContent = fs.readFileSync(fpath, 'utf8');
        const newContent = computeUpdatedAgentContent(originalContent, modelId);
        const stagedPath = path.join(resolvedDir, `.${targetFile}.${txId}.staged`);
        const bakPath = path.join(resolvedDir, `.${targetFile}.${txId}.bak`);

        const fd = fs.openSync(stagedPath, 'w');
        try {
          fs.writeSync(fd, newContent, 0, 'utf8');
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        items.push({ agentKey, targetFile, fpath, bakPath, stagedPath, originalContent });
      }
    }
  }

  if (items.length === 0) {
    throw new Error(`No agent files found in ${resolvedDir} to configure.`);
  }

  // H-08: Write journal storing ONLY transaction ID and allowlisted agent keys (NO raw paths!)
  const tempJournalPath = path.join(resolvedDir, `.${txId}.journal.tmp`);
  const journalPayload = JSON.stringify({
    status: 'staged',
    transactionId: txId,
    timestamp: Date.now(),
    presetKey,
    agents: items.map(i => i.agentKey)
  }, null, 2);

  const jfd = fs.openSync(tempJournalPath, 'w');
  try {
    fs.writeSync(jfd, journalPayload, 0, 'utf8');
    fs.fsyncSync(jfd);
  } finally {
    fs.closeSync(jfd);
  }
  fs.renameSync(tempJournalPath, journalPath);

  // Commit phase with crash-safe journal
  const committed = [];
  try {
    for (const item of items) {
      try {
        const st = fs.lstatSync(item.fpath);
        if (st.isSymbolicLink()) throw new Error(`Security error: Agent file cannot be a symbolic link: ${item.fpath}`);
      } catch (e) {
        if (e.message.startsWith('Security error')) throw e;
      }
      fs.copyFileSync(item.fpath, item.bakPath);
      fs.renameSync(item.stagedPath, item.fpath);
      committed.push(item);
    }
    fs.writeFileSync(journalPath, JSON.stringify({ status: 'committed', transactionId: txId }), 'utf8');
    for (const item of items) {
      try { if (fs.existsSync(item.bakPath)) fs.unlinkSync(item.bakPath); } catch (_) {}
    }
    try { fs.unlinkSync(journalPath); } catch (_) {}
    return items.length;
  } catch (err) {
    // Rollback from backups
    for (const item of committed) {
      try {
        if (fs.existsSync(item.bakPath)) {
          try {
            const st = fs.lstatSync(item.fpath);
            if (st.isSymbolicLink()) fs.unlinkSync(item.fpath);
          } catch (_) {}
          fs.copyFileSync(item.bakPath, item.fpath);
          fs.unlinkSync(item.bakPath);
        }
      } catch (_) {}
    }
    for (const item of items) {
      try { if (fs.existsSync(item.stagedPath)) fs.unlinkSync(item.stagedPath); } catch (_) {}
      try { if (fs.existsSync(item.bakPath)) fs.unlinkSync(item.bakPath); } catch (_) {}
    }
    try { fs.unlinkSync(journalPath); } catch (_) {}
    throw err;
  }
}

const applyPresetAtomically = applyPresetTransaction;

function readAllAgentStates(agentDir) {
  const states = {};
  for (const a of AGENTS) {
    const p = path.join(agentDir, a.file);
    states[a.key] = {
      ...a,
      path: p,
      exists: fs.existsSync(p),
      model: getAgentModel(p)
    };
  }
  return states;
}

function projectRootForAgentDir(agentDir) {
  const resolved = path.resolve(agentDir);
  if (path.basename(resolved) !== 'agent' || path.basename(path.dirname(resolved)) !== '.opencode') return null;
  return path.dirname(path.dirname(resolved));
}

function modelIdFromRuntimeValue(value) {
  if (!value) return null;
  if (typeof value === 'string' && isValidModelId(value)) return value;
  if (typeof value !== 'object') return null;
  const provider = value.providerID || value.providerId || value.provider;
  const model = value.modelID || value.modelId || value.id;
  if (typeof provider === 'string' && typeof model === 'string' && isValidModelId(`${provider}/${model}`)) return `${provider}/${model}`;
  for (const [key, nested] of Object.entries(value)) {
    if (/^(?:model|resolvedModel)$/i.test(key)) {
      const found = modelIdFromRuntimeValue(nested);
      if (found) return found;
    }
  }
  return null;
}

function queryRuntimeAgentModels(agentDir, keys) {
  const cwd = projectRootForAgentDir(agentDir);
  if (!cwd) return { ok: false, models: {}, errors: ['runtime verification requires an installed .opencode/agent directory'] };
  const models = {}, errors = [];
  for (const key of keys) {
    try {
      const output = execFileSync(process.env.OEOS_OPENCODE_BINARY || 'opencode', ['debug', 'agent', key, '--pure'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      let parsed = null;
      try { parsed = JSON.parse(output); } catch { /* older CLI may print structured text */ }
      let model = modelIdFromRuntimeValue(parsed);
      if (!model) {
        const provider = output.match(/(?:providerID|providerId)\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i)?.[1];
        const modelName = output.match(/(?:modelID|modelId)\s*[:=]\s*["']?([A-Za-z0-9._:/-]+)/i)?.[1];
        const direct = output.match(/\b[A-Za-z0-9._-]+\/[A-Za-z0-9._:/-]+\b/)?.[0];
        model = provider && modelName ? `${provider}/${modelName}` : direct || null;
      }
      if (!model || !isValidModelId(model)) errors.push(`${key}: OpenCode did not report a resolved provider/model identity`);
      else models[key] = model;
    } catch (error) {
      errors.push(`${key}: ${String(error.stderr || error.message).trim()}`);
    }
  }
  return { ok: errors.length === 0, models, errors };
}

function normalizeModelId(id) {
  if (!id) return '';
  let s = id.toLowerCase().trim();
  if (s.includes('/')) {
    const parts = s.split('/');
    s = parts[parts.length - 1];
  }
  return s;
}

function getModelFamily(id) {
  if (!id) return null;
  const slash = id.indexOf('/');
  if (slash < 1) return null;
  // Provider names are deliberately excluded. Only normalized model namespace
  // and model-name tokens may establish a family.
  const model = id.slice(slash + 1).toLowerCase();
  const token = value => new RegExp(`(?:^|[/._-])${value}(?:$|[/._-])`).test(model);
  if (token('kimi') || token('moonshot') || token('moonshotai')) return 'Kimi';
  if (token('glm') || token('zhipu') || token('chatglm')) return 'GLM';
  if (token('deepseek')) return 'DeepSeek';
  if (token('claude') || token('anthropic') || token('opus') || token('sonnet') || token('haiku')) return 'Claude';
  if (token('gpt') || /(?:^|[/._-])o[134](?:$|[/._-])/.test(model) || token('chatgpt') || token('luna')) return 'OpenAI';
  if (token('minimax') || token('abab')) return 'MiniMax';
  if (token('gemini') || token('palm')) return 'Gemini';
  if (token('llama') || token('meta-llama')) return 'Llama';
  if (token('muse') || token('spark')) return 'Muse';
  if (token('mimo')) return 'MiMo';
  if (token('mistral') || token('mixtral') || token('codestral')) return 'Mistral';
  if (/(?:^|[/._-])qwen(?:\d|$|[/._-])/.test(model) || token('tongyi')) return 'Qwen';
  if (token('grok') || token('xai')) return 'Grok';
  if (token('cohere') || token('command-r')) return 'Cohere';
  return null;
}

function checkIndependence(states, waiver = null) {
  const coder = states['oeos-coder']?.model;
  const qa = states['oeos-test-planner']?.model;
  const adv = states['oeos-adversarial']?.model;
  const glm = states['oeos-glm-reviewer']?.model;

  const warnings = [];
  const nonWaivableWarnings = [];
  const hardWarning = message => { warnings.push(message); nonWaivableWarnings.push(message); };

  // Check unconfigured / session default collapse risk (M2)
  const unpinned = [];
  if (!coder) unpinned.push("Coder ('oeos-coder')");
  if (!qa) unpinned.push("Executable QA ('oeos-test-planner')");
  if (!adv) unpinned.push("Adversarial ('oeos-adversarial')");
  if (!glm) unpinned.push("GLM ('oeos-glm-reviewer')");

  if (unpinned.length) {
    const verb = unpinned.length === 1 ? "inherits" : "inherit";
    hardWarning(`Independence unverified: ${unpinned.join(' and ')} ${verb} session default${unpinned.length > 1 ? " (roles may collapse to one runtime model)" : ""}.`);
  }

  // 1. Exact ID check
  if (coder && adv && coder === adv) {
    warnings.push(`Coder ('oeos-coder') and Adversarial ('oeos-adversarial') share model '${coder}'`);
  }
  if (coder && glm && coder === glm) {
    warnings.push(`Coder ('oeos-coder') and GLM ('oeos-glm-reviewer') share model '${coder}'`);
  }
  if (qa && coder && qa === coder) {
    warnings.push(`Executable QA ('oeos-test-planner') and Coder ('oeos-coder') share model '${qa}'`);
  }
  if (qa && glm && qa === glm) {
    hardWarning(`Executable QA ('oeos-test-planner') and its independent GLM reviewer share model '${qa}'`);
  }

  // 2. Cross-provider identical model check (normalized name)
  const normCoder = normalizeModelId(coder);
  const normQa = normalizeModelId(qa);
  const normAdv = normalizeModelId(adv);
  const normGlm = normalizeModelId(glm);

  if (normCoder && normAdv && normCoder === normAdv && coder !== adv) {
    warnings.push(`Coder and Adversarial Reviewer share the same underlying model '${normCoder}' across providers ('${coder}' vs '${adv}')`);
  }
  if (normCoder && normGlm && normCoder === normGlm && coder !== glm) {
    warnings.push(`Coder and GLM Reviewer share the same underlying model '${normCoder}' across providers ('${coder}' vs '${glm}')`);
  }
  if (normQa && normCoder && normQa === normCoder && qa !== coder) {
    warnings.push(`Executable QA and Coder share the same underlying model '${normQa}' across providers ('${qa}' vs '${coder}')`);
  }
  if (normQa && normGlm && normQa === normGlm && qa !== glm) {
    hardWarning(`Executable QA and GLM Reviewer share the same underlying model '${normQa}' across providers ('${qa}' vs '${glm}')`);
  }

  // 3. Model family check (cross-provider collision)
  const coderFam = getModelFamily(coder);
  const qaFam = getModelFamily(qa);
  const advFam = getModelFamily(adv);
  const glmFam = getModelFamily(glm);

  if (coderFam && advFam && coderFam === advFam && normCoder !== normAdv) {
    warnings.push(`Coder and Adversarial Reviewer both use ${coderFam} family models ('${coder}' vs '${adv}')`);
  }
  if (coderFam && glmFam && coderFam === glmFam && normCoder !== normGlm) {
    warnings.push(`Coder and GLM Reviewer both use ${coderFam} family models ('${coder}' vs '${glm}')`);
  }
  if (qaFam && coderFam && qaFam === coderFam && normQa !== normCoder) {
    warnings.push(`Executable QA and Coder both use ${qaFam} family models ('${qa}' vs '${coder}')`);
  }
  if (qaFam && glmFam && qaFam === glmFam && normQa !== normGlm) {
    hardWarning(`Executable QA and GLM Reviewer both use ${qaFam} family models ('${qa}' vs '${glm}')`);
  }

  // 4. Unknown model family (fail closed unless waived)
  if (coder && !coderFam) {
    warnings.push(`Independence unverified: Coder ('oeos-coder') uses unknown model family '${coder}'.`);
  }
  if (qa && !qaFam) {
    warnings.push(`Independence unverified: Executable QA ('oeos-test-planner') uses unknown model family '${qa}'.`);
  }
  if (adv && !advFam) {
    warnings.push(`Independence unverified: Adversarial ('oeos-adversarial') uses unknown model family '${adv}'.`);
  }
  if (glm && !glmFam) {
    warnings.push(`Independence unverified: GLM ('oeos-glm-reviewer') uses unknown model family '${glm}'.`);
  }

  if (warnings.length > 0 && waiver && nonWaivableWarnings.length === 0) {
    return {
      valid: true,
      waived: true,
      waiverReason: waiver,
      warnings,
      nonWaivableWarnings
    };
  }

  return {
    valid: warnings.length === 0,
    waived: false,
    warnings,
    nonWaivableWarnings
  };
}

// ------------------------------------------------------------------------------
// Interactive Search-as-You-Type TUI
// ------------------------------------------------------------------------------

function selectModelInteractive(models, currentModel, agentMeta) {
  return new Promise((resolve) => {
    let query = '';
    let selectedIndex = 0;
    const termRows = process.stdout.rows || 24;
    const PAGE_SIZE = Math.max(5, Math.min(15, termRows - 13));
    let scrollOffset = 0;

    // Filter models matching query
    function getFiltered() {
      const q = query.trim().toLowerCase();
      let list = models;
      if (q) {
        list = models.filter(m =>
          m.id.toLowerCase().includes(q) ||
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.provider && m.provider.toLowerCase().includes(q)) ||
          (m.note && m.note.toLowerCase().includes(q))
        );
      } else {
        // When query is empty, sort models recommended for this agent to top
        list = [...models].sort((a, b) => {
          const aRec = (a.recommendedFor || []).includes(agentMeta.key) ? 1 : 0;
          const bRec = (b.recommendedFor || []).includes(agentMeta.key) ? 1 : 0;
          return bRec - aRec;
        });
      }

      const results = [...list];

      // Option: Clear / Session default
      results.push({
        id: '__UNSET__',
        name: `[x] (session default)`,
        note: 'Inherit session default (removes model: pin)'
      });

      // Option: Custom write-in
      results.push({
        id: '__CUSTOM__',
        name: `[+] Enter custom model ID...`,
        note: q ? `Use custom: '${query}'` : 'Type any custom provider/model ID'
      });
      return results;
    }

    // Set initial selection to currentModel in the sorted recommendation list
    const initialList = getFiltered();
    if (currentModel) {
      const initIdx = initialList.findIndex(m => m.id === currentModel);
      if (initIdx >= 0) {
        selectedIndex = initIdx;
        scrollOffset = Math.max(0, initIdx - Math.floor(PAGE_SIZE / 2));
      }
    }

    function render() {
      const filtered = getFiltered();
      if (selectedIndex >= filtered.length) selectedIndex = Math.max(0, filtered.length - 1);
      if (selectedIndex < scrollOffset) scrollOffset = selectedIndex;
      if (selectedIndex >= scrollOffset + PAGE_SIZE) scrollOffset = selectedIndex - PAGE_SIZE + 1;

      const visible = filtered.slice(scrollOffset, scrollOffset + PAGE_SIZE);

      const lines = [];
      lines.push(`${REPOSITION_TOP}`);
      lines.push(`${BOLD}${BLUE}======================================================================${RESET}`);
      lines.push(`${BOLD}SELECT MODEL FOR: ${CYAN}${agentMeta.key}${RESET} ${DIM}(${agentMeta.role})${RESET}`);
      lines.push(`${BOLD}${BLUE}======================================================================${RESET}`);
      lines.push(`Recommended family : ${GREEN}${agentMeta.rec}${RESET}`);
      lines.push(`Current model      : ${currentModel ? `${YELLOW}${currentModel}${RESET}` : `${DIM}(session default)${RESET}`}`);
      lines.push('');
      lines.push(`${BOLD}Search / Filter   :${RESET} ${query}${INVERSE} ${RESET}`);
      lines.push(`${DIM}Controls: Type to filter | ↑/↓ or Ctrl+N/P to navigate | Enter to select | Esc to cancel${RESET}`);
      lines.push('----------------------------------------------------------------------');

      if (visible.length === 0) {
        lines.push(`  ${YELLOW}No matching models found.${RESET}`);
      } else {
        visible.forEach((item, idx) => {
          const actualIdx = scrollOffset + idx;
          const isSelected = actualIdx === selectedIndex;
          const marker = isSelected ? `${GREEN}${BOLD}❯${RESET} ` : '  ';
          const isCustom = item.id === '__CUSTOM__';
          const isUnset = item.id === '__UNSET__';
          const isRec = (item.recommendedFor || []).includes(agentMeta.key);
          const recBadge = isRec ? `${GREEN}[★ REC]${RESET} ` : '';

          let idDisplay = item.id;
          if (isSelected) {
            idDisplay = `${INVERSE}${BOLD}${item.id}${RESET}`;
          } else if (item.id === currentModel) {
            idDisplay = `${YELLOW}${BOLD}${item.id}${RESET} ${DIM}(current)${RESET}`;
          }

          let note = item.note ? `${DIM}— ${item.note}${RESET}` : '';
          if (isCustom) {
            idDisplay = isSelected ? `${INVERSE}${BOLD}${item.name}${RESET}` : `${MAGENTA}${BOLD}${item.name}${RESET}`;
            note = `${DIM}— ${item.note}${RESET}`;
          } else if (isUnset) {
            idDisplay = isSelected ? `${INVERSE}${BOLD}${item.name}${RESET}` : `${DIM}${BOLD}${item.name}${RESET}`;
            note = `${DIM}— ${item.note}${RESET}`;
          }

          lines.push(`${marker}${recBadge}${idDisplay} ${note}`);
        });
      }

      lines.push('----------------------------------------------------------------------');
      lines.push(`${DIM}Matches: ${filtered.length} models (Page ${Math.floor(scrollOffset / PAGE_SIZE) + 1} of ${Math.ceil(filtered.length / PAGE_SIZE) || 1})${RESET}`);

      process.stdout.write(lines.join('\n'));
    }

    // Key handling with readline event emitter (fixes L1 split escape packets)
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    readline.emitKeypressEvents(stdin);
    if (process.stdout.isTTY) process.stdout.write(`${ENTER_ALT_SCREEN}${HIDE_CURSOR}`);

    render();

    function cleanup() {
      stdin.removeListener('keypress', onKeypress);
      stdin.setRawMode(wasRaw || false);
      if (process.stdout.isTTY) process.stdout.write(`${SHOW_CURSOR}${EXIT_ALT_SCREEN}`);
    }

    async function promptCustomWriteIn(prefill = '') {
      cleanup();
      process.stdout.write(`${REPOSITION_TOP}`);
      process.stdout.write(`${BOLD}${BLUE}======================================================================${RESET}\n`);
      process.stdout.write(`${BOLD}ENTER CUSTOM MODEL ID FOR ${CYAN}${agentMeta.key}${RESET}\n`);
      process.stdout.write(`${DIM}Format: provider_id/model_id (e.g. opencode-go/kimi-k3 or anthropic/claude-3-7-sonnet)${RESET}\n`);
      process.stdout.write(`${BOLD}${BLUE}======================================================================${RESET}\n\n`);

      const promptLabel = prefill
        ? `Enter model ID (or press Enter to use '${prefill}'): `
        : `Enter model ID (leave blank to cancel): `;

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(promptLabel, (ans) => {
        rl.close();
        const trimmed = ans.trim() || prefill.trim();
        if (trimmed.length === 0) {
          resolve(null);
        } else if (!isValidModelId(trimmed)) {
          console.error(`Invalid model ID '${trimmed}'. Expected provider_id/model_id using letters, numbers, '.', '_', ':', '/', and '-'.`);
          resolve(null);
        } else {
          resolve(trimmed);
        }
      });
    }

    function onKeypress(str, key) {
      if (!key) return;
      const filtered = getFiltered();

      // Enter
      if (key.name === 'return' || key.name === 'enter') {
        const item = filtered[selectedIndex];
        if (item) {
          if (item.id === '__CUSTOM__') {
            promptCustomWriteIn(query);
            return;
          }
          if (item.id === '__UNSET__') {
            cleanup();
            resolve('__UNSET__');
            return;
          }
          cleanup();
          resolve(item.id);
          return;
        }
      }

      // Esc or Ctrl+C
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve(null);
        return;
      }

      // Up or Ctrl+P or Ctrl+K or (k when query empty)
      if (key.name === 'up' || (key.ctrl && key.name === 'p') || (key.ctrl && key.name === 'k') || (query === '' && key.name === 'k')) {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : filtered.length - 1;
        render();
        return;
      }

      // Down or Ctrl+N or Ctrl+J or (j when query empty)
      if (key.name === 'down' || (key.ctrl && key.name === 'n') || (key.ctrl && key.name === 'j') || (query === '' && key.name === 'j')) {
        selectedIndex = selectedIndex < filtered.length - 1 ? selectedIndex + 1 : 0;
        render();
        return;
      }

      // Page Up
      if (key.name === 'pageup') {
        selectedIndex = Math.max(0, selectedIndex - PAGE_SIZE);
        render();
        return;
      }

      // Page Down
      if (key.name === 'pagedown') {
        selectedIndex = Math.min(filtered.length - 1, selectedIndex + PAGE_SIZE);
        render();
        return;
      }

      // Home
      if (key.name === 'home') {
        selectedIndex = 0;
        scrollOffset = 0;
        render();
        return;
      }

      // End
      if (key.name === 'end') {
        selectedIndex = filtered.length - 1;
        render();
        return;
      }

      // Backspace
      if (key.name === 'backspace') {
        if (query.length > 0) {
          query = query.slice(0, -1);
          selectedIndex = 0;
          scrollOffset = 0;
          render();
        }
        return;
      }

      // Printable character
      if (str && str.length === 1 && !key.ctrl && !key.meta && str.charCodeAt(0) >= 32) {
        query += str;
        selectedIndex = 0;
        scrollOffset = 0;
        render();
        return;
      }
    }

    stdin.on('keypress', onKeypress);
  });
}

// ------------------------------------------------------------------------------
// Presets Menu
// ------------------------------------------------------------------------------

function selectPresetInteractive() {
  return new Promise((resolve) => {
    const keys = Object.keys(PRESETS);
    let selectedIndex = 0;

    function render() {
      const lines = [];
      lines.push(`${REPOSITION_TOP}`);
      lines.push(`${BOLD}${BLUE}======================================================================${RESET}`);
      lines.push(`${BOLD}SELECT 1-CLICK RECOMMENDED PRESET${RESET}`);
      lines.push(`${BOLD}${BLUE}======================================================================${RESET}`);
      lines.push(`${DIM}Choose a verified multi-model configuration for all 6 subagents:${RESET}\n`);

      keys.forEach((k, idx) => {
        const p = PRESETS[k];
        const isSelected = idx === selectedIndex;
        const marker = isSelected ? `${GREEN}${BOLD}❯${RESET} ` : '  ';
        const title = isSelected ? `${INVERSE}${BOLD} ${p.name} ${RESET}` : `${CYAN}${BOLD}${p.name}${RESET}`;
        lines.push(`${marker}${title}`);
        lines.push(`    ${DIM}${p.description}${RESET}`);
        lines.push('');
      });

      lines.push('----------------------------------------------------------------------');
      lines.push(`${DIM}Controls: ↑/↓ to navigate | Enter to apply | Esc to cancel${RESET}`);

      process.stdout.write(lines.join('\n'));
    }

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    readline.emitKeypressEvents(stdin);
    if (process.stdout.isTTY) process.stdout.write(`${ENTER_ALT_SCREEN}${HIDE_CURSOR}`);

    render();

    function cleanup() {
      stdin.removeListener('keypress', onKeypress);
      stdin.setRawMode(wasRaw || false);
      if (process.stdout.isTTY) process.stdout.write(`${SHOW_CURSOR}${EXIT_ALT_SCREEN}`);
    }

    function onKeypress(str, key) {
      if (!key) return;
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(keys[selectedIndex]);
        return;
      }
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve(null);
        return;
      }
      if (key.name === 'up' || (key.ctrl && key.name === 'p') || key.name === 'k') {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : keys.length - 1;
        render();
        return;
      }
      if (key.name === 'down' || (key.ctrl && key.name === 'n') || key.name === 'j') {
        selectedIndex = selectedIndex < keys.length - 1 ? selectedIndex + 1 : 0;
        render();
        return;
      }
    }

    stdin.on('keypress', onKeypress);
  });
}

// ------------------------------------------------------------------------------
// Main Dashboard
// ------------------------------------------------------------------------------

async function runDashboard(agentDir, initialNotice = null) {
  let allModels = await discoverAllModels(true);
  let notice = initialNotice;

  while (true) {
    const states = readAllAgentStates(agentDir);
    const ind = checkIndependence(states);

    const lines = [];
    lines.push(`${REPOSITION_TOP}`);
    lines.push(`${BOLD}${BLUE}======================================================================${RESET}`);
    lines.push(`${BOLD}OEOS v6 Subagent Model Configuration Dashboard${RESET}`);
    lines.push(`${BOLD}${BLUE}======================================================================${RESET}`);
    lines.push(`Agent directory: ${DIM}${agentDir}${RESET}\n`);

    lines.push(`${BOLD}#   Subagent              Role                             Configured Model${RESET}`);
    lines.push('----------------------------------------------------------------------');

    AGENTS.forEach((a, idx) => {
      const num = `${idx + 1}`.padStart(2, ' ');
      const keyPad = a.key.padEnd(20, ' ');
      const rolePad = a.role.padEnd(32, ' ').slice(0, 32);
      const m = states[a.key]?.model;
      let modelDisplay = m ? `${GREEN}${BOLD}${m}${RESET}` : `${DIM}(session default)${RESET}`;

      // Highlight executable authors and reviewers for quick visual audit.
      if (a.key === 'oeos-coder') {
        modelDisplay = m ? `${YELLOW}${BOLD}${m}${RESET}` : `${RED}UNSET${RESET}`;
      } else if (a.key === 'oeos-test-planner') {
        modelDisplay = m ? `${MAGENTA}${BOLD}${m}${RESET}` : `${RED}UNSET${RESET}`;
      } else if (a.key === 'oeos-adversarial' || a.key === 'oeos-glm-reviewer') {
        modelDisplay = m ? `${CYAN}${BOLD}${m}${RESET}` : `${DIM}(session default)${RESET}`;
      }

      lines.push(`${BOLD}${num}${RESET}  ${keyPad}  ${DIM}${rolePad}${RESET} ${modelDisplay}`);
    });

    lines.push('----------------------------------------------------------------------');
    lines.push(`${BOLD}Reviewer Independence Guard:${RESET}`);
    if (ind.valid) {
      lines.push(`  ${GREEN}✔ VERIFIED: Coder, Adversarial, and GLM models are pinned and distinct.${RESET}`);
    } else {
      ind.warnings.forEach(w => {
        lines.push(`  ${RED}${BOLD}⚠ ${w}${RESET}`);
      });
      lines.push(`  ${YELLOW}Notice: Kickoff will halt with BLOCKED unless distinct models are chosen.${RESET}`);
    }
    lines.push('======================================================================');

    if (notice) {
      lines.push(`${GREEN}${BOLD}ℹ ${notice}${RESET}`);
      lines.push('======================================================================');
      notice = null;
    }

    lines.push(`${BOLD}ACTIONS:${RESET}`);
    lines.push(`  ${CYAN}[1-7]${RESET} Reconfigure specific subagent`);
    lines.push(`  ${CYAN}[A]${RESET}   Configure All (Guided Sequential Wizard)`);
    lines.push(`  ${CYAN}[P]${RESET}   Apply 1-Click Recommended Preset`);
    lines.push(`  ${CYAN}[R]${RESET}   Force-Refresh Provider Model List`);
    lines.push(`  ${CYAN}[Q]${RESET}   Save & Exit`);
    lines.push('======================================================================');
    lines.push(`Select an option: `);

    process.stdout.write(lines.join('\n'));

    const choice = await new Promise((resolve) => {
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      readline.emitKeypressEvents(stdin);

      function onKey(str, key) {
        stdin.removeListener('keypress', onKey);
        stdin.setRawMode(wasRaw || false);
        resolve(str || (key && key.name) || '');
      }
      stdin.on('keypress', onKey);
    });

    // Handle choices
    if (choice === 'q' || choice === 'Q' || choice === 'escape') {
      process.stdout.write(`${CLEAR_SCREEN}`);
      console.log(`${GREEN}✔ Subagent model configuration saved successfully.${RESET}`);
      console.log(`Agents configured in: ${agentDir}\n`);
      break;
    }

    if (choice === 'r' || choice === 'R') {
      process.stdout.write(`\n${CYAN}Refreshing OpenCode's resolved model inventory...${RESET}\n`);
      allModels = await discoverAllModels(true);
      notice = `Discovered ${allModels.length} models from OpenCode's resolved inventory and the catalog.`;
      continue;
    }

    if (choice === 'p' || choice === 'P') {
      const presetKey = await selectPresetInteractive();
      if (presetKey && PRESETS[presetKey]) {
        try {
          const appliedCount = applyPresetTransaction(agentDir, presetKey);
          notice = `Applied preset: ${PRESETS[presetKey].name} (${appliedCount} agents configured atomically)`;
        } catch (err) {
          notice = `ERROR: Failed to apply preset: ${err.message}`;
        }
      }
      continue;
    }

    if (choice === 'a' || choice === 'A') {
      for (const a of AGENTS) {
        if (a.key === 'oeos') continue; // skip orchestrator in quick wizard
        const cur = getAgentModel(path.join(agentDir, a.file));
        const selected = await selectModelInteractive(allModels, cur, a);
        if (selected === '__UNSET__') {
          setAgentModel(path.join(agentDir, a.file), null);
        } else if (selected) {
          setAgentModel(path.join(agentDir, a.file), selected);
        }
      }
      notice = 'Completed wizard for all subagents.';
      continue;
    }

    const numChoice = parseInt(choice, 10);
    if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= AGENTS.length) {
      const a = AGENTS[numChoice - 1];
      const cur = getAgentModel(path.join(agentDir, a.file));
      const selected = await selectModelInteractive(allModels, cur, a);
      if (selected === '__UNSET__') {
        setAgentModel(path.join(agentDir, a.file), null);
        notice = `Reset ${a.key} -> (session default)`;
      } else if (selected) {
        setAgentModel(path.join(agentDir, a.file), selected);
        notice = `Updated ${a.key} -> ${selected}`;
      }
      continue;
    }
  }
}

// ------------------------------------------------------------------------------
// CLI Non-Interactive Execution
// ------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Flag: --help / -h
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
OEOS v6 Subagent Model Configuration Tool

Usage:
  bash tools/configure-models.sh                      Launch interactive TUI (arrow keys + live search)
  bash tools/configure-models.sh --status             Show active models & independence verification
  bash tools/configure-models.sh --status --verify-runtime
                                                        Verify OpenCode inventory and child-agent identities
  bash tools/configure-models.sh --preset <name>      Apply 1-click preset (standard, budget, frontier)
  bash tools/configure-models.sh --set <agent>=<id>   Set model for a specific subagent (or id=default)
  bash tools/configure-models.sh --list-models        List all discovered models
  bash tools/configure-models.sh --agent-dir <path>   Explicitly specify target agent directory
  bash tools/configure-models.sh --help               Show this help message

Presets:
  standard   Muse Spark 1.3 + GLM 5.3 + DeepSeek V4 Pro + Qwen3.8 Max (Zero-Quality-Compromise)
  budget     Muse Spark 1.3 + GPT 5.6 Luna + GLM 5.3 Flash + DeepSeek V4.1 Flash (4-Lab Synergy)
  frontier   Kimi K3 + Grok 4.7 + GLM 5.3 + DeepSeek V4 Pro + Qwen3.8 Max (Go Flagships)

Subagents:
  oeos-planner       (Kimi K3 role - Architecture, Contracts)
  oeos-test-planner  (Executable QA - strategy, acceptance/E2E tests, interaction evidence)
  oeos-adversarial   (Kimi K3 role - Fresh Context Reviewer)
  oeos-glm-reviewer  (GLM 5.2 role - Independent Reviewer)
  oeos-coder         (DeepSeek role - TDD Implementation)
  oeos-auditor       (Opus role - Milestone Audit)
  oeos               (Orchestrator - Session Default)
`);
    process.exit(0);
  }

  const agentDir = findAgentDir(args);
  if (!agentDir) {
    console.error(`\nERROR: Could not locate OEOS agent directory (.opencode/agent/ or runbook/agent/).`);
    console.error(`Make sure you run this command from your project root (where .opencode/agent/ exists),`);
    console.error(`or run: bash runbook/install.sh to initialize the agents first.\n`);
    process.exit(1);
  }

  // Crash recovery: automatically rollback any interrupted preset transaction
  recoverPresetJournal(agentDir);

  // Flag: --status
  if (args.includes('--status')) {
    const states = readAllAgentStates(agentDir);
    const waiverIdx = args.indexOf('--waiver');
    if (waiverIdx >= 0 && (!args[waiverIdx + 1] || args[waiverIdx + 1].startsWith('--'))) {
      console.error('ERROR: --waiver requires a nonempty recorded reason.');
      process.exit(1);
    }
    const waiver = waiverIdx >= 0 ? args[waiverIdx + 1].trim() : null;
    if (waiverIdx >= 0 && !waiver) {
      console.error('ERROR: --waiver requires a nonempty recorded reason.');
      process.exit(1);
    }
    const ind = checkIndependence(states, waiver);
    if (args.includes('--verify-runtime')) {
      const resolved = queryResolvedOpenCodeModels(projectRootForAgentDir(agentDir) || process.cwd());
      const runtimeFailure = message => { ind.warnings.push(message); ind.nonWaivableWarnings.push(message); };
      if (!resolved.ok) runtimeFailure(`OpenCode model inventory unavailable: ${resolved.error}`);
      else {
        const available = new Set(resolved.models.map(model => model.id));
        for (const key of ['oeos-coder', 'oeos-test-planner', 'oeos-adversarial', 'oeos-glm-reviewer']) {
          const configured = states[key]?.model;
          if (configured && !available.has(configured)) runtimeFailure(`${key} is assigned '${configured}', which is absent from OpenCode's resolved model inventory.`);
        }
      }
      const runtime = queryRuntimeAgentModels(agentDir, ['oeos-coder', 'oeos-test-planner', 'oeos-adversarial', 'oeos-glm-reviewer']);
      for (const error of runtime.errors) runtimeFailure(`Runtime identity unavailable: ${error}`);
      for (const [key, actual] of Object.entries(runtime.models)) {
        if (states[key]?.model !== actual) runtimeFailure(`${key} resolves at runtime to '${actual}', not configured '${states[key]?.model || '(session default)'}'.`);
      }
      ind.valid = ind.nonWaivableWarnings.length === 0 && (ind.warnings.length === 0 || Boolean(waiver));
      if (ind.warnings.length && waiver && ind.valid) { ind.waived = true; ind.waiverReason = waiver; }
    }
    console.log(`\nOEOS v6 Subagent Models (${agentDir}):`);
    for (const a of AGENTS) {
      const m = states[a.key]?.model || '(session default)';
      console.log(`  ${a.key.padEnd(20)} : ${m}`);
    }
    console.log('');
    if (ind.valid) {
      if (ind.waived) {
        console.log(`✔ Independence verified with active waiver: "${ind.waiverReason}"`);
        ind.warnings.forEach(w => console.log(`  (waived) ${w}`));
      } else {
        console.log(`✔ Independence verified (distinct models pinned).`);
      }
      process.exit(0);
    } else {
      console.error(`⚠️  WARNING: Independence unverified or degraded:`);
      ind.warnings.forEach(w => console.error(`  - ${w}`));
      process.exit(1);
    }
  }

  // Flag: --list-models (L6: live discovery enabled by default)
  if (args.includes('--list-models')) {
    const live = !args.includes('--cached');
    const models = await discoverAllModels(live);
    console.log(`Available Models (${models.length} total${live ? ', OpenCode inventory enabled' : ', cached catalog'}):`);
    models.forEach(m => console.log(`  ${m.id.padEnd(36)} [${m.provider}] ${m.note || ''}`));
    process.exit(0);
  }

  // Flag: --preset <name>
  const presetIdx = args.indexOf('--preset');
  if (presetIdx >= 0) {
    const pKey = args[presetIdx + 1]?.toLowerCase();
    if (!pKey || !PRESETS[pKey]) {
      console.error(`ERROR: Invalid or missing preset name '${pKey || ''}'.`);
      console.error(`Available presets: ${Object.keys(PRESETS).join(', ')}`);
      process.exit(1);
    }
    const p = PRESETS[pKey];
    try {
      const appliedCount = applyPresetAtomically(agentDir, pKey);
      console.log(`✔ Applied preset: ${p.name} (${appliedCount} agents configured)`);
      process.exit(0);
    } catch (err) {
      console.error(`ERROR: Failed to apply preset '${pKey}' atomically: ${err.message}`);
      process.exit(1);
    }
  }

  // Flag: --set <agent>=<model>
  const setIdx = args.indexOf('--set');
  if (setIdx >= 0) {
    const rawVal = args[setIdx + 1];
    if (!rawVal || !rawVal.includes('=')) {
      console.error(`ERROR: Invalid format for --set. Expected: --set <agent>=<model_id>`);
      console.error(`Example: --set oeos-coder=opencode-go/deepseek-v4-pro`);
      console.error(`Valid agents: ${AGENTS.map(a => a.key).join(', ')}`);
      process.exit(1);
    }
    const separatorIndex = rawVal.indexOf('=');
    const agentKey = rawVal.slice(0, separatorIndex);
    const modelVal = rawVal.slice(separatorIndex + 1);
    const agentMeta = AGENTS.find(a => a.key === agentKey);
    if (!agentMeta) {
      console.error(`ERROR: Unknown agent '${agentKey}'.`);
      console.error(`Valid agents: ${AGENTS.map(a => a.key).join(', ')}`);
      process.exit(1);
    }
    const fpath = path.join(agentDir, agentMeta.file);
    if (!fs.existsSync(fpath)) {
      console.error(`ERROR: Agent file not found: ${fpath}`);
      process.exit(1);
    }
    const normalizedModel = (modelVal === 'default' || modelVal === 'none' || modelVal === 'unset') ? null : modelVal;
    if (normalizedModel && !isValidModelId(normalizedModel)) {
      console.error(`ERROR: Invalid model ID '${normalizedModel}'. Expected provider_id/model_id using letters, numbers, '.', '_', ':', '/', and '-'.`);
      process.exit(1);
    }
    setAgentModel(fpath, normalizedModel);
    console.log(`✔ Set ${agentKey} -> ${normalizedModel || '(session default)'}`);
    process.exit(0);
  }

  // Non-TTY environment check
  if (!process.stdin.isTTY) {
    console.log(`\n${BOLD}OEOS v6 Model Configuration (Non-Interactive Shell)${RESET}`);
    const states = readAllAgentStates(agentDir);
    const ind = checkIndependence(states);
    console.log(`\nSubagent Models (${agentDir}):`);
    for (const a of AGENTS) {
      const m = states[a.key]?.model || '(session default)';
      console.log(`  ${a.key.padEnd(20)} : ${m}`);
    }
    console.log('');
    if (ind.valid) {
      console.log(`✔ Independence verified (distinct models pinned).`);
    } else {
      console.log(`⚠️  Independence unverified or degraded:`);
      ind.warnings.forEach(w => console.log(`  - ${w}`));
    }
    console.log(`\n${DIM}To launch the interactive search-as-you-type TUI, run inside an interactive terminal.`);
    console.log(`Or use CLI flags: --preset standard|budget|frontier, --set <agent>=<model>, --list-models${RESET}\n`);
    process.exit(ind.valid ? 0 : 1);
  }

  // Default: Interactive TUI
  await runDashboard(agentDir);
}

main().catch(err => {
  console.error('\nError running model selector:', err.message);
  process.exit(1);
});
