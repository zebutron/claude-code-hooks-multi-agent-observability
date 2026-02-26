/**
 * Agent Spawner & Tracker
 *
 * Spawns Claude Code agents as background processes, tracks their lifecycle,
 * and provides APIs for listing/stopping them.
 *
 * Security: follows P2a (Subagent Scope Delegation) — every spawned agent
 * receives task, scope, awareness boundary, and trust context in its prompt.
 */

import { getTask, updateTask, type Task } from './tasks';

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentInfo {
  pid: number;
  task_id: string;
  task_title: string;
  project_dir: string;
  model: string | null;
  started_at: number;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  exit_code: number | null;
  output_tail: string[];       // last N lines of combined stdout/stderr
  prompt_summary: string;      // first 200 chars of the prompt sent
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

  // 6. Additional instructions
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

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.max_turns) {
    args.push('--max-turns', String(options.max_turns));
  }

  // Spawn the process
  // CRITICAL: unset CLAUDECODE env var to allow nested spawning
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== 'CLAUDECODE' && value !== undefined) {
      env[key] = value;
    }
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
  };

  agents.set(pid, agentInfo);
  agentProcesses.set(pid, proc);

  // Update task with agent info
  updateTask(taskId, {
    status: 'active',
    agent_session_id: `agent-${pid}`,
    last_agent_activity: Date.now(),
  });

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
        agent.status = exitCode === 0 ? 'completed' : 'failed';
      }
    }
    agentProcesses.delete(pid);

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

  // Update task — set back to queued so it can be reassigned
  const task = getTask(agent.task_id);
  if (task && task.status === 'active') {
    updateTask(agent.task_id, {
      status: 'queued',
      agent_session_id: undefined,
    });
  }

  console.log(`[Agent] Stopped PID ${pid} (task: ${agent.task_id})`);
  return true;
}

export function cleanupFinishedAgents(): number {
  let cleaned = 0;
  const cutoff = Date.now() - (60 * 60 * 1000); // 1 hour

  for (const [pid, agent] of agents) {
    if (agent.status !== 'running' && agent.started_at < cutoff) {
      agents.delete(pid);
      agentProcesses.delete(pid);
      cleaned++;
    }
  }

  return cleaned;
}

// ── Stats ────────────────────────────────────────────────────────────────

export function getAgentStats(): {
  running: number;
  completed: number;
  failed: number;
  stopped: number;
  total: number;
} {
  const stats = { running: 0, completed: 0, failed: 0, stopped: 0, total: 0 };
  for (const agent of agents.values()) {
    stats[agent.status]++;
    stats.total++;
  }
  return stats;
}
