import { ref, onMounted, onUnmounted } from 'vue';
import type { UsageSummary, ClaudeUsage } from '../types';
import { API_BASE_URL } from '../config';

export function useUsage() {
  const usage = ref<UsageSummary>({ today: 0, this_week: 0, by_session: [] });
  const claudeUsage = ref<ClaudeUsage | null>(null);
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

  onMounted(() => {
    fetchUsage();
    // Poll every 30s
    pollInterval = setInterval(fetchUsage, 30000);
  });

  onUnmounted(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  return { usage, claudeUsage, loading, fetchUsage };
}
