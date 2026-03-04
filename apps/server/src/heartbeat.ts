/**
 * Heartbeat management for CRABHUD
 *
 * Reads heartbeat markdown files from personal-os/heartbeat/
 * Manages pulse triggering and launchd scheduling
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

const PERSONAL_OS_DIR = process.env.PERSONAL_OS_DIR || '/Users/zebrey/Documents/GitHub/personal-os';
const HEARTBEAT_DIR = join(PERSONAL_OS_DIR, 'heartbeat');
const PLIST_NAME = 'com.zeb.personal-os.heartbeat';
const PLIST_PATH = join(process.env.HOME || '/Users/zebrey', 'Library/LaunchAgents', `${PLIST_NAME}.plist`);
const PLIST_SOURCE = join(HEARTBEAT_DIR, `${PLIST_NAME}.plist`);
const HEARTBEAT_SCRIPT = join(HEARTBEAT_DIR, 'run-heartbeat.sh');

// In-memory state (populated from launchd on startup)
let heartbeatState = {
  enabled: false,
  frequencyMinutes: 240, // 4 hours default
  lastPulse: null as string | null,
  nextScheduled: null as string | null,
  pulseRunning: false,
};

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
    const proc = Bun.spawn(['bash', HEARTBEAT_SCRIPT], {
      cwd: PERSONAL_OS_DIR,
      env: {
        ...process.env,
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

    // Recalculate next scheduled
    if (heartbeatState.enabled) {
      const next = new Date(Date.now() + heartbeatState.frequencyMinutes * 60 * 1000);
      heartbeatState.nextScheduled = next.toISOString();
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
 * Check if heartbeat is loaded in launchd
 */
async function checkLaunchdStatus(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['launchctl', 'list'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    return output.includes(PLIST_NAME);
  } catch {
    return false;
  }
}

/**
 * Read frequency from plist file
 */
async function readPlistFrequency(): Promise<number> {
  try {
    const content = await readFile(PLIST_SOURCE, 'utf-8');
    const match = content.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/);
    if (match) {
      return Math.round(parseInt(match[1]) / 60); // seconds to minutes
    }
  } catch { }
  return 240; // default 4 hours
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
      if (config.enabled) {
        // Copy plist to LaunchAgents if not there
        if (!existsSync(PLIST_PATH)) {
          const plistContent = await readFile(PLIST_SOURCE, 'utf-8');
          await Bun.write(PLIST_PATH, plistContent);
        }
        // Bootstrap into launchd
        const proc = Bun.spawn(['launchctl', 'bootstrap', 'gui/501', PLIST_PATH], {
          stdout: 'pipe',
          stderr: 'pipe',
        });
        await proc.exited;
        heartbeatState.enabled = true;
        heartbeatState.nextScheduled = new Date(
          Date.now() + (config.frequencyMinutes || heartbeatState.frequencyMinutes) * 60 * 1000
        ).toISOString();
      } else {
        // Bootout from launchd
        const proc = Bun.spawn(['launchctl', 'bootout', `gui/501/${PLIST_NAME}`], {
          stdout: 'pipe',
          stderr: 'pipe',
        });
        await proc.exited;
        heartbeatState.enabled = false;
        heartbeatState.nextScheduled = null;
      }
    }

    // Handle frequency change
    if (config.frequencyMinutes !== undefined && config.frequencyMinutes !== heartbeatState.frequencyMinutes) {
      const newFreqSeconds = config.frequencyMinutes * 60;
      heartbeatState.frequencyMinutes = config.frequencyMinutes;

      // Update the plist source file
      let plistContent = await readFile(PLIST_SOURCE, 'utf-8');
      plistContent = plistContent.replace(
        /(<key>StartInterval<\/key>\s*<integer>)\d+(<\/integer>)/,
        `$1${newFreqSeconds}$2`
      );
      await Bun.write(PLIST_SOURCE, plistContent);

      // If enabled, reload with new frequency
      if (heartbeatState.enabled) {
        // Bootout + bootstrap to pick up new plist
        await Bun.write(PLIST_PATH, plistContent);
        try {
          const bootout = Bun.spawn(['launchctl', 'bootout', `gui/501/${PLIST_NAME}`], {
            stdout: 'pipe', stderr: 'pipe',
          });
          await bootout.exited;
        } catch { }
        const bootstrap = Bun.spawn(['launchctl', 'bootstrap', 'gui/501', PLIST_PATH], {
          stdout: 'pipe', stderr: 'pipe',
        });
        await bootstrap.exited;

        heartbeatState.nextScheduled = new Date(
          Date.now() + config.frequencyMinutes * 60 * 1000
        ).toISOString();
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Initialize heartbeat state from system
 */
export async function initHeartbeat() {
  heartbeatState.enabled = await checkLaunchdStatus();
  heartbeatState.frequencyMinutes = await readPlistFrequency();

  if (heartbeatState.enabled) {
    heartbeatState.nextScheduled = new Date(
      Date.now() + heartbeatState.frequencyMinutes * 60 * 1000
    ).toISOString();
  }

  // Find last pulse time from most recent heartbeat file
  const outputs = await getHeartbeatOutputs(1);
  if (outputs.length > 0) {
    heartbeatState.lastPulse = outputs[0].date;
  }

  console.log(`💓 Heartbeat: ${heartbeatState.enabled ? 'ON' : 'OFF'} | ${heartbeatState.frequencyMinutes}min interval`);
}
