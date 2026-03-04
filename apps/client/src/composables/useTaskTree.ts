import { ref, onMounted, onUnmounted } from 'vue';
import type { Task } from '../types';
import { API_BASE_URL, WS_URL } from '../config';

export function useTaskTree() {
  const tasks = ref<Task[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let ws: WebSocket | null = null;
  let lastUpdateTs = 0; // Track when we last did an in-place update

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
    const updated: Task = await res.json();

    // Optimistic in-place update (preserves scroll position — no full refetch)
    function patchInPlace(list: Task[]): boolean {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          // Preserve children from existing tree
          list[i] = { ...updated, children: list[i].children };
          return true;
        }
        if (list[i].children && patchInPlace(list[i].children!)) return true;
      }
      return false;
    }
    patchInPlace(tasks.value);
    lastUpdateTs = Date.now();

    return updated;
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
          // Skip full refetch if we just did an in-place update (<500ms ago)
          // This prevents scroll-resetting double-fetches
          if (Date.now() - lastUpdateTs < 500) return;
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
