/**
 * Agent Spawner & Tracker
 *
 * Spawns Claude Code agents as background processes, tracks their lifecycle,
 * and provides APIs for listing/stopping them.
 *
 * Security: follows P2a (Subagent Scope Delegation) — every spawned agent
 * receives task, scope, awareness boundary, and trust context in its prompt.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getTask, updateTask, type Task } from './tasks';
import { db, resolveDelegationLog } from './db';

const TOKEN_CACHE_PATH = join(homedir(), '.local', 'state', 'crabhud', 'oauth-token');

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentProgressSignal {
  phase: string;
  detail: string;
  timestamp: number;
}

export interface AgentInfo {
  pid: number;
  task_id: string;
  task_title: string;
  project_dir: string;
  model: string | null;
  started_at: number;
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'exhausted';
  exit_code: number | null;
  output_tail: string[];       // last N lines of combined stdout/stderr
  prompt_summary: string;      // first 200 chars of the prompt sent

  // ── Enhanced tracking ──
  full_prompt: string;                // complete prompt sent to agent
  last_output_at: number | null;      // timestamp of last output line received
  output_line_count: number;          // total output lines seen
  detected_phase: string;             // current inferred activity phase
  tools_used: string[];               // unique tools/actions detected
  files_touched: string[];            // unique files read/written
  errors: string[];                   // error messages detected (last 10)
  is_stalled: boolean;                // no output for STALL_THRESHOLD_MS
  estimated_duration_ms: number | null; // from task.estimated_minutes
  progress_signals: AgentProgressSignal[]; // phase change timeline
}

export interface SpawnOptions {
  project_dir?: string;
  model?: string;
  max_turns?: number;
  scope_description?: string;   // P2a: what dirs/resources are in scope
  trust_context?: string;       // P2a: what the agent can/can't do
  additional_instructions?: string;
}

// ── State ────────────────────────────────────────────────────────────────

const agents = new Map<number, AgentInfo>();
const agentProcesses = new Map<number, ReturnType<typeof Bun.spawn>>();
const MAX_OUTPUT_LINES = 100;
const MAX_ERRORS = 10;
const MAX_TOOLS = 50;
const MAX_FILES = 100;
const MAX_PROGRESS_SIGNALS = 50;
const STALL_THRESHOLD_MS = 120_000; // 2 minutes without output → stalled

// ── Output change broadcast callback ────────────────────────────────
// Set by index.ts to push agent updates over WebSocket
let onAgentOutputChange: ((agent: AgentInfo) => void) | null = null;
export function setOnAgentOutputChange(cb: (agent: AgentInfo) => void) {
  onAgentOutputChange = cb;
}

// Throttle WS broadcasts per agent (max once per 2s)
const lastBroadcast = new Map<number, number>();
function maybeBroadcastUpdate(agent: AgentInfo) {
  const now = Date.now();
  const last = lastBroadcast.get(agent.pid) || 0;
  if (now - last < 2000) return;
  lastBroadcast.set(agent.pid, now);
  onAgentOutputChange?.(agent);
}

// ── Output line parsing (detect phases, tools, files, errors) ───────

const TOOL_PATTERNS: [RegExp, string][] = [
  [/\bRead\b.*?(?:\/[\w./-]+)/i, 'Read'],
  [/\bWrite\b.*?(?:\/[\w./-]+)/i, 'Write'],
  [/\bEdit\b.*?(?:\/[\w./-]+)/i, 'Edit'],
  [/\bBash\b/i, 'Bash'],
  [/\bGrep\b/i, 'Grep'],
  [/\bGlob\b/i, 'Glob'],
  [/\bTask\b.*?agent/i, 'Task'],
  [/\bWebFetch\b/i, 'WebFetch'],
  [/\bWebSearch\b/i, 'WebSearch'],
  [/\bNotebookEdit\b/i, 'NotebookEdit'],
  [/\bTodoWrite\b/i, 'TodoWrite'],
];

const FILE_PATTERN = /(?:\/[\w.-]+){2,}/g;

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bpermission denied\b/i,
  /\bcannot\b.*?\bfind\b/i,
  /\bnot found\b/i,
  /\btimeout\b/i,
  /\brefused\b/i,
];

const MAX_TURNS_PATTERN = /max.turns|maximum turns|turn limit|ran out of turns|reached.*turn.*limit/i;

const PHASE_KEYWORDS: [RegExp, string][] = [
  [/reading|Read tool|cat |head |tail /i, 'reading'],
  [/writing|Write tool|creating file/i, 'writing'],
  [/editing|Edit tool|replacing/i, 'editing'],
  [/running|Bash tool|executing|npm |bun |git /i, 'executing'],
  [/searching|Grep|Glob|rg |find /i, 'searching'],
  [/testing|test|jest|pytest|vitest/i, 'testing'],
  [/installing|npm install|bun install|pip install/i, 'installing'],
  [/building|build|compile|tsc/i, 'building'],
  [/committing|git commit|git push/i, 'committing'],
  [/planning|thinking|analyzing/i, 'planning'],
];

function parseOutputLine(agent: AgentInfo, line: string) {
  // Update timing
  agent.last_output_at = Date.now();
  agent.output_line_count++;
  agent.is_stalled = false;

  // Detect tool usage
  for (const [pattern, tool] of TOOL_PATTERNS) {
    if (pattern.test(line)) {
      if (!agent.tools_used.includes(tool)) {
        agent.tools_used.push(tool);
        if (agent.tools_used.length > MAX_TOOLS) agent.tools_used.shift();
      }
      break;
    }
  }

  // Detect files
  const files = line.match(FILE_PATTERN);
  if (files) {
    for (const f of files) {
      // Skip common non-file paths and short paths
      if (f.length < 5 || /node_modules|\.git\//.test(f)) continue;
      if (!agent.files_touched.includes(f)) {
        agent.files_touched.push(f);
        if (agent.files_touched.length > MAX_FILES) agent.files_touched.shift();
      }
    }
  }

  // Detect errors
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(line)) {
      // Don't flag common false positives
      if (/error.*handler|error.*boundary|on_?error|error\.ts|error\.js/i.test(line)) continue;
      agent.errors.push(line.trim().slice(0, 200));
      if (agent.errors.length > MAX_ERRORS) agent.errors.shift();
      break;
    }
  }

  // Detect max turns exhaustion
  if (MAX_TURNS_PATTERN.test(line)) {
    agent.detected_phase = 'exhausted';
    agent.progress_signals.push({
      phase: 'exhausted',
      detail: 'Hit max turns limit — work may be incomplete',
      timestamp: Date.now(),
    });
  }

  // Detect phase changes
  for (const [pattern, phase] of PHASE_KEYWORDS) {
    if (pattern.test(line)) {
      if (agent.detected_phase !== phase) {
        agent.detected_phase = phase;
        agent.progress_signals.push({
          phase,
          detail: line.trim().slice(0, 100),
          timestamp: Date.now(),
        });
        if (agent.progress_signals.length > MAX_PROGRESS_SIGNALS) {
          agent.progress_signals.shift();
        }
      }
      break;
    }
  }

  // Broadcast update (throttled)
  maybeBroadcastUpdate(agent);
}

// ── Prompt Construction (P2a compliant) ──────────────────────────────────

function buildAgentPrompt(task: Task, options: SpawnOptions): string {
  const ccUrl = `http://localhost:${process.env.SERVER_PORT || '4000'}`;

  const sections: string[] = [];

  // 1. Task — clear, specific objective
  sections.push(`## Task\n\n${task.title}`);
  if (task.description) {
    sections.push(task.description);
  }
  if (task.rationale) {
    sections.push(`**Rationale:** ${task.rationale}`);
  }

  // Include notes (may contain unblock context)
  if (task.notes) {
    sections.push(`**Context/Notes:**\n${task.notes}`);
  }

  // 2. Scope — directories, resources, tools
  const scopeDesc = options.scope_description
    || `This project directory. Focus on the task at hand.`;
  sections.push(`## Scope\n\n${scopeDesc}`);

  // 3. Awareness boundary
  sections.push(`## Awareness Boundary

If you need resources outside the scope described above, **stop and report what you need** rather than reaching for it silently. Update the task with what's needed:

\`\`\`bash
curl -X PUT ${ccUrl}/tasks/${task.id} \\
  -H 'Content-Type: application/json' \\
  -d '{"status":"blocked","blocked_by":"human_input","blocked_reason":"[describe what you need and why]"}'
\`\`\``);

  // 4. Trust context
  const trust = options.trust_context
    || `You are authorized to read and write files within the project directory. Do not access external services, APIs, or credentials unless the task specifically requires it and they are described in the scope above.`;
  sections.push(`## Trust Context\n\n${trust}`);

  // 5. Callback mechanism — how to report status
  sections.push(`## Status Reporting

Report your progress by updating the task in the Command Center:

**When you start working:**
\`\`\`bash
curl -X PUT ${ccUrl}/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status":"active","last_agent_activity":'$(date +%s000)'}'
\`\`\`

**When you hit a blocker:**
\`\`\`bash
curl -X PUT ${ccUrl}/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status":"blocked","blocked_by":"human_input","blocked_reason":"[what you need]"}'
\`\`\`

**When you complete the task:**
\`\`\`bash
curl -X PUT ${ccUrl}/tasks/${task.id} -H 'Content-Type: application/json' -d '{"status":"complete"}'
\`\`\`

**To create subtasks:**
\`\`\`bash
curl -X POST ${ccUrl}/tasks -H 'Content-Type: application/json' -d '{"title":"[subtask]","parent_id":"${task.id}","source":"agent","status":"queued"}'
\`\`\``);

  // 6. Validation requirements — how to make results verifiable by a human
  sections.push(`## Validation Requirements

When you complete the task, you MUST update the task notes with a validation section that a human can follow to verify your work. Use this format:

\`\`\`bash
curl -X PUT ${ccUrl}/tasks/${task.id} -H 'Content-Type: application/json' -d '{"notes":"## Validation\\n\\n**What was built:** [1-sentence summary]\\n\\n**How to test:**\\n1. [concrete step the human can take right now]\\n2. [expected result they should see]\\n\\n**Files changed:**\\n- [path/to/file] — [what changed]\\n\\n**Not yet wired up:** [anything that still needs integration, if applicable]"}'
\`\`\`

This is mandatory. The human reviewing your work needs to know exactly what to do to see the result, what's working, and what's still disconnected. If your deliverable requires a server restart, frontend change, or manual trigger — say so explicitly.`);

  // 7. Additional instructions (from the spawner/manager)
  if (options.additional_instructions) {
    sections.push(`## Additional Instructions\n\n${options.additional_instructions}`);
  }

  return sections.join('\n\n');
}

// ── Spawn ────────────────────────────────────────────────────────────────

export function spawnAgent(taskId: string, options: SpawnOptions = {}): AgentInfo | { error: string } {
  const task = getTask(taskId);
  if (!task) {
    return { error: 'Task not found' };
  }

  if (task.status === 'complete' || task.status === 'archived') {
    return { error: `Task is already ${task.status}` };
  }

  // Check if an agent is already running for this task
  for (const [, agent] of agents) {
    if (agent.task_id === taskId && agent.status === 'running') {
      return { error: `Agent already running for this task (PID ${agent.pid})` };
    }
  }

  const projectDir = options.project_dir || '/Users/zebrey/Documents/GitHub/personal-os';
  const prompt = buildAgentPrompt(task, options);

  // Build claude command args
  const args: string[] = ['-p', prompt, '--verbose'];

  // Grant standard code-writing permissions so agents can operate autonomously.
  // Without this, non-interactive `claude -p` hits permission gates with no human to approve.
  // Use comma-separated format to avoid variadic arg parsing eating subsequent flags.
  args.push('--allowedTools', 'Read,Edit,Write,Bash,Glob,Grep');

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.max_turns) {
    args.push('--max-turns', String(options.max_turns));
  }

  // Spawn the process
  // CRITICAL: strip Claude Code session vars that block nesting,
  // but preserve/inject the OAuth token for subscription-based auth
  // (mirrors heartbeat.ts env-stripping logic)
  const cleanEnv: Record<string, string | undefined> = { ...process.env };
  const STRIP_VARS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_AGENT_SDK_VERSION',
    'CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES', 'CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL',
    '__CFBundleIdentifier'];
  for (const key of STRIP_VARS) delete cleanEnv[key];
  // Strip MCP_ vars
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('MCP_')) delete cleanEnv[key];
  }
  // Strip all CLAUDE_ vars except the OAuth token
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('CLAUDE_') && key !== 'CLAUDE_CODE_OAUTH_TOKEN') delete cleanEnv[key];
  }

  // Inject OAuth token (from env or cached file) for subscription auth
  let oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!oauthToken) {
    try {
      if (existsSync(TOKEN_CACHE_PATH)) {
        oauthToken = readFileSync(TOKEN_CACHE_PATH, 'utf-8').trim();
      }
    } catch {}
  }
  if (oauthToken) {
    cleanEnv.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  }

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(cleanEnv)) {
    if (value !== undefined) env[key] = value;
  }

  const proc = Bun.spawn(['claude', ...args], {
    cwd: projectDir,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const pid = proc.pid;

  const agentInfo: AgentInfo = {
    pid,
    task_id: taskId,
    task_title: task.title,
    project_dir: projectDir,
    model: options.model || null,
    started_at: Date.now(),
    status: 'running',
    exit_code: null,
    output_tail: [],
    prompt_summary: prompt.slice(0, 200),
    // Enhanced tracking
    full_prompt: prompt,
    last_output_at: null,
    output_line_count: 0,
    detected_phase: 'initializing',
    tools_used: [],
    files_touched: [],
    errors: [],
    is_stalled: false,
    estimated_duration_ms: task.estimated_minutes ? task.estimated_minutes * 60_000 : null,
    progress_signals: [{ phase: 'initializing', detail: 'Agent spawned', timestamp: Date.now() }],
  };

  agents.set(pid, agentInfo);
  agentProcesses.set(pid, proc);
  persistAgent(agentInfo);

  // Update task with agent info
  updateTask(taskId, {
    status: 'active',
    agent_session_id: `agent-${pid}`,
    last_agent_activity: Date.now(),
  }, `agent:${pid}`);

  // Stream stdout
  if (proc.stdout) {
    streamOutput(pid, proc.stdout);
  }

  // Stream stderr
  if (proc.stderr) {
    streamOutput(pid, proc.stderr);
  }

  // Handle process exit
  proc.exited.then((exitCode) => {
    const agent = agents.get(pid);
    if (agent) {
      agent.exit_code = exitCode;
      if (agent.status === 'running') {
        if (exitCode !== 0) {
          agent.status = 'failed';
        } else if (agent.detected_phase === 'exhausted') {
          agent.status = 'exhausted'; // hit max turns, work likely incomplete
        } else {
          agent.status = 'completed';
        }
      }
      agent.detected_phase = agent.status === 'completed' ? 'done'
        : agent.status === 'exhausted' ? 'exhausted'
        : 'failed';
      agent.progress_signals.push({
        phase: agent.detected_phase,
        detail: `Exit code ${exitCode}`,
        timestamp: Date.now(),
      });
      // Persist final state to SQLite
      persistAgent(agent);
      // Auto-resolve delegation log entry
      const delegationOutcome = agent.status === 'completed' ? 'success'
        : agent.status === 'exhausted' ? 'stalled'
        : 'failed';
      resolveDelegationLog(
        pid,
        delegationOutcome,
        agent.status !== 'completed'
          ? (agent.errors.slice(-1)[0] || (agent.status === 'exhausted' ? 'Hit max turns' : `Exit code ${exitCode}`))
          : undefined,
      );
      // Force-broadcast final state
      onAgentOutputChange?.(agent);
    }
    agentProcesses.delete(pid);
    lastBroadcast.delete(pid);

    console.log(`[Agent] PID ${pid} exited with code ${exitCode} (task: ${taskId})`);
  });

  console.log(`[Agent] Spawned PID ${pid} for task "${task.title}" in ${projectDir}`);

  return agentInfo;
}

// ── Output streaming ─────────────────────────────────────────────────────

async function streamOutput(pid: number, stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on newlines, keep partial last line in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          appendOutput(pid, line);
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      appendOutput(pid, buffer);
    }
  } catch {
    // Stream closed
  }
}

function appendOutput(pid: number, line: string) {
  const agent = agents.get(pid);
  if (!agent) return;

  agent.output_tail.push(line);
  if (agent.output_tail.length > MAX_OUTPUT_LINES) {
    agent.output_tail.shift();
  }

  // Parse for structured signals
  parseOutputLine(agent, line);
}

// ── Query & Control ──────────────────────────────────────────────────────

export function listAgents(): AgentInfo[] {
  return Array.from(agents.values()).sort((a, b) => b.started_at - a.started_at);
}

export function getAgent(pid: number): AgentInfo | null {
  return agents.get(pid) || null;
}

export function stopAgent(pid: number): boolean {
  const agent = agents.get(pid);
  if (!agent) return false;

  const proc = agentProcesses.get(pid);
  if (proc) {
    proc.kill();
    agentProcesses.delete(pid);
  }

  agent.status = 'stopped';
  persistAgent(agent);
  resolveDelegationLog(pid, 'stopped');

  // Update task — set back to queued so it can be reassigned
  const task = getTask(agent.task_id);
  if (task && task.status === 'active') {
    updateTask(agent.task_id, {
      status: 'queued',
      agent_session_id: undefined,
    }, 'system');
  }

  console.log(`[Agent] Stopped PID ${pid} (task: ${agent.task_id})`);
  return true;
}

/** Dismiss a specific finished agent from the list.
 *  Agents persist until explicitly dismissed by the human —
 *  this is the only way to remove completed/failed/stopped agents. */
export function dismissAgent(pid: number): boolean {
  const agent = agents.get(pid);
  if (!agent) return false;
  if (agent.status === 'running') return false; // can't dismiss running agents, stop first
  agents.delete(pid);
  agentProcesses.delete(pid);
  // Mark dismissed in SQLite so it doesn't reload on next startup
  db.prepare('UPDATE agent_runs SET dismissed = 1 WHERE pid = ?').run(pid);
  return true;
}

/** Legacy cleanup — only removes agents already dismissed or very old (24h+).
 *  Normal cleanup path is dismissAgent() triggered by human review. */
export function cleanupFinishedAgents(): number {
  let cleaned = 0;
  const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours (safety net only)

  for (const [pid, agent] of agents) {
    if (agent.status !== 'running' && agent.started_at < cutoff) {
      agents.delete(pid);
      agentProcesses.delete(pid);
      cleaned++;
    }
  }

  return cleaned;
}

// ── Stall detection (runs every 30s) ──────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const agent of agents.values()) {
    if (agent.status !== 'running') continue;
    const lastActivity = agent.last_output_at || agent.started_at;
    const wasStalled = agent.is_stalled;
    agent.is_stalled = (now - lastActivity) > STALL_THRESHOLD_MS;
    // Broadcast if stall state changed
    if (agent.is_stalled && !wasStalled) {
      agent.progress_signals.push({
        phase: 'stalled',
        detail: `No output for ${Math.round((now - lastActivity) / 1000)}s`,
        timestamp: now,
      });
      onAgentOutputChange?.(agent);
    }
  }
}, 30_000);

// ── SQLite Persistence ────────────────────────────────────────────────

function persistAgent(agent: AgentInfo) {
  db.prepare(`
    INSERT OR REPLACE INTO agent_runs
      (pid, task_id, task_title, project_dir, model, started_at, finished_at,
       status, exit_code, output_tail, prompt_summary, full_prompt,
       detected_phase, tools_used, files_touched, errors, progress_signals,
       output_line_count, dismissed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    agent.pid,
    agent.task_id,
    agent.task_title,
    agent.project_dir,
    agent.model,
    agent.started_at,
    agent.status !== 'running' ? Date.now() : null,
    agent.status,
    agent.exit_code,
    JSON.stringify(agent.output_tail),
    agent.prompt_summary,
    agent.full_prompt,
    agent.detected_phase,
    JSON.stringify(agent.tools_used),
    JSON.stringify(agent.files_touched),
    JSON.stringify(agent.errors),
    JSON.stringify(agent.progress_signals),
    agent.output_line_count,
  );
}

function dbRowToAgentInfo(row: any): AgentInfo {
  return {
    pid: row.pid,
    task_id: row.task_id,
    task_title: row.task_title,
    project_dir: row.project_dir,
    model: row.model || null,
    started_at: row.started_at,
    status: row.status,
    exit_code: row.exit_code,
    output_tail: JSON.parse(row.output_tail || '[]'),
    prompt_summary: row.prompt_summary || '',
    full_prompt: row.full_prompt || '',
    last_output_at: row.finished_at || null,
    output_line_count: row.output_line_count || 0,
    detected_phase: row.detected_phase || 'unknown',
    tools_used: JSON.parse(row.tools_used || '[]'),
    files_touched: JSON.parse(row.files_touched || '[]'),
    errors: JSON.parse(row.errors || '[]'),
    is_stalled: false,
    estimated_duration_ms: null,
    progress_signals: JSON.parse(row.progress_signals || '[]'),
  };
}

/** Load non-dismissed finished agents from SQLite into the in-memory Map.
 *  Called once at server startup to restore agent history. */
export function loadPersistedAgents(): number {
  // Any agents marked 'running' in the DB died with the old server process —
  // mark them as failed so they show correctly in the UI.
  db.prepare(`
    UPDATE agent_runs SET status = 'failed', exit_code = -1, finished_at = ?
    WHERE status = 'running'
  `).run(Date.now());

  const rows = db.prepare(`
    SELECT * FROM agent_runs WHERE dismissed = 0 ORDER BY started_at DESC LIMIT 200
  `).all() as any[];

  for (const row of rows) {
    if (!agents.has(row.pid)) {
      agents.set(row.pid, dbRowToAgentInfo(row));
    }
  }

  console.log(`[Agent] Loaded ${rows.length} persisted agent records from SQLite`);
  return rows.length;
}

// ── Detail (full prompt + full output) ──────────────────────────────

export function getAgentDetail(pid: number): {
  full_prompt: string;
  output_tail: string[];
  progress_signals: AgentProgressSignal[];
  tools_used: string[];
  files_touched: string[];
  errors: string[];
} | null {
  const agent = agents.get(pid);
  if (!agent) return null;
  return {
    full_prompt: agent.full_prompt,
    output_tail: agent.output_tail,
    progress_signals: agent.progress_signals,
    tools_used: agent.tools_used,
    files_touched: agent.files_touched,
    errors: agent.errors,
  };
}

// ── Stats ────────────────────────────────────────────────────────────────

export function getAgentStats(): {
  running: number;
  completed: number;
  failed: number;
  stopped: number;
  exhausted: number;
  total: number;
} {
  const stats = { running: 0, completed: 0, failed: 0, stopped: 0, exhausted: 0, total: 0 };
  for (const agent of agents.values()) {
    stats[agent.status]++;
    stats.total++;
  }
  return stats;
}
