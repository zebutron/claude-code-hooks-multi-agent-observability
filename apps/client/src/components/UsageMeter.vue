<template>
  <div class="flex items-center gap-3 px-3 py-1.5 bg-black/20 rounded-lg">
    <!-- Session (5hr window) — real data when available -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-[9px] font-semibold text-stone-500 uppercase tracking-wider">Session</span>
        <span class="text-[10px] font-mono" :class="hasRealData ? 'text-stone-300' : 'text-stone-500'">
          {{ sessionLabel }}
        </span>
      </div>
      <div class="h-1.5 bg-stone-700/60 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="usageBarClass(sessionPct)"
          :style="{ width: sessionPct + '%' }"
        />
      </div>
      <div v-if="sessionResetLabel" class="text-[8px] text-stone-600 mt-0.5">{{ sessionResetLabel }}</div>
    </div>

    <!-- Week (7-day) — real data when available -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-[9px] font-semibold text-stone-500 uppercase tracking-wider">Week</span>
        <span class="text-[10px] font-mono" :class="hasRealData ? 'text-stone-300' : 'text-stone-500'">
          {{ weekLabel }}
        </span>
      </div>
      <div class="h-1.5 bg-stone-700/60 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="usageBarClass(weekPct)"
          :style="{ width: weekPct + '%' }"
        />
      </div>
      <div v-if="weekResetLabel" class="text-[8px] text-stone-600 mt-0.5">{{ weekResetLabel }}</div>
    </div>

    <!-- Agents count + data freshness -->
    <div class="text-center shrink-0 pl-1">
      <div class="text-sm font-bold text-stone-200">{{ usage.by_session.length }}</div>
      <div class="text-[8px] text-stone-500 uppercase">Agents</div>
      <div v-if="hasRealData" class="text-[7px] mt-0.5" :class="isStale ? 'text-amber-600' : 'text-emerald-700'">
        {{ freshness }}
      </div>
      <div v-else class="text-[7px] text-red-700/80 mt-0.5 cursor-pointer" title="Run bridge on claude.ai tab">no sync</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UsageSummary, ClaudeUsage } from '../types';

const props = defineProps<{
  usage: UsageSummary;
  claudeUsage: ClaudeUsage | null;
}>();

// ── Real Claude data ──
const hasRealData = computed(() => !!props.claudeUsage?.five_hour);

const sessionPct = computed(() => {
  if (props.claudeUsage?.five_hour) return props.claudeUsage.five_hour.utilization;
  // Fallback: estimate from hook data (capped at 100)
  const REF_DAY = 3_000_000;
  return Math.min(100, Math.round((props.usage.today / REF_DAY) * 100));
});

const weekPct = computed(() => {
  if (props.claudeUsage?.seven_day) return props.claudeUsage.seven_day.utilization;
  const REF_WEEK = 15_000_000;
  return Math.min(100, Math.round((props.usage.this_week / REF_WEEK) * 100));
});

const sessionLabel = computed(() => {
  if (hasRealData.value) return sessionPct.value + '%';
  return formatTokens(props.usage.today) + ' est';
});

const weekLabel = computed(() => {
  if (hasRealData.value) return weekPct.value + '%';
  return formatTokens(props.usage.this_week) + ' est';
});

// Reset time labels
const sessionResetLabel = computed(() => {
  if (!props.claudeUsage?.five_hour?.resets_at) return null;
  return 'resets ' + formatTimeUntil(props.claudeUsage.five_hour.resets_at);
});

const weekResetLabel = computed(() => {
  if (!props.claudeUsage?.seven_day?.resets_at) return null;
  return 'resets ' + formatTimeUntil(props.claudeUsage.seven_day.resets_at);
});

// Data freshness
const isStale = computed(() => {
  if (!props.claudeUsage?.cached_at) return true;
  return Date.now() - props.claudeUsage.cached_at > 5 * 60 * 1000; // stale after 5 min
});

const freshness = computed(() => {
  if (!props.claudeUsage?.cached_at) return '';
  const ago = Math.round((Date.now() - props.claudeUsage.cached_at) / 1000);
  if (ago < 60) return `${ago}s ago`;
  if (ago < 3600) return `${Math.round(ago / 60)}m ago`;
  return `${Math.round(ago / 3600)}h ago`;
});

// ── Helpers ──

function usageBarClass(pct: number): string {
  if (pct >= 80) return 'bg-[#ff2d6f]';   // danger
  if (pct >= 50) return 'bg-[#ffee00]';   // warning
  return 'bg-[#39ff14]';                   // good
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return String(n);
}

function formatTimeUntil(isoString: string): string {
  const target = new Date(isoString).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return 'now';
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}
</script>
