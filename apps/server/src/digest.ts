import { db } from './db';
import type { Task } from './tasks';

// ── Types ────────────────────────────────────────────────────────────────

export interface DigestSection {
  title: string;
  emoji: string;
  items: string[];
}

export interface DailyDigest {
  generated_at: number;
  greeting: string;
  sections: DigestSection[];
  summary: {
    total_tasks: number;
    blocked: number;
    active: number;
    completed_today: number;
    discovered: number;
    queued: number;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function rowToTask(row: any): Task {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function priorityLabel(p: string): string {
  if (p === 'P0') return '🔴 P0';
  if (p === 'P1') return '🟠 P1';
  return '';
}

// ── Digest Generation ───────────────────────────────────────────────────

export function generateDigest(): DailyDigest {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  // Get all non-archived tasks
  const allTasks: Task[] = db
    .query(`SELECT * FROM tasks WHERE status != 'archived' ORDER BY sort_order ASC`)
    .all()
    .map(rowToTask);

  // Categorize
  const blocked = allTasks.filter(t => t.status === 'blocked');
  const active = allTasks.filter(t => t.status === 'active');
  const discovered = allTasks.filter(t => t.status === 'discovered');
  const queued = allTasks.filter(t => t.status === 'queued');
  const completedToday = allTasks.filter(t => t.status === 'complete' && t.completed_at && t.completed_at >= todayMs);

  // Also check recently completed (archived or complete) for celebration
  const recentlyCompleted: Task[] = db
    .query(`SELECT * FROM tasks WHERE status IN ('complete', 'archived') AND completed_at >= ? ORDER BY completed_at DESC`)
    .all(todayMs)
    .map(rowToTask);

  const sections: DigestSection[] = [];

  // ── Section 1: Blocked items (URGENT) ──────────────────────────────
  if (blocked.length > 0) {
    const items = blocked.map(t => {
      const pri = priorityLabel(t.priority);
      const since = t.blocked_since ? ` (${timeAgo(t.blocked_since)})` : '';
      const reason = t.blocked_reason ? ` — ${t.blocked_reason}` : '';
      return `${pri ? pri + ' ' : ''}${t.title}${reason}${since}`;
    });
    sections.push({
      title: 'Needs Your Input',
      emoji: '🚨',
      items,
    });
  }

  // ── Section 2: Active work ─────────────────────────────────────────
  if (active.length > 0) {
    const items = active.map(t => {
      const pri = priorityLabel(t.priority);
      const agent = t.agent_session_id
        ? ` [agent: ${t.agent_session_id.slice(0, 8)}]`
        : '';
      const activity = t.last_agent_activity
        ? ` (last active ${timeAgo(t.last_agent_activity)})`
        : '';
      return `${pri ? pri + ' ' : ''}${t.title}${agent}${activity}`;
    });
    sections.push({
      title: 'In Progress',
      emoji: '⚡',
      items,
    });
  }

  // ── Section 3: Completed today (celebration) ───────────────────────
  if (recentlyCompleted.length > 0) {
    const items = recentlyCompleted.map(t => t.title);
    sections.push({
      title: 'Completed Today',
      emoji: '✅',
      items,
    });
  }

  // ── Section 4: Discovered (AI-proposed, needs triage) ──────────────
  if (discovered.length > 0) {
    const items = discovered.map(t => {
      const pri = priorityLabel(t.priority);
      return `${pri ? pri + ' ' : ''}${t.title}${t.rationale ? ` — ${t.rationale}` : ''}`;
    });
    sections.push({
      title: 'Needs Triage',
      emoji: '🔮',
      items,
    });
  }

  // ── Section 5: Top queued (what's next) ────────────────────────────
  if (queued.length > 0) {
    // Show top 5 queued by sort order
    const topQueued = queued.slice(0, 5);
    const items = topQueued.map((t, i) => {
      const pri = priorityLabel(t.priority);
      return `${i + 1}. ${pri ? pri + ' ' : ''}${t.title}`;
    });
    if (queued.length > 5) {
      items.push(`...and ${queued.length - 5} more queued`);
    }
    sections.push({
      title: 'Up Next',
      emoji: '📋',
      items,
    });
  }

  // ── Section 6: Stale items (no activity in 48h+) ──────────────────
  const staleThreshold = now - 48 * 60 * 60 * 1000;
  const stale = active.filter(t => {
    const lastActivity = t.last_agent_activity || t.updated_at;
    return lastActivity < staleThreshold;
  });
  if (stale.length > 0) {
    const items = stale.map(t => {
      const lastActivity = t.last_agent_activity || t.updated_at;
      return `${t.title} — no activity for ${timeAgo(lastActivity)}`;
    });
    sections.push({
      title: 'Stale (No Activity 48h+)',
      emoji: '⚠️',
      items,
    });
  }

  // Generate greeting based on time of day
  const hour = new Date().getHours();
  let greeting: string;
  if (hour < 6) greeting = 'Late night session.';
  else if (hour < 12) greeting = 'Good morning.';
  else if (hour < 17) greeting = 'Good afternoon.';
  else if (hour < 21) greeting = 'Good evening.';
  else greeting = 'Night session.';

  return {
    generated_at: now,
    greeting,
    sections,
    summary: {
      total_tasks: allTasks.length,
      blocked: blocked.length,
      active: active.length,
      completed_today: recentlyCompleted.length,
      discovered: discovered.length,
      queued: queued.length,
    },
  };
}

// ── Markdown formatter (for Slack/terminal delivery) ─────────────────

export function digestToMarkdown(digest: DailyDigest): string {
  const lines: string[] = [];

  lines.push(`**${digest.greeting}** Here's your stack:`);
  lines.push('');

  // Summary line
  const s = digest.summary;
  const parts: string[] = [];
  if (s.blocked > 0) parts.push(`🚨 ${s.blocked} blocked`);
  if (s.active > 0) parts.push(`⚡ ${s.active} active`);
  if (s.completed_today > 0) parts.push(`✅ ${s.completed_today} done today`);
  if (s.discovered > 0) parts.push(`🔮 ${s.discovered} to triage`);
  parts.push(`📋 ${s.queued} queued`);
  lines.push(parts.join(' · '));
  lines.push('');

  // Sections
  for (const section of digest.sections) {
    lines.push(`**${section.emoji} ${section.title}**`);
    for (const item of section.items) {
      lines.push(`  • ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

// ── Slack mrkdwn formatter ────────────────────────────────────────────

export function digestToSlack(digest: DailyDigest): string {
  const lines: string[] = [];

  lines.push(`*${digest.greeting}* Here's your stack:`);
  lines.push('');

  // Summary line
  const s = digest.summary;
  const parts: string[] = [];
  if (s.blocked > 0) parts.push(`🚨 ${s.blocked} blocked`);
  if (s.active > 0) parts.push(`⚡ ${s.active} active`);
  if (s.completed_today > 0) parts.push(`✅ ${s.completed_today} done today`);
  if (s.discovered > 0) parts.push(`🔮 ${s.discovered} to triage`);
  parts.push(`📋 ${s.queued} queued`);
  lines.push(parts.join(' · '));
  lines.push('');

  // Sections
  for (const section of digest.sections) {
    lines.push(`*${section.emoji} ${section.title}*`);
    for (const item of section.items) {
      lines.push(`  • ${item}`);
    }
    lines.push('');
  }

  lines.push(`_View full stack: http://localhost:5173/command_`);

  return lines.join('\n').trim();
}
