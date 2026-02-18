import { ref, onMounted, onUnmounted } from 'vue';
import type { UsageSummary } from '../types';
import { API_BASE_URL } from '../config';

export function useUsage() {
  const usage = ref<UsageSummary>({ today: 0, this_week: 0, by_session: [] });
  const loading = ref(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function fetchUsage() {
    loading.value = true;
    try {
      const res = await fetch(`${API_BASE_URL}/usage/summary`);
      if (res.ok) {
        usage.value = await res.json();
      }
    } catch {
      // ignore fetch errors
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    fetchUsage();
    // Poll every 30s
    pollInterval = setInterval(fetchUsage, 30000);
  });

  onUnmounted(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  return { usage, loading, fetchUsage };
}
