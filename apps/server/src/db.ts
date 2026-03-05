import { Database } from 'bun:sqlite';
import type { HookEvent, FilterOptions, Theme, ThemeSearchQuery } from './types';

let db: Database;

export function initDatabase(): void {
  db = new Database('events.db');
  
  // Enable WAL mode for better concurrent performance
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  
  // Create events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_app TEXT NOT NULL,
      session_id TEXT NOT NULL,
      hook_event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      chat TEXT,
      summary TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
  
  // Check if chat column exists, add it if not (for migration)
  try {
    const columns = db.prepare("PRAGMA table_info(events)").all() as any[];
    const hasChatColumn = columns.some((col: any) => col.name === 'chat');
    if (!hasChatColumn) {
      db.exec('ALTER TABLE events ADD COLUMN chat TEXT');
    }

    // Check if summary column exists, add it if not (for migration)
    const hasSummaryColumn = columns.some((col: any) => col.name === 'summary');
    if (!hasSummaryColumn) {
      db.exec('ALTER TABLE events ADD COLUMN summary TEXT');
    }

    // Check if humanInTheLoop column exists, add it if not (for migration)
    const hasHumanInTheLoopColumn = columns.some((col: any) => col.name === 'humanInTheLoop');
    if (!hasHumanInTheLoopColumn) {
      db.exec('ALTER TABLE events ADD COLUMN humanInTheLoop TEXT');
    }

    // Check if humanInTheLoopStatus column exists, add it if not (for migration)
    const hasHumanInTheLoopStatusColumn = columns.some((col: any) => col.name === 'humanInTheLoopStatus');
    if (!hasHumanInTheLoopStatusColumn) {
      db.exec('ALTER TABLE events ADD COLUMN humanInTheLoopStatus TEXT');
    }

    // Check if model_name column exists, add it if not (for migration)
    const hasModelNameColumn = columns.some((col: any) => col.name === 'model_name');
    if (!hasModelNameColumn) {
      db.exec('ALTER TABLE events ADD COLUMN model_name TEXT');
    }
  } catch (error) {
    // If the table doesn't exist yet, the CREATE TABLE above will handle it
  }
  
  // Create indexes for common queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_source_app ON events(source_app)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_session_id ON events(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_hook_event_type ON events(hook_event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)');

  // ── Usage snapshots table (real Anthropic cap data from bridge) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      five_hour_pct REAL,
      five_hour_resets_at TEXT,
      seven_day_pct REAL,
      seven_day_resets_at TEXT,
      seven_day_sonnet_pct REAL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_usage_snapshots_ts ON usage_snapshots(timestamp)');

  // Create themes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      displayName TEXT NOT NULL,
      description TEXT,
      colors TEXT NOT NULL,
      isPublic INTEGER NOT NULL DEFAULT 0,
      authorId TEXT,
      authorName TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      tags TEXT,
      downloadCount INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      ratingCount INTEGER DEFAULT 0
    )
  `);
  
  // Create theme shares table
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_shares (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      shareToken TEXT NOT NULL UNIQUE,
      expiresAt INTEGER,
      isPublic INTEGER NOT NULL DEFAULT 0,
      allowedUsers TEXT,
      createdAt INTEGER NOT NULL,
      accessCount INTEGER DEFAULT 0,
      FOREIGN KEY (themeId) REFERENCES themes (id) ON DELETE CASCADE
    )
  `);
  
  // Create theme ratings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_ratings (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      userId TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      createdAt INTEGER NOT NULL,
      UNIQUE(themeId, userId),
      FOREIGN KEY (themeId) REFERENCES themes (id) ON DELETE CASCADE
    )
  `);
  
  // Create indexes for theme tables
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_isPublic ON themes(isPublic)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_themes_createdAt ON themes(createdAt)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_theme_shares_token ON theme_shares(shareToken)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_theme_ratings_theme ON theme_ratings(themeId)');

  // ── Command Center: Tasks table ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      rationale TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      priority TEXT NOT NULL DEFAULT 'P2',
      sort_order REAL NOT NULL DEFAULT 0,
      roi_score INTEGER DEFAULT 5,
      risk_score INTEGER DEFAULT 5,
      fit_score INTEGER DEFAULT 5,
      estimated_tokens INTEGER,
      actual_tokens INTEGER DEFAULT 0,
      estimated_minutes INTEGER,
      actual_minutes INTEGER DEFAULT 0,
      blocked_by TEXT,
      blocked_reason TEXT,
      blocked_since INTEGER,
      agent_session_id TEXT,
      last_agent_activity INTEGER,
      source TEXT DEFAULT 'human',
      notes TEXT,
      depth INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(sort_order)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_blocked ON tasks(blocked_by)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_session_id)');

  // Migration: add tags column if missing
  try {
    const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as any[];
    if (!taskCols.some((c: any) => c.name === 'tags')) {
      db.exec("ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]'");
    }
    if (!taskCols.some((c: any) => c.name === 'requirements')) {
      db.exec("ALTER TABLE tasks ADD COLUMN requirements TEXT");
    }
    // Migration: rename roi_score/risk_score/fit_score conceptually to 0-9 scale
    // (column names stay same for backward compat, but new items default to 0)
    if (!taskCols.some((c: any) => c.name === 'time_score')) {
      db.exec("ALTER TABLE tasks ADD COLUMN time_score INTEGER DEFAULT 0");
    }
    if (!taskCols.some((c: any) => c.name === 'cost_score')) {
      db.exec("ALTER TABLE tasks ADD COLUMN cost_score INTEGER DEFAULT 0");
    }
    if (!taskCols.some((c: any) => c.name === 'urgent_score')) {
      db.exec("ALTER TABLE tasks ADD COLUMN urgent_score INTEGER DEFAULT 0");
    }
  } catch { /* table may not exist yet */ }

  // ── Command Center: Task Audit Log ────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT NOT NULL DEFAULT 'human',
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_task ON task_audit_log(task_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON task_audit_log(timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_changed_by ON task_audit_log(changed_by)');

  // Migration: add task_snapshot and edit_batch_id columns if missing
  // (must run BEFORE creating idx_audit_batch which references edit_batch_id)
  try {
    const auditCols = db.prepare("PRAGMA table_info(task_audit_log)").all() as any[];
    if (!auditCols.some((c: any) => c.name === 'task_snapshot')) {
      db.exec("ALTER TABLE task_audit_log ADD COLUMN task_snapshot TEXT");
    }
    if (!auditCols.some((c: any) => c.name === 'edit_batch_id')) {
      db.exec("ALTER TABLE task_audit_log ADD COLUMN edit_batch_id TEXT");
    }
  } catch { /* table may not exist yet */ }

  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_batch ON task_audit_log(edit_batch_id)');

  // ── Command Center: Usage log table ──────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      tokens_estimated INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      model_name TEXT
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_log(timestamp)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_log(session_id)');

  // ── Agent Runs table (persists agent records across server restarts) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      pid INTEGER PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_title TEXT NOT NULL,
      project_dir TEXT NOT NULL,
      model TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL DEFAULT 'running',
      exit_code INTEGER,
      output_tail TEXT DEFAULT '[]',
      prompt_summary TEXT,
      full_prompt TEXT,
      detected_phase TEXT DEFAULT 'initializing',
      tools_used TEXT DEFAULT '[]',
      files_touched TEXT DEFAULT '[]',
      errors TEXT DEFAULT '[]',
      progress_signals TEXT DEFAULT '[]',
      output_line_count INTEGER DEFAULT 0,
      dismissed INTEGER DEFAULT 0
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_runs_dismissed ON agent_runs(dismissed)');

  // ── Delegation Log (tracks every delegation decision + outcome) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS delegation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      task_title TEXT NOT NULL,
      agent_pid INTEGER,
      model TEXT,
      spawned_at INTEGER NOT NULL,
      completed_at INTEGER,
      outcome TEXT DEFAULT 'pending',
      duration_ms INTEGER,
      error_summary TEXT,
      heartbeat_run TEXT
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_delegation_log_spawned ON delegation_log(spawned_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_delegation_log_outcome ON delegation_log(outcome)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_delegation_log_pid ON delegation_log(agent_pid)');

  // ── Delegation Config (tunable limits, singleton rows) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS delegation_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Seed default config values if not present
  const seedConfig = db.prepare(
    'INSERT OR IGNORE INTO delegation_config (key, value, updated_at) VALUES (?, ?, ?)'
  );
  const now = Date.now();
  seedConfig.run('max_concurrent_workers', '5', now);
  seedConfig.run('max_daily_spawns', '20', now);
  seedConfig.run('usage_headroom_min_pct', '20', now);
  seedConfig.run('cooldown_after_failures_ms', '300000', now);
}

export function insertEvent(event: HookEvent): HookEvent {
  const stmt = db.prepare(`
    INSERT INTO events (source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const timestamp = event.timestamp || Date.now();

  // Initialize humanInTheLoopStatus to pending if humanInTheLoop exists
  let humanInTheLoopStatus = event.humanInTheLoopStatus;
  if (event.humanInTheLoop && !humanInTheLoopStatus) {
    humanInTheLoopStatus = { status: 'pending' };
  }

  const result = stmt.run(
    event.source_app,
    event.session_id,
    event.hook_event_type,
    JSON.stringify(event.payload),
    event.chat ? JSON.stringify(event.chat) : null,
    event.summary || null,
    timestamp,
    event.humanInTheLoop ? JSON.stringify(event.humanInTheLoop) : null,
    humanInTheLoopStatus ? JSON.stringify(humanInTheLoopStatus) : null,
    event.model_name || null
  );

  return {
    ...event,
    id: result.lastInsertRowid as number,
    timestamp,
    humanInTheLoopStatus
  };
}

export function getFilterOptions(): FilterOptions {
  const sourceApps = db.prepare('SELECT DISTINCT source_app FROM events ORDER BY source_app').all() as { source_app: string }[];
  const sessionIds = db.prepare('SELECT DISTINCT session_id FROM events ORDER BY session_id DESC LIMIT 300').all() as { session_id: string }[];
  const hookEventTypes = db.prepare('SELECT DISTINCT hook_event_type FROM events ORDER BY hook_event_type').all() as { hook_event_type: string }[];
  
  return {
    source_apps: sourceApps.map(row => row.source_app),
    session_ids: sessionIds.map(row => row.session_id),
    hook_event_types: hookEventTypes.map(row => row.hook_event_type)
  };
}

// ── Usage Timeseries ──────────────────────────────────────────────────

export interface TimeseriesBucket {
  timestamp: number;       // bucket start (ms)
  total: number;           // total events
  tool_uses: number;       // PreToolUse + PostToolUse
  sessions: number;        // SessionStart count
}

/**
 * Returns event counts bucketed by interval over a lookback window.
 * Default: 5-minute buckets over last 6 hours (72 bars).
 */
export function getUsageTimeseries(
  lookbackMs: number = 6 * 60 * 60 * 1000,
  bucketMs: number = 5 * 60 * 1000,
): TimeseriesBucket[] {
  const now = Date.now();
  const cutoff = now - lookbackMs;
  const numBuckets = Math.ceil(lookbackMs / bucketMs);

  // Initialize all buckets (so gaps show as 0)
  const buckets: TimeseriesBucket[] = [];
  const bucketStart = Math.floor(cutoff / bucketMs) * bucketMs;
  for (let i = 0; i < numBuckets; i++) {
    buckets.push({
      timestamp: bucketStart + i * bucketMs,
      total: 0,
      tool_uses: 0,
      sessions: 0,
    });
  }

  // Use SQL aggregation for efficiency
  const rows = db.prepare(`
    SELECT
      (timestamp / ? * ?) AS bucket_ts,
      COUNT(*) AS total,
      SUM(CASE WHEN hook_event_type IN ('PreToolUse', 'PostToolUse') THEN 1 ELSE 0 END) AS tool_uses,
      SUM(CASE WHEN hook_event_type = 'SessionStart' THEN 1 ELSE 0 END) AS sessions
    FROM events
    WHERE timestamp >= ?
    GROUP BY bucket_ts
    ORDER BY bucket_ts
  `).all(bucketMs, bucketMs, cutoff) as any[];

  // Merge SQL results into pre-initialized buckets
  const bucketMap = new Map<number, TimeseriesBucket>();
  for (const b of buckets) bucketMap.set(b.timestamp, b);
  for (const row of rows) {
    const b = bucketMap.get(row.bucket_ts);
    if (b) {
      b.total = row.total;
      b.tool_uses = row.tool_uses;
      b.sessions = row.sessions;
    }
  }

  return buckets;
}

// ── Usage Snapshots (real Anthropic cap data) ────────────────────────

export interface UsageSnapshot {
  timestamp: number;
  five_hour_pct: number | null;
  five_hour_resets_at: string | null;
  seven_day_pct: number | null;
  seven_day_resets_at: string | null;
  seven_day_sonnet_pct: number | null;
}

/**
 * Store a usage snapshot from the bridge. Deduplicates if values haven't changed
 * in the last 5 minutes (avoids storing identical readings).
 */
export function storeUsageSnapshot(data: {
  five_hour?: { utilization: number; resets_at: string } | null;
  seven_day?: { utilization: number; resets_at: string } | null;
  seven_day_sonnet?: { utilization: number; resets_at: string | null } | null;
}): void {
  const now = Date.now();
  const fiveHourPct = data.five_hour?.utilization ?? null;
  const sevenDayPct = data.seven_day?.utilization ?? null;
  const sonnetPct = data.seven_day_sonnet?.utilization ?? null;

  // Deduplicate: skip if identical reading within last 5 minutes
  const recent = db.prepare(
    'SELECT five_hour_pct, seven_day_pct FROM usage_snapshots ORDER BY timestamp DESC LIMIT 1'
  ).get() as any;
  if (recent && recent.five_hour_pct === fiveHourPct && recent.seven_day_pct === sevenDayPct) {
    const lastTs = (db.prepare('SELECT MAX(timestamp) as ts FROM usage_snapshots').get() as any)?.ts || 0;
    if (now - lastTs < 5 * 60 * 1000) return; // Skip duplicate within 5 min
  }

  db.prepare(`
    INSERT INTO usage_snapshots (timestamp, five_hour_pct, five_hour_resets_at, seven_day_pct, seven_day_resets_at, seven_day_sonnet_pct)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    now,
    fiveHourPct,
    data.five_hour?.resets_at ?? null,
    sevenDayPct,
    data.seven_day?.resets_at ?? null,
    sonnetPct,
  );
}

/**
 * Get usage snapshots for timeseries chart. Default: last 24 hours.
 */
export function getUsageSnapshots(lookbackMs: number = 24 * 60 * 60 * 1000): UsageSnapshot[] {
  const cutoff = Date.now() - lookbackMs;
  return db.prepare(
    'SELECT timestamp, five_hour_pct, five_hour_resets_at, seven_day_pct, seven_day_resets_at, seven_day_sonnet_pct FROM usage_snapshots WHERE timestamp >= ? ORDER BY timestamp'
  ).all(cutoff) as UsageSnapshot[];
}

export function getRecentEvents(limit: number = 300): HookEvent[] {
  const stmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name
    FROM events
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map(row => ({
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    hook_event_type: row.hook_event_type,
    payload: JSON.parse(row.payload),
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    timestamp: row.timestamp,
    humanInTheLoop: row.humanInTheLoop ? JSON.parse(row.humanInTheLoop) : undefined,
    humanInTheLoopStatus: row.humanInTheLoopStatus ? JSON.parse(row.humanInTheLoopStatus) : undefined,
    model_name: row.model_name || undefined
  })).reverse();
}

// Theme database functions
export function insertTheme(theme: Theme): Theme {
  const stmt = db.prepare(`
    INSERT INTO themes (id, name, displayName, description, colors, isPublic, authorId, authorName, createdAt, updatedAt, tags, downloadCount, rating, ratingCount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    theme.id,
    theme.name,
    theme.displayName,
    theme.description || null,
    JSON.stringify(theme.colors),
    theme.isPublic ? 1 : 0,
    theme.authorId || null,
    theme.authorName || null,
    theme.createdAt,
    theme.updatedAt,
    JSON.stringify(theme.tags),
    theme.downloadCount || 0,
    theme.rating || 0,
    theme.ratingCount || 0
  );
  
  return theme;
}

export function updateTheme(id: string, updates: Partial<Theme>): boolean {
  const allowedFields = ['displayName', 'description', 'colors', 'isPublic', 'updatedAt', 'tags'];
  const setClause = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .map(key => `${key} = ?`)
    .join(', ');
  
  if (!setClause) return false;
  
  const values = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .map(key => {
      if (key === 'colors' || key === 'tags') {
        return JSON.stringify(updates[key as keyof Theme]);
      }
      if (key === 'isPublic') {
        return updates[key as keyof Theme] ? 1 : 0;
      }
      return updates[key as keyof Theme];
    });
  
  const stmt = db.prepare(`UPDATE themes SET ${setClause} WHERE id = ?`);
  const result = stmt.run(...values, id);
  
  return result.changes > 0;
}

export function getTheme(id: string): Theme | null {
  const stmt = db.prepare('SELECT * FROM themes WHERE id = ?');
  const row = stmt.get(id) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    colors: JSON.parse(row.colors),
    isPublic: Boolean(row.isPublic),
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: JSON.parse(row.tags || '[]'),
    downloadCount: row.downloadCount,
    rating: row.rating,
    ratingCount: row.ratingCount
  };
}

export function getThemes(query: ThemeSearchQuery = {}): Theme[] {
  let sql = 'SELECT * FROM themes WHERE 1=1';
  const params: any[] = [];
  
  if (query.isPublic !== undefined) {
    sql += ' AND isPublic = ?';
    params.push(query.isPublic ? 1 : 0);
  }
  
  if (query.authorId) {
    sql += ' AND authorId = ?';
    params.push(query.authorId);
  }
  
  if (query.query) {
    sql += ' AND (name LIKE ? OR displayName LIKE ? OR description LIKE ?)';
    const searchTerm = `%${query.query}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  // Add sorting
  const sortBy = query.sortBy || 'created';
  const sortOrder = query.sortOrder || 'desc';
  const sortColumn = {
    name: 'name',
    created: 'createdAt',
    updated: 'updatedAt',
    downloads: 'downloadCount',
    rating: 'rating'
  }[sortBy] || 'createdAt';
  
  sql += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;
  
  // Add pagination
  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(query.limit);
    
    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }
  }
  
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    colors: JSON.parse(row.colors),
    isPublic: Boolean(row.isPublic),
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: JSON.parse(row.tags || '[]'),
    downloadCount: row.downloadCount,
    rating: row.rating,
    ratingCount: row.ratingCount
  }));
}

export function deleteTheme(id: string): boolean {
  const stmt = db.prepare('DELETE FROM themes WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function incrementThemeDownloadCount(id: string): boolean {
  const stmt = db.prepare('UPDATE themes SET downloadCount = downloadCount + 1 WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// HITL helper functions
export function updateEventHITLResponse(id: number, response: any): HookEvent | null {
  const status = {
    status: 'responded',
    respondedAt: response.respondedAt,
    response
  };

  const stmt = db.prepare('UPDATE events SET humanInTheLoopStatus = ? WHERE id = ?');
  stmt.run(JSON.stringify(status), id);

  const selectStmt = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp, humanInTheLoop, humanInTheLoopStatus, model_name
    FROM events
    WHERE id = ?
  `);
  const row = selectStmt.get(id) as any;

  if (!row) return null;

  return {
    id: row.id,
    source_app: row.source_app,
    session_id: row.session_id,
    hook_event_type: row.hook_event_type,
    payload: JSON.parse(row.payload),
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    timestamp: row.timestamp,
    humanInTheLoop: row.humanInTheLoop ? JSON.parse(row.humanInTheLoop) : undefined,
    humanInTheLoopStatus: row.humanInTheLoopStatus ? JSON.parse(row.humanInTheLoopStatus) : undefined,
    model_name: row.model_name || undefined
  };
}

// ── Delegation Log & Budget ───────────────────────────────────────────

export interface DelegationLogEntry {
  id?: number;
  task_id: string;
  task_title: string;
  agent_pid: number | null;
  model: string | null;
  spawned_at: number;
  completed_at: number | null;
  outcome: 'pending' | 'success' | 'failed' | 'stalled' | 'stopped';
  duration_ms: number | null;
  error_summary: string | null;
  heartbeat_run: string | null;
}

export function insertDelegationLog(entry: Omit<DelegationLogEntry, 'id' | 'completed_at' | 'duration_ms' | 'outcome'>): number {
  const result = db.prepare(`
    INSERT INTO delegation_log (task_id, task_title, agent_pid, model, spawned_at, outcome, error_summary, heartbeat_run)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    entry.task_id,
    entry.task_title,
    entry.agent_pid,
    entry.model,
    entry.spawned_at,
    entry.error_summary || null,
    entry.heartbeat_run || null,
  );
  return result.lastInsertRowid as number;
}

export function resolveDelegationLog(
  agentPid: number,
  outcome: 'success' | 'failed' | 'stalled' | 'stopped',
  errorSummary?: string,
): void {
  const now = Date.now();
  const row = db.prepare(
    'SELECT id, spawned_at FROM delegation_log WHERE agent_pid = ? AND outcome = ? ORDER BY spawned_at DESC LIMIT 1'
  ).get(agentPid, 'pending') as any;

  if (!row) return; // No pending log entry for this agent

  db.prepare(`
    UPDATE delegation_log SET outcome = ?, completed_at = ?, duration_ms = ?, error_summary = COALESCE(?, error_summary)
    WHERE id = ?
  `).run(outcome, now, now - row.spawned_at, errorSummary || null, row.id);
}

function getConfigValue(key: string): string | null {
  const row = db.prepare('SELECT value FROM delegation_config WHERE key = ?').get(key) as any;
  return row?.value ?? null;
}

function getConfigInt(key: string, fallback: number): number {
  const val = getConfigValue(key);
  return val !== null ? parseInt(val, 10) : fallback;
}

export interface DelegationBudget {
  max_concurrent: number;
  running_now: number;
  available_slots: number;
  daily_spawns: number;
  daily_limit: number;
  daily_remaining: number;
  success_rate_7d: number;
  total_delegations_7d: number;
  usage_headroom_pct: number | null;  // null if no usage data available
  recommendation: 'spawn_ok' | 'slow_down' | 'hold';
}

export function getDelegationBudget(): DelegationBudget {
  const maxConcurrent = getConfigInt('max_concurrent_workers', 5);
  const dailyLimit = getConfigInt('max_daily_spawns', 20);
  const headroomMin = getConfigInt('usage_headroom_min_pct', 20);

  // Count running agents from agent_runs table
  const runningRow = db.prepare(
    "SELECT COUNT(*) as cnt FROM agent_runs WHERE status = 'running' AND dismissed = 0"
  ).get() as any;
  const runningNow = runningRow?.cnt ?? 0;

  // Count today's spawns
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dailyRow = db.prepare(
    'SELECT COUNT(*) as cnt FROM delegation_log WHERE spawned_at >= ?'
  ).get(todayStart.getTime()) as any;
  const dailySpawns = dailyRow?.cnt ?? 0;

  // 7-day success rate
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekRows = db.prepare(
    "SELECT outcome, COUNT(*) as cnt FROM delegation_log WHERE spawned_at >= ? AND outcome != 'pending' GROUP BY outcome"
  ).all(weekAgo) as any[];

  let total7d = 0;
  let success7d = 0;
  for (const r of weekRows) {
    total7d += r.cnt;
    if (r.outcome === 'success') success7d += r.cnt;
  }
  const successRate = total7d > 0 ? success7d / total7d : 1.0; // default optimistic

  // Adaptive scaling: adjust limits based on success rate
  if (total7d >= 5 && successRate > 0.8) {
    // Ramp up
    const newMax = Math.min(maxConcurrent + 1, 8);
    const newDaily = Math.min(dailyLimit + 2, 30);
    if (newMax !== maxConcurrent) updateDelegationConfig('max_concurrent_workers', String(newMax));
    if (newDaily !== dailyLimit) updateDelegationConfig('max_daily_spawns', String(newDaily));
  } else if (total7d >= 3 && successRate < 0.5) {
    // Ramp down
    const newMax = Math.max(maxConcurrent - 1, 1);
    const newDaily = Math.max(dailyLimit - 2, 3);
    if (newMax !== maxConcurrent) updateDelegationConfig('max_concurrent_workers', String(newMax));
    if (newDaily !== dailyLimit) updateDelegationConfig('max_daily_spawns', String(newDaily));
  }

  // Re-read after potential adaptive changes
  const effectiveMax = getConfigInt('max_concurrent_workers', 5);
  const effectiveDaily = getConfigInt('max_daily_spawns', 20);

  const availableSlots = Math.max(0, effectiveMax - runningNow);
  const dailyRemaining = Math.max(0, effectiveDaily - dailySpawns);

  // Usage headroom from latest snapshot
  const latestUsage = db.prepare(
    'SELECT five_hour_pct FROM usage_snapshots ORDER BY timestamp DESC LIMIT 1'
  ).get() as any;
  const usageHeadroom = latestUsage?.five_hour_pct != null
    ? Math.round(100 - latestUsage.five_hour_pct)
    : null;

  // Recommendation
  let recommendation: 'spawn_ok' | 'slow_down' | 'hold' = 'spawn_ok';
  if (availableSlots <= 0 || dailyRemaining <= 0 || (usageHeadroom !== null && usageHeadroom < headroomMin)) {
    recommendation = 'hold';
  } else if (availableSlots === 1 || dailyRemaining <= 2 || (usageHeadroom !== null && usageHeadroom < 40)) {
    recommendation = 'slow_down';
  }

  return {
    max_concurrent: effectiveMax,
    running_now: runningNow,
    available_slots: availableSlots,
    daily_spawns: dailySpawns,
    daily_limit: effectiveDaily,
    daily_remaining: dailyRemaining,
    success_rate_7d: Math.round(successRate * 100) / 100,
    total_delegations_7d: total7d,
    usage_headroom_pct: usageHeadroom,
    recommendation,
  };
}

export interface DelegationOutcomes {
  total: number;
  successful: number;
  failed: number;
  stalled: number;
  stopped: number;
  pending: number;
  avg_duration_ms: number | null;
  recent_failures: Array<{ task_id: string; task_title: string; error: string | null; when: number }>;
}

export function getDelegationOutcomes(days: number = 7): DelegationOutcomes {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const rows = db.prepare(
    "SELECT outcome, COUNT(*) as cnt FROM delegation_log WHERE spawned_at >= ? GROUP BY outcome"
  ).all(cutoff) as any[];

  const counts: Record<string, number> = { pending: 0, success: 0, failed: 0, stalled: 0, stopped: 0 };
  for (const r of rows) counts[r.outcome] = r.cnt;

  const avgRow = db.prepare(
    "SELECT AVG(duration_ms) as avg_dur FROM delegation_log WHERE spawned_at >= ? AND outcome != 'pending' AND duration_ms IS NOT NULL"
  ).get(cutoff) as any;

  const failures = db.prepare(
    "SELECT task_id, task_title, error_summary, completed_at FROM delegation_log WHERE spawned_at >= ? AND outcome = 'failed' ORDER BY completed_at DESC LIMIT 10"
  ).all(cutoff) as any[];

  return {
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    successful: counts.success,
    failed: counts.failed,
    stalled: counts.stalled,
    stopped: counts.stopped,
    pending: counts.pending,
    avg_duration_ms: avgRow?.avg_dur ? Math.round(avgRow.avg_dur) : null,
    recent_failures: failures.map((f: any) => ({
      task_id: f.task_id,
      task_title: f.task_title,
      error: f.error_summary,
      when: f.completed_at,
    })),
  };
}

export function getDelegationConfig(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM delegation_config').all() as any[];
  const config: Record<string, string> = {};
  for (const r of rows) config[r.key] = r.value;
  return config;
}

export function updateDelegationConfig(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO delegation_config (key, value, updated_at) VALUES (?, ?, ?)'
  ).run(key, value, Date.now());
}

export { db };