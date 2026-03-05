/**
 * Task Enrichment
 *
 * Calls claude -p with a task title + existing task context to suggest
 * priority, tags, description, rationale, urgency_score, and estimated_minutes.
 *
 * Returns suggestions only — does NOT auto-apply them to the task.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getTask, getRootTasks, type Task } from './tasks';

const TOKEN_CACHE_PATH = join(homedir(), '.local', 'state', 'crabhud', 'oauth-token');

export interface EnrichmentSuggestion {
  priority: string;
  tags: string[];
  description: string;
  rationale: string;
  urgency_score: number;
  estimated_minutes: number;
}

export interface EnrichmentResult {
  task_id: string;
  task_title: string;
  suggestion: EnrichmentSuggestion;
  raw_response?: string;
}

export interface EnrichmentError {
  error: string;
  reason: string;
}

function buildOAuthEnv(): Record<string, string> {
  const cleanEnv: Record<string, string | undefined> = { ...process.env };

  const STRIP_VARS = [
    'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_AGENT_SDK_VERSION',
    'CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES', 'CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL',
    '__CFBundleIdentifier',
  ];
  for (const key of STRIP_VARS) delete cleanEnv[key];

  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('MCP_')) delete cleanEnv[key];
  }

  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('CLAUDE_') && key !== 'CLAUDE_CODE_OAUTH_TOKEN') delete cleanEnv[key];
  }

  // Inject OAuth token
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
  return env;
}

function buildEnrichPrompt(task: Task, allTasks: Task[]): string {
  // Derive tag vocabulary from existing tasks
  const tagCounts: Record<string, number> = {};
  const priorityCounts: Record<string, number> = {};

  for (const t of allTasks) {
    priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
    for (const tag of t.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([tag, count]) => `${tag} (${count})`)
    .join(', ');

  const priorityDist = Object.entries(priorityCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([p, c]) => `${p}: ${c}`)
    .join(', ');

  // Sample of recent task titles for context
  const recentTitles = allTasks
    .slice(0, 10)
    .map(t => `- [${t.priority}] ${t.title}${t.tags?.length ? ` (${t.tags.join(', ')})` : ''}`)
    .join('\n');

  return `You are a task enrichment assistant for a personal productivity system called CRABHUB.

## Task to enrich

Title: "${task.title}"
${task.description ? `Existing description: ${task.description}` : ''}

## Context from existing tasks

**Priority distribution:** ${priorityDist}
**Tag vocabulary (most used first):** ${topTags}

**Recent tasks for style reference:**
${recentTitles}

## Your job

Analyze the task title and suggest enrichment fields. Return ONLY a JSON object with exactly these fields:

{
  "priority": "P0" | "P1" | "P2" | "P3",
  "tags": [string, ...],  // 1-4 tags from the vocabulary above; only add new tags if truly necessary
  "description": string,  // 1-2 sentences expanding on what this task entails
  "rationale": string,    // 1 sentence explaining why this task matters
  "urgency_score": number, // 0-10 integer; how time-sensitive is this?
  "estimated_minutes": number  // rough work sizing in minutes (e.g. 30, 60, 120, 240)
}

Priority guide:
- P0: Critical / blocking / must-do today
- P1: High priority, important this week
- P2: Normal priority
- P3: Nice to have / someday

Return ONLY valid JSON, no markdown, no explanation.`;
}

export async function enrichTask(taskId: string): Promise<EnrichmentResult | EnrichmentError> {
  const task = getTask(taskId);
  if (!task) {
    return { error: 'Task not found', reason: `No task with id ${taskId}` };
  }

  const allTasks = getRootTasks(false);
  const prompt = buildEnrichPrompt(task, allTasks);
  const env = buildOAuthEnv();

  if (!env.CLAUDE_CODE_OAUTH_TOKEN) {
    return {
      error: 'enrichment unavailable',
      reason: 'No OAuth token found. Check ~/.local/state/crabhud/oauth-token or CLAUDE_CODE_OAUTH_TOKEN env var.',
    };
  }

  let rawOutput = '';
  try {
    const proc = Bun.spawn(
      ['claude', '-p', prompt, '--output-format', 'json', '--max-turns', '1'],
      {
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );

    // Collect stdout
    const decoder = new TextDecoder();
    const reader = proc.stdout.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rawOutput += decoder.decode(value, { stream: true });
    }

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      // Collect stderr for the error message
      let errOutput = '';
      const errReader = proc.stderr.getReader();
      const errDecoder = new TextDecoder();
      while (true) {
        const { done, value } = await errReader.read();
        if (done) break;
        errOutput += errDecoder.decode(value, { stream: true });
      }
      return {
        error: 'enrichment unavailable',
        reason: `claude exited with code ${exitCode}: ${errOutput.trim().slice(0, 300)}`,
      };
    }
  } catch (err: any) {
    return {
      error: 'enrichment unavailable',
      reason: `Failed to spawn claude: ${err?.message || String(err)}`,
    };
  }

  // Parse the claude --output-format json wrapper: { result: "...", ... }
  // The result field contains the model's text response.
  let jsonText = rawOutput.trim();
  try {
    const wrapper = JSON.parse(jsonText);
    if (wrapper && typeof wrapper.result === 'string') {
      jsonText = wrapper.result.trim();
    }
  } catch {
    // rawOutput might be the JSON directly — fall through
  }

  // Strip markdown code fences if present
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let suggestion: EnrichmentSuggestion;
  try {
    suggestion = JSON.parse(jsonText);
  } catch (err) {
    return {
      error: 'enrichment unavailable',
      reason: `Could not parse JSON from claude response: ${jsonText.slice(0, 300)}`,
    };
  }

  // Validate required fields
  const valid =
    typeof suggestion.priority === 'string' &&
    Array.isArray(suggestion.tags) &&
    typeof suggestion.description === 'string' &&
    typeof suggestion.rationale === 'string' &&
    typeof suggestion.urgency_score === 'number' &&
    typeof suggestion.estimated_minutes === 'number';

  if (!valid) {
    return {
      error: 'enrichment unavailable',
      reason: `Incomplete suggestion from claude: ${JSON.stringify(suggestion).slice(0, 300)}`,
    };
  }

  return {
    task_id: taskId,
    task_title: task.title,
    suggestion,
  };
}
