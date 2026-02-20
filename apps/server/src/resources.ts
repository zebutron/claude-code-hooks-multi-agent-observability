/**
 * Shared Resource Lock Manager
 *
 * Coordinates access to contested resources (Chrome MCP, etc.) across
 * parallel Claude Code sessions. NO human bottleneck — fully autonomous.
 *
 * Design:
 * - Lease-based: locks expire after TTL (default 5min) to prevent deadlocks
 * - Heartbeat: holders must heartbeat to keep their lease alive
 * - First-come-first-served with queue: waiters get notified when lock frees
 * - All state in SQLite for crash resilience
 */

import { Database } from 'bun:sqlite';

let db: Database;

export interface ResourceLock {
  resource_id: string;
  holder_session_id: string;
  holder_description: string;  // human-readable: "Turbine scoring session"
  acquired_at: number;
  expires_at: number;
  last_heartbeat: number;
}

export interface ResourceWaiter {
  resource_id: string;
  session_id: string;
  description: string;
  queued_at: number;
}

export function initResourceDB(database: Database) {
  db = database;

  db.run(`
    CREATE TABLE IF NOT EXISTS resource_locks (
      resource_id TEXT PRIMARY KEY,
      holder_session_id TEXT NOT NULL,
      holder_description TEXT NOT NULL DEFAULT '',
      acquired_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_heartbeat INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resource_waiters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      queued_at INTEGER NOT NULL,
      UNIQUE(resource_id, session_id)
    )
  `);

  // Seed known shared resources
  db.run(`
    CREATE TABLE IF NOT EXISTS resource_registry (
      resource_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      default_ttl_ms INTEGER NOT NULL DEFAULT 300000
    )
  `);

  // Insert default resources if not exist
  const existing = db.query('SELECT COUNT(*) as c FROM resource_registry').get() as { c: number };
  if (existing.c === 0) {
    db.run(`INSERT INTO resource_registry VALUES ('chrome_mcp', 'Chrome MCP', 'Browser automation — only one session at a time', 300000)`);
  }
}

/**
 * Attempt to acquire a resource lock.
 * Returns the lock if acquired, null if held by someone else.
 * Automatically cleans expired locks first.
 */
export function acquireResource(
  resourceId: string,
  sessionId: string,
  description: string = '',
  ttlMs: number = 300000  // 5 minutes default
): { acquired: boolean; lock: ResourceLock | null; position?: number } {
  const now = Date.now();

  // Clean expired locks
  db.run('DELETE FROM resource_locks WHERE expires_at < ?', [now]);

  // Check if already held
  const existing = db.query('SELECT * FROM resource_locks WHERE resource_id = ?')
    .get(resourceId) as ResourceLock | null;

  if (existing) {
    // If WE already hold it, just refresh the lease
    if (existing.holder_session_id === sessionId) {
      const refreshed = db.query(
        'UPDATE resource_locks SET expires_at = ?, last_heartbeat = ?, holder_description = ? WHERE resource_id = ? RETURNING *'
      ).get(now + ttlMs, now, description || existing.holder_description, resourceId) as ResourceLock;
      return { acquired: true, lock: refreshed };
    }

    // Someone else holds it — add us to the wait queue
    try {
      db.run(
        'INSERT OR REPLACE INTO resource_waiters (resource_id, session_id, description, queued_at) VALUES (?, ?, ?, ?)',
        [resourceId, sessionId, description, now]
      );
    } catch { /* already in queue */ }

    const position = db.query(
      'SELECT COUNT(*) as c FROM resource_waiters WHERE resource_id = ? AND queued_at <= (SELECT queued_at FROM resource_waiters WHERE resource_id = ? AND session_id = ?)'
    ).get(resourceId, resourceId, sessionId) as { c: number };

    return { acquired: false, lock: existing, position: position.c };
  }

  // Not held — acquire it
  const lock = db.query(
    'INSERT INTO resource_locks (resource_id, holder_session_id, holder_description, acquired_at, expires_at, last_heartbeat) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
  ).get(resourceId, sessionId, description, now, now + ttlMs, now) as ResourceLock;

  // Remove us from wait queue if we were there
  db.run('DELETE FROM resource_waiters WHERE resource_id = ? AND session_id = ?', [resourceId, sessionId]);

  return { acquired: true, lock };
}

/**
 * Heartbeat — extend the lease. Returns false if we don't hold the lock.
 */
export function heartbeatResource(
  resourceId: string,
  sessionId: string,
  ttlMs: number = 300000
): ResourceLock | null {
  const now = Date.now();

  // Clean expired locks first
  db.run('DELETE FROM resource_locks WHERE expires_at < ?', [now]);

  const result = db.query(
    'UPDATE resource_locks SET expires_at = ?, last_heartbeat = ? WHERE resource_id = ? AND holder_session_id = ? RETURNING *'
  ).get(now + ttlMs, now, resourceId, sessionId) as ResourceLock | null;

  return result;
}

/**
 * Release a resource lock. Only the holder can release.
 */
export function releaseResource(resourceId: string, sessionId: string): boolean {
  const result = db.run(
    'DELETE FROM resource_locks WHERE resource_id = ? AND holder_session_id = ?',
    [resourceId, sessionId]
  );

  // Also remove from wait queue
  db.run('DELETE FROM resource_waiters WHERE resource_id = ? AND session_id = ?', [resourceId, sessionId]);

  return result.changes > 0;
}

/**
 * Get all resource locks and their state (including expired status).
 */
export function getAllResourceState(): {
  resources: Array<{
    resource_id: string;
    display_name: string;
    description: string;
    default_ttl_ms: number;
    lock: ResourceLock | null;
    waiters: ResourceWaiter[];
    is_expired: boolean;
  }>;
} {
  const now = Date.now();

  // Clean expired locks
  db.run('DELETE FROM resource_locks WHERE expires_at < ?', [now]);

  const registry = db.query('SELECT * FROM resource_registry').all() as Array<{
    resource_id: string;
    display_name: string;
    description: string;
    default_ttl_ms: number;
  }>;

  const resources = registry.map(r => {
    const lock = db.query('SELECT * FROM resource_locks WHERE resource_id = ?')
      .get(r.resource_id) as ResourceLock | null;

    const waiters = db.query('SELECT * FROM resource_waiters WHERE resource_id = ? ORDER BY queued_at ASC')
      .all(r.resource_id) as ResourceWaiter[];

    return {
      ...r,
      lock,
      waiters,
      is_expired: lock ? lock.expires_at < now : false,
    };
  });

  return { resources };
}

/**
 * Register a new shared resource type.
 */
export function registerResource(
  resourceId: string,
  displayName: string,
  description: string = '',
  defaultTtlMs: number = 300000
): void {
  db.run(
    'INSERT OR REPLACE INTO resource_registry (resource_id, display_name, description, default_ttl_ms) VALUES (?, ?, ?, ?)',
    [resourceId, displayName, description, defaultTtlMs]
  );
}
