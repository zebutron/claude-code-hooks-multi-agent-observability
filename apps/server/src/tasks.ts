import { db } from './db';

// ── Types ────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  rationale: string | null;
  status: 'queued' | 'active' | 'blocked' | 'complete' | 'discovered' | 'archived';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  sort_order: number;
  roi_score: number;
  risk_score: number;
  fit_score: number;
  estimated_tokens: number | null;
  actual_tokens: number;
  estimated_minutes: number | null;
  actual_minutes: number;
  blocked_by: 'human_input' | 'dependency' | 'resource' | null;
  blocked_reason: string | null;
  blocked_since: number | null;
  agent_session_id: string | null;
  last_agent_activity: number | null;
  source: 'human' | 'agent';
  notes: string | null;
  tags: string[];
  depth: number;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  children?: Task[];
}

export interface TaskCreate {
  title: string;
  parent_id?: string | null;
  description?: string;
  rationale?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  sort_order?: number;
  roi_score?: number;
  risk_score?: number;
  fit_score?: number;
  estimated_tokens?: number;
  estimated_minutes?: number;
  blocked_by?: Task['blocked_by'];
  blocked_reason?: string;
  agent_session_id?: string;
  source?: Task['source'];
  notes?: string;
  tags?: string[];
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  rationale?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  sort_order?: number;
  roi_score?: number;
  risk_score?: number;
  fit_score?: number;
  estimated_tokens?: number;
  actual_tokens?: number;
  estimated_minutes?: number;
  actual_minutes?: number;
  blocked_by?: Task['blocked_by'] | null;
  blocked_reason?: string | null;
  blocked_since?: number | null;
  agent_session_id?: string;
  last_agent_activity?: number;
  notes?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    parent_id: row.parent_id,
    title: row.title,
    description: row.description,
    rationale: row.rationale,
    status: row.status,
    priority: row.priority,
    sort_order: row.sort_order,
    roi_score: row.roi_score,
    risk_score: row.risk_score,
    fit_score: row.fit_score,
    estimated_tokens: row.estimated_tokens,
    actual_tokens: row.actual_tokens,
    estimated_minutes: row.estimated_minutes,
    actual_minutes: row.actual_minutes,
    blocked_by: row.blocked_by,
    blocked_reason: row.blocked_reason,
    blocked_since: row.blocked_since,
    agent_session_id: row.agent_session_id,
    last_agent_activity: row.last_agent_activity,
    source: row.source,
    notes: row.notes,
    tags: row.tags ? JSON.parse(row.tags) : [],
    depth: row.depth,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

function getNextSortOrder(parentId: string | null): number {
  const stmt = parentId
    ? db.prepare('SELECT MAX(sort_order) as max_sort FROM tasks WHERE parent_id = ?')
    : db.prepare('SELECT MAX(sort_order) as max_sort FROM tasks WHERE parent_id IS NULL');

  const row = (parentId ? stmt.get(parentId) : stmt.get()) as any;
  return (row?.max_sort ?? 0) + 1.0;
}

function getDepth(parentId: string | null): number {
  if (!parentId) return 0;
  const stmt = db.prepare('SELECT depth FROM tasks WHERE id = ?');
  const row = stmt.get(parentId) as any;
  return row ? row.depth + 1 : 0;
}

// ── CRUD ─────────────────────────────────────────────────────────────────

export function createTask(input: TaskCreate): Task {
  const now = Date.now();
  const id = generateId();
  const parentId = input.parent_id ?? null;
  const status = input.status ?? 'queued';

  const task: Task = {
    id,
    parent_id: parentId,
    title: input.title,
    description: input.description ?? null,
    rationale: input.rationale ?? null,
    status,
    priority: input.priority ?? 'P2',
    sort_order: input.sort_order ?? getNextSortOrder(parentId),
    roi_score: input.roi_score ?? 5,
    risk_score: input.risk_score ?? 5,
    fit_score: input.fit_score ?? 5,
    estimated_tokens: input.estimated_tokens ?? null,
    actual_tokens: 0,
    estimated_minutes: input.estimated_minutes ?? null,
    actual_minutes: 0,
    blocked_by: input.blocked_by ?? null,
    blocked_reason: input.blocked_reason ?? null,
    blocked_since: input.blocked_by ? now : null,
    agent_session_id: input.agent_session_id ?? null,
    last_agent_activity: null,
    source: input.source ?? 'human',
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    depth: getDepth(parentId),
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, parent_id, title, description, rationale, status, priority, sort_order,
      roi_score, risk_score, fit_score, estimated_tokens, actual_tokens,
      estimated_minutes, actual_minutes, blocked_by, blocked_reason, blocked_since,
      agent_session_id, last_agent_activity, source, notes, tags, depth,
      created_at, updated_at, completed_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  stmt.run(
    task.id, task.parent_id, task.title, task.description, task.rationale,
    task.status, task.priority, task.sort_order,
    task.roi_score, task.risk_score, task.fit_score,
    task.estimated_tokens, task.actual_tokens,
    task.estimated_minutes, task.actual_minutes,
    task.blocked_by, task.blocked_reason, task.blocked_since,
    task.agent_session_id, task.last_agent_activity,
    task.source, task.notes, JSON.stringify(task.tags), task.depth,
    task.created_at, task.updated_at, task.completed_at
  );

  return task;
}

export function getTask(id: string): Task | null {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return null;
  return rowToTask(row);
}

export function getTaskWithChildren(id: string): Task | null {
  const task = getTask(id);
  if (!task) return null;

  const childStmt = db.prepare(
    'SELECT * FROM tasks WHERE parent_id = ? AND status != ? ORDER BY sort_order'
  );
  const childRows = childStmt.all(id, 'archived') as any[];
  task.children = childRows.map(rowToTask);

  return task;
}

export function getRootTasks(includeChildren: boolean = false): Task[] {
  const stmt = db.prepare(
    'SELECT * FROM tasks WHERE parent_id IS NULL AND status != ? ORDER BY sort_order'
  );
  const rows = stmt.all('archived') as any[];
  const tasks = rows.map(rowToTask);

  if (includeChildren) {
    for (const task of tasks) {
      task.children = getChildrenRecursive(task.id);
    }
  }

  return tasks;
}

function getChildrenRecursive(parentId: string): Task[] {
  const stmt = db.prepare(
    'SELECT * FROM tasks WHERE parent_id = ? AND status != ? ORDER BY sort_order'
  );
  const rows = stmt.all(parentId, 'archived') as any[];
  const children = rows.map(rowToTask);

  for (const child of children) {
    child.children = getChildrenRecursive(child.id);
  }

  return children;
}

export function getBlockedTasks(): Task[] {
  const stmt = db.prepare(`
    SELECT * FROM tasks
    WHERE blocked_by IS NOT NULL AND status = 'blocked'
    ORDER BY
      CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 END,
      roi_score DESC,
      blocked_since ASC
  `);
  return (stmt.all() as any[]).map(rowToTask);
}

export function updateTask(id: string, updates: TaskUpdate): Task | null {
  const existing = getTask(id);
  if (!existing) return null;

  const now = Date.now();

  // Handle blocked_since: set when newly blocked, clear when unblocked
  let blockedSince = existing.blocked_since;
  if (updates.blocked_by && !existing.blocked_by) {
    blockedSince = now;
  } else if (updates.blocked_by === null) {
    blockedSince = null;
  }

  // Handle completed_at
  let completedAt = existing.completed_at;
  if (updates.status === 'complete' && existing.status !== 'complete') {
    completedAt = now;
  } else if (updates.status && updates.status !== 'complete') {
    completedAt = null;
  }

  const fields: string[] = [];
  const values: any[] = [];

  const fieldMap: Record<string, any> = {
    title: updates.title,
    description: updates.description,
    rationale: updates.rationale,
    status: updates.status,
    priority: updates.priority,
    sort_order: updates.sort_order,
    roi_score: updates.roi_score,
    risk_score: updates.risk_score,
    fit_score: updates.fit_score,
    estimated_tokens: updates.estimated_tokens,
    actual_tokens: updates.actual_tokens,
    estimated_minutes: updates.estimated_minutes,
    actual_minutes: updates.actual_minutes,
    blocked_by: updates.blocked_by,
    blocked_reason: updates.blocked_reason,
    agent_session_id: updates.agent_session_id,
    last_agent_activity: updates.last_agent_activity,
    notes: updates.notes,
  };

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  // Handle tags specially (JSON serialization)
  if ((updates as any).tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify((updates as any).tags));
  }

  // Always update these computed fields
  fields.push('blocked_since = ?');
  values.push(blockedSince);
  fields.push('completed_at = ?');
  values.push(completedAt);
  fields.push('updated_at = ?');
  values.push(now);

  if (fields.length === 0) return existing;

  const stmt = db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values, id);

  return getTask(id);
}

export function reorderTask(id: string, newSortOrder: number): Task | null {
  const stmt = db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?');
  stmt.run(newSortOrder, Date.now(), id);
  return getTask(id);
}

export function unblockTask(id: string, response: string): Task | null {
  const existing = getTask(id);
  if (!existing) return null;

  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE tasks SET
      status = 'active',
      blocked_by = NULL,
      blocked_reason = NULL,
      blocked_since = NULL,
      notes = CASE
        WHEN notes IS NULL THEN ?
        ELSE notes || char(10) || ?
      END,
      updated_at = ?
    WHERE id = ?
  `);

  const note = `[${new Date(now).toISOString()}] Unblocked: ${response}`;
  stmt.run(note, note, now, id);

  return getTask(id);
}

export function archiveTask(id: string): boolean {
  const now = Date.now();
  // Archive task and all children
  const stmt = db.prepare("UPDATE tasks SET status = 'archived', updated_at = ? WHERE id = ? OR parent_id = ?");
  const result = stmt.run(now, id, id);
  return result.changes > 0;
}

// ── Usage Log ────────────────────────────────────────────────────────────

export interface UsageEntry {
  session_id: string;
  tokens_estimated: number;
  timestamp: number;
  model_name?: string;
}

export function logUsage(entry: UsageEntry): void {
  const stmt = db.prepare(`
    INSERT INTO usage_log (session_id, tokens_estimated, timestamp, model_name)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(entry.session_id, entry.tokens_estimated, entry.timestamp, entry.model_name ?? null);
}

export interface UsageSummary {
  today: number;
  this_week: number;
  by_session: { session_id: string; tokens: number; model_name: string | null }[];
}

export function getUsageSummary(): UsageSummary {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const todayStmt = db.prepare(
    'SELECT COALESCE(SUM(tokens_estimated), 0) as total FROM usage_log WHERE timestamp >= ?'
  );
  const today = (todayStmt.get(startOfDay.getTime()) as any).total;

  const weekStmt = db.prepare(
    'SELECT COALESCE(SUM(tokens_estimated), 0) as total FROM usage_log WHERE timestamp >= ?'
  );
  const thisWeek = (weekStmt.get(startOfWeek.getTime()) as any).total;

  const sessionStmt = db.prepare(`
    SELECT session_id, SUM(tokens_estimated) as tokens, model_name
    FROM usage_log
    WHERE timestamp >= ?
    GROUP BY session_id
    ORDER BY tokens DESC
  `);
  const bySession = (sessionStmt.all(startOfDay.getTime()) as any[]).map(r => ({
    session_id: r.session_id,
    tokens: r.tokens,
    model_name: r.model_name,
  }));

  return { today, this_week: thisWeek, by_session: bySession };
}

// ── Auto-update from hook events ─────────────────────────────────────────

export function handleHookEvent(sessionId: string, eventType: string, payloadSize: number): void {
  // Update last_agent_activity for any task owned by this session
  const updateStmt = db.prepare(`
    UPDATE tasks SET last_agent_activity = ? WHERE agent_session_id = ? AND status = 'active'
  `);
  updateStmt.run(Date.now(), sessionId);

  // Rough token estimation from payload size (chars / 4)
  const estimatedTokens = Math.ceil(payloadSize / 4);

  if (estimatedTokens > 0) {
    // Increment actual_tokens on active tasks for this session
    const tokenStmt = db.prepare(`
      UPDATE tasks SET actual_tokens = actual_tokens + ? WHERE agent_session_id = ? AND status = 'active'
    `);
    tokenStmt.run(estimatedTokens, sessionId);

    // Log usage
    logUsage({
      session_id: sessionId,
      tokens_estimated: estimatedTokens,
      timestamp: Date.now(),
    });
  }
}
