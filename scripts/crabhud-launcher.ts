#!/usr/bin/env bun
/**
 * CRABHUD Launcher — starts server + client as child processes.
 * Run directly by launchd (no bash needed, avoids TCC issues).
 *
 * Usage:
 *   bun scripts/crabhud-launcher.ts        # foreground (for launchd)
 *   bun scripts/crabhud-launcher.ts &       # background (manual)
 */

import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';

const PROJECT_ROOT = join(import.meta.dir, '..');
const STATE_DIR = join(process.env.HOME || '/Users/zebrey', '.local/state/crabhud');
const PID_FILE = join(STATE_DIR, 'pids');
const SERVER_PORT = process.env.SERVER_PORT || '4000';
const CLIENT_PORT = process.env.CLIENT_PORT || '5173';

mkdirSync(STATE_DIR, { recursive: true });

// Kill existing processes
if (existsSync(PID_FILE)) {
  const pids = readFileSync(PID_FILE, 'utf-8').trim().split('\n');
  for (const pid of pids) {
    try { process.kill(parseInt(pid)); } catch {}
  }
  await Bun.sleep(1000);
}

// Kill anything on our ports
for (const port of [SERVER_PORT, CLIENT_PORT]) {
  const lsof = Bun.spawn(['lsof', '-ti', `:${port}`], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(lsof.stdout).text();
  for (const pid of out.trim().split('\n').filter(Boolean)) {
    try { process.kill(parseInt(pid), 9); } catch {}
  }
}

// Start server
const serverLog = Bun.file(join(STATE_DIR, 'server.log'));
const server = Bun.spawn(['bun', 'run', 'src/index.ts'], {
  cwd: join(PROJECT_ROOT, 'apps/server'),
  env: { ...process.env, SERVER_PORT },
  stdout: serverLog,
  stderr: serverLog,
});

// Wait for server
for (let i = 0; i < 15; i++) {
  try {
    const res = await fetch(`http://localhost:${SERVER_PORT}/`);
    if (res.ok) break;
  } catch {}
  await Bun.sleep(1000);
}

// Start client (vite)
const clientLog = Bun.file(join(STATE_DIR, 'client.log'));
const client = Bun.spawn(['npx', 'vite', '--port', CLIENT_PORT], {
  cwd: join(PROJECT_ROOT, 'apps/client'),
  env: { ...process.env, VITE_PORT: CLIENT_PORT },
  stdout: clientLog,
  stderr: clientLog,
});

// Save PIDs
writeFileSync(PID_FILE, `${server.pid}\n${client.pid}\n`);

console.log(`CRABHUD running — server:${SERVER_PORT} (pid ${server.pid}) client:${CLIENT_PORT} (pid ${client.pid})`);

// Wait for children (keeps launchd happy)
const cleanup = () => {
  server.kill();
  client.kill();
  try { Bun.file(PID_FILE).delete; } catch {}
  process.exit(0);
};
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

await Promise.all([server.exited, client.exited]);
