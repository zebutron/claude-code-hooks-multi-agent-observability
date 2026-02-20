<template>
  <div v-if="resources.length > 0" class="flex items-center gap-3">
    <div
      v-for="r in resources"
      :key="r.resource_id"
      class="flex items-center gap-1.5 text-[10px]"
    >
      <!-- Lock indicator dot -->
      <span
        class="inline-block w-2 h-2 rounded-full"
        :class="r.lock
          ? 'bg-[#ff2d6f] animate-pulse'
          : 'bg-[#39ff14]'"
      />

      <!-- Resource name -->
      <span class="text-stone-400 font-medium">{{ r.display_name }}</span>

      <!-- Holder info -->
      <span v-if="r.lock" class="text-stone-500 truncate max-w-[160px]" :title="r.lock.holder_description">
        {{ r.lock.holder_session_id.slice(0, 8) }}
        <span v-if="r.lock.holder_description" class="text-stone-600">· {{ r.lock.holder_description }}</span>
      </span>
      <span v-else class="text-stone-600">free</span>

      <!-- Waiter count -->
      <span
        v-if="r.waiters.length > 0"
        class="text-[#ffee00] font-mono"
        :title="r.waiters.map((w: any) => w.session_id.slice(0, 8)).join(', ')"
      >
        +{{ r.waiters.length }} waiting
      </span>

      <!-- TTL countdown -->
      <span v-if="r.lock" class="text-stone-600 font-mono">
        {{ formatTTL(r.lock.expires_at) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface ResourceLock {
  resource_id: string;
  holder_session_id: string;
  holder_description: string;
  acquired_at: number;
  expires_at: number;
  last_heartbeat: number;
}

interface ResourceWaiter {
  resource_id: string;
  session_id: string;
  description: string;
  queued_at: number;
}

interface ResourceState {
  resource_id: string;
  display_name: string;
  description: string;
  default_ttl_ms: number;
  lock: ResourceLock | null;
  waiters: ResourceWaiter[];
  is_expired: boolean;
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const resources = ref<ResourceState[]>([]);
let pollInterval: ReturnType<typeof setInterval> | null = null;
let ws: WebSocket | null = null;

function formatTTL(expiresAt: number): string {
  const remaining = Math.max(0, expiresAt - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function fetchResources() {
  try {
    const res = await fetch(`${API}/resources`);
    const data = await res.json();
    resources.value = data.resources;
  } catch {
    // Silently fail — resource panel is supplementary
  }
}

function connectWebSocket() {
  const wsUrl = API.replace('http', 'ws') + '/stream';
  ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'resource_update') {
        resources.value = msg.data.resources;
      }
    } catch { /* ignore */ }
  };
  ws.onclose = () => {
    // Reconnect after 5s
    setTimeout(connectWebSocket, 5000);
  };
}

onMounted(() => {
  fetchResources();
  // Poll TTL countdown every second for visual update
  pollInterval = setInterval(() => {
    // Force reactivity update for TTL display
    resources.value = [...resources.value];
  }, 1000);
  // Also poll API every 30s as backup
  const apiPoll = setInterval(fetchResources, 30000);
  onUnmounted(() => clearInterval(apiPoll));
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
  if (ws) ws.close();
});
</script>
