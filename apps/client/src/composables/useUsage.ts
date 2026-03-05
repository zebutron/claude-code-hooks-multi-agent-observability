import { ref, onMounted, onUnmounted } from 'vue';
import type { UsageSummary, ClaudeUsage } from '../types';
import { API_BASE_URL } from '../config';

export interface TimeseriesBucket {
  timestamp: number;
  total: number;
  tool_uses: number;
  sessions: number;
}

export function useUsage() {
  const usage = ref<UsageSummary>({ today: 0, this_week: 0, by_session: [] });
  const claudeUsage = ref<ClaudeUsage | null>(null);
  const timeseries = ref<TimeseriesBucket[]>([]);
  const loading = ref(false);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  async function fetchUsage() {
    loading.value = true;
    try {
      const [summaryRes, claudeRes] = await Promise.all([
        fetch(`${API_BASE_URL}/usage/summary`),
        fetch(`${API_BASE_URL}/usage/claude`),
      ]);
      if (summaryRes.ok) {
        usage.value = await summaryRes.json();
      }
      if (claudeRes.ok) {
        const data = await claudeRes.json();
        if (data) {
          claudeUsage.value = data;
        }
      }
    } catch {
      // ignore fetch errors
    } finally {
      loading.value = false;
    }
  }

  async function fetchTimeseries(hours = 6, bucketMin = 5) {
    try {
      const res = await fetch(`${API_BASE_URL}/usage/timeseries?hours=${hours}&bucket=${bucketMin}`);
      if (res.ok) {
        timeseries.value = await res.json();
      }
    } catch {
      // ignore
    }
  }

  onMounted(() => {
    fetchUsage();
    fetchTimeseries();
    // Poll usage every 30s, timeseries every 60s
    pollInterval = setInterval(() => {
      fetchUsage();
      fetchTimeseries();
    }, 30000);
  });

  onUnmounted(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  return { usage, claudeUsage, timeseries, loading, fetchUsage, fetchTimeseries };
}
