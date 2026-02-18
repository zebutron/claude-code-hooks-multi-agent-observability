import { ref, onMounted, onUnmounted } from 'vue';
import type { Task } from '../types';
import { API_BASE_URL, WS_URL } from '../config';

export function useTaskTree() {
  const tasks = ref<Task[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let ws: WebSocket | null = null;

  async function fetchTasks() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_BASE_URL}/tasks?children=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      tasks.value = await res.json();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function createTask(input: Partial<Task>) {
    const res = await fetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const task: Task = await res.json();
    // Will be updated via WebSocket, but add optimistically
    await fetchTasks();
    return task;
  }

  async function updateTask(id: string, updates: Partial<Task>) {
    const res = await fetch(`${API_BASE_URL}/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const task: Task = await res.json();
    await fetchTasks();
    return task;
  }

  async function reorderTask(id: string, sortOrder: number) {
    const res = await fetch(`${API_BASE_URL}/tasks/${id}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort_order: sortOrder }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchTasks();
  }

  async function unblockTask(id: string, response: string) {
    const res = await fetch(`${API_BASE_URL}/tasks/${id}/unblock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchTasks();
  }

  async function archiveTask(id: string) {
    const res = await fetch(`${API_BASE_URL}/tasks/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchTasks();
  }

  function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'task_update' || msg.type === 'task_archived') {
          // Re-fetch full tree on any task change
          fetchTasks();
        }
      } catch {
        // ignore parse errors
      }
    };
    ws.onclose = () => {
      // Reconnect after 3s
      setTimeout(connectWebSocket, 3000);
    };
  }

  onMounted(() => {
    fetchTasks();
    connectWebSocket();
  });

  onUnmounted(() => {
    if (ws) {
      ws.onclose = null; // prevent reconnect
      ws.close();
    }
  });

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    reorderTask,
    unblockTask,
    archiveTask,
  };
}
