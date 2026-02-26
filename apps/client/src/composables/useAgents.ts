import { ref, onMounted, onUnmounted } from 'vue';
import type { AgentInfo, AgentStats } from '../types';
import { API_BASE_URL, WS_URL } from '../config';

export function useAgents() {
  const agents = ref<AgentInfo[]>([]);
  const stats = ref<AgentStats>({ running: 0, completed: 0, failed: 0, stopped: 0, total: 0 });
  const loading = ref(false);
  const error = ref<string | null>(null);
  let ws: WebSocket | null = null;

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

  async function getAgent(pid: number): Promise<AgentInfo | null> {
    const res = await fetch(`${API_BASE_URL}/agents/${pid}`);
    if (!res.ok) return null;
    return await res.json();
  }

  function getAgentForTask(taskId: string): AgentInfo | undefined {
    return agents.value.find(a => a.task_id === taskId && a.status === 'running');
  }

  function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'agent_spawned' || msg.type === 'agent_stopped') {
          fetchAgents();
          fetchStats();
        }
      } catch {
        // ignore parse errors
      }
    };
    ws.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };
  }

  onMounted(() => {
    fetchAgents();
    fetchStats();
    connectWebSocket();
  });

  onUnmounted(() => {
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  });

  return {
    agents,
    stats,
    loading,
    error,
    fetchAgents,
    fetchStats,
    assignAgent,
    stopAgent,
    getAgent,
    getAgentForTask,
  };
}
