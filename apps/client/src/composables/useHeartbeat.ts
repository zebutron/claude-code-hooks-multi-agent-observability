import { ref, onMounted, onUnmounted } from 'vue';
import { API_BASE_URL, WS_URL } from '../config';

export interface HeartbeatOutput {
  filename: string;
  date: string;
  content: string;
}

export interface HeartbeatStatus {
  enabled: boolean;
  frequencyMinutes: number;
  lastPulse: string | null;
  nextScheduled: string | null;
  pulseRunning: boolean;
}

export function useHeartbeat() {
  const outputs = ref<HeartbeatOutput[]>([]);
  const status = ref<HeartbeatStatus>({
    enabled: false,
    frequencyMinutes: 240,
    lastPulse: null,
    nextScheduled: null,
    pulseRunning: false,
  });
  const loading = ref(false);
  const error = ref<string | null>(null);
  let ws: WebSocket | null = null;

  async function fetchOutputs(limit = 20) {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_BASE_URL}/heartbeat/outputs?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      outputs.value = await res.json();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`${API_BASE_URL}/heartbeat/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      status.value = await res.json();
    } catch {
      // ignore
    }
  }

  async function triggerPulse(): Promise<{ success: boolean; error?: string }> {
    status.value.pulseRunning = true;
    try {
      const res = await fetch(`${API_BASE_URL}/heartbeat/pulse`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        status.value.pulseRunning = false;
        return { success: false, error: data.error };
      }
      // Pulse started — will complete via WebSocket notification
      return { success: true };
    } catch (e: any) {
      status.value.pulseRunning = false;
      return { success: false, error: e.message };
    }
  }

  async function updateConfig(config: {
    enabled?: boolean;
    frequencyMinutes?: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/heartbeat/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error };
      }
      if (data.status) {
        status.value = data.status;
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'heartbeat_pulse_complete') {
          status.value.pulseRunning = false;
          fetchOutputs();
          fetchStatus();
        }
        if (msg.type === 'heartbeat_config_changed') {
          status.value = msg.data;
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
    fetchOutputs();
    fetchStatus();
    connectWebSocket();
  });

  onUnmounted(() => {
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  });

  return {
    outputs,
    status,
    loading,
    error,
    fetchOutputs,
    fetchStatus,
    triggerPulse,
    updateConfig,
  };
}
