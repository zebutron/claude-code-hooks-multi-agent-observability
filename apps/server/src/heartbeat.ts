/**
 * Heartbeat management for CRABHUD
 *
 * Reads heartbeat markdown files from personal-os/heartbeat/
 * Manages pulse triggering and in-process scheduling (no launchd dependency)
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

const PERSONAL_OS_DIR = process.env.PERSONAL_OS_DIR || '/Users/zebrey/Documents/GitHub/personal-os';
const HEARTBEAT_DIR = join(PERSONAL_OS_DIR, 'heartbeat');
const HEARTBEAT_SCRIPT = join(HEARTBEAT_DIR, 'run-heartbeat.sh');
const TOKEN_CACHE_DIR = join(homedir(), '.local', 'state', 'crabhud');
const TOKEN_CACHE_PATH = join(TOKEN_CACHE_DIR, 'oauth-token');

/**
 * Cache the OAuth token to disk so LaunchAgent-started CRABHUD can use it.
 * Called on server startup when CLAUDE_CODE_OAUTH_TOKEN is in env.
 */
async function cacheOAuthToken(token: string) {
  try {
    if (!existsSync(TOKEN_CACHE_DIR)) mkdirSync(TOKEN_CACHE_DIR, { recursive: true });
    await writeFile(TOKEN_CACHE_PATH, token, { mode: 0o600 });
    console.log('💓 OAuth token cached for heartbeat auth');
  } catch (e) {
    console.error('Failed to cache OAuth token:', e);
  }
}

/**
 * Get the best available OAuth token (env first, then cache file).
 */
function getOAuthToken(): string | null {
  // Live env var (set when started from Claude Desktop context)
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  // Cached from a previous Desktop-started session
  try {
    if (existsSync(TOKEN_CACHE_PATH)) return readFileSync(TOKEN_CACHE_PATH, 'utf-8').trim();
  } catch {}
  return null;
}

// In-memory state + scheduler
let heartbeatState = {
  enabled: false,
  frequencyMinutes: 240, // 4 hours default
  lastPulse: null as string | null,
  nextScheduled: null as string | null,
  pulseRunning: false,
};

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

// Callback for broadcasting pulse completion (set by server)
let onPulseComplete: ((result: { success: boolean; output?: string; error?: string }) => void) | null = null;

export function setOnPulseComplete(cb: typeof onPulseComplete) {
  onPulseComplete = cb;
}

/**
 * Get all heartbeat output files sorted by date descending
 */
export async function getHeartbeatOutputs(limit = 20): Promise<Array<{ filename: string; date: string; content: string }>> {
  try {
    const files = await readdir(HEARTBEAT_DIR);
    const mdFiles = files.filter(f =>
      f.endsWith('.md') &&
      f !== 'manager-prompt.md' &&
      /^\d{4}-\d{2}-\d{2}/.test(f)
    );

    // Sort by filename descending (they're date-stamped)
    mdFiles.sort((a, b) => b.localeCompare(a));

    const limited = mdFiles.slice(0, limit);

    const outputs = await Promise.all(
      limited.map(async (filename) => {
        const content = await readFile(join(HEARTBEAT_DIR, filename), 'utf-8');
        // Extract date from filename like 2026-03-04-22.md
        const dateParts = filename.replace('.md', '').split('-');
        const date = dateParts.length >= 4
          ? `${dateParts[0]}-${dateParts[1]}-${dateParts[2]} ${dateParts[3]}:00`
          : filename;
        return { filename, date, content };
      })
    );

    return outputs;
  } catch (e) {
    console.error('Failed to read heartbeat outputs:', e);
    return [];
  }
}

/**
 * Trigger a manual heartbeat pulse
 */
export async function triggerPulse(): Promise<{ success: boolean; output?: string; error?: string }> {
  if (heartbeatState.pulseRunning) {
    return { success: false, error: 'A pulse is already running' };
  }

  heartbeatState.pulseRunning = true;

  try {
    // Build clean env: strip Claude Code session vars that block nesting,
    // but preserve/inject the OAuth token for subscription-based auth
    const cleanEnv = { ...process.env };
    const STRIP_VARS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_AGENT_SDK_VERSION',
      'CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES', 'CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL',
      '__CFBundleIdentifier', 'MCP_'];
    for (const key of STRIP_VARS) delete cleanEnv[key];
    // Also strip any other CLAUDE_ vars except the OAuth token
    for (const key of Object.keys(cleanEnv)) {
      if (key.startsWith('CLAUDE_') && key !== 'CLAUDE_CODE_OAUTH_TOKEN') delete cleanEnv[key];
    }

    // Inject OAuth token (from env or cached) for subscription auth
    const oauthToken = getOAuthToken();
    if (oauthToken) {
      cleanEnv.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
    }

    const proc = Bun.spawn(['bash', HEARTBEAT_SCRIPT], {
      cwd: PERSONAL_OS_DIR,
      env: {
        ...cleanEnv,
        HEARTBEAT_MODEL: process.env.HEARTBEAT_MODEL || 'haiku',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    heartbeatState.pulseRunning = false;
    heartbeatState.lastPulse = new Date().toISOString();

    // Reschedule next if enabled
    if (heartbeatState.enabled) {
      scheduleNext();
    }

    if (exitCode !== 0) {
      return { success: false, error: `Heartbeat exited with code ${exitCode}: ${stderr}` };
    }

    return { success: true, output: stdout || 'Heartbeat completed successfully' };
  } catch (e: any) {
    heartbeatState.pulseRunning = false;
    return { success: false, error: e.message };
  }
}

/**
 * Get current heartbeat status
 */
export function getHeartbeatStatus() {
  return { ...heartbeatState };
}

/**
 * Schedule the next pulse
 */
function scheduleNext() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  const delayMs = heartbeatState.frequencyMinutes * 60 * 1000;
  heartbeatState.nextScheduled = new Date(Date.now() + delayMs).toISOString();

  schedulerTimer = setTimeout(async () => {
    console.log('💓 Scheduled heartbeat pulse firing...');
    const result = await triggerPulse();
    if (onPulseComplete) onPulseComplete(result);
    console.log(`💓 Pulse ${result.success ? 'complete' : 'failed: ' + result.error}`);
  }, delayMs);
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  heartbeatState.nextScheduled = null;
}

/**
 * Update heartbeat configuration
 */
export async function updateHeartbeatConfig(config: {
  enabled?: boolean;
  frequencyMinutes?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Handle enable/disable
    if (config.enabled !== undefined && config.enabled !== heartbeatState.enabled) {
      heartbeatState.enabled = config.enabled;
      if (config.enabled) {
        if (config.frequencyMinutes !== undefined) {
          heartbeatState.frequencyMinutes = config.frequencyMinutes;
        }
        scheduleNext();
        console.log(`💓 Heartbeat ON — next pulse in ${heartbeatState.frequencyMinutes}min`);
      } else {
        stopScheduler();
        console.log('💓 Heartbeat OFF');
      }
    }

    // Handle frequency change (while enabled)
    if (config.frequencyMinutes !== undefined && config.frequencyMinutes !== heartbeatState.frequencyMinutes) {
      heartbeatState.frequencyMinutes = config.frequencyMinutes;
      if (heartbeatState.enabled) {
        scheduleNext(); // Reschedule with new frequency
        console.log(`💓 Heartbeat frequency → ${config.frequencyMinutes}min`);
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Initialize heartbeat state
 */
export async function initHeartbeat() {
  // Cache OAuth token if available (for later use by LaunchAgent-started instances)
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    await cacheOAuthToken(process.env.CLAUDE_CODE_OAUTH_TOKEN);
  }

  // Find last pulse time from most recent heartbeat file
  const outputs = await getHeartbeatOutputs(1);
  if (outputs.length > 0) {
    heartbeatState.lastPulse = outputs[0].date;
  }

  // Start disabled — user toggles ON via CRABHUD UI
  heartbeatState.enabled = false;
  heartbeatState.frequencyMinutes = 240;

  const hasToken = !!getOAuthToken();
  console.log(`💓 Heartbeat: OFF | ${heartbeatState.frequencyMinutes}min interval | Auth: ${hasToken ? 'subscription ✓' : 'NO TOKEN ✗'}`);
}
