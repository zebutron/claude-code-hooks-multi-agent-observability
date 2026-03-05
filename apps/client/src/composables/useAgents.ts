import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { AgentInfo, AgentDetail, AgentStats } from '../types';
import { API_BASE_URL, WS_URL } from '../config';

export function useAgents() {
  const agents = ref<AgentInfo[]>([]);
  const stats = ref<AgentStats>({ running: 0, completed: 0, failed: 0, stopped: 0, total: 0 });
  const loading = ref(false);
  const error = ref<string | null>(null);
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Track if any agent is running → faster poll interval
  const hasRunningAgents = computed(() => agents.value.some(a => a.status === 'running'));

  async function fetchAgents() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_BASE_URL}/agents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      agents.value = await res.json();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch(`${API_BASE_URL}/agents/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      stats.value = await res.json();
    } catch {
      // ignore
    }
  }

  async function fetchAgentDetail(pid: number): Promise<AgentDetail | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/agents/${pid}/detail`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function assignAgent(taskId: string, options: {
    project_dir?: string;
    model?: string;
    max_turns?: number;
    scope_description?: string;
    trust_context?: string;
    additional_instructions?: string;
  } = {}): Promise<AgentInfo> {
    const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const agent: AgentInfo = await res.json();
    await fetchAgents();
    await fetchStats();
    return agent;
  }

  async function stopAgent(pid: number): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/agents/${pid}/stop`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchAgents();
    await fetchStats();
  }

  async function dismissAgent(pid: number): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/agents/${pid}/dismiss`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Remove from local list immediately for snappy UX
    agents.value = agents.value.filter(a => a.pid !== pid);
    await fetchStats();
  }

  async function getAgent(pid: number): Promise<AgentInfo | null> {
    const res = await fetch(`${API_BASE_URL}/agents/${pid}`);
    if (!res.ok) return null;
    return await res.json();
  }

  function getAgentForTask(taskId: string): AgentInfo | undefined {
    return agents.value.find(a => a.task_id === taskId && a.status === 'running');
  }

  // Apply a partial agent update from WebSocket (merge into existing list)
  function applyAgentUpdate(update: AgentInfo) {
    const idx = agents.value.findIndex(a => a.pid === update.pid);
    if (idx >= 0) {
      agents.value[idx] = update;
    } else {
      agents.value.unshift(update);
    }
    // Re-compute stats from local data
    const s = { running: 0, completed: 0, failed: 0, stopped: 0, total: 0 };
    for (const a of agents.value) {
      s[a.status]++;
      s.total++;
    }
    stats.value = s;
  }

  function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'agent_spawned' || msg.type === 'agent_stopped' || msg.type === 'agent_dismissed') {
          fetchAgents();
          fetchStats();
        } else if (msg.type === 'agent_output' && msg.data) {
          // Live update from agent output parsing
          applyAgentUpdate(msg.data as AgentInfo);
        }
      } catch {
        // ignore parse errors
      }
    };
    ws.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };
  }

  // Adaptive polling: 3s when agents running, 30s when idle
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    const interval = hasRunningAgents.value ? 3000 : 30000;
    pollTimer = setInterval(() => {
      fetchAgents();
      fetchStats();
      // Re-adjust interval if running state changed
      const newInterval = hasRunningAgents.value ? 3000 : 30000;
      if (newInterval !== interval) {
        startPolling(); // restart with new interval
      }
    }, interval);
  }

  onMounted(() => {
    fetchAgents();
    fetchStats();
    connectWebSocket();
    startPolling();
  });

  onUnmounted(() => {
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    if (pollTimer) clearInterval(pollTimer);
  });

  return {
    agents,
    stats,
    loading,
    error,
    hasRunningAgents,
    fetchAgents,
    fetchStats,
    fetchAgentDetail,
    assignAgent,
    stopAgent,
    dismissAgent,
    getAgent,
    getAgentForTask,
  };
}
