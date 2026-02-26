// New interface for human-in-the-loop requests
export interface HumanInTheLoop {
  question: string;
  responseWebSocketUrl: string;
  type: 'question' | 'permission' | 'choice';
  choices?: string[]; // For multiple choice questions
  timeout?: number; // Optional timeout in seconds
  requiresResponse?: boolean; // Whether response is required or optional
}

// Response interface
export interface HumanInTheLoopResponse {
  response?: string;
  permission?: boolean;
  choice?: string; // Selected choice from options
  hookEvent: HookEvent;
  respondedAt: number;
  respondedBy?: string; // Optional user identifier
}

// Status tracking interface
export interface HumanInTheLoopStatus {
  status: 'pending' | 'responded' | 'timeout' | 'error';
  respondedAt?: number;
  response?: HumanInTheLoopResponse;
}

export interface HookEvent {
  id?: number;
  source_app: string;
  session_id: string;
  hook_event_type: string;
  payload: Record<string, any>;
  chat?: any[];
  summary?: string;
  timestamp?: number;
  model_name?: string;

  // NEW: Optional HITL data
  humanInTheLoop?: HumanInTheLoop;
  humanInTheLoopStatus?: HumanInTheLoopStatus;
}

export interface FilterOptions {
  source_apps: string[];
  session_ids: string[];
  hook_event_types: string[];
}

export interface WebSocketMessage {
  type: 'initial' | 'event' | 'hitl_response';
  data: HookEvent | HookEvent[] | HumanInTheLoopResponse;
}

export type TimeRange = '1m' | '3m' | '5m' | '10m';

export interface ChartDataPoint {
  timestamp: number;
  count: number;
  eventTypes: Record<string, number>; // event type -> count
  toolEvents?: Record<string, number>; // "EventType:ToolName" -> count (e.g., "PreToolUse:Bash" -> 3)
  sessions: Record<string, number>; // session id -> count
}

// ── Command Center Types ───────────────────────────────────────────────

export type TaskStatus = 'queued' | 'active' | 'blocked' | 'complete' | 'discovered' | 'archived';
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type BlockedBy = 'human_input' | 'dependency' | 'resource';

export interface Task {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  rationale: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  sort_order: number;
  roi_score: number;
  risk_score: number;
  fit_score: number;
  estimated_tokens: number | null;
  actual_tokens: number;
  estimated_minutes: number | null;
  actual_minutes: number;
  blocked_by: BlockedBy | null;
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

export interface UsageSummary {
  today: number;
  this_week: number;
  by_session: { session_id: string; tokens: number; model_name: string | null }[];
}

export interface ClaudeUsage {
  five_hour: { utilization: number; resets_at: string } | null;
  seven_day: { utilization: number; resets_at: string } | null;
  seven_day_sonnet: { utilization: number; resets_at: string | null } | null;
  cached_at: number;
}

// ── Agent Types ──────────────────────────────────────────────────────────

export interface AgentInfo {
  pid: number;
  task_id: string;
  task_title: string;
  project_dir: string;
  model: string | null;
  started_at: number;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  exit_code: number | null;
  output_tail: string[];
  prompt_summary: string;
}

export interface AgentStats {
  running: number;
  completed: number;
  failed: number;
  stopped: number;
  total: number;
}

export interface ChartConfig {
  maxDataPoints: number;
  animationDuration: number;
  barWidth: number;
  barGap: number;
  colors: {
    primary: string;
    glow: string;
    axis: string;
    text: string;
  };
}